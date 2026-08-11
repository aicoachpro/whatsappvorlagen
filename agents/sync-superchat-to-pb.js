/**
 * agents/sync-superchat-to-pb.js — Mirror Superchat-Templates → PocketBase
 *
 * Superchat ist Master, PocketBase ist die Mirror-/Auslieferungs-DB.
 * Läuft täglich 05:00 UTC per GitHub Actions (.github/workflows/sync-superchat.yml).
 *
 * - Legt Collection `templates` + Feld `geloescht_am` + Collection `sync_state` idempotent an.
 * - Upsert per `superchat_id`: alle Felder, die Superchat liefert, werden überschrieben
 *   (Superchat gewinnt — Entscheidung 2026-07-29). Reine Völker-Felder, die Superchat NICHT
 *   kennt (ueberschrift, urls, telefonnummer, schnellantwort, notizen, vorschaubild), bleiben
 *   unangetastet, ebenso alle Kunden-Overlays in `template_overlays`.
 * - Papierkorb statt Hard-Delete: Vorlagen, die in Superchat verschwunden sind, bekommen
 *   `geloescht_am` gesetzt und verschwinden aus der Kundenansicht. Endgültig gelöscht wird
 *   nur manuell im „Gelöscht"-Tab der WebUI (Admin).
 * - Wiederauferstehung: taucht eine Vorlage in Superchat wieder auf, wird `geloescht_am` geleert.
 * - Schutzschwelle: fehlen auf einmal mehr als 10% (und mind. 5 Stück), wird NICHTS in den
 *   Papierkorb verschoben — stattdessen Telegram-Warnung und Exit 1. Schützt gegen Teilantworten
 *   der Superchat-API. Bewusstes Großaufräumen: mit --force durchdrücken.
 * - Telegram nur bei Änderungen oder Fehlern (ruhige Läufe bleiben still).
 * - Heartbeat in `sync_state`; agents/health-check.js schlägt Alarm, wenn >48h kein Erfolg.
 *
 * Env (process.env hat Vorrang, sonst .env):
 *   SUPERCHAT_API_KEY, PB_URL, PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD
 *   optional TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
 *
 * Usage:
 *   node agents/sync-superchat-to-pb.js --limit 3 --no-image   # Test (Papierkorb wird übersprungen)
 *   node agents/sync-superchat-to-pb.js --dry-run              # nur Plan
 *   node agents/sync-superchat-to-pb.js --force                # Schutzschwelle übergehen
 *   node agents/sync-superchat-to-pb.js                        # voller Lauf
 */
'use strict';

const fs   = require('fs');
const path = require('path');

// ─── ENV ─────────────────────────────────────────────────────────────────────
// process.env hat Vorrang (GitHub Actions), .env ist der lokale Fallback.
const ENV_PATH = path.join(__dirname, '..', '.env');
function loadEnv() {
  const env = {};
  try {
    for (const raw of fs.readFileSync(ENV_PATH, 'utf8').split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('='); if (eq < 0) continue;
      let val = line.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
      env[line.slice(0, eq).trim()] = val;
    }
  } catch (_) { /* in CI gibt es keine .env — dann kommt alles aus process.env */ }
  for (const k of ['SUPERCHAT_API_KEY', 'SUPERCHAT_BASE_URL', 'PB_URL', 'PB_ADMIN_EMAIL',
                   'PB_ADMIN_PASSWORD', 'TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID']) {
    if (process.env[k]) env[k] = process.env[k];
  }
  return env;
}
const env = loadEnv();

const SC_KEY   = env.SUPERCHAT_API_KEY;
const SC_BASE  = env.SUPERCHAT_BASE_URL || 'https://api.superchat.com/v1.0';
const PB_URL   = (env.PB_URL || 'https://vorlagen.voelkergroup.cloud').replace(/\/$/, '');
const PB_EMAIL = env.PB_ADMIN_EMAIL;
const PB_PASS  = env.PB_ADMIN_PASSWORD;
const TG_TOKEN = env.TELEGRAM_BOT_TOKEN;
const TG_CHAT  = env.TELEGRAM_CHAT_ID;

if (!SC_KEY  || SC_KEY.includes('your_'))  { console.error('SUPERCHAT_API_KEY fehlt (Env oder .env)'); process.exit(2); }
if (!PB_EMAIL) { console.error('PB_ADMIN_EMAIL fehlt'); process.exit(2); }
if (!PB_PASS)  { console.error('PB_ADMIN_PASSWORD fehlt'); process.exit(2); }

