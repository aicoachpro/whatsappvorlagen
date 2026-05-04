/**
 * agents/list-superchat-templates.js — liest alle WhatsApp-Templates aus Superchat
 *
 * Endpoint:  GET /v1.0/templates  (cursor-paginiert via ?after=<id>)
 * Auth:      X-API-Key
 * Schema:    { id, status, name, content: { body, file_ids, variables, type },
 *              folder, channels: [{ id, name, url }], createdAt, updatedAt }
 *
 * Usage:
 *   node agents/list-superchat-templates.js                # Tabelle (alle Templates)
 *   node agents/list-superchat-templates.js --raw          # JSON komplett
 *   node agents/list-superchat-templates.js --status approved
 *   node agents/list-superchat-templates.js --get tn_xxx   # nur EIN Template (full)
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
const BASE = env.SUPERCHAT_BASE_URL || 'https://api.superchat.com/v1.0';

if (!KEY || KEY.includes('your_')) { console.error('SUPERCHAT_API_KEY fehlt'); process.exit(2); }

const args     = process.argv.slice(2);
const RAW      = args.includes('--raw');
const STATUS   = (i => i >= 0 ? args[i + 1] : null)(args.indexOf('--status'));
const GET_ONE  = (i => i >= 0 ? args[i + 1] : null)(args.indexOf('--get'));

async function api(pathSegment) {
  const res = await fetch(`${BASE}${pathSegment}`, {
    headers: { 'X-API-Key': KEY, 'Accept': 'application/json' },
    signal:  AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} on ${pathSegment}: ${txt.slice(0, 200)}`);
  }
  return res.json();
}

async function fetchAll() {
  const all  = [];
  let cursor = null;
  while (true) {
    const url = cursor ? `/templates?after=${cursor}` : '/templates';
    const j   = await api(url);
    const pageItems = j.results || j.data || [];
    all.push(...pageItems);
    cursor = j.pagination?.next_cursor || j.next_cursor;
    if (!cursor) break;
  }
  return all;
}

(async () => {
  if (GET_ONE) {
    const j = await api(`/templates/${GET_ONE}`);
    console.log(JSON.stringify(j, null, 2));
    return;
  }

  let templates = await fetchAll();
  if (STATUS) templates = templates.filter(t => t.status === STATUS);

  if (RAW) { console.log(JSON.stringify(templates, null, 2)); return; }

  const counts = templates.reduce((acc, t) => { acc[t.status] = (acc[t.status] || 0) + 1; return acc; }, {});
  const summary = Object.entries(counts).map(([k, v]) => `${k}=${v}`).join('  ');

  console.log(`\n[Templates] ${templates.length} insgesamt  |  ${summary}\n`);
  console.log(`  ${'ID'.padEnd(28)}${'Status'.padEnd(18)}${'Vars'.padEnd(6)}${'Channels'.padEnd(10)}Name`);
  console.log('  ' + '-'.repeat(28 + 18 + 6 + 10 + 30));
  for (const t of templates) {
    const id     = t.id;
    const status = (t.status || '?').padEnd(18);
    const vars   = String((t.content?.variables || []).length).padEnd(6);
    const chans  = String((t.channels || []).length).padEnd(10);
    const name   = t.name || '?';
    console.log(`  ${id.padEnd(28)}${status}${vars}${chans}${name}`);
  }
  console.log('');
})().catch(err => { console.error('[Templates] FAIL:', err.message); process.exit(1); });
