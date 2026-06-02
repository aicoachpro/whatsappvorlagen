/**
 * agents/setup-telegram.js — Telegram-Chat-ID ermitteln + Test senden (VOE-247)
 *
 * Liest TELEGRAM_BOT_TOKEN aus .env, holt die Chat-ID aus den letzten Bot-Updates
 * (du musst dem Bot vorher eine Nachricht geschrieben haben), schreibt
 * TELEGRAM_CHAT_ID in die .env und sendet eine Test-Nachricht.
 *
 * Usage: node agents/setup-telegram.js
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
const TOKEN = env.TELEGRAM_BOT_TOKEN;
if (!TOKEN || TOKEN.includes('your_')) {
  // Nur Variablen-NAMEN ausgeben (keine Werte) zur Diagnose
  console.error('TELEGRAM_BOT_TOKEN nicht gefunden. Vorhandene Variablennamen in .env:');
  console.error('  ' + Object.keys(env).join(', '));
  process.exit(2);
}

function setEnvVar(key, value) {
  let txt = fs.readFileSync(ENV_PATH, 'utf8');
  const re = new RegExp(`^${key}=.*$`, 'm');
  if (re.test(txt)) txt = txt.replace(re, `${key}=${value}`);
  else txt = txt.replace(/\n?$/, `\n${key}=${value}\n`);
  fs.writeFileSync(ENV_PATH, txt);
}

(async () => {
  const me = await (await fetch(`https://api.telegram.org/bot${TOKEN}/getMe`, { signal: AbortSignal.timeout(12000) })).json();
  if (!me.ok) { console.error('Token-Fehler:', me.description); process.exit(1); }
  console.log(`Bot: @${me.result.username}`);

  const up = await (await fetch(`https://api.telegram.org/bot${TOKEN}/getUpdates`, { signal: AbortSignal.timeout(12000) })).json();
  let chatId = null;
  for (const u of (up.result || []).reverse()) {
    const m = u.message || u.edited_message || {};
    if (m.chat && m.chat.id) { chatId = m.chat.id; break; }
  }
  if (!chatId) { console.error('Keine Nachricht gefunden — bitte dem Bot eine schreiben (kein reines /start) und erneut ausführen.'); process.exit(1); }
  console.log(`Chat-ID: ${chatId}`);
  setEnvVar('TELEGRAM_CHAT_ID', chatId);
  console.log('→ TELEGRAM_CHAT_ID in .env gespeichert');

  const r = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: '✅ WhatsApp-Vorlagen: Telegram verbunden! Hier kommen künftig die Ablauf-Erinnerungen für deine Kunden-Lizenzen.' }),
    signal: AbortSignal.timeout(12000),
  });
  console.log('Test-Nachricht: ' + ((await r.json()).ok ? 'gesendet ✓ (schau auf dein Handy)' : 'FEHLER'));
})().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
