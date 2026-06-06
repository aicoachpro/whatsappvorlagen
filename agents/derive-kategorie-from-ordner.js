/**
 * agents/derive-kategorie-from-ordner.js — Heuristik: Ordner → Kategorie (VOE-238/Datenqualität)
 *
 * Leitet die Meta-Kategorie (Verwaltung=UTILITY / Marketing=MARKETING) heuristisch aus dem
 * Ordnernamen ab — NUR für Records, deren `kategorie` noch leer ist. Die im PocketBase-Admin
 * gepflegten Kategorien (Admin-Handarbeit) werden NIE überschrieben.
 *
 * Heuristik (konservativ — im Zweifel Verwaltung, da UTILITY die compliance-sichere Default ist):
 *   Marketing  ⟸ Ordner enthält: lead, kampagn, automation, neukund, follow, aktion, akquise, bewerbung, kette
 *   Verwaltung ⟸ alles andere
 *
 * .env: PB_URL, PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD
 * Usage:
 *   node agents/derive-kategorie-from-ordner.js --dry-run   # Zuordnung anzeigen
 *   node agents/derive-kategorie-from-ordner.js             # schreiben
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
const PB_URL   = (env.PB_URL || 'https://vorlagen.voelkergroup.cloud').replace(/\/$/, '');
const PB_EMAIL = env.PB_ADMIN_EMAIL;
const PB_PASS  = env.PB_ADMIN_PASSWORD;
if (!PB_EMAIL || !PB_PASS) { console.error('PB_ADMIN_* fehlt in .env'); process.exit(2); }

const DRY_RUN = process.argv.includes('--dry-run');
const MARKETING_RE = /lead|kampagn|automation|neukund|follow|aktion|akquise|bewerbung|kette/i;

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
async function pbAll() {
  const out = []; let page = 1;
  while (true) {
    const j = await pb('GET', `/api/collections/templates/records?perPage=200&page=${page}&fields=id,ordner,kategorie`);
    out.push(...j.items);
    if (page >= j.totalPages) break; page++;
  }
  return out;
}

(async () => {
  console.log(`\n[Kategorie] Auth + laden ...`);
  await pbAuth();
  const recs = await pbAll();

  const perOrdner = {};   // ordner → {kat, n}
  const todo = [];
  let noOrdner = 0;
  for (const r of recs) {
    if (r.kategorie && r.kategorie.trim()) continue;     // Admin-Pflege nicht anfassen
    const ordner = (r.ordner || '').trim();
    if (!ordner) { noOrdner++; continue; }
    const kat = MARKETING_RE.test(ordner) ? 'Marketing' : 'Verwaltung';
    todo.push({ id: r.id, kat });
    const key = `${ordner} → ${kat}`;
    perOrdner[key] = (perOrdner[key] || 0) + 1;
  }

  console.log(`[Kategorie] Leere Kategorien füllbar: ${todo.length} | ohne Ordner (bleibt leer): ${noOrdner}`);
  console.log(`\n[Zuordnung] Ordner → Kategorie (Anzahl):`);
  for (const [k, v] of Object.entries(perOrdner).sort()) {
    const mark = k.endsWith('Marketing') ? 'M' : ' ';
    console.log(`  [${mark}] ${String(v).padStart(2)}  ${k}`);
  }

  if (DRY_RUN) { console.log(`\n[Kategorie] DRY-RUN — nichts geschrieben.\n`); return; }
  let done = 0, err = 0;
  for (const x of todo) {
    try { await pb('PATCH', `/api/collections/templates/records/${x.id}`, { kategorie: x.kat }); done++; }
    catch (e) { err++; console.error(`  ✗ ${x.id}: ${e.message.slice(0, 120)}`); }
  }
  console.log(`\n[Kategorie] Gesetzt: ${done}  Fehler: ${err}\n`);
})().catch(err => { console.error('[Kategorie] Fatal:', err.message || err); process.exit(1); });
