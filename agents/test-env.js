/**
 * agents/test-env.js — Smoke-Test fuer .env-Credentials
 *
 * Prueft alle in .env definierten API-Keys mit minimalen Auth-Proben.
 * Gibt NUR Status (OK/FAIL/MISSING) aus — niemals Secrets.
 *
 * Usage: node agents/test-env.js
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const PROJECT_PATH = path.join(__dirname, '..');
const ENV_PATH     = path.join(PROJECT_PATH, '.env');

// ─── .env laden (ohne Dependency) ────────────────────────────────────────────
function loadEnv() {
  if (!fs.existsSync(ENV_PATH)) {
    console.error('[ENV] .env nicht gefunden unter', ENV_PATH);
    console.error('[ENV] Lege sie an: cp .env.example .env');
    process.exit(2);
  }
  const env = {};
  for (const raw of fs.readFileSync(ENV_PATH, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let val   = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    env[key] = val;
  }
  return env;
}

const env = loadEnv();

// ─── Hilfen ──────────────────────────────────────────────────────────────────
function isPlaceholder(v) {
  if (!v) return true;
  return v.includes('your_') || v.includes('_here') || v === '';
}

function status(name, state, detail = '') {
  const icon = { OK: '✓', FAIL: '✗', MISSING: '○', SKIP: '–' }[state] || '?';
  const pad  = name.padEnd(28);
  console.log(`  ${icon} ${pad} ${state}${detail ? '  ' + detail : ''}`);
}

async function probe(label, url, headers, opts = {}) {
  try {
    const res = await fetch(url, {
      method: opts.method || 'GET',
      headers,
      body: opts.body,
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) return { ok: true, code: res.status };
    let txt = '';
    try { txt = (await res.text()).slice(0, 120).replace(/\s+/g, ' '); } catch {}
    return { ok: false, code: res.status, msg: txt };
  } catch (err) {
    return { ok: false, msg: err.message };
  }
}

// ─── 1) Linear ───────────────────────────────────────────────────────────────
async function testLinear() {
  const key = env.LINEAR_API_KEY;
  if (isPlaceholder(key)) return status('LINEAR_API_KEY', 'MISSING', 'in .env nicht befuellt');
  const r = await probe('Linear', 'https://api.linear.app/graphql', {
    'Content-Type':  'application/json',
    'Authorization': key.startsWith('lin_api_') ? key : key,
  }, {
    method: 'POST',
    body: JSON.stringify({ query: '{ viewer { id email } }' }),
  });
  if (r.ok) {
    status('LINEAR_API_KEY', 'OK', `(${r.code})`);
  } else {
    status('LINEAR_API_KEY', 'FAIL', `${r.code || ''} ${r.msg || ''}`.trim());
  }
}

// ─── 2) Notion ───────────────────────────────────────────────────────────────
async function testNotion() {
  const token = env.NOTION_TOKEN;
  const dbId  = env.NOTION_DATABASE_ID;
  if (isPlaceholder(token)) {
    status('NOTION_TOKEN', 'MISSING', 'in .env nicht befuellt');
    return;
  }
  // a) /v1/users/me — pure auth check
  const r1 = await probe('Notion auth', 'https://api.notion.com/v1/users/me', {
    'Authorization':   `Bearer ${token}`,
    'Notion-Version':  '2022-06-28',
  });
  if (r1.ok) status('NOTION_TOKEN', 'OK', `(${r1.code})`);
  else       status('NOTION_TOKEN', 'FAIL', `${r1.code || ''} ${r1.msg || ''}`.trim());

  // b) DB-Zugriff (zeigt, ob die Integration zur Page geteilt wurde)
  if (isPlaceholder(dbId)) {
    status('NOTION_DATABASE_ID', 'MISSING', 'in .env nicht befuellt');
    return;
  }
  const r2 = await probe('Notion DB', `https://api.notion.com/v1/databases/${dbId}`, {
    'Authorization':   `Bearer ${token}`,
    'Notion-Version':  '2022-06-28',
  });
  if (r2.ok) status('NOTION_DATABASE_ID', 'OK', `(${r2.code} — Integration hat Zugriff)`);
  else       status('NOTION_DATABASE_ID', 'FAIL',
    r2.code === 404
      ? '404 — Integration ist NICHT zur Page "Whatsapp Vorlagen" geteilt'
      : `${r2.code || ''} ${r2.msg || ''}`.trim());
}

// ─── 3) Superchat ────────────────────────────────────────────────────────────
async function testSuperchat() {
  const key     = env.SUPERCHAT_API_KEY;
  const inboxId = env.SUPERCHAT_INBOX_ID;
  if (isPlaceholder(key)) {
    status('SUPERCHAT_API_KEY', 'MISSING', 'in .env nicht befuellt');
    return;
  }
  // Doku: https://developers.superchat.com/reference/listinboxes
  // Base-URL: https://api.superchat.com/v1.0
  const baseUrl   = env.SUPERCHAT_BASE_URL || 'https://api.superchat.com/v1.0';
  const endpoint  = `${baseUrl}/inboxes`;

  // Mehrere Auth-Header-Varianten probieren, weil die Doku das Format nicht eindeutig zeigt
  const variants = [
    { name: 'Bearer',     headers: { 'Authorization': `Bearer ${key}`, 'Accept': 'application/json' } },
    { name: 'X-API-Key',  headers: { 'X-API-Key': key,                   'Accept': 'application/json' } },
    { name: 'Token',      headers: { 'Authorization': `Token ${key}`,    'Accept': 'application/json' } },
    { name: 'raw-Auth',   headers: { 'Authorization': key,                'Accept': 'application/json' } },
  ];

  let lastCode = null;
  for (const v of variants) {
    const r = await probe('Superchat', endpoint, v.headers);
    if (r.ok) {
      status('SUPERCHAT_API_KEY', 'OK', `(${r.code} via "${v.name}")`);
      lastCode = 'OK';
      break;
    }
    lastCode = r.code;
  }
  if (lastCode !== 'OK') {
    status('SUPERCHAT_API_KEY', 'FAIL',
      `letzte Antwort: ${lastCode} (alle 4 Auth-Varianten gegen ${endpoint} probiert)`);
  }

  if (isPlaceholder(inboxId)) {
    status('SUPERCHAT_INBOX_ID', 'MISSING', 'in .env nicht befuellt');
  } else {
    status('SUPERCHAT_INBOX_ID', 'OK', '(gesetzt — Endpoint-spezifisch verifiziert beim ersten Send)');
  }
}

// ─── 4) Optional: Telegram ───────────────────────────────────────────────────
async function testTelegram() {
  const token = env.TELEGRAM_BOT_TOKEN;
  if (isPlaceholder(token)) {
    status('TELEGRAM_BOT_TOKEN', 'SKIP', 'optional, nicht gesetzt');
    return;
  }
  const r = await probe('Telegram', `https://api.telegram.org/bot${token}/getMe`, {});
  if (r.ok) status('TELEGRAM_BOT_TOKEN', 'OK', `(${r.code})`);
  else      status('TELEGRAM_BOT_TOKEN', 'FAIL', `${r.code || ''} ${r.msg || ''}`.trim());
}

// ─── Main ────────────────────────────────────────────────────────────────────
(async () => {
  console.log('\n[ENV-Test] .env smoke test\n');
  await testLinear();
  await testNotion();
  await testSuperchat();
  await testTelegram();
  console.log('\n[ENV-Test] done.\n');
})();