// ─── Args ────────────────────────────────────────────────────────────────────
const args     = process.argv.slice(2);
const argv     = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const LIMIT    = argv('--limit') ? parseInt(argv('--limit'), 10) : null;
const DRY_RUN  = args.includes('--dry-run');
const NO_IMAGE = args.includes('--no-image');
const VERBOSE  = args.includes('--verbose');
const FORCE    = args.includes('--force');

// Schutzschwelle gegen Teilantworten der Superchat-API (siehe Kopf).
// WV-7: Minimum von 5 auf 2 gesenkt — vorher wanderten bis zu 4 Vorlagen IMMER automatisch in
// den Papierkorb, auch wenn das weit über 10% (oder 100% eines kleinen Katalogs) waren. Jetzt
// bleibt genau EINE Einzellöschung immer erlaubt; ab 2 gleichzeitig greift die 10%-Grenze.
const MISSING_PCT_LIMIT = 0.10; // >10% der aktiven Records
const MISSING_MIN_ABS   = 2;    // ... ab 2 Stück — eine Einzellöschung blockiert nie

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ─── Audit-Log ───────────────────────────────────────────────────────────────
const AUDIT_PATH = path.join(__dirname, '..', 'journal', 'audit.log');
function audit(action, details) {
  try {
    fs.appendFileSync(AUDIT_PATH, JSON.stringify({ ts: new Date().toISOString(), sink: 'pb', action, ...details }) + '\n');
  } catch (_) { /* im Runner ist das Log flüchtig — kein Grund, den Sync zu stoppen */ }
}

