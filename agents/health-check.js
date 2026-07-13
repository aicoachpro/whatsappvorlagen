/**
 * agents/health-check.js — Störungs-Monitor (VOR-14 #2)
 *
 * Prüft die Live-Plattform und meldet GRAVIERENDE Störungen per Telegram an Thomas:
 *   - PocketBase erreichbar?            GET /api/health → 200
 *   - Kunden-UI ausgeliefert?           GET / → 200 + enthält app.js
 *   - Server-Hooks geladen?             POST /api/vor/superchat-key → 401 (404 = weg, 5xx = kaputt)
 *   - Datenbank/Login intakt?           Superuser-Login → 200 (nur wenn PB-Creds vorhanden)
 *
 * Läuft per GitHub Actions alle ~30 Min. Telegram NUR bei Störung (gesund = still).
 *
 * VOR-15 — Fehlalarme: GitHub-Runner kommen sporadisch nicht an den VPS ran (Netz-Blip,
 * nicht Server-Ausfall). Dagegen zwei Stufen: Retry pro Check (Sekunden-Blips) und eine
 * Gegenprobe nach 90s (Minuten-Blips). Alarm erst, wenn die Störung beides überlebt.
 * Der Fehlergrund (TimeoutError / ECONNREFUSED / ...) steht immer im Log, nicht nur im Telegram.
 *
 * .env: PB_URL, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID  (optional PB_ADMIN_EMAIL/PASSWORD)
 * Usage: node agents/health-check.js [--dry-run]
 */
'use strict';
const fs = require('fs'), path = require('path');
const ENV_PATH = path.join(__dirname, '..', '.env');
function loadEnv() {
  const env = {};
  try {
    for (const raw of fs.readFileSync(ENV_PATH, 'utf8').split('\n')) {
      const line = raw.trim(); if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('='); if (eq < 0) continue;
      let v = line.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      env[line.slice(0, eq).trim()] = v;
    }
  } catch (_) {}
  return env;
}
const env = loadEnv();
const PB_URL = (env.PB_URL || 'https://vorlagen.voelkergroup.cloud').replace(/\/$/, '');
const TG_TOKEN = env.TELEGRAM_BOT_TOKEN, TG_CHAT = env.TELEGRAM_CHAT_ID;
const DRY = process.argv.includes('--dry-run');

const TIMEOUT_MS = 15000;
const RETRIES = 3;              // pro Check — faengt Sekunden-Blips des Runners ab
const RECHECK_DELAY_MS = 90000; // Gegenprobe vor Alarm — faengt Minuten-Blips ab
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Ergebnis lesbar machen: HTTP-Status, sonst der Grund (TimeoutError / ECONNREFUSED / ENOTFOUND ...)
const dsc = (r) => r.status || r.err || 'unbekannt';

async function fetchT(url, opt) {
  let last = { status: 0, body: '', err: 'unbekannt' };
  for (let i = 1; i <= RETRIES; i++) {
    try {
      const r = await fetch(url, Object.assign({ signal: AbortSignal.timeout(TIMEOUT_MS) }, opt || {}));
      const body = await r.text().catch(() => '');
      // 5xx ist genauso transient-verdaechtig wie ein Netzwerkfehler → auch da nochmal versuchen
      if (r.status < 500) return { status: r.status, body };
      last = { status: r.status, body, err: `HTTP ${r.status}` };
    } catch (e) {
      // Node verpackt Netzwerkfehler als nichtssagendes "TypeError: fetch failed" — der echte
      // Grund (ECONNREFUSED / ECONNRESET / ENOTFOUND) steckt in e.cause. Genau den brauchen wir.
      const cause = e.cause && (e.cause.code || e.cause.message);
      const why = e.name === 'TimeoutError' ? `Timeout nach ${TIMEOUT_MS / 1000}s`
        : cause || `${e.name}: ${e.message}`;
      last = { status: 0, body: '', err: why };
    }
    if (i < RETRIES) await sleep(2000 * i); // 2s, 4s
  }
  return last;
}

