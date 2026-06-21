/**
 * agents/sync-superchat-to-pb.js — Mirror Superchat-Templates → PocketBase
 *
 * Phase 2 (VOE-238): Superchat ist Master, PocketBase ist die Mirror-/Auslieferungs-DB.
 * (Notion-Sync war übergangsweise parallel aktiv — Notion in Phase 6 / VOR-2 abgeschaltet 2026-06-21.)
 *
 * - Legt die Collection `templates` idempotent an (falls nicht vorhanden).
 * - Upsert per `superchat_id`: schreibt NUR die Superchat-Felder.
 *   Die Völker-Anreicherungsfelder (kategorie, ordner, ueberschrift, buttons, urls,
 *   telefonnummer, schnellantwort, notizen, vorschaubild) werden NIE überschrieben.
 * - Vorschaubild (assets/previews/<id>.png) wird optional hochgeladen, aber nur wenn der
 *   Record noch keines hat (überschreibt keine Admin-Pflege).
 *
 * .env benötigt zusätzlich:
 *   PB_URL=https://vorlagen.voelkergroup.cloud
 *   PB_ADMIN_EMAIL=thomas@voelker.digital
 *   PB_ADMIN_PASSWORD=...        (NICHT committen — nur lokal in .env)
 *
 * Usage:
 *   node agents/sync-superchat-to-pb.js --limit 3 --no-image   # Test (3 Templates, ohne Bild)
 *   node agents/sync-superchat-to-pb.js --dry-run              # nur Plan
 *   node agents/sync-superchat-to-pb.js                        # alle, inkl. Bild-Upload
 */
'use strict';

const fs   = require('fs');
const path = require('path');

// ─── ENV ─────────────────────────────────────────────────────────────────────
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

const SC_KEY   = env.SUPERCHAT_API_KEY;
const SC_BASE  = env.SUPERCHAT_BASE_URL || 'https://api.superchat.com/v1.0';
const PB_URL   = (env.PB_URL || 'https://vorlagen.voelkergroup.cloud').replace(/\/$/, '');
const PB_EMAIL = env.PB_ADMIN_EMAIL;
const PB_PASS  = env.PB_ADMIN_PASSWORD;

if (!SC_KEY  || SC_KEY.includes('your_'))  { console.error('SUPERCHAT_API_KEY fehlt in .env'); process.exit(2); }
if (!PB_EMAIL) { console.error('PB_ADMIN_EMAIL fehlt in .env'); process.exit(2); }
if (!PB_PASS)  { console.error('PB_ADMIN_PASSWORD fehlt in .env'); process.exit(2); }

// ─── Args ────────────────────────────────────────────────────────────────────
const args     = process.argv.slice(2);
const argv     = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const LIMIT    = argv('--limit') ? parseInt(argv('--limit'), 10) : null;
const DRY_RUN  = args.includes('--dry-run');
const NO_IMAGE = args.includes('--no-image');
const VERBOSE  = args.includes('--verbose');

// ─── Audit-Log ───────────────────────────────────────────────────────────────
const AUDIT_PATH = path.join(__dirname, '..', 'journal', 'audit.log');
function audit(action, details) {
  fs.appendFileSync(AUDIT_PATH, JSON.stringify({ ts: new Date().toISOString(), sink: 'pb', action, ...details }) + '\n');
}

