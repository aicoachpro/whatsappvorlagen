/**
 * agents/setup-mail.js — PocketBase-Mailversand konfigurieren (VOR-11)
 *
 * AI-generated: VOR-11
 *
 * Setzt per PocketBase-Settings-API (Superuser):
 *   1. SMTP (Postfach noreply@voelkergroup.cloud) → smtp.hostinger.com
 *   2. meta.appURL + Absender (senderName/senderAddress)
 *   3. resetPasswordTemplate der `users`-Collection → Link auf die Kunden-UI
 *      (`{APP_URL}/?reset={TOKEN}`, deutscher Text) — dient für „Passwort vergessen"
 *      UND die Willkommens-Mail beim Kunde-Anlegen.
 *
 * Das Postfach-Passwort kommt aus `.env` (MAIL_PASSWORD) — NIE in Code/Chat/Log.
 *
 * .env: PB_URL, PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD, MAIL_PASSWORD
 *   optional: MAIL_SMTP_HOST, MAIL_SMTP_PORT, MAIL_SMTP_USER, MAIL_SENDER_NAME,
 *             MAIL_SENDER_ADDRESS, APP_URL
 * Usage: node agents/setup-mail.js [--dry-run]
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

// Mail-Konfiguration (Defaults für voelkergroup.cloud; via .env überschreibbar)
const SMTP_HOST = env.MAIL_SMTP_HOST   || 'smtp.hostinger.com';
const SMTP_PORT = parseInt(env.MAIL_SMTP_PORT || '465', 10);
const SMTP_USER = env.MAIL_SMTP_USER   || 'noreply@voelkergroup.cloud';
const SMTP_PASS = env.MAIL_PASSWORD;
const SENDER_NAME = env.MAIL_SENDER_NAME    || 'Völker Vorlagen';
const SENDER_ADDR = env.MAIL_SENDER_ADDRESS || SMTP_USER;
const APP_URL     = (env.APP_URL || 'https://vorlagen.voelkergroup.cloud').replace(/\/$/, '');

if (!SMTP_PASS || /your_|changeme|placeholder/i.test(SMTP_PASS)) {
  console.error('MAIL_PASSWORD fehlt in .env — bitte das Passwort des Postfachs ' + SMTP_USER + ' eintragen.');
  process.exit(2);
}

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
  if (!res.ok) throw new Error(`PB ${res.status} ${method} ${p}: ${t.slice(0, 300)}`);
  return t ? JSON.parse(t) : null;
}

// AI-generated: VOR-11 — deutsches Reset-/Willkommens-Template; Link auf die Kunden-UI
const RESET_SUBJECT = 'Deine neue WhatsApp-Vorlagen-App — Zugang & Start';
const RESET_BODY =
  '<p>Hallo,</p>\n' +
  '<p>ab sofort läuft die Verwaltung deiner WhatsApp-Vorlagen in einer <strong>eigenen App</strong> statt über Notion. Deine Vorteile:</p>\n' +
  '<ul>\n' +
  '  <li><strong>Mehr Einstellungen</strong> – Firma, eigene Links und eigene Anpassungen pro Vorlage.</li>\n' +
  '  <li><strong>Automatisierung per Knopfdruck</strong> – hinterlegst du deine SuperChat-API, überträgst du Vorlagen mit einem Klick in deinen SuperChat-Account (kein Abtippen mehr).</li>\n' +
  '</ul>\n' +
  '<p><strong>So startest du:</strong> klicke auf den Button, vergib dein eigenes Passwort und logge dich dann mit deiner E-Mail ein.</p>\n' +
  '<p><a class="btn" href="{APP_URL}/?reset={TOKEN}" target="_blank" rel="noopener">Passwort setzen &amp; loslegen</a></p>\n' +
  '<p>Ein kurzes Erklär-Video folgt in Kürze. Bei Fragen einfach auf diese E-Mail antworten.</p>\n' +
  '<p>Dein Völker-Team</p>';

(async () => {
  console.log(`\n[Mail-Setup] Auth gegen ${PB_URL} ...`);
  if (DRY_RUN) {
    console.log('(DRY-RUN) WÜRDE setzen:');
    console.log(`  SMTP: ${SMTP_USER} @ ${SMTP_HOST}:${SMTP_PORT} (TLS ${SMTP_PORT === 465}) — Passwort: ${'*'.repeat(8)}`);
    console.log(`  Absender: "${SENDER_NAME}" <${SENDER_ADDR}>`);
    console.log(`  App-URL: ${APP_URL}`);
    console.log(`  Reset-Template-Link: ${APP_URL}/?reset={TOKEN}`);
    return;
  }
  PB_TOKEN = (await pb('POST', '/api/collections/_superusers/auth-with-password', { identity: PB_EMAIL, password: PB_PASS })).token;

  // 1) SMTP + meta
  await pb('PATCH', '/api/settings', {
    smtp: { enabled: true, host: SMTP_HOST, port: SMTP_PORT, username: SMTP_USER, password: SMTP_PASS, authMethod: 'PLAIN', tls: SMTP_PORT === 465 },
    meta: { senderName: SENDER_NAME, senderAddress: SENDER_ADDR, appURL: APP_URL },
  });
  console.log(`  SMTP gesetzt: ${SMTP_USER} @ ${SMTP_HOST}:${SMTP_PORT}; Absender "${SENDER_NAME}" <${SENDER_ADDR}>; App-URL ${APP_URL}`);

  // 2) Reset-Template der users-Collection → Link auf die Kunden-UI
  const users = await pb('GET', '/api/collections/users');
  await pb('PATCH', `/api/collections/${users.id}`, { resetPasswordTemplate: { subject: RESET_SUBJECT, body: RESET_BODY } });
  console.log('  resetPasswordTemplate gesetzt (Link → Kunden-UI, deutscher Text)');

  console.log('\n[Mail-Setup] Fertig. Test: im Login „Passwort vergessen?" → Mail muss ankommen, Link → Passwort setzen.\n');
})().catch(err => { console.error('[Mail-Setup] Fatal:', err.message || err); process.exit(1); });
