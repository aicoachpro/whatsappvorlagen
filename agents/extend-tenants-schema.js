/**
 * agents/extend-tenants-schema.js — Erweitert die `tenants`-Collection (VOE-250)
 *
 * Idempotent. Fügt fehlende Felder hinzu (Superchat-Account-Daten, Personalisierungs-URLs,
 * Telefon, Notizen, Logo) und setzt die `updateRule` so, dass `role=admin` Tenants über die
 * Kunden-UI bearbeiten kann. Existierende Felder werden NIE überschrieben.
 *
 * .env: PB_URL, PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD
 * Usage:
 *   node agents/extend-tenants-schema.js --dry-run   # nur Plan zeigen
 *   node agents/extend-tenants-schema.js             # tatsächlich anwenden
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

// ─── Wunsch-Felder ───────────────────────────────────────────────────────────
// Reihenfolge entspricht der gewünschten Anzeige im Edit-Modal.
const DESIRED_FIELDS = [
  { name: 'sc_api_key',         type: 'text', presentable: false }, // Superchat-API-Key des Coach-Accounts (Klartext nötig — über updateRule + viewRule abgesichert)
  { name: 'sc_waba_id',         type: 'text', presentable: false }, // Superchat WABA-/Workspace-ID
  { name: 'flixcheck_base_url', type: 'text' },                     // z.B. https://flixcheck.de/MUSTERFINANZ
  { name: 'terminbuchung_url',  type: 'text' },                     // TidyCal / Cal.com
  { name: 'bewertung_url',      type: 'text' },                     // Google-Review / Trustpilot
  { name: 'telefon',            type: 'text' },
  { name: 'notizen',            type: 'editor' },
  { name: 'logo',               type: 'file', maxSelect: 1, maxSize: 5242880, mimeTypes: ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'] },
];

// Rules: Customer darf SEINEN eigenen Tenant view'en (für Personalisierung),
//        Admin alles. updateRule: nur Admin (über die Kunden-UI bearbeitbar).
const DESIRED_VIEW   = '@request.auth.role = "admin" || id = @request.auth.tenant';
const DESIRED_UPDATE = '@request.auth.role = "admin"';

(async () => {
  console.log(`\n[Extend-Tenants] Auth gegen ${PB_URL} ...`);
  await pbAuth();
  const c = await pb('GET', '/api/collections/tenants');
  const haveNames = new Set((c.fields || []).map(f => f.name));
  const toAdd = DESIRED_FIELDS.filter(f => !haveNames.has(f.name));

  console.log(`[Extend-Tenants] Vorhandene Felder: ${c.fields.length}`);
  console.log(`[Extend-Tenants] Hinzuzufügen:      ${toAdd.length}`);
  for (const f of toAdd) console.log(`    + ${f.name} (${f.type})`);

  const viewNeedsChange   = c.viewRule   !== DESIRED_VIEW;
  const updateNeedsChange = c.updateRule !== DESIRED_UPDATE;
  console.log(`[Extend-Tenants] viewRule   ist: ${JSON.stringify(c.viewRule)}  → soll: ${JSON.stringify(DESIRED_VIEW)}  ${viewNeedsChange ? 'ÄNDERN' : 'OK'}`);
  console.log(`[Extend-Tenants] updateRule ist: ${JSON.stringify(c.updateRule)}  → soll: ${JSON.stringify(DESIRED_UPDATE)}  ${updateNeedsChange ? 'ÄNDERN' : 'OK'}`);

  if (DRY_RUN) { console.log('\n[Extend-Tenants] DRY-RUN — nichts geschrieben.\n'); return; }
  if (!toAdd.length && !viewNeedsChange && !updateNeedsChange) {
    console.log('\n[Extend-Tenants] Nichts zu tun.\n');
    return;
  }

  const newFields = toAdd.length ? [...c.fields, ...toAdd] : c.fields;
  const patch = { fields: newFields };
  if (viewNeedsChange)   patch.viewRule   = DESIRED_VIEW;
  if (updateNeedsChange) patch.updateRule = DESIRED_UPDATE;

  await pb('PATCH', `/api/collections/${c.id}`, patch);
  console.log(`\n[Extend-Tenants] OK — ${toAdd.length} Felder ergänzt${viewNeedsChange ? ', viewRule gesetzt' : ''}${updateNeedsChange ? ', updateRule gesetzt' : ''}.\n`);
})().catch(err => { console.error('[Extend-Tenants] Fatal:', err.message || err); process.exit(1); });
