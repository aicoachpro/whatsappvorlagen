/**
 * tests/tenant-isolation.js — Cross-Tenant-Sicherheitstest (VOE-240)
 *
 * Beweist die Mandantentrennung der PocketBase-API-Rules:
 *   - Kunde A sieht NUR Overlays seines Tenants (nicht die von B)
 *   - Kunde A kann B's Overlay weder direkt lesen noch ändern noch löschen
 *   - Kunde A sieht/ändert sein eigenes Overlay
 *   - WV-7: Kunde A kann sein Overlay NICHT in einen fremden Tenant umhängen (Reparenting)
 *   - WV-7: abgelaufener Kunde darf einloggen, sieht aber keine Templates und schreibt nichts
 *
 * Legt temporäre Test-Tenants/Kunden/Overlays an und räumt sie am Ende restlos weg.
 * .env: PB_URL, PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD
 * Usage: node tests/tenant-isolation.js
 */
'use strict';

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

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
if (!PB_EMAIL || !PB_PASS) { console.error('PB_ADMIN_* fehlt in .env'); process.exit(2); }

async function req(method, p, body, token) {
  const headers = { 'Accept': 'application/json' };
  if (token) headers['Authorization'] = token;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${PB_URL}${p}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20_000) });
  const txt = await res.text();
  let json = null; try { json = txt ? JSON.parse(txt) : null; } catch {}
  return { status: res.status, json };
}
const pw = () => crypto.randomBytes(12).toString('base64') + 'aA1!';

let results = [];
function check(name, cond) { results.push({ name, ok: !!cond }); console.log(`  ${cond ? '✓ PASS' : '✗ FAIL'}  ${name}`); }

