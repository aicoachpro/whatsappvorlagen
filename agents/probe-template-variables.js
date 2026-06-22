/**
 * agents/probe-template-variables.js — VOR-9: Create-Schema für Variablen-Templates klären
 *
 * Hintergrund: POST /v1.0/templates verlangt pro Variable ein `attribute_identifier`,
 * das die API beim Lesen NIE liefert. Dieses Skript klärt das Create-Format datengetrieben.
 *
 * Modi:
 *   (default / --recon)   READ-ONLY. Holt /custom-attributes, ein Beispiel-Variablen-Template
 *                         (Read-Shape), /channels (WABA-ID). Schreibt NICHTS, fasst Meta NICHT an.
 *   --create              SCHREIBT. Reicht ein Minimal-Template mit EINER Variable bei Meta ein.
 *                         400 = falsches Format (landet NICHT bei Meta). 2xx = Treffer (zählt gegen
 *                         WABA-Limit, in SuperChat löschbar). Nur mit explizitem Flag + Bestätigung.
 *
 * Usage:
 *   node agents/probe-template-variables.js                       # Recon (sicher)
 *   node agents/probe-template-variables.js --create --attr ca_xxx --confirm
 *   node agents/probe-template-variables.js --create --attr-name "Vorname" --confirm
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
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    env[line.slice(0, eq).trim()] = val;
  }
  return env;
}

const env  = loadEnv();
const KEY  = env.SUPERCHAT_API_KEY;
const BASE = (env.SUPERCHAT_BASE_URL || 'https://api.superchat.com/v1.0').replace(/\/$/, '');
if (!KEY || KEY.includes('your_')) { console.error('SUPERCHAT_API_KEY fehlt'); process.exit(2); }

const args     = process.argv.slice(2);
const DO_CREATE = args.includes('--create');
const CONFIRM   = args.includes('--confirm');
const ATTR_ID   = (i => i >= 0 ? args[i + 1] : null)(args.indexOf('--attr'));
const ATTR_NAME = (i => i >= 0 ? args[i + 1] : null)(args.indexOf('--attr-name'));
const H = { 'X-API-Key': KEY, 'Accept': 'application/json' };

async function get(p) {
  const res = await fetch(`${BASE}${p}`, { headers: H, signal: AbortSignal.timeout(20_000) });
  const txt = await res.text().catch(() => '');
  let json = null; try { json = JSON.parse(txt); } catch (_) {}
  return { status: res.status, ok: res.ok, json, txt };
}
async function post(p, payload) {
  const res = await fetch(`${BASE}${p}`, {
    method: 'POST',
    headers: { ...H, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30_000),
  });
  const txt = await res.text().catch(() => '');
  let json = null; try { json = JSON.parse(txt); } catch (_) {}
  return { status: res.status, ok: res.ok, json, txt };
}
const unwrap = j => (j && (j.results || j.data || j.items)) || [];

async function recon() {
  console.log(`\n=== RECON (read-only) gegen ${BASE} ===\n`);

  // 1) Custom-Attribute — liefern ca_… Identifier
  console.log('— GET /custom-attributes —');
  const ca = await get('/custom-attributes');
  if (!ca.ok) console.log(`  HTTP ${ca.status}: ${ca.txt.slice(0, 200)}`);
  else {
    const arr = unwrap(ca.json);
    console.log(`  ${arr.length} Custom-Attribute:`);
    for (const a of arr) console.log(`    ${String(a.id || '?').padEnd(24)} ${a.type || ''}  "${a.name || a.display_name || ''}"`);
  }

  // 2) Weitere mögliche Attribut-Endpunkte (Standard-Attr?) — best effort
  for (const p of ['/attributes', '/contact-attributes', '/contacts/attributes']) {
    const r = await get(p);
    console.log(`— GET ${p} → HTTP ${r.status}` + (r.ok ? ` (${unwrap(r.json).length} items)` : ''));
    if (r.ok) console.log('    ' + JSON.stringify(r.json).slice(0, 400));
  }

  // 3) WABA-ID aus Channels
  console.log('\n— GET /channels —');
  const ch = await get('/channels');
  if (ch.ok) {
    for (const c of unwrap(ch.json)) {
      if (c && (c.type === 'whats_app' || c.whats_app_business_account_id))
        console.log(`    ${String(c.id||'').padEnd(24)} waba=${c.whats_app_business_account_id || '?'}  "${c.name||''}"`);
    }
  } else console.log(`  HTTP ${ch.status}: ${ch.txt.slice(0, 200)}`);

  // 4) Read-Shape eines Variablen-Templates (zum Vergleich mit Create-Schema)
  console.log('\n— Beispiel: erstes Template MIT Variablen (Read-Shape) —');
  let cursor = null, sample = null;
  for (let page = 0; page < 20 && !sample; page++) {
    const j = (await get(cursor ? `/templates?after=${cursor}` : '/templates')).json;
    for (const t of (j?.results || j?.data || [])) {
      if ((t.content?.variables || []).length) { sample = t; break; }
    }
    cursor = j?.pagination?.next_cursor || j?.next_cursor;
    if (!cursor) break;
  }
  if (sample) {
    console.log(`    Template ${sample.id} "${sample.name}"`);
    console.log('    content.variables = ' + JSON.stringify(sample.content.variables, null, 2).replace(/\n/g, '\n    '));
  } else console.log('    (kein Variablen-Template gefunden)');

  console.log('\n=== Recon fertig. Nächster Schritt: gezielter --create-Versuch (schreibt!). ===\n');
}

async function create() {
  if (!CONFIRM) { console.error('ABBRUCH: --create braucht zusätzlich --confirm (reicht real bei Meta ein).'); process.exit(3); }
  if (!ATTR_ID && !ATTR_NAME) { console.error('ABBRUCH: --attr <identifier> ODER --attr-name <Name> angeben.'); process.exit(3); }

  // WABA-ID holen
  const ch = await get('/channels');
  let waba = null;
  for (const c of unwrap(ch.json)) if (c && c.whats_app_business_account_id) { waba = c.whats_app_business_account_id; break; }
  if (!waba) { console.error('ABBRUCH: keine WABA-ID über /channels gefunden.'); process.exit(4); }

  // Minimal-Template mit GENAU einer Variable. {{1}} verweist auf position 1.
  const variable = { position: 1, type: 'static' };
  if (ATTR_ID)   variable.attribute_identifier = ATTR_ID;
  if (ATTR_NAME) variable.display_name = ATTR_NAME, variable.attribute_identifier = ATTR_NAME;

  const stamp = Date.now().toString().slice(-6);
  const payload = {
    name: `VOR9 Probe ${stamp}`,
    whats_app_business_account_id: waba,
    content: {
      type: 'whats_app_template',
      category: 'utility',
      language: 'de',
      body: 'Hallo {{1}}, dies ist ein Test.',
      variables: [variable],
    },
  };

  console.log('\n=== CREATE-Versuch (schreibt real) ===');
  console.log('Payload:\n' + JSON.stringify(payload, null, 2) + '\n');
  const r = await post('/templates', payload);
  console.log(`HTTP ${r.status}`);
  console.log(r.txt.slice(0, 800));
  if (r.ok) {
    console.log('\n✅ TREFFER — dieses variables-Schema akzeptiert SuperChat.');
    console.log(`   SuperChat-Template-ID: ${r.json?.id} — in SuperChat wieder LÖSCHEN (zählt gegen Meta-Limit).`);
  } else {
    console.log('\n❌ Abgelehnt (NICHT bei Meta gelandet). Identifier/Schema anpassen und erneut.');
  }
  console.log('');
}

(DO_CREATE ? create() : recon()).catch(err => { console.error('FAIL:', err.message); process.exit(1); });
