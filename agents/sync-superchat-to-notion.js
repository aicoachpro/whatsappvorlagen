/**
 * agents/sync-superchat-to-notion.js — Mirror Superchat-Templates → Notion-DB
 *
 * Phase 1 (Read-only Mirror): Superchat ist Master, Notion wird gespiegelt.
 * Match-Strategie:
 *   1. Existierende Notion-Page mit superchat_id == template.id → UPDATE
 *   2. Existierende Page mit gleichem Name (Erstmigration) → UPDATE + superchat_id setzen
 *   3. Sonst → CREATE
 *
 * Vorschaubild: Lokale PNGs aus assets/previews/<id>.png werden via Notion-File-Upload
 * an die Page "Vorschaubild"-Property gehaengt.
 *
 * Usage:
 *   node agents/sync-superchat-to-notion.js --limit 3   # Test-Run mit 3 Templates
 *   node agents/sync-superchat-to-notion.js --dry-run   # nur Plan, kein Schreiben
 *   node agents/sync-superchat-to-notion.js             # alle 271
 *   node agents/sync-superchat-to-notion.js --no-image  # ohne Vorschau-Upload
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

const SC_KEY     = env.SUPERCHAT_API_KEY;
const SC_BASE    = env.SUPERCHAT_BASE_URL || 'https://api.superchat.com/v1.0';
const NOTION_KEY = env.NOTION_TOKEN;
const NOTION_DB  = env.NOTION_DATABASE_ID;

if (!SC_KEY || SC_KEY.includes('your_'))         { console.error('SUPERCHAT_API_KEY fehlt'); process.exit(2); }
if (!NOTION_KEY || NOTION_KEY.includes('your_')) { console.error('NOTION_TOKEN fehlt');     process.exit(2); }
if (!NOTION_DB || NOTION_DB.includes('your_'))   { console.error('NOTION_DATABASE_ID fehlt'); process.exit(2); }

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
  const entry = JSON.stringify({ ts: new Date().toISOString(), action, ...details }) + '\n';
  fs.appendFileSync(AUDIT_PATH, entry);
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

// ─── Notion ──────────────────────────────────────────────────────────────────
const NOTION_BASE = 'https://api.notion.com/v1';
const NOTION_VER  = '2022-06-28';     // file_uploads sind ueber separate Header-Version verfuegbar — wir testen Default

async function notionApi(method, p, body, extraHeaders = {}) {
  const opts = {
    method,
    headers: {
      'Authorization':  `Bearer ${NOTION_KEY}`,
      'Notion-Version': NOTION_VER,
      'Content-Type':   'application/json',
      ...extraHeaders,
    },
    signal: AbortSignal.timeout(30_000),
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(`${NOTION_BASE}${p}`, opts);
  const txt = await res.text();
  if (!res.ok) throw new Error(`Notion ${res.status} ${method} ${p}: ${txt.slice(0, 300)}`);
  return txt ? JSON.parse(txt) : null;
}

async function fetchAllNotionPages() {
  const all = []; let cursor = undefined;
  while (true) {
    const body = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;
    const j = await notionApi('POST', `/databases/${NOTION_DB}/query`, body);
    all.push(...(j.results || []));
    if (!j.has_more) break;
    cursor = j.next_cursor;
  }
  return all;
}

// ─── Notion File Upload (3-step) ─────────────────────────────────────────────
async function uploadFileToNotion(filePath, filename) {
  // Step 1: create file_upload
  const init = await notionApi('POST', '/file_uploads', {
    mode:         'single_part',
    filename,
    content_type: 'image/png',
  });

  // Step 2: PUT file binary to upload_url
  const buf  = fs.readFileSync(filePath);
  const form = new FormData();
  form.append('file', new Blob([buf], { type: 'image/png' }), filename);
  const putRes = await fetch(init.upload_url, {
    method:  'POST',
    headers: {
      'Authorization':  `Bearer ${NOTION_KEY}`,
      'Notion-Version': NOTION_VER,
    },
    body:    form,
    signal:  AbortSignal.timeout(60_000),
  });
  if (!putRes.ok) throw new Error(`Notion upload PUT ${putRes.status}: ${(await putRes.text()).slice(0, 200)}`);

  return init.id;
}

// ─── Mapping Superchat → Notion-Properties ──────────────────────────────────
function buildNotionProperties(t, fileUploadId, options = {}) {
  const c = t.content || {};
  const props = {
    'Name': {
      title: [{ text: { content: (t.name || 'Unbenannt').slice(0, 2000) } }],
    },
    'Vorlagentext': {
      rich_text: [{ text: { content: (c.body || '').slice(0, 2000) } }],
    },
    'superchat_id': {
      rich_text: [{ text: { content: t.id } }],
    },
    'Sync-Status': {
      select: { name: t.status === 'approved' ? 'synced' : (t.status === 'external_deleted' ? 'external_deleted' : 'synced') },
    },
    'superchat_updated': {
      date: { start: t.updatedAt || t.createdAt || new Date().toISOString() },
    },
  };
  if (c.footer) {
    props['Fusszeile'] = { rich_text: [{ text: { content: c.footer.slice(0, 2000) } }] };
  }
  if (fileUploadId) {
    props['Vorschaubild'] = {
      files: [{
        type: 'file_upload',
        file_upload: { id: fileUploadId },
        name: `${t.id}.png`,
      }],
    };
  }
  return props;
}

// ─── Sync-Logik ──────────────────────────────────────────────────────────────
function indexExistingPages(pages) {
  const byScId = new Map();
  const byName = new Map();
  for (const p of pages) {
    const props  = p.properties || {};
    const scId   = (props.superchat_id?.rich_text?.[0]?.plain_text || '').trim();
    const name   = (props.Name?.title?.[0]?.plain_text || '').trim();
    if (scId) byScId.set(scId, p);
    if (name) byName.set(name, p);
  }
  return { byScId, byName };
}

async function syncOne(t, idx) {
  const previewPath = path.join(__dirname, '..', 'assets', 'previews', `${t.id}.png`);
  const hasPreview  = !NO_IMAGE && fs.existsSync(previewPath);

  // Find existing
  const existing = idx.byScId.get(t.id) || idx.byName.get((t.name || '').trim());

  if (DRY_RUN) {
    return { mode: existing ? 'update' : 'create', preview: hasPreview, t };
  }

  // Upload preview
  let fileUploadId = null;
  if (hasPreview) {
    try {
      fileUploadId = await uploadFileToNotion(previewPath, `${t.id}.png`);
    } catch (err) {
      audit('preview-upload-fail', { template_id: t.id, error: err.message });
      // continue without image
    }
  }

  const props = buildNotionProperties(t, fileUploadId);

  if (existing) {
    await notionApi('PATCH', `/pages/${existing.id}`, { properties: props });
    audit('update', { template_id: t.id, page_id: existing.id, has_preview: !!fileUploadId });
    return { mode: 'update', preview: !!fileUploadId, t };
  } else {
    const created = await notionApi('POST', '/pages', {
      parent:     { database_id: NOTION_DB },
      properties: props,
    });
    audit('create', { template_id: t.id, page_id: created.id, has_preview: !!fileUploadId });
    return { mode: 'create', preview: !!fileUploadId, t };
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────
(async () => {
  console.log('\n[Sync] Hole Superchat-Templates + Notion-Pages...');
  const [templates, pages] = await Promise.all([fetchAllTemplates(), fetchAllNotionPages()]);
  console.log(`[Sync] Superchat: ${templates.length} Templates  |  Notion: ${pages.length} Pages`);

  const idx = indexExistingPages(pages);
  let work  = templates;
  if (LIMIT) work = work.slice(0, LIMIT);

  console.log(`[Sync] Verarbeite ${work.length} Template(s)${DRY_RUN ? ' (DRY-RUN)' : ''}${NO_IMAGE ? ' [no-image]' : ''}\n`);

  let created = 0, updated = 0, errors = 0, withPreview = 0;
  const t0 = Date.now();
  for (let i = 0; i < work.length; i++) {
    const t = work[i];
    try {
      const r = await syncOne(t, idx);
      if (r.mode === 'create') created++; else updated++;
      if (r.preview) withPreview++;
      if (VERBOSE || (i % 25 === 0) || i === work.length - 1) {
        console.log(`  [${String(i + 1).padStart(3)}/${work.length}] ${r.mode.padEnd(7)} ${r.preview ? '🖼' : '  '} ${t.id.padEnd(28)} ${(t.name || '').slice(0, 50)}`);
      }
      // Throttle for Notion rate limit (3 RPS soft)
      if (!DRY_RUN) await new Promise(r => setTimeout(r, 350));
    } catch (err) {
      errors++;
      console.error(`  [${i + 1}/${work.length}] ✗ ${t.id}: ${err.message.slice(0, 200)}`);
      audit('error', { template_id: t.id, error: err.message });
    }
  }

  const ms = Date.now() - t0;
  console.log(`\n[Sync] Done in ${(ms / 1000).toFixed(1)}s — created=${created} updated=${updated} errors=${errors} previews=${withPreview}\n`);
})().catch(err => { console.error('[Sync] Fatal:', err); process.exit(1); });
