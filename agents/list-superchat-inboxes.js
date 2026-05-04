/**
 * agents/list-superchat-inboxes.js — Listet Superchat-Inboxes (ID + Name + Channel)
 *
 * Hilft beim Setzen der SUPERCHAT_INBOX_ID in .env.
 * Loggt KEINEN API-Key — nur sichtbare Inbox-Metadaten.
 *
 * Usage: node agents/list-superchat-inboxes.js
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const ENV_PATH = path.join(__dirname, '..', '.env');

function loadEnv() {
  if (!fs.existsSync(ENV_PATH)) {
    console.error('[Superchat] .env nicht gefunden');
    process.exit(2);
  }
  const env = {};
  for (const raw of fs.readFileSync(ENV_PATH, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    env[line.slice(0, eq).trim()] = val;
  }
  return env;
}

(async () => {
  const env = loadEnv();
  const key = env.SUPERCHAT_API_KEY;
  if (!key || key.includes('your_')) {
    console.error('[Superchat] SUPERCHAT_API_KEY in .env nicht befuellt');
    process.exit(2);
  }
  const baseUrl = env.SUPERCHAT_BASE_URL || 'https://api.superchat.com/v1.0';

  const res = await fetch(`${baseUrl}/inboxes`, {
    headers: { 'X-API-Key': key, 'Accept': 'application/json' },
    signal:  AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    console.error(`[Superchat] FAIL ${res.status}: ${(await res.text()).slice(0, 200)}`);
    process.exit(1);
  }

  const data = await res.json();
  const items = Array.isArray(data) ? data : (data.results || data.data || data.items || []);

  if (items.length === 0) {
    console.log('[Superchat] Keine Inboxes gefunden. Roh-Antwort:');
    console.log(JSON.stringify(data, null, 2).slice(0, 500));
    return;
  }

  console.log(`\n[Superchat] ${items.length} Inbox(en) gefunden:\n`);
  console.log('  ' + 'ID'.padEnd(40) + 'Channel'.padEnd(15) + 'Name');
  console.log('  ' + '-'.repeat(40) + '-'.repeat(15) + '-'.repeat(40));
  for (const i of items) {
    const id      = i.id || i._id || '?';
    const channel = i.channelType || i.channel || i.type || '?';
    const name    = i.name || i.displayName || i.title || '?';
    console.log('  ' + String(id).padEnd(40) + String(channel).padEnd(15) + String(name));
  }
  console.log('\n[Superchat] Fuer .env: SUPERCHAT_INBOX_ID=<gewuenschte-ID-oben>\n');
})().catch(err => {
  console.error('[Superchat] Fatal:', err.message);
  process.exit(1);
});