async function telegram(text) {
  if (!TG_TOKEN || !TG_CHAT) { console.log('[Telegram] Token/Chat fehlt — nur Log:\n' + text); return; }
  try {
    const r = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TG_CHAT, text, disable_web_page_preview: true }),
      signal: AbortSignal.timeout(15000),
    });
    if (r.ok) { console.log('[Telegram] gesendet ✓'); return; }
    console.error(`[Telegram] FEHLER ${r.status}: ${(await r.text().catch(() => '')).slice(0, 200)}`);
  } catch (e) { console.error(`[Telegram] Versand fehlgeschlagen: ${e.message}`); }
}

async function runChecks() {
  const fails = [], diag = [];

  const health = await fetchT(`${PB_URL}/api/health`);
  diag.push(`PB=${dsc(health)}`);
  if (health.status !== 200) fails.push(`PocketBase nicht erreichbar (GET /api/health → ${dsc(health)})`);

  const site = await fetchT(`${PB_URL}/`);
  diag.push(`Site=${dsc(site)}`);
  if (site.status !== 200) fails.push(`Kunden-UI nicht erreichbar (GET / → ${dsc(site)})`);
  else if (!/app\.js/.test(site.body)) fails.push('Kunden-UI antwortet, liefert aber kein app.js aus (GET / → 200)');

  // Hooks geladen = 401 (Auth fehlt). 404 = Hooks weg, 5xx = Server kaputt — beides Störung.
  const hook = await fetchT(`${PB_URL}/api/vor/superchat-key`, { method: 'POST' });
  diag.push(`Hook=${dsc(hook)}`);
  if (hook.status === 404) fails.push('Server-Hooks NICHT geladen (POST /api/vor/superchat-key → 404)');
  else if (hook.status !== 401) fails.push(`Server-Hooks antworten unerwartet (POST /api/vor/superchat-key → ${dsc(hook)}, erwartet 401)`);

  if (env.PB_ADMIN_EMAIL && env.PB_ADMIN_PASSWORD) {
    const auth = await fetchT(`${PB_URL}/api/collections/_superusers/auth-with-password`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identity: env.PB_ADMIN_EMAIL, password: env.PB_ADMIN_PASSWORD }),
    });
    diag.push(`Auth=${dsc(auth)}`);
    if (auth.status !== 200) fails.push(`Admin-Login/DB-Problem (auth → ${dsc(auth)})`);
  }

  return { fails, diag };
}

(async () => {
  let { fails, diag } = await runChecks();
  console.log(`[Health] ${diag.join(' ')} | Störungen: ${fails.length}`);
  if (!fails.length) { console.log('[Health] alles ok ✓'); return; }

  // Gegenprobe: GitHub-Runner kommen sporadisch nicht an den VPS ran (VOR-15).
  // Erst wenn die Störung sie überlebt, ist sie echt.
  fails.forEach(f => console.log('  ? ' + f));
  console.log(`[Health] Gegenprobe in ${RECHECK_DELAY_MS / 1000}s ...`);
  await sleep(RECHECK_DELAY_MS);

  ({ fails, diag } = await runChecks());
  console.log(`[Health] Gegenprobe: ${diag.join(' ')} | Störungen: ${fails.length}`);
  if (!fails.length) { console.log('[Health] Gegenprobe sauber — transienter Blip, kein Alarm ✓'); return; }

  fails.forEach(f => console.error('  ! ' + f));
  const msg = '🚨 WhatsApp-Vorlagen — STÖRUNG erkannt (2× in Folge geprüft):\n\n'
    + fails.map(f => '• ' + f).join('\n') + `\n\n→ ${PB_URL}/`;
  if (DRY) { console.log('[DRY-RUN] Telegram:\n' + msg); }
  else await telegram(msg);
  process.exit(1);
})().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