// ─── Superchat ───────────────────────────────────────────────────────────────
async function scApi(p) {
  const res = await fetch(`${SC_BASE}${p}`, {
    headers: { 'X-API-Key': SC_KEY, 'Accept': 'application/json' },
    signal:  AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Superchat ${res.status} ${p}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

async function fetchAllTemplates() {
  const all = []; let cursor = null;
  while (true) {
    const j = await scApi(cursor ? `/templates?after=${cursor}` : '/templates');
    all.push(...(j.results || []));
    cursor = j.pagination?.next_cursor;
    if (!cursor) break;
  }
  return all;
}

// ─── PocketBase ──────────────────────────────────────────────────────────────
let PB_TOKEN = null;

async function pb(method, p, body, extraHeaders = {}) {
  const opts = {
    method,
    headers: { 'Accept': 'application/json', ...extraHeaders },
    signal:  AbortSignal.timeout(30_000),
  };
  if (PB_TOKEN) opts.headers['Authorization'] = PB_TOKEN;
  if (body !== undefined && !(body instanceof FormData)) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  } else if (body instanceof FormData) {
    opts.body = body;
  }
  const res = await fetch(`${PB_URL}${p}`, opts);
  const txt = await res.text();
  if (!res.ok) throw new Error(`PB ${res.status} ${method} ${p}: ${txt.slice(0, 300)}`);
  return txt ? JSON.parse(txt) : null;
}

async function pbAuth() {
  const j = await pb('POST', '/api/collections/_superusers/auth-with-password', {
    identity: PB_EMAIL, password: PB_PASS,
  });
  PB_TOKEN = j.token;
}

// Collection-Definition: Superchat-Felder + (leere) Anreicherungsfelder
const TEMPLATES_FIELDS = [
  { name: 'superchat_id',      type: 'text',   required: true },
  { name: 'status',            type: 'text'   },
  { name: 'name',              type: 'text'   },
  { name: 'body',              type: 'editor' },
  { name: 'footer',            type: 'text'   },
  { name: 'variables',         type: 'json',   maxSize: 2000000 },
  { name: 'superchat_updated', type: 'text'   },
  // ── Völker-Anreicherung (admin-editierbar, Sync fasst NIE an) ──
  { name: 'kategorie',         type: 'select', maxSelect: 1, values: ['Verwaltung', 'Marketing'] },
  { name: 'ordner',            type: 'text'   },
  { name: 'ueberschrift',      type: 'text'   },
  { name: 'buttons',           type: 'json',   maxSize: 2000000 },
  { name: 'urls',              type: 'text'   },
  { name: 'telefonnummer',     type: 'text'   },
  { name: 'schnellantwort',    type: 'text'   },
  { name: 'notizen',           type: 'editor' },
  { name: 'vorschaubild',      type: 'file',   maxSelect: 1, maxSize: 5242880, mimeTypes: ['image/png', 'image/jpeg'] },
];

async function ensureCollection() {
  try {
    await pb('GET', '/api/collections/templates');
    return false; // existiert schon
  } catch (err) {
    if (!String(err.message).includes('PB 404')) throw err;
  }
  await pb('POST', '/api/collections', {
    name:    'templates',
    type:    'base',
    fields:  TEMPLATES_FIELDS,
    indexes: ['CREATE UNIQUE INDEX `idx_templates_superchat_id` ON `templates` (`superchat_id`)'],
    // Phase 4 verschärft die Rules; vorerst nur Superuser (null = admin-only)
    listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
  });
  return true; // neu angelegt
}

async function findBySuperchatId(scId) {
  const q = encodeURIComponent(`superchat_id="${scId}"`);
  const j = await pb('GET', `/api/collections/templates/records?filter=${q}&perPage=1`);
  return j.items && j.items[0] ? j.items[0] : null;
}

// ─── Mapping: Superchat-Felder (Superchat = Master) ──────────────────────────
// content.category → deutsches Kategorie-Label
function mapKategorie(cat) {
  return ({ marketing: 'Marketing', utility: 'Verwaltung', authentication: 'Authentifizierung' })[cat] || '';
}
function buildScFields(t) {
  const c = t.content || {};
  return {
    superchat_id:      t.id,
    status:            t.status || '',
    name:              (t.name || 'Unbenannt').slice(0, 2000),
    body:              c.body || '',
    footer:            c.footer || '',
    variables:         c.variables || [],
    superchat_updated: t.updatedAt || t.createdAt || '',
    // ── echte Superchat-Komponenten (VOE-243) ──
    kategorie:         mapKategorie(c.category),
    sc_category:       c.category || '',
    ordner:            t.folder?.name || '',
    buttons:           c.buttons || [],
    header:            c.header || null,
    channels:          (t.channels || []).map(ch => ch.name),
    track_links:       !!c.track_links,
  };
}

async function attachPreview(recordId, filePath) {
  const buf  = fs.readFileSync(filePath);
  const form = new FormData();
  form.append('vorschaubild', new Blob([buf], { type: 'image/png' }), path.basename(filePath));
  await pb('PATCH', `/api/collections/templates/records/${recordId}`, form);
}

async function syncOne(t) {
  const previewPath = path.join(__dirname, '..', 'assets', 'previews', `${t.id}.png`);
  const hasPreview  = !NO_IMAGE && fs.existsSync(previewPath);
  const existing    = await findBySuperchatId(t.id);

  if (DRY_RUN) return { mode: existing ? 'update' : 'create', preview: hasPreview };

  const fields = buildScFields(t);
  let record;
  if (existing) {
    record = await pb('PATCH', `/api/collections/templates/records/${existing.id}`, fields);
    audit('update', { template_id: t.id, record_id: existing.id });
  } else {
    record = await pb('POST', '/api/collections/templates/records', fields);
    audit('create', { template_id: t.id, record_id: record.id });
  }

  // Bild nur anhängen, wenn Record noch keines hat (Admin-Pflege nicht überschreiben)
  let attached = false;
  if (hasPreview && !record.vorschaubild) {
    try { await attachPreview(record.id, previewPath); attached = true; }
    catch (err) { audit('preview-upload-fail', { template_id: t.id, error: err.message }); }
  }
  return { mode: existing ? 'update' : 'create', preview: attached };
}

// ─── Main ────────────────────────────────────────────────────────────────────
(async () => {
  console.log(`\n[PB-Sync] Auth gegen ${PB_URL} ...`);
  await pbAuth();
  const created = await ensureCollection();
  console.log(`[PB-Sync] Collection 'templates' ${created ? 'NEU angelegt' : 'vorhanden'}`);

  console.log('[PB-Sync] Hole Superchat-Templates ...');
  let work = await fetchAllTemplates();
  console.log(`[PB-Sync] Superchat: ${work.length} Templates`);
  if (LIMIT) work = work.slice(0, LIMIT);
  console.log(`[PB-Sync] Verarbeite ${work.length}${DRY_RUN ? ' (DRY-RUN)' : ''}${NO_IMAGE ? ' [no-image]' : ''}\n`);

  let nCreate = 0, nUpdate = 0, nErr = 0, nImg = 0;
  const t0 = Date.now();
  for (let i = 0; i < work.length; i++) {
    const t = work[i];
    try {
      const r = await syncOne(t);
      if (r.mode === 'create') nCreate++; else nUpdate++;
      if (r.preview) nImg++;
      if (VERBOSE || i % 25 === 0 || i === work.length - 1) {
        console.log(`  [${String(i + 1).padStart(3)}/${work.length}] ${r.mode.padEnd(6)} ${r.preview ? '🖼' : '  '} ${t.id.padEnd(28)} ${(t.name || '').slice(0, 48)}`);
      }
    } catch (err) {
      nErr++;
      console.error(`  [${i + 1}/${work.length}] ✗ ${t.id}: ${err.message.slice(0, 200)}`);
      audit('error', { template_id: t.id, error: err.message });
    }
  }
  console.log(`\n[PB-Sync] Done in ${((Date.now() - t0) / 1000).toFixed(1)}s — created=${nCreate} updated=${nUpdate} previews=${nImg} errors=${nErr}\n`);
})().catch(err => { console.error('[PB-Sync] Fatal:', err.message || err); process.exit(1); });
