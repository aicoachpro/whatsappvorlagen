/**
 * agents/fill-ordner-from-superchat.js — Gap-Fill: Superchat `folder` → PB `ordner`
 *
 * Superchat-Templates tragen ein `folder.name`. Diese Info ist eine SUPERCHAT-Quelle
 * und wurde im Erst-Sync nicht übernommen. Dieses Script füllt
 * `ordner` NUR dort, wo es noch leer ist — die Admin-Anreicherung im PocketBase-Admin
 * hat also weiterhin Vorrang und wird nie überschrieben.
 *
 * .env: SUPERCHAT_API_KEY, PB_URL, PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD
 * Usage:
 *   node agents/fill-ordner-from-superchat.js --dry-run   # nur Analyse + Verteilung
 *   node agents/fill-ordner-from-superchat.js             # füllt Lücken
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const ENV_PATH = path.join(__dirname, '..', '.env');
function loadEnv() {
  const env = {};
  for (const raw of fs.readFileSync(ENV_PATH, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('='); if (eq < 0) continue;
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    env[line.slice(0, eq).trim()] = val;
  }
  return env;
}
const env = loadEnv();
const SC_KEY   = env.SUPERCHAT_API_KEY;
const SC_BASE  = env.SUPERCHAT_BASE_URL || 'https://api.superchat.com/v1.0';
const PB_URL   = (env.PB_URL || 'https://vorlagen.voelkergroup.cloud').replace(/\/$/, '');
const PB_EMAIL = env.PB_ADMIN_EMAIL;
const PB_PASS  = env.PB_ADMIN_PASSWORD;
if (!SC_KEY || !PB_EMAIL || !PB_PASS) { console.error('SUPERCHAT_API_KEY / PB_ADMIN_* fehlt in .env'); process.exit(2); }

const DRY_RUN = process.argv.includes('--dry-run');

async function scApi(p) {
  const res = await fetch(`${SC_BASE}${p}`, { headers: { 'X-API-Key': SC_KEY, 'Accept': 'application/json' }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`Superchat ${res.status} ${p}`);
  return res.json();
}
async function fetchAllTemplates() {
  const all = []; let cursor = null;
  while (true) {
    const j = await scApi(cursor ? `/templates?after=${cursor}` : '/templates');
    all.push(...(j.results || []));
    cursor = j.pagination?.next_cursor; if (!cursor) break;
  }
  return all;
}

let PB_TOKEN = null;
async function pb(method, p, body) {
  const headers = { 'Accept': 'application/json' };
  if (PB_TOKEN) headers['Authorization'] = PB_TOKEN;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${PB_URL}${p}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30_000) });
  const t = await res.text();
  if (!res.ok) throw new Error(`PB ${res.status} ${method} ${p}: ${t.slice(0, 200)}`);
  return t ? JSON.parse(t) : null;
}
async function pbAuth() {
  const j = await pb('POST', '/api/collections/_superusers/auth-with-password', { identity: PB_EMAIL, password: PB_PASS });
  PB_TOKEN = j.token;
}
async function pbAllTemplates() {
  const byScId = new Map(); let page = 1;
  while (true) {
    const j = await pb('GET', `/api/collections/templates/records?perPage=200&page=${page}&fields=id,superchat_id,ordner`);
    for (const r of j.items) if (r.superchat_id) byScId.set(r.superchat_id, r);
    if (page >= j.totalPages) break; page++;
  }
  return byScId;
}

(async () => {
  console.log(`\n[Fill-Ordner] Auth + laden ...`);
  await pbAuth();
  const [byScId, templates] = await Promise.all([pbAllTemplates(), fetchAllTemplates()]);
  console.log(`[Fill-Ordner] PB: ${byScId.size} Records | Superchat: ${templates.length} Templates`);

  let scWithFolder = 0, gapFillable = 0, alreadySet = 0, noFolder = 0, noMatch = 0;
  const dist = {};        // folder.name → Anzahl gap-fillable
  const todo = [];        // {recId, ordner}

  for (const t of templates) {
    const folder = t.folder?.name?.trim();
    if (!folder) { noFolder++; continue; }
    scWithFolder++;
    const rec = byScId.get(t.id);
    if (!rec) { noMatch++; continue; }
    if (rec.ordner && rec.ordner.trim()) { alreadySet++; continue; }
    gapFillable++;
    dist[folder] = (dist[folder] || 0) + 1;
    todo.push({ recId: rec.id, ordner: folder });
  }

  console.log(`\n[Analyse] Superchat-Templates mit folder: ${scWithFolder} | ohne: ${noFolder}`);
  console.log(`[Analyse] davon in PB: bereits Ordner gesetzt=${alreadySet}  LÜCKE-füllbar=${gapFillable}  kein-Match=${noMatch}`);
  console.log(`\n[Analyse] Ordner-Verteilung der füllbaren Lücken:`);
  for (const [k, v] of Object.entries(dist).sort((a, b) => b[1] - a[1])) console.log(`   ${String(v).padStart(3)}  ${k}`);

  if (DRY_RUN) { console.log(`\n[Fill-Ordner] DRY-RUN — nichts geschrieben (${gapFillable} würden gefüllt).\n`); return; }

  let done = 0, err = 0;
  for (const x of todo) {
    try { await pb('PATCH', `/api/collections/templates/records/${x.recId}`, { ordner: x.ordner }); done++; }
    catch (e) { err++; console.error(`  ✗ ${x.recId}: ${e.message.slice(0, 120)}`); }
  }
  console.log(`\n[Fill-Ordner] Gefüllt: ${done}  Fehler: ${err}\n`);
})().catch(err => { console.error('[Fill-Ordner] Fatal:', err.message || err); process.exit(1); });
