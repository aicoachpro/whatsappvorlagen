/**
 * agents/setup-tenant-lifecycle.js — Tenant um Lizenz + Personalisierung erweitern (VOE-247/248)
 *
 * Erweitert `tenants` um: invited_at, expires_at (date), firma (text),
 * ersetzungen (json: [{from,to}]), status um 'expired'.
 * Setzt die users-authRule: Login nur für role=admin ODER tenant.status=active
 * → abgelaufene/suspendierte Kunden kommen serverseitig nicht mehr rein.
 *
 * .env: PB_URL, PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD
 * Usage: node agents/setup-tenant-lifecycle.js [--dry-run]
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
  const tenants = await pb('GET', '/api/collections/tenants');
  const have = new Set(tenants.fields.map(f => f.name));
  const add = [];
  if (!have.has('invited_at'))  add.push({ name: 'invited_at',  type: 'date' });
  if (!have.has('expires_at'))  add.push({ name: 'expires_at',  type: 'date' });
  if (!have.has('firma'))       add.push({ name: 'firma',       type: 'text' });
  if (!have.has('ersetzungen')) add.push({ name: 'ersetzungen', type: 'json', maxSize: 200000 });
  // status-Select um 'expired' erweitern
  const fields = tenants.fields.map(f => {
    if (f.name === 'status' && f.type === 'select' && !f.values.includes('expired'))
      return { ...f, values: [...f.values, 'expired'] };
    return f;
  });

  console.log(`Neue tenants-Felder: ${add.map(f => f.name).join(', ') || '(keine)'}`);
  // users-authRule: Login nur admin oder aktiver Mandant
  const users = await pb('GET', '/api/collections/users');
  const authRule = 'role = "admin" || tenant.status = "active"';
  console.log(`users.authRule → ${authRule}`);

  // Kunde darf seinen EIGENEN Mandanten lesen (für Personalisierung: firma/ersetzungen)
  const tenantViewRule = '@request.auth.role = "admin" || id = @request.auth.tenant';
  console.log(`tenants.viewRule → ${tenantViewRule}`);

  if (DRY) { console.log('DRY-RUN — nichts geschrieben.'); return; }
  await pb('PATCH', `/api/collections/${tenants.id}`, { fields: [...fields, ...add], viewRule: tenantViewRule });
  await pb('PATCH', `/api/collections/${users.id}`, { authRule });
  console.log('tenants-Schema + Login-Block + viewRule gesetzt ✓');
})().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
