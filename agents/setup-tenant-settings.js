/**
 * agents/setup-tenant-settings.js — kundeneditierbare Tenant-Einstellungen (VOR-8)
 *
 * AI-generated: VOR-8
 *
 * Idempotent. Legt an / migriert:
 *   - Collection `tenant_settings` (base): tenant→tenants (unique), firma, ersetzungen
 *     mit tenant-scoped API-Rules (Kunde liest/ändert nur eigene Einstellungen).
 *   - Migration: für jeden bestehenden Tenant mit firma/ersetzungen einen
 *     tenant_settings-Record anlegen (Bestand verlustfrei übernehmen).
 *
 * Warum eigene Collection statt Felder am `tenants`-Record:
 *   `tenants` trägt Lizenz-/Status-Felder (expires_at, status), die NUR Admin/Superuser
 *   ändern dürfen. PocketBase-Rules sind record-, nicht feldgenau — ließe man Kunden den
 *   tenants-Record patchen, könnten sie ihre eigene Lizenz verlängern. Darum liegen die
 *   kundeneditierbaren Felder (firma, ersetzungen) in dieser separaten, tenant-scoped
 *   Collection. Lizenzfelder bleiben am tenants (Admin/Superuser).
 *
 * .env: PB_URL, PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD
 * Usage: node agents/setup-tenant-settings.js [--dry-run]
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

// ─── 1) tenant_settings-Collection ───────────────────────────────────────────
// AI-generated: VOR-8
async function ensureTenantSettings(tenantsId) {
  let c = await getCollection('tenant_settings');
  if (c) { console.log('  tenant_settings: vorhanden'); return c; }
  if (DRY_RUN) { console.log('  tenant_settings: WÜRDE anlegen'); return { id: 'DRY' }; }
  // Tenant-Scoping wie bei template_overlays: Admin sieht alles, Kunde nur eigenen Tenant.
  const own = '@request.auth.role = "admin" || tenant = @request.auth.tenant';
  c = await pb('POST', '/api/collections', {
    name: 'tenant_settings', type: 'base',
    fields: [
      { name: 'tenant',      type: 'relation', required: true, collectionId: tenantsId, maxSelect: 1, cascadeDelete: true },
      { name: 'firma',       type: 'text' },
      { name: 'ersetzungen', type: 'json', maxSize: 2000000 },
    ],
    indexes: ['CREATE UNIQUE INDEX `idx_tenant_settings_tenant` ON `tenant_settings` (`tenant`)'],
    listRule:   own,
    viewRule:   own,
    createRule: '@request.auth.id != "" && (@request.auth.role = "admin" || tenant = @request.auth.tenant)',
    updateRule: own,
    deleteRule: own,
  });
  console.log('  tenant_settings: NEU angelegt (mit Tenant-Scoping-Rules)');
  return c;
}

// ─── 2) Migration: Bestand tenants.firma/ersetzungen → tenant_settings ────────
// AI-generated: VOR-8
async function migrateExisting() {
  // Alle Tenants laden (als Superuser; Rule egal)
  const tenants = [];
  let page = 1;
  while (true) {
    const j = await pb('GET', `/api/collections/tenants/records?perPage=200&page=${page}`);
    tenants.push(...(j.items || []));
    if (page >= (j.totalPages || 1)) break;
    page++;
  }
  // Bereits vorhandene Settings indexieren
  const existing = new Set();
  page = 1;
  while (true) {
    const j = await pb('GET', `/api/collections/tenant_settings/records?perPage=200&page=${page}`);
    for (const s of (j.items || [])) if (s.tenant) existing.add(s.tenant);
    if (page >= (j.totalPages || 1)) break;
    page++;
  }

  let created = 0, skipped = 0;
  for (const t of tenants) {
    if (existing.has(t.id)) { skipped++; continue; }
    const firma = t.firma || '';
    const ersetzungen = Array.isArray(t.ersetzungen) ? t.ersetzungen : [];
    // Auch leere Settings anlegen, damit jeder Tenant einen editierbaren Record hat.
    if (DRY_RUN) { console.log(`  migrate: WÜRDE tenant_settings für ${t.name || t.id} anlegen`); created++; continue; }
    await pb('POST', '/api/collections/tenant_settings/records', { tenant: t.id, firma, ersetzungen });
    created++;
    console.log(`  migrate: ${t.name || t.id} → tenant_settings angelegt`);
  }
  console.log(`  migrate: ${created} angelegt, ${skipped} bereits vorhanden (von ${tenants.length} Tenants)`);
}

(async () => {
  console.log(`\n[TenantSettings] Auth gegen ${PB_URL} ...`);
  await pbAuth();
  console.log(`[TenantSettings] ${DRY_RUN ? '(DRY-RUN) ' : ''}Richte tenant_settings ein ...`);
  const tenants = await getCollection('tenants');
  if (!tenants) throw new Error('tenants-Collection fehlt — zuerst setup-pb-tenancy.js laufen lassen');
  await ensureTenantSettings(tenants.id);
  if (!DRY_RUN) await migrateExisting();
  else console.log('  migrate: (DRY-RUN) übersprungen');
  console.log('\n[TenantSettings] Fertig.\n');
})().catch(err => { console.error('[TenantSettings] Fatal:', err.message || err); process.exit(1); });
