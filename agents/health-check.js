/**
 * agents/health-check.js — Störungs-Monitor (VOR-14 #2)
 *
 * Prüft die Live-Plattform und meldet GRAVIERENDE Störungen per Telegram an Thomas:
 *   - PocketBase erreichbar?            GET /api/health → 200
 *   - Kunden-UI ausgeliefert?           GET / → 200 + enthält app.js
 *   - Server-Hooks geladen?             POST /api/vor/superchat-key → 401 (nicht 404)
 *   - Datenbank/Login intakt?           Superuser-Login → 200 (nur wenn PB-Creds vorhanden)
 *
 * Läuft per GitHub Actions alle ~30 Min. Telegram NUR bei Störung (gesund = still).
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

async function fetchT(url, opt) {
  try {
    const r = await fetch(url, Object.assign({ signal: AbortSignal.timeout(20000) }, opt || {}));
    const body = await r.text().catch(() => '');
    return { status: r.status, body };
  } catch (e) { return { status: 0, body: '', err: e.message }; }
}
async function telegram(text) {
  if (!TG_TOKEN || !TG_CHAT) { console.log('[Telegram] Token/Chat fehlt — nur Log:\n' + text); return; }
  const r = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: TG_CHAT, text }),
  });
  console.log(`[Telegram] ${r.ok ? 'gesendet ✓' : 'FEHLER ' + r.status}`);
}

(async () => {
  const fails = [];

  const health = await fetchT(`${PB_URL}/api/health`);
  if (health.status !== 200) fails.push(`PocketBase nicht erreichbar (GET /api/health → ${health.status || health.err})`);

  const site = await fetchT(`${PB_URL}/`);
  if (site.status !== 200 || !/app\.js/.test(site.body)) fails.push(`Kunden-UI nicht ausgeliefert (GET / → ${site.status})`);

  const hook = await fetchT(`${PB_URL}/api/vor/superchat-key`, { method: 'POST' });
  if (hook.status === 404) fails.push('Server-Hooks NICHT geladen (POST /api/vor/superchat-key → 404)');
  else if (hook.status === 0) fails.push(`Hook-Check fehlgeschlagen (${hook.err})`);

  if (env.PB_ADMIN_EMAIL && env.PB_ADMIN_PASSWORD) {
    const auth = await fetchT(`${PB_URL}/api/collections/_superusers/auth-with-password`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identity: env.PB_ADMIN_EMAIL, password: env.PB_ADMIN_PASSWORD }),
    });
    if (auth.status !== 200) fails.push(`Admin-Login/DB-Problem (auth → ${auth.status})`);
  }

  console.log(`[Health] PB=${health.status} Site=${site.status} Hook=${hook.status} | Störungen: ${fails.length}`);
  if (!fails.length) { console.log('[Health] alles ok ✓'); return; }

  const msg = '🚨 WhatsApp-Vorlagen — STÖRUNG erkannt:\n\n' + fails.map(f => '• ' + f).join('\n') + `\n\n→ ${PB_URL}/`;
  if (DRY) { console.log('[DRY-RUN] Telegram:\n' + msg); }
  else await telegram(msg);
  process.exit(1);
})().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
