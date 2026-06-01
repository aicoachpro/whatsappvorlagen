/**
 * agents/sync-header-media.js — Media-Header-Dateien Superchat → PocketBase (VOE-243/Media)
 *
 * Templates mit Bild-/Video-/Dokument-Header tragen in `header` nur einen Verweis
 * ({ file_id, type }). Dieses Script lädt die echte Datei von Superchat
 * (file_id → GET /files/{id} → link.url → Download) und legt sie im neuen
 * PocketBase-File-Feld `header_media` ab. Idempotent: lädt nur, wo noch keins liegt.
 *
 * .env: SUPERCHAT_API_KEY, PB_URL, PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD
 * Usage:
 *   node agents/sync-header-media.js --dry-run   # nur zählen
 *   node agents/sync-header-media.js [--limit N]
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
const SC_KEY = env.SUPERCHAT_API_KEY;
const SC_BASE = (env.SUPERCHAT_BASE_URL || 'https://api.superchat.com/v1.0');
const PB_URL = (env.PB_URL || 'https://vorlagen.voelkergroup.cloud').replace(/\/$/, '');
const PB_EMAIL = env.PB_ADMIN_EMAIL, PB_PASS = env.PB_ADMIN_PASSWORD;
if (!SC_KEY || !PB_EMAIL || !PB_PASS) { console.error('SUPERCHAT_API_KEY / PB_ADMIN_* fehlt'); process.exit(2); }

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const LIMIT = args.indexOf('--limit') >= 0 ? parseInt(args[args.indexOf('--limit') + 1], 10) : null;

let TOK = null;
async function pb(method, p, body, isForm) {
  const headers = { 'Accept': 'application/json' };
  if (TOK) headers['Authorization'] = TOK;
  if (body !== undefined && !isForm) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${PB_URL}${p}`, { method, headers, body: isForm ? body : (body !== undefined ? JSON.stringify(body) : undefined), signal: AbortSignal.timeout(60000) });
  const t = await res.text(); if (!res.ok) throw new Error(`PB ${res.status} ${method} ${p}: ${t.slice(0, 200)}`); return t ? JSON.parse(t) : null;
}
async function pbAuth() { TOK = (await pb('POST', '/api/collections/_superusers/auth-with-password', { identity: PB_EMAIL, password: PB_PASS })).token; }

async function ensureHeaderMediaField() {
  const c = await pb('GET', '/api/collections/templates');
  if (c.fields.some(f => f.name === 'header_media')) return;
  if (DRY) { console.log('  (würde Feld header_media anlegen)'); return; }
  await pb('PATCH', `/api/collections/${c.id}`, {
    fields: [...c.fields, { name: 'header_media', type: 'file', maxSelect: 1, maxSize: 15000000, mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'application/pdf'] }],
  });
  console.log('  Feld header_media angelegt ✓');
}

async function scFileLink(fileId) {
  const res = await fetch(`${SC_BASE}/files/${fileId}`, { headers: { 'X-API-Key': SC_KEY, 'Accept': 'application/json' }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`Superchat /files/${fileId} ${res.status}`);
  const j = await res.json();
  return { url: j.link?.url, name: j.name || `${fileId}`, mime: j.mime_type || 'application/octet-stream' };
}

async function pbAllWithHeader() {
  const out = []; let page = 1;
  while (true) {
    const j = await pb('GET', `/api/collections/templates/records?perPage=200&page=${page}&fields=id,name,header,header_media`);
    out.push(...j.items); if (page >= j.totalPages) break; page++;
  }
  return out;
}

(async () => {
  console.log(`\n[Header-Media] Auth + Schema ...`);
  await pbAuth();
  await ensureHeaderMediaField();
  const recs = await pbAllWithHeader();
  let todo = recs.filter(r => r.header && ['image', 'video', 'document'].includes(r.header.type) && r.header.file_id && !r.header_media);
  const byType = {};
  for (const r of recs) if (r.header && r.header.type) byType[r.header.type] = (byType[r.header.type] || 0) + 1;
  console.log(`[Header-Media] Header-Typen gesamt:`, byType);
  console.log(`[Header-Media] Media-Header ohne Datei: ${todo.length}`);
  if (LIMIT) todo = todo.slice(0, LIMIT);
  if (DRY) { console.log(`[Header-Media] DRY-RUN — ${todo.length} würden geladen.\n`); return; }

  let done = 0, err = 0;
  for (let i = 0; i < todo.length; i++) {
    const r = todo[i];
    try {
      const { url, name, mime } = await scFileLink(r.header.file_id);
      if (!url) throw new Error('kein link.url');
      const bin = await fetch(url, { signal: AbortSignal.timeout(60000) });
      if (!bin.ok) throw new Error(`download ${bin.status}`);
      const buf = Buffer.from(await bin.arrayBuffer());
      const form = new FormData();
      form.append('header_media', new Blob([buf], { type: mime }), name);
      await pb('PATCH', `/api/collections/templates/records/${r.id}`, form, true);
      done++;
      if (i % 10 === 0 || i === todo.length - 1) console.log(`  [${i + 1}/${todo.length}] ${r.name.slice(0, 40)} ← ${name}`);
    } catch (e) {
      err++; console.error(`  ✗ ${r.name}: ${e.message.slice(0, 120)}`);
    }
  }
  console.log(`\n[Header-Media] Geladen: ${done}  Fehler: ${err}\n`);
})().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