(async () => {
  console.log(`\n[Isolation-Test] gegen ${PB_URL}`);
  const su = (await req('POST', '/api/collections/_superusers/auth-with-password', { identity: PB_EMAIL, password: PB_PASS })).json.token;
  const created = { tenants: [], users: [], overlays: [] };

  try {
    // Ein echtes Template als Referenz
    const tpl = (await req('GET', '/api/collections/templates/records?perPage=1', undefined, su)).json.items[0];

    // 2 Tenants
    const tA = (await req('POST', '/api/collections/tenants/records', { name: 'TEST Tenant A', slug: 'test-a-' + Date.now(), status: 'active' }, su)).json;
    const tB = (await req('POST', '/api/collections/tenants/records', { name: 'TEST Tenant B', slug: 'test-b-' + Date.now(), status: 'active' }, su)).json;
    created.tenants.push(tA.id, tB.id);

    // 2 Kunden
    const passA = pw(), passB = pw();
    const emailA = `test-a-${Date.now()}@example.invalid`, emailB = `test-b-${Date.now()}@example.invalid`;
    const uA = (await req('POST', '/api/collections/users/records', { email: emailA, password: passA, passwordConfirm: passA, tenant: tA.id, role: 'customer', verified: true }, su)).json;
    const uB = (await req('POST', '/api/collections/users/records', { email: emailB, password: passB, passwordConfirm: passB, tenant: tB.id, role: 'customer', verified: true }, su)).json;
    created.users.push(uA.id, uB.id);

    // Je 1 Overlay pro Tenant (als Superuser angelegt)
    const oA = (await req('POST', '/api/collections/template_overlays/records', { tenant: tA.id, template: tpl.id, notes: 'A-secret' }, su)).json;
    const oB = (await req('POST', '/api/collections/template_overlays/records', { tenant: tB.id, template: tpl.id, notes: 'B-secret' }, su)).json;
    created.overlays.push(oA.id, oB.id);

    // Login als Kunde A
    const tokA = (await req('POST', '/api/collections/users/auth-with-password', { identity: emailA, password: passA }).then(r => r)).json.token;
    check('Kunde A kann sich einloggen', !!tokA);

    // 1) Liste: A sieht nur eigenes Overlay
    const list = (await req('GET', '/api/collections/template_overlays/records?perPage=100', undefined, tokA)).json;
    check('A sieht genau 1 Overlay (sein eigenes)', list.items.length === 1 && list.items[0].id === oA.id);
    check('A sieht NICHT B\'s Overlay in der Liste', !list.items.some(o => o.id === oB.id));

    // 2) Direktzugriff auf B's Overlay → blockiert (404)
    const viewB = await req('GET', `/api/collections/template_overlays/records/${oB.id}`, undefined, tokA);
    check('A kann B\'s Overlay NICHT direkt lesen (404)', viewB.status === 404);

    // 3) Update auf B's Overlay → blockiert
    const patchB = await req('PATCH', `/api/collections/template_overlays/records/${oB.id}`, { notes: 'hacked' }, tokA);
    check('A kann B\'s Overlay NICHT ändern (404/403)', patchB.status === 404 || patchB.status === 403);

    // 4) Delete auf B's Overlay → blockiert
    const delB = await req('DELETE', `/api/collections/template_overlays/records/${oB.id}`, undefined, tokA);
    check('A kann B\'s Overlay NICHT löschen (404/403)', delB.status === 404 || delB.status === 403);

    // 5) A kann sein eigenes lesen
    const viewA = await req('GET', `/api/collections/template_overlays/records/${oA.id}`, undefined, tokA);
    check('A kann sein eigenes Overlay lesen (200)', viewA.status === 200 && viewA.json.notes === 'A-secret');

    // 6) B's Overlay ist unverändert
    const stillB = await req('GET', `/api/collections/template_overlays/records/${oB.id}`, undefined, su);
    check('B\'s Overlay blieb unverändert ("B-secret")', stillB.json && stillB.json.notes === 'B-secret');

    // 7) WV-7 Reparenting: A hängt sein EIGENES Overlay per PATCH in Tenant B um → blockiert
    const repar = await req('PATCH', `/api/collections/template_overlays/records/${oA.id}`, { tenant: tB.id }, tokA);
    const oAafter = (await req('GET', `/api/collections/template_overlays/records/${oA.id}`, undefined, su)).json;
    check('A kann sein Overlay NICHT in Tenant B umhängen (Reparenting blockiert)',
      repar.status >= 400 && oAafter && oAafter.tenant === tA.id);

    // 8) WV-7 Lizenz-Status: abgelaufener Kunde darf einloggen (Verlängerungs-Screen),
    //    sieht aber keine Templates und kann keine Overlays anlegen.
    const tC = (await req('POST', '/api/collections/tenants/records', { name: 'TEST Tenant C (expired)', slug: 'test-c-' + Date.now(), status: 'expired' }, su)).json;
    created.tenants.push(tC.id);
    const passC = pw(), emailC = `test-c-${Date.now()}@example.invalid`;
    const uC = (await req('POST', '/api/collections/users/records', { email: emailC, password: passC, passwordConfirm: passC, tenant: tC.id, role: 'customer', verified: true }, su)).json;
    created.users.push(uC.id);
    const tokC = (await req('POST', '/api/collections/users/auth-with-password', { identity: emailC, password: passC })).json.token;
    check('Abgelaufener Kunde C kann sich einloggen (Verlängerungs-Screen)', !!tokC);
    const tplListC = (await req('GET', '/api/collections/templates/records?perPage=5', undefined, tokC)).json;
    check('C (expired) sieht KEINE Templates', tplListC && Array.isArray(tplListC.items) && tplListC.items.length === 0);
    const ovC = await req('POST', '/api/collections/template_overlays/records', { tenant: tC.id, template: tpl.id, notes: 'C' }, tokC);
    check('C (expired) kann KEIN Overlay anlegen', ovC.status >= 400);

  } finally {
    // Cleanup (als Superuser)
    for (const id of created.overlays) await req('DELETE', `/api/collections/template_overlays/records/${id}`, undefined, su).catch(() => {});
    for (const id of created.users)    await req('DELETE', `/api/collections/users/records/${id}`, undefined, su).catch(() => {});
    for (const id of created.tenants)  await req('DELETE', `/api/collections/tenants/records/${id}`, undefined, su).catch(() => {});
    console.log('  (Test-Daten aufgeräumt)');
  }

  const failed = results.filter(r => !r.ok).length;
  console.log(`\n[Isolation-Test] ${results.length - failed}/${results.length} PASS${failed ? ` — ${failed} FAIL` : ' — Mandantentrennung bestätigt ✅'}\n`);
  process.exit(failed ? 1 : 0);
})().catch(err => { console.error('[Isolation-Test] Fatal:', err.message || err); process.exit(1); });
