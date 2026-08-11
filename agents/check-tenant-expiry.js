/**
 * agents/check-tenant-expiry.js — Lizenz-Ablauf prüfen + erinnern (VOE-247)
 *
 * Täglich per Cron (VPS). Für jeden Mandanten mit `expires_at`:
 *   - abgelaufen (< heute) und noch nicht `expired` → status=expired (Login-Block greift)
 *   - läuft in ≤14 Tagen ab → in Telegram-Erinnerung aufnehmen
 * Sendet eine Telegram-Nachricht an Thomas, wenn es etwas zu melden gibt.
 *
 * .env: PB_URL, PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
 * Usage: node agents/check-tenant-expiry.js [--dry-run]
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
const TG_TOKEN = env.TELEGRAM_BOT_TOKEN, TG_CHAT = env.TELEGRAM_CHAT_ID;
if (!PB_EMAIL || !PB_PASS) { console.error('PB_ADMIN_* fehlt'); process.exit(2); }
const DRY = process.argv.includes('--dry-run');

let TOK = null;
async function pb(m, p, b) {
  const h = { 'Accept': 'application/json' }; if (TOK) h['Authorization'] = TOK; if (b !== undefined) h['Content-Type'] = 'application/json';
  const r = await fetch(`${PB_URL}${p}`, { method: m, headers: h, body: b !== undefined ? JSON.stringify(b) : undefined, signal: AbortSignal.timeout(30000) });
  const t = await r.text(); if (!r.ok) throw new Error(`PB ${r.status} ${m} ${p}: ${t.slice(0, 200)}`); return t ? JSON.parse(t) : null;
}
const days = (d) => Math.ceil((new Date(d) - new Date()) / 86400000);
const fmt = (d) => new Date(d).toLocaleDateString('de-DE');

async function telegram(text) {
  if (!TG_TOKEN || !TG_CHAT) { console.log('[Telegram] Token/Chat fehlt — Nachricht nur im Log:\n' + text); return; }
  const r = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: TG_CHAT, text, disable_web_page_preview: true }),
    signal: AbortSignal.timeout(15000),
  });
  console.log(`[Telegram] ${r.ok ? 'gesendet ✓' : 'FEHLER ' + r.status}`);
}

(async () => {
  TOK = (await pb('POST', '/api/collections/_superusers/auth-with-password', { identity: PB_EMAIL, password: PB_PASS })).token;
  const tenants = (await pb('GET', '/api/collections/tenants/records?perPage=500')).items;
  const users = (await pb('GET', '/api/collections/users/records?perPage=500')).items;
  // WV-7 (DSGVO-Datenminimierung): KEINE Kunden-E-Mails an Telegram oder ins Log — nur
  // Firmen-/Mandantenname. Die Adressen stehen in der Admin-UI (Kunden verwalten).

  const soon = [], justExpired = [];
  for (const t of tenants) {
    if (!t.expires_at) continue;
    const d = days(t.expires_at);
    if (d < 0) {
      if (t.status !== 'expired') {
        if (!DRY) await pb('PATCH', `/api/collections/tenants/records/${t.id}`, { status: 'expired' });
        justExpired.push(t);
      }
    } else if (d <= 14) {
      soon.push({ t, d });
    }
  }
  soon.sort((a, b) => a.d - b.d);

  // VOR-13: offene Verlängerungs-Anfragen (Tenant noch nicht wieder aktiv)
  const tById = {}; for (const t of tenants) tById[t.id] = t;
  let renewals = [];
  try {
    renewals = (await pb('GET', '/api/collections/renewal_requests/records?perPage=200')).items
      .filter(r => !r.handled && tById[r.tenant] && tById[r.tenant].status !== 'active');
  } catch (_) { renewals = []; }
  // pro Tenant nur einmal melden
  const seenT = new Set(); renewals = renewals.filter(r => (seenT.has(r.tenant) ? false : seenT.add(r.tenant)));

  // VOR-14: neu registrierte Kunden (registered_at in den letzten ~26h)
  const regCut = Date.now() - 26 * 3600 * 1000;
  const registered = users.filter(u => u.role !== 'admin' && u.registered_at && new Date(u.registered_at).getTime() >= regCut);

  console.log(`[Expiry] geprüft: ${tenants.length} | bald ab: ${soon.length} | gesperrt: ${justExpired.length} | Verlängerung: ${renewals.length} | neu registriert: ${registered.length}`);
  if (!soon.length && !justExpired.length && !renewals.length && !registered.length) { console.log('[Expiry] nichts zu melden.'); return; }

  let msg = '🔔 WhatsApp-Vorlagen — Kunden-Lizenzen\n';
  if (registered.length) {
    msg += '\n🎉 Neu registriert (Einladung angenommen):\n';
    for (const u of registered) { const t = tById[u.tenant]; msg += `• ${t ? (t.firma || t.name) : 'Mandant ' + (u.tenant || '?')}\n`; }
  }
  if (renewals.length) {
    msg += '\n💶 Verlängerung ANGEFRAGT (Kunde wartet):\n';
    for (const r of renewals) { const t = tById[r.tenant]; msg += `• ${t.firma || t.name}\n`; }
  }
  if (soon.length) {
    msg += '\n⏰ Läuft bald ab (verlängern?):\n';
    for (const { t, d } of soon) msg += `• ${t.firma || t.name} — in ${d} Tg. (${fmt(t.expires_at)})\n`;
  }
  if (justExpired.length) {
    msg += '\n🔴 Soeben abgelaufen — Zugang gesperrt:\n';
    for (const t of justExpired) msg += `• ${t.firma || t.name}\n`;
  }
  msg += '\n→ Verlängern: ' + PB_URL + '/  (Kunden verwalten → +1 Jahr)';
  if (DRY) { console.log('[DRY-RUN] Telegram-Nachricht:\n' + msg); return; }
  await telegram(msg);
})().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
