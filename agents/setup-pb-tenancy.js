/**
 * agents/setup-pb-tenancy.js — Multi-Tenant-Unterbau in PocketBase (VOE-240)
 *
 * Idempotent. Legt an / aktualisiert:
 *   - Collection `tenants` (base): name, slug, status
 *   - Auth-Collection `users`: + Felder `tenant`→tenants, `role` [customer|admin]
 *   - Collection `template_overlays` (base): tenant→tenants, template→templates,
 *     *-override-Felder, hidden, notes
 *   - API-Rules (Mandantentrennung): Kunde sieht/ändert nur eigene Overlays;
 *     templates lesen alle Auth, schreiben nur role=admin.
 *
 * .env: PB_URL, PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD
 * Usage: node agents/setup-pb-tenancy.js [--dry-run]
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

// ─── 1) tenants ──────────────────────────────────────────────────────────────
async function ensureTenants() {
  let c = await getCollection('tenants');
  if (c) { console.log('  tenants: vorhanden'); return c; }
  if (DRY_RUN) { console.log('  tenants: WÜRDE anlegen'); return { id: 'DRY' }; }
  c = await pb('POST', '/api/collections', {
    name: 'tenants', type: 'base',
    fields: [
      { name: 'name',   type: 'text', required: true },
      { name: 'slug',   type: 'text', required: true },
      { name: 'status', type: 'select', maxSelect: 1, values: ['active', 'suspended'] },
    ],
    indexes: ['CREATE UNIQUE INDEX `idx_tenants_slug` ON `tenants` (`slug`)'],
    listRule: '@request.auth.role = "admin"', viewRule: '@request.auth.role = "admin"',
    createRule: null, updateRule: null, deleteRule: null, // nur Superuser
  });
  console.log('  tenants: NEU angelegt');
  return c;
}

// ─── 2) users erweitern (tenant + role) ──────────────────────────────────────
async function ensureUserFields(tenantsId) {
  const c = await getCollection('users');
  if (!c) throw new Error('users-Collection fehlt unerwartet');
  const have = new Set((c.fields || []).map(f => f.name));
  const add = [];
  if (!have.has('tenant')) add.push({ name: 'tenant', type: 'relation', required: false, collectionId: tenantsId, maxSelect: 1, cascadeDelete: false });
  if (!have.has('role'))   add.push({ name: 'role',   type: 'select', maxSelect: 1, values: ['customer', 'admin'] });
  if (add.length === 0) { console.log('  users: tenant/role vorhanden'); return; }
  if (DRY_RUN) { console.log(`  users: WÜRDE Felder ergänzen: ${add.map(f => f.name).join(', ')}`); return; }
  await pb('PATCH', `/api/collections/${c.id}`, { fields: [...c.fields, ...add] });
  console.log(`  users: Felder ergänzt: ${add.map(f => f.name).join(', ')}`);
}

// ─── 3) template_overlays ────────────────────────────────────────────────────
async function ensureOverlays(tenantsId, templatesId) {
  let c = await getCollection('template_overlays');
  if (c) { console.log('  template_overlays: vorhanden'); return c; }
  if (DRY_RUN) { console.log('  template_overlays: WÜRDE anlegen'); return { id: 'DRY' }; }
  // Tenant-Scoping-Rule: Admin sieht alles, Kunde nur eigenen Tenant
  const own = '@request.auth.role = "admin" || tenant = @request.auth.tenant';
  c = await pb('POST', '/api/collections', {
    name: 'template_overlays', type: 'base',
    fields: [
      { name: 'tenant',          type: 'relation', required: true,  collectionId: tenantsId,   maxSelect: 1, cascadeDelete: true },
      { name: 'template',        type: 'relation', required: false, collectionId: templatesId, maxSelect: 1, cascadeDelete: true },
      { name: 'name_override',   type: 'text'   },
      { name: 'body_override',   type: 'editor' },
      { name: 'header_override', type: 'text'   },
      { name: 'footer_override', type: 'text'   },
      { name: 'buttons',         type: 'json', maxSize: 2000000 },
      { name: 'hidden',          type: 'bool'   },
      { name: 'notes',           type: 'editor' },
    ],
    indexes: ['CREATE UNIQUE INDEX `idx_overlay_tenant_template` ON `template_overlays` (`tenant`, `template`)'],
    listRule:   own,
    viewRule:   own,
    createRule: '@request.auth.id != "" && (@request.auth.role = "admin" || tenant = @request.auth.tenant)',
    updateRule: own,
    deleteRule: own,
  });
  console.log('  template_overlays: NEU angelegt (mit Tenant-Scoping-Rules)');
  return c;
}

// ─── 4) templates-Rules (lesen: alle Auth; schreiben: nur admin) ─────────────
async function setTemplateRules() {
  const c = await getCollection('templates');
  const desiredRead  = '@request.auth.id != ""';
  const desiredWrite = '@request.auth.role = "admin"';
  if (c.listRule === desiredRead && c.updateRule === desiredWrite) { console.log('  templates: Rules bereits gesetzt'); return; }
  if (DRY_RUN) { console.log('  templates: WÜRDE Rules setzen (read=auth, write=admin)'); return; }
  await pb('PATCH', `/api/collections/${c.id}`, {
    listRule: desiredRead, viewRule: desiredRead,
    createRule: desiredWrite, updateRule: desiredWrite, deleteRule: desiredWrite,
  });
  console.log('  templates: Rules gesetzt (read=auth, write=admin)');
}

(async () => {
  console.log(`\n[Tenancy] Auth gegen ${PB_URL} ...`);
  await pbAuth();
  console.log(`[Tenancy] ${DRY_RUN ? '(DRY-RUN) ' : ''}Setze Multi-Tenant-Unterbau ...`);
  const tenants   = await ensureTenants();
  const templates = await getCollection('templates');
  await ensureUserFields(tenants.id);
  await ensureOverlays(tenants.id, templates.id);
  await setTemplateRules();
  console.log('\n[Tenancy] Fertig.\n');
})().catch(err => { console.error('[Tenancy] Fatal:', err.message || err); process.exit(1); });