// ─── Telegram ────────────────────────────────────────────────────────────────
async function telegram(text) {
  if (!TG_TOKEN || !TG_CHAT) { console.log('[Telegram] Token/Chat fehlt — nur Log:\n' + text); return; }
  if (DRY_RUN) { console.log('[DRY-RUN] Telegram:\n' + text); return; }
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

// ─── Superchat ───────────────────────────────────────────────────────────────
// Retry, weil eine Teilantwort hier wie eine Massenlöschung aussähe.
async function scApi(p) {
  let lastErr;
  for (let i = 1; i <= 3; i++) {
    try {
      const res = await fetch(`${SC_BASE}${p}`, {
        headers: { 'X-API-Key': SC_KEY, 'Accept': 'application/json' },
        signal:  AbortSignal.timeout(20_000),
      });
      if (res.ok) return res.json();
      const body = (await res.text()).slice(0, 200);
      lastErr = new Error(`Superchat ${res.status} ${p}: ${body}`);
      if (res.status < 500 && res.status !== 429) throw lastErr; // 4xx ist echt, nicht transient
    } catch (e) {
      lastErr = e;
      if (/Superchat 4/.test(e.message)) throw e;
    }
    if (i < 3) await sleep(2000 * i);
  }
  throw lastErr;
}

async function fetchAllTemplates() {
  const all = []; let cursor = null; let pages = 0;
  while (true) {
    const j = await scApi(cursor ? `/templates?after=${cursor}` : '/templates');
    all.push(...(j.results || []));
    cursor = j.pagination?.next_cursor;
    pages++;
    if (!cursor) break;
    if (pages > 200) throw new Error('Pagination bricht nicht ab (>200 Seiten) — abgebrochen');
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

// Collection-Definition: Superchat-Felder + (leere) Anreicherungsfelder.
// WV-7: vollständig — vorher fehlten sc_category/header/channels/track_links und der
// kategorie-Wert "Authentifizierung"; der Sync SCHREIBT diese Felder aber (buildScFields)
// und hing damit am manuell auszuführenden extend-templates-schema.js.
const TEMPLATES_FIELDS = [
  { name: 'superchat_id',      type: 'text',   required: true },
  { name: 'status',            type: 'text'   },
  { name: 'name',              type: 'text'   },
  { name: 'body',              type: 'editor' },
  { name: 'footer',            type: 'text'   },
  { name: 'variables',         type: 'json',   maxSize: 2000000 },
  { name: 'superchat_updated', type: 'text'   },
  // ── Papierkorb (VOR-Sync 2026-07-29): leer = aktiv, ISO-Zeitstempel = gelöscht in Superchat ──
  { name: 'geloescht_am',      type: 'text'   },
  // ── echte Superchat-Komponenten (VOE-243) ──
  { name: 'sc_category',       type: 'text'   },
  { name: 'header',            type: 'json',   maxSize: 200000 },
  { name: 'channels',          type: 'json',   maxSize: 200000 },
  { name: 'track_links',       type: 'bool'   },
  // ── Völker-Anreicherung (admin-editierbar, Superchat kennt diese Felder nicht) ──
  { name: 'kategorie',         type: 'select', maxSelect: 1, values: ['Verwaltung', 'Marketing', 'Authentifizierung'] },
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
  let col;
  try {
    col = await pb('GET', '/api/collections/templates');
  } catch (err) {
    if (!String(err.message).includes('PB 404')) throw err;
    // WV-7: --dry-run ist strikt read-only — vorher wurde die Collection trotz DRY_RUN angelegt.
    if (DRY_RUN) return 'fehlt — WÜRDE anlegen (DRY-RUN)';
    await pb('POST', '/api/collections', {
      name:    'templates',
      type:    'base',
      fields:  TEMPLATES_FIELDS,
      indexes: ['CREATE UNIQUE INDEX `idx_templates_superchat_id` ON `templates` (`superchat_id`)'],
      listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
    });
    return 'neu angelegt';
  }

  // WV-7: Schema-Drift vollständig nachziehen — jedes fehlende Feld aus TEMPLATES_FIELDS plus
  // fehlende kategorie-Select-Werte (vorher wurde nur geloescht_am migriert).
  const have    = new Set(col.fields.map(f => f.name));
  const missing = TEMPLATES_FIELDS.filter(f => !have.has(f.name));
  let katFix = false;
  const fields = col.fields.map(f => {
    if (f.name === 'kategorie' && f.type === 'select' && !(f.values || []).includes('Authentifizierung')) {
      katFix = true;
      return { ...f, values: [...f.values, 'Authentifizierung'] };
    }
    return f;
  });
  if (!missing.length && !katFix) return 'vorhanden';
  const plan = [...missing.map(f => f.name), ...(katFix ? ['kategorie+Authentifizierung'] : [])].join(', ');
  if (DRY_RUN) return `vorhanden — WÜRDE ergänzen: ${plan} (DRY-RUN)`;
  await pb('PATCH', `/api/collections/${col.id}`, { fields: [...fields, ...missing] });
  return `vorhanden, ergänzt: ${plan}`;
}

// Gelöschte Vorlagen sind für Kunden unsichtbar — serverseitig, nicht nur im Frontend.
// WV-7: zusätzlich Lizenz-Status erzwingen — abgelaufene Mandanten lesen den Katalog nicht mehr.
// Identisch mit setTemplateRules() in agents/setup-pb-tenancy.js halten (sonst überschreiben
// sich die Skripte gegenseitig — der Sync setzt die Rule täglich).
const TEMPLATES_LIST_RULE = '@request.auth.id != "" && (@request.auth.role = "admin" || (geloescht_am = "" && @request.auth.tenant.status = "active"))';

async function ensureListRule() {
  const col = await pb('GET', '/api/collections/templates');
  if (col.listRule === TEMPLATES_LIST_RULE && col.viewRule === TEMPLATES_LIST_RULE) return false;
  if (DRY_RUN) return 'DRY-RUN';
  await pb('PATCH', `/api/collections/${col.id}`, {
    listRule: TEMPLATES_LIST_RULE,
    viewRule: TEMPLATES_LIST_RULE,
  });
  return true;
}

// Heartbeat-Collection: ein Record pro Job, damit health-check.js einen Stillstand erkennt.
async function ensureSyncState() {
  try {
    await pb('GET', '/api/collections/sync_state');
    return false;
  } catch (err) {
    if (!String(err.message).includes('PB 404')) throw err;
  }
  if (DRY_RUN) return 'DRY-RUN';
  await pb('POST', '/api/collections', {
    name: 'sync_state', type: 'base',
    fields: [
      { name: 'key',          type: 'text', required: true },
      { name: 'last_success', type: 'text' },
      { name: 'last_alert',   type: 'text' },
      { name: 'stats',        type: 'json', maxSize: 200000 },
    ],
    indexes: ['CREATE UNIQUE INDEX `idx_sync_state_key` ON `sync_state` (`key`)'],
    // Superuser-only — weder Kunden noch Admin-User der WebUI haben hier etwas zu suchen.
    listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
  });
  return true;
}

async function writeHeartbeat(stats) {
  const now = new Date().toISOString();
  const j = await pb('GET', `/api/collections/sync_state/records?filter=${encodeURIComponent('key="superchat_sync"')}&perPage=1`);
  const rec = j.items && j.items[0];
  const body = { key: 'superchat_sync', last_success: now, stats };
  if (rec) await pb('PATCH', `/api/collections/sync_state/records/${rec.id}`, body);
  else     await pb('POST',  '/api/collections/sync_state/records', body);
}

async function fetchAllPbTemplates() {
  const all = []; let page = 1;
  while (true) {
    const j = await pb('GET', `/api/collections/templates/records?perPage=500&page=${page}&fields=id,superchat_id,name,geloescht_am`);
    all.push(...(j.items || []));
    if (page >= (j.totalPages || 1)) break;
    page++;
  }
  return all;
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

async function syncOne(t, byScId) {
  const previewPath = path.join(__dirname, '..', 'assets', 'previews', `${t.id}.png`);
  const hasPreview  = !NO_IMAGE && fs.existsSync(previewPath);
  const existing    = byScId.get(t.id) || null;

  if (DRY_RUN) return { mode: existing ? 'update' : 'create', preview: hasPreview, restored: !!(existing && existing.geloescht_am) };

  const fields = buildScFields(t);
  // Wieder in Superchat aufgetaucht → aus dem Papierkorb zurückholen.
  const restored = !!(existing && existing.geloescht_am);
  if (restored) fields.geloescht_am = '';

  let record;
  if (existing) {
    record = await pb('PATCH', `/api/collections/templates/records/${existing.id}`, fields);
    audit(restored ? 'restore' : 'update', { template_id: t.id, record_id: existing.id });
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
  return { mode: existing ? 'update' : 'create', preview: attached, restored };
}

// ─── Main ────────────────────────────────────────────────────────────────────
(async () => {
  console.log(`\n[PB-Sync] Auth gegen ${PB_URL} ...`);
  await pbAuth();
  console.log(`[PB-Sync] Collection 'templates': ${await ensureCollection()}`);
  const ruleChanged = await ensureListRule();
  if (ruleChanged) console.log('[PB-Sync] Sichtbarkeitsregel gesetzt (Kunden sehen keine gelöschten Vorlagen)');
  const stateNew = await ensureSyncState();
  if (stateNew) console.log('[PB-Sync] Collection \'sync_state\' angelegt (Heartbeat)');

  console.log('[PB-Sync] Hole Superchat-Templates ...');
  const scAll = await fetchAllTemplates();
  console.log(`[PB-Sync] Superchat: ${scAll.length} Templates`);
  if (!scAll.length) {
    // Leere Antwort ist niemals plausibel — das wäre "alles gelöscht".
    await telegram('⚠️ Vorlagen-Sync abgebrochen: Superchat lieferte 0 Vorlagen zurück.\nEs wurde nichts geändert. Bitte API-Key und Superchat-Account prüfen.');
    console.error('[PB-Sync] Superchat lieferte 0 Templates — Abbruch ohne Änderung.');
    process.exit(1);
  }

  const pbAll  = await fetchAllPbTemplates();
  const byScId = new Map(pbAll.map(r => [r.superchat_id, r]));
  console.log(`[PB-Sync] PocketBase: ${pbAll.length} Records (${pbAll.filter(r => r.geloescht_am).length} im Papierkorb)`);

  let work = scAll;
  if (LIMIT) work = work.slice(0, LIMIT);
  console.log(`[PB-Sync] Verarbeite ${work.length}${DRY_RUN ? ' (DRY-RUN)' : ''}${NO_IMAGE ? ' [no-image]' : ''}\n`);

  let nCreate = 0, nUpdate = 0, nRestore = 0, nErr = 0, nImg = 0;
  const neuNamen = [];
  const t0 = Date.now();
  for (let i = 0; i < work.length; i++) {
    const t = work[i];
    try {
      const r = await syncOne(t, byScId);
      if (r.mode === 'create') { nCreate++; neuNamen.push(t.name || t.id); } else nUpdate++;
      if (r.restored) nRestore++;
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

  // ── Papierkorb: was in Superchat verschwunden ist ──────────────────────────
  // Bei --limit ist die Superchat-Liste absichtlich unvollständig → niemals löschen.
  let nTrash = 0, blocked = null;
  if (LIMIT) {
    console.log('\n[PB-Sync] --limit gesetzt → Papierkorb-Abgleich übersprungen.');
  } else {
    const scIds   = new Set(scAll.map(t => t.id));
    const aktiv   = pbAll.filter(r => !r.geloescht_am);
    const missing = aktiv.filter(r => !scIds.has(r.superchat_id));
    const grenze  = Math.floor(aktiv.length * MISSING_PCT_LIMIT);

    if (missing.length && missing.length >= MISSING_MIN_ABS && missing.length > grenze && !FORCE) {
      blocked = { missing: missing.length, aktiv: aktiv.length, grenze };
      console.error(`\n[PB-Sync] STOPP: ${missing.length} von ${aktiv.length} Vorlagen fehlen (Grenze ${grenze}). Nichts in den Papierkorb verschoben.`);
      audit('trash-blocked', blocked);
    } else if (missing.length) {
      console.log(`\n[PB-Sync] Papierkorb: ${missing.length} Vorlage(n) nicht mehr in Superchat${FORCE ? ' [--force]' : ''}`);
      const now = new Date().toISOString();
      for (const r of missing) {
        if (DRY_RUN) { nTrash++; console.log(`  → würde in Papierkorb: ${r.name}`); continue; }
        try {
          await pb('PATCH', `/api/collections/templates/records/${r.id}`, { geloescht_am: now });
          nTrash++;
          console.log(`  🗑 ${r.name}`);
          audit('trash', { template_id: r.superchat_id, record_id: r.id });
        } catch (err) {
          nErr++;
          console.error(`  ✗ Papierkorb ${r.superchat_id}: ${err.message.slice(0, 200)}`);
          audit('error', { template_id: r.superchat_id, error: err.message });
        }
      }
    } else {
      console.log('\n[PB-Sync] Papierkorb: nichts zu verschieben.');
    }
  }

  const dauer = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n[PB-Sync] Done in ${dauer}s — created=${nCreate} updated=${nUpdate} restored=${nRestore} trashed=${nTrash} previews=${nImg} errors=${nErr}\n`);

  // ── Heartbeat nur bei sauberem Lauf ────────────────────────────────────────
  // WV-7: ein Heartbeat-Fehler ist ein DEGRADED-Lauf (Exit 1), kein Erfolg — sonst meldet CI
  // grün, während der Totmann-Schalter (health-check.js) nicht aktualisiert wurde.
  let hbErr = null;
  if (!DRY_RUN && !LIMIT && !blocked && !nErr) {
    try {
      await writeHeartbeat({ created: nCreate, updated: nUpdate, restored: nRestore, trashed: nTrash, superchat: scAll.length });
      console.log('[PB-Sync] Heartbeat geschrieben ✓');
    } catch (err) { hbErr = err; console.error(`[PB-Sync] Heartbeat fehlgeschlagen: ${err.message}`); }
  }

  // ── Telegram: nur bei Änderungen oder Fehlern ──────────────────────────────
  if (blocked) {
    await telegram(
      `⚠️ Vorlagen-Sync gestoppt — Sicherheitsschwelle\n\n`
      + `${blocked.missing} von ${blocked.aktiv} Vorlagen fehlen plötzlich in der Superchat-Antwort (Grenze: ${blocked.grenze}).\n\n`
      + `Es wurde NICHTS in den Papierkorb verschoben. Neue und geänderte Vorlagen sind übernommen.\n\n`
      + `War das ein echtes Aufräumen? Dann GitHub → Actions → „Vorlagen-Sync" → Run workflow → force = true.`
    );
    process.exit(1);
  }

  const geaendert = nCreate + nRestore + nTrash;
  if (geaendert || nErr) {
    const zeilen = [`🔄 Vorlagen-Sync (${scAll.length} in Superchat)`, ''];
    if (nCreate)  zeilen.push(`➕ ${nCreate} neu: ${neuNamen.slice(0, 5).join(', ')}${neuNamen.length > 5 ? ` … +${neuNamen.length - 5}` : ''}`);
    if (nRestore) zeilen.push(`♻️ ${nRestore} aus dem Papierkorb zurück`);
    if (nTrash)   zeilen.push(`🗑 ${nTrash} in den Papierkorb`);
    if (nUpdate)  zeilen.push(`✏️ ${nUpdate} aktualisiert`);
    if (nErr)     zeilen.push(`❌ ${nErr} Fehler — siehe GitHub Actions`);
    zeilen.push('', `→ ${PB_URL}/`);
    await telegram(zeilen.join('\n'));
  } else {
    console.log('[PB-Sync] Keine Änderungen — kein Telegram.');
  }

  if (hbErr) {
    await telegram(`⚠️ Vorlagen-Sync: Daten synchron, aber Heartbeat NICHT geschrieben (${String(hbErr.message || hbErr).slice(0, 200)}).\nDie Totmann-Überwachung läuft blind — bitte prüfen.`);
    console.error('[PB-Sync] Lauf degraded (Heartbeat) → Exit 1.');
    process.exit(1);
  }
  if (nErr) process.exit(1);
})().catch(async err => {
  console.error('[PB-Sync] Fatal:', err.message || err);
  await telegram(`❌ Vorlagen-Sync fehlgeschlagen\n\n${String(err.message || err).slice(0, 400)}\n\n→ GitHub Actions prüfen`);
  process.exit(1);
});
