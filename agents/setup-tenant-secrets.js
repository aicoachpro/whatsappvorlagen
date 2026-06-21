/**
 * agents/setup-tenant-secrets.js — verschlüsselte Per-Tenant-SuperChat-Anbindung (VOR-9 Slice 1)
 *
 * AI-generated: VOR-9
 *
 * Idempotent. Legt an:
 *   - Collection `tenant_secrets` (base, 1:1 zum Tenant): hält die SuperChat-Anbindung des Kunden.
 *       tenant (relation→tenants, unique, cascadeDelete)
 *       sc_api_key_enc (text)  — AES-256-GCM-Cipher des API-Keys (leer bei mode=session)
 *       waba_id (text)         — whats_app_business_account_id (kein Secret)
 *       mode (select)          — stored | session
 *     Rules: ALLE null → NUR Superuser/Hooks. Der Browser kommt NIE direkt an diese Collection;
 *     Zugriff ausschließlich über die pb_hooks-Routen (/api/vor/superchat-key), die tenant-scoped
 *     prüfen und den Key serverseitig ver-/entschlüsseln. So liegt der Cipher nie im client-lesbaren
 *     `tenant_settings` und der Klartext-Key verlässt den Server nie.
 *
 * .env: PB_URL, PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD
 * Usage: node agents/setup-tenant-secrets.js [--dry-run]
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
if (!PB_EMAIL || !PB_PASS) { console.error('PB_ADMIN_EMAIL / PB_ADMIN_PASSWORD fehlt in .env'); process.exit(2); }

const DRY_RUN = process.argv.includes('--dry-run');

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
  if (!res.ok) throw new Error(`PB ${res.status} ${method} ${p}: ${t.slice(0, 400)}`);
  return t ? JSON.parse(t) : null;
}
async function pbAuth() {
  const j = await pb('POST', '/api/collections/_superusers/auth-with-password', { identity: PB_EMAIL, password: PB_PASS });
  PB_TOKEN = j.token;
}
async function getCollection(nameOrId) {
  try { return await pb('GET', `/api/collections/${nameOrId}`); }
  catch (err) { if (String(err.message).includes('PB 404')) return null; throw err; }
}

// AI-generated: VOR-9
async function ensureTenantSecrets(tenantsId) {
  let c = await getCollection('tenant_secrets');
  if (c) { console.log('  tenant_secrets: vorhanden'); return c; }
  if (DRY_RUN) { console.log('  tenant_secrets: WÜRDE anlegen (superuser-only)'); return { id: 'DRY' }; }
  c = await pb('POST', '/api/collections', {
    name: 'tenant_secrets', type: 'base',
    fields: [
      { name: 'tenant',         type: 'relation', required: true, collectionId: tenantsId, maxSelect: 1, cascadeDelete: true },
      { name: 'sc_api_key_enc', type: 'text' },
      { name: 'waba_id',        type: 'text' },
      { name: 'mode',           type: 'select', maxSelect: 1, values: ['stored', 'session'] },
    ],
    indexes: ['CREATE UNIQUE INDEX `idx_tenant_secrets_tenant` ON `tenant_secrets` (`tenant`)'],
    // ALLE Rules null → nur Superuser/Hooks. Browser kommt nie direkt ran (Zugriff via pb_hooks).
    listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
  });
  console.log('  tenant_secrets: NEU angelegt (superuser-only, Zugriff nur via pb_hooks)');
  return c;
}

(async () => {
  console.log(`\n[TenantSecrets] Auth gegen ${PB_URL} ...`);
  await pbAuth();
  console.log(`[TenantSecrets] ${DRY_RUN ? '(DRY-RUN) ' : ''}Richte tenant_secrets ein ...`);
  const tenants = await getCollection('tenants');
  if (!tenants) throw new Error('tenants-Collection fehlt — zuerst setup-pb-tenancy.js laufen lassen');
  await ensureTenantSecrets(tenants.id);
  console.log('\n[TenantSecrets] Fertig. Hinweis: pb_hooks brauchen SUPERCHAT_ENC_KEY (32 Zeichen) in der Server-Env.\n');
})().catch(err => { console.error('[TenantSecrets] Fatal:', err.message || err); process.exit(1); });
