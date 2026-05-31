/**
 * agents/notion-enrich-to-pb.js — Einmaliger Export der Notion-Anreicherung → PocketBase
 *
 * Phase 2 (VOE-238): Migriert die in Notion von Admins gepflegten Anreicherungsfelder
 * (Kategorie, Ordner, Überschrift, Buttons, URL's, Telefonnummer, Schnellantwort, Notizen)
 * in die PocketBase-`templates`-Collection. Match über `superchat_id` (in beiden DBs).
 *
 * - Schreibt NUR die Anreicherungsfelder — die Superchat-Felder (name/body/footer/…) bleiben
 *   unberührt.
 * - Leere Notion-Werte werden übersprungen (überschreiben nichts).
 * - Idempotent: kann mehrfach laufen.
 *
 * .env benötigt: NOTION_TOKEN, NOTION_DATABASE_ID, PB_URL, PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD
 *
 * Usage:
 *   node agents/notion-enrich-to-pb.js --limit 3 --verbose   # Test
 *   node agents/notion-enrich-to-pb.js --dry-run             # nur Plan
 *   node agents/notion-enrich-to-pb.js                       # alle
 */
'use strict';

const fs   = require('fs');
const path = require('path');

// ─── ENV ─────────────────────────────────────────────────────────────────────
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

const NOTION_KEY = env.NOTION_TOKEN;
const NOTION_DB  = env.NOTION_DATABASE_ID;
const PB_URL     = (env.PB_URL || 'https://vorlagen.voelkergroup.cloud').replace(/\/$/, '');
const PB_EMAIL   = env.PB_ADMIN_EMAIL;
const PB_PASS    = env.PB_ADMIN_PASSWORD;

for (const [k, v] of Object.entries({ NOTION_TOKEN: NOTION_KEY, NOTION_DATABASE_ID: NOTION_DB, PB_ADMIN_EMAIL: PB_EMAIL, PB_ADMIN_PASSWORD: PB_PASS })) {
  if (!v || String(v).includes('your_')) { console.error(`${k} fehlt in .env`); process.exit(2); }
}

// ─── Args ────────────────────────────────────────────────────────────────────
const args    = process.argv.slice(2);
const argv     = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const LIMIT   = argv('--limit') ? parseInt(argv('--limit'), 10) : null;
const DRY_RUN = args.includes('--dry-run');
const VERBOSE = args.includes('--verbose');

// ─── Audit ───────────────────────────────────────────────────────────────────
const AUDIT_PATH = path.join(__dirname, '..', 'journal', 'audit.log');
function audit(action, details) {
  fs.appendFileSync(AUDIT_PATH, JSON.stringify({ ts: new Date().toISOString(), sink: 'pb-enrich', action, ...details }) + '\n');
}

