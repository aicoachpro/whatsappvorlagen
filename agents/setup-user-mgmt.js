/**
 * agents/setup-user-mgmt.js — Rules für Admin-Kundenverwaltung (VOE-246)
 *
 * Erlaubt role=admin (in der users-Collection) das CRUD von `tenants` + `users`.
 * Sicherheit: KEIN Self-Update (verhindert role-Eskalation durch Kunden) — Kunden ändern
 * nichts an user/tenant-Records; nur `view` auf den eigenen Datensatz.
 * Superuser (_superusers) umgeht ohnehin alle Rules.
 *
 * .env: PB_URL, PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD
 * Usage: node agents/setup-user-mgmt.js [--dry-run]
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

const ADMIN = '@request.auth.role = "admin"';
const SELF  = 'id = @request.auth.id';

(async () => {
  TOK = (await pb('POST', '/api/collections/_superusers/auth-with-password', { identity: PB_EMAIL, password: PB_PASS })).token;

  const tenants = await pb('GET', '/api/collections/tenants');
  const users   = await pb('GET', '/api/collections/users');

  // WV-12: viewRule KANONISCH mit setup-tenant-lifecycle.js — Kunde liest seinen EIGENEN Mandanten
  // (Verlängerungsdialog VOR-13 + Personalisierungs-Fallback). Vorher setzte dieses Skript Admin-only
  // und das zuletzt gelaufene Setup-Skript gewann. Drift-Assertion: tests/tenant-isolation.js.
  const tenantRules = { listRule: ADMIN, viewRule: `${ADMIN} || id = @request.auth.tenant`, createRule: ADMIN, updateRule: ADMIN, deleteRule: ADMIN };
  // users: admin verwaltet alle; Kunde darf nur seinen eigenen Datensatz sehen, NICHT ändern
  const userRules   = { listRule: ADMIN, viewRule: `${ADMIN} || ${SELF}`, createRule: ADMIN, updateRule: ADMIN, deleteRule: ADMIN };

  if (DRY) { console.log('DRY-RUN\n  tenants:', tenantRules, '\n  users:', userRules); return; }
  await pb('PATCH', `/api/collections/${tenants.id}`, tenantRules);
  await pb('PATCH', `/api/collections/${users.id}`, userRules);
  console.log('Rules gesetzt: tenants + users → admin-verwaltbar (kein Self-Update) ✓');
})().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
