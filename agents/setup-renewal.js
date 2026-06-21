/**
 * agents/setup-renewal.js — Verlängerungs-Dialog-Unterbau (VOR-13)
 *
 * AI-generated: VOR-13
 *
 * Per PocketBase-Settings-API (Superuser), idempotent:
 *   1. users.authRule → abgelaufene Kunden dürfen einloggen (für den Verlängerungs-Screen),
 *      suspended bleibt blockiert.
 *   2. tenants.viewRule → Kunde darf seinen EIGENEN Tenant lesen (Status/Ablaufdatum).
 *      list/update/delete bleiben admin-only (Kunde kann sich NICHT selbst verlängern).
 *   3. Collection `renewal_requests`: Kunde legt eine Verlängerungs-Anfrage für seinen Tenant an.
 *
 * .env: PB_URL, PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD
 * Usage: node agents/setup-renewal.js [--dry-run]
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
const DRY = process.argv.includes('--dry-run');

let TOK = null;
async function pb(m, p, b) {
  const h = { 'Accept': 'application/json' };
  if (TOK) h['Authorization'] = TOK;
  if (b !== undefined) h['Content-Type'] = 'application/json';
  const r = await fetch(`${PB_URL}${p}`, { method: m, headers: h, body: b !== undefined ? JSON.stringify(b) : undefined, signal: AbortSignal.timeout(30000) });
  const t = await r.text();
  if (!r.ok) throw new Error(`PB ${r.status} ${m} ${p}: ${t.slice(0, 300)}`);
  return t ? JSON.parse(t) : null;
}
async function getColl(n) { try { return await pb('GET', `/api/collections/${n}`); } catch (e) { if (String(e.message).includes('PB 404')) return null; throw e; } }

const USERS_AUTH = 'role = "admin" || tenant.status = "active" || tenant.status = "expired"';
// tenants.viewRule bleibt unangetastet — erlaubt dem Kunden bereits den eigenen Tenant
// (`@request.auth.role = "admin" || id = @request.auth.tenant`). Ein bare `role` wäre hier falsch.

(async () => {
  console.log(`\n[Renewal] Auth gegen ${PB_URL} ...`);
  TOK = (await pb('POST', '/api/collections/_superusers/auth-with-password', { identity: PB_EMAIL, password: PB_PASS })).token;

  const users = await getColl('users');
  const tenants = await getColl('tenants');
  if (!users || !tenants) throw new Error('users/tenants-Collection fehlt');

  console.log('  users.authRule  ist :', JSON.stringify(users.authRule));
  console.log('  tenants.viewRule ist:', JSON.stringify(tenants.viewRule), '(unverändert)');
  if (DRY) {
    console.log('  (DRY-RUN) WÜRDE setzen:');
    console.log('    users.authRule  →', USERS_AUTH);
    console.log('    renewal_requests:', (await getColl('renewal_requests')) ? 'vorhanden' : 'WÜRDE anlegen');
    return;
  }

  if (users.authRule !== USERS_AUTH) { await pb('PATCH', `/api/collections/${users.id}`, { authRule: USERS_AUTH }); console.log('  users.authRule gesetzt (expired darf rein)'); }
  else console.log('  users.authRule bereits gesetzt');

  // VOR-14: registered_at-Feld für Registrierungs-Erkennung (Erst-Login)
  if (!(users.fields || []).some(f => f.name === 'registered_at')) {
    await pb('PATCH', `/api/collections/${users.id}`, { fields: [...users.fields, { name: 'registered_at', type: 'text' }] });
    console.log('  users.registered_at-Feld ergänzt');
  } else console.log('  users.registered_at vorhanden');

  let rr = await getColl('renewal_requests');
  if (!rr) {
    const ADMIN = '@request.auth.role = "admin"';
    rr = await pb('POST', '/api/collections', {
      name: 'renewal_requests', type: 'base',
      fields: [
        { name: 'tenant', type: 'relation', required: true, collectionId: tenants.id, maxSelect: 1, cascadeDelete: true },
        { name: 'handled', type: 'bool' },
      ],
      // Kunde legt Anfrage NUR für seinen eigenen Tenant an; lesen/erledigen = admin.
      createRule: '@request.auth.id != "" && tenant = @request.auth.tenant',
      listRule: ADMIN, viewRule: ADMIN, updateRule: ADMIN, deleteRule: ADMIN,
    });
    console.log('  renewal_requests: NEU angelegt');
  } else console.log('  renewal_requests: vorhanden');

  console.log('\n[Renewal] Fertig.\n');
})().catch(e => { console.error('[Renewal] Fatal:', e.message || e); process.exit(1); });