// ─── Notion ──────────────────────────────────────────────────────────────────
const NOTION_BASE = 'https://api.notion.com/v1';
async function notionApi(method, p, body) {
  const res = await fetch(`${NOTION_BASE}${p}`, {
    method,
    headers: {
      'Authorization':  `Bearer ${NOTION_KEY}`,
      'Notion-Version': '2022-06-28',
      'Content-Type':   'application/json',
    },
    body:   body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  const txt = await res.text();
  if (!res.ok) throw new Error(`Notion ${res.status} ${method} ${p}: ${txt.slice(0, 200)}`);
  return txt ? JSON.parse(txt) : null;
}
async function fetchAllNotionPages() {
  const all = []; let cursor;
  while (true) {
    const body = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;
    const j = await notionApi('POST', `/databases/${NOTION_DB}/query`, body);
    all.push(...(j.results || []));
    if (!j.has_more) break;
    cursor = j.next_cursor;
  }
  return all;
}

// Notion-Property-Extraktoren
const txt  = (p) => ((p?.rich_text || p?.title || []).map(r => r.plain_text).join('')).trim();
const sel  = (p) => (p?.select?.name || '').trim();
const msel = (p) => (p?.multi_select || []).map(o => o.name);
const url  = (p) => (p?.url || '').trim();
const phone = (p) => (p?.phone_number || '').trim();

// ─── PocketBase ──────────────────────────────────────────────────────────────
let PB_TOKEN = null;
async function pb(method, p, body) {
  const headers = { 'Accept': 'application/json' };
  if (PB_TOKEN) headers['Authorization'] = PB_TOKEN;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${PB_URL}${p}`, {
    method, headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  const t = await res.text();
  if (!res.ok) throw new Error(`PB ${res.status} ${method} ${p}: ${t.slice(0, 300)}`);
  return t ? JSON.parse(t) : null;
}
async function pbAuth() {
  const j = await pb('POST', '/api/collections/_superusers/auth-with-password', { identity: PB_EMAIL, password: PB_PASS });
  PB_TOKEN = j.token;
}
async function pbAllTemplates() {
  const byScId = new Map(); let page = 1;
  while (true) {
    const j = await pb('GET', `/api/collections/templates/records?perPage=200&page=${page}&fields=id,superchat_id`);
    for (const r of j.items) if (r.superchat_id) byScId.set(r.superchat_id, r.id);
    if (page >= j.totalPages) break;
    page++;
  }
  return byScId;
}

// ─── Mapping: Notion-Page → PB-Anreicherungsfelder (nur nicht-leere) ─────────
function buildEnrichment(props) {
  const patch = {};
  const kategorie     = sel(props['Kategorie']);
  const ordner        = sel(props['Ordner']);
  const ueberschrift  = txt(props['Überschrift']);
  const urls          = url(props["URL's"]);
  const telefonnummer = phone(props['Telefonnummer']);
  const schnellantwort = txt(props['Schnellantwort']);
  const notizen       = txt(props['Notizen']);
  const btnTypes      = msel(props['Button hinzufügen']);
  const btnName       = txt(props['Button Name']);

  if (kategorie)      patch.kategorie = kategorie;
  if (ordner)         patch.ordner = ordner;
  if (ueberschrift)   patch.ueberschrift = ueberschrift;
  if (urls)           patch.urls = urls;
  if (telefonnummer)  patch.telefonnummer = telefonnummer;
  if (schnellantwort) patch.schnellantwort = schnellantwort;
  if (notizen)        patch.notizen = notizen;
  if (btnTypes.length || btnName) patch.buttons = { hinzufuegen: btnTypes, name: btnName };
  return patch;
}

// ─── Main ────────────────────────────────────────────────────────────────────
(async () => {
  console.log(`\n[Enrich] Auth gegen ${PB_URL} ...`);
  await pbAuth();
  console.log('[Enrich] Lade PB-Records + Notion-Pages ...');
  const [byScId, pages] = await Promise.all([pbAllTemplates(), fetchAllNotionPages()]);
  console.log(`[Enrich] PB: ${byScId.size} Records  |  Notion: ${pages.length} Pages`);

  let work = pages;
  if (LIMIT) work = work.slice(0, LIMIT);

  let updated = 0, skippedNoMatch = 0, skippedEmpty = 0, errors = 0;
  const t0 = Date.now();
  for (let i = 0; i < work.length; i++) {
    const page  = work[i];
    const props = page.properties || {};
    const scId  = txt(props.superchat_id);
    if (!scId)            { skippedNoMatch++; continue; }
    const recId = byScId.get(scId);
    if (!recId)          { skippedNoMatch++; if (VERBOSE) console.log(`  ~ kein PB-Match: ${scId}`); continue; }

    const patch = buildEnrichment(props);
    if (Object.keys(patch).length === 0) { skippedEmpty++; continue; }

    if (DRY_RUN) { updated++; if (VERBOSE) console.log(`  [dry] ${scId} ← ${Object.keys(patch).join(',')}`); continue; }

    try {
      await pb('PATCH', `/api/collections/templates/records/${recId}`, patch);
      updated++;
      audit('enrich', { superchat_id: scId, record_id: recId, fields: Object.keys(patch) });
      if (VERBOSE || i % 25 === 0) console.log(`  [${String(i + 1).padStart(3)}/${work.length}] ${scId.padEnd(28)} ← ${Object.keys(patch).join(',')}`);
    } catch (err) {
      errors++;
      console.error(`  ✗ ${scId}: ${err.message.slice(0, 180)}`);
      audit('error', { superchat_id: scId, error: err.message });
    }
  }
  console.log(`\n[Enrich] Done in ${((Date.now() - t0) / 1000).toFixed(1)}s — updated=${updated} no-match=${skippedNoMatch} empty=${skippedEmpty} errors=${errors}\n`);
})().catch(err => { console.error('[Enrich] Fatal:', err.message || err); process.exit(1); });
