/**
 * agents/extend-templates-schema.js — templates-Collection um echte Superchat-Komponenten erweitern (VOE-243)
 *
 * Ergänzt (idempotent) die Felder, die die Superchat-API im content liefert und die im
 * Erst-Sync fehlten: header (json), channels (json), track_links (bool), sc_category (text, roh).
 * Erweitert das kategorie-Select um "Authentifizierung".
 * (buttons + variables existieren bereits als json.)
 *
 * .env: PB_URL, PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD
 * Usage: node agents/extend-templates-schema.js [--dry-run]
 */
'use strict';
const fs = require('fs'), path = require('path');
const ENV_PATH = path.join(__dirname, '..', '.env');
function loadEnv() {
  const env = {};
  for (const raw of fs.readFileSync(ENV_PATH, 'utf8').split('\n')) {
    const line = raw.trim(); if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('='); if (eq < 0) continue;
    let v = line.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    env[line.slice(0, eq).trim()] = v;
  }
  return env;
}
const env = loadEnv();
const PB_URL = (env.PB_URL || 'https://vorlagen.voelkergroup.cloud').replace(/\/$/, '');
const PB_EMAIL = env.PB_ADMIN_EMAIL, PB_PASS = env.PB_ADMIN_PASSWORD;
if (!PB_EMAIL || !PB_PASS) { console.error('PB_ADMIN_* fehlt'); process.exit(2); }
const DRY = process.argv.includes('--dry-run');

let TOK = null;
async function pb(m, p, b) {
  const h = { 'Accept': 'application/json' }; if (TOK) h['Authorization'] = TOK; if (b !== undefined) h['Content-Type'] = 'application/json';
  const r = await fetch(`${PB_URL}${p}`, { method: m, headers: h, body: b !== undefined ? JSON.stringify(b) : undefined, signal: AbortSignal.timeout(30000) });
  const t = await r.text(); if (!r.ok) throw new Error(`PB ${r.status} ${m} ${p}: ${t.slice(0, 300)}`); return t ? JSON.parse(t) : null;
}

(async () => {
  TOK = (await pb('POST', '/api/collections/_superusers/auth-with-password', { identity: PB_EMAIL, password: PB_PASS })).token;
  const c = await pb('GET', '/api/collections/templates');
  const have = new Set(c.fields.map(f => f.name));
  const want = [
    { name: 'sc_category',  type: 'text' },
    { name: 'header',       type: 'json', maxSize: 200000 },
    { name: 'channels',     type: 'json', maxSize: 200000 },
    { name: 'track_links',  type: 'bool' },
  ];
  const add = want.filter(f => !have.has(f.name));

  // kategorie-Select um "Authentifizierung" erweitern
  const fields = c.fields.map(f => {
    if (f.name === 'kategorie' && f.type === 'select' && !f.values.includes('Authentifizierung'))
      return { ...f, values: [...f.values, 'Authentifizierung'] };
    return f;
  });

  console.log(`Neue Felder: ${add.map(f => f.name).join(', ') || '(keine)'}`);
  if (DRY) { console.log('DRY-RUN — nichts geschrieben.'); return; }
  await pb('PATCH', `/api/collections/${c.id}`, { fields: [...fields, ...add] });
  console.log('templates-Schema aktualisiert ✓');
})().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
