/**
 * agents/render-template-preview.js — rendert WhatsApp-Look-Mockups fuer Superchat-Templates
 *
 * Nimmt jedes Template aus Superchat (oder eines), rendert eine HTML-WhatsApp-Bubble
 * via Puppeteer und exportiert es als PNG nach assets/previews/<id>.png.
 *
 * Usage:
 *   node agents/render-template-preview.js                   # alle 271
 *   node agents/render-template-preview.js --limit 3         # erste 3 (Demo)
 *   node agents/render-template-preview.js --id tn_xxx       # ein bestimmtes
 *   node agents/render-template-preview.js --status approved # nur approved
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

const env  = loadEnv();
const KEY  = env.SUPERCHAT_API_KEY;
const BASE = env.SUPERCHAT_BASE_URL || 'https://api.superchat.com/v1.0';
if (!KEY || KEY.includes('your_')) { console.error('SUPERCHAT_API_KEY fehlt'); process.exit(2); }

const args   = process.argv.slice(2);
const argv   = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const ID     = argv('--id');
const LIMIT  = argv('--limit') ? parseInt(argv('--limit'), 10) : null;
const STATUS = argv('--status');

const OUT_DIR = path.join(__dirname, '..', 'assets', 'previews');
fs.mkdirSync(OUT_DIR, { recursive: true });

// ─── Superchat fetch ────────────────────────────────────────────────────────
async function api(p) {
  const res = await fetch(`${BASE}${p}`, {
    headers: { 'X-API-Key': KEY, 'Accept': 'application/json' },
    signal:  AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} on ${p}`);
  return res.json();
}

async function fetchTemplates() {
  if (ID) return [await api(`/templates/${ID}`)];
  const all = []; let cursor = null;
  while (true) {
    const j = await api(cursor ? `/templates?after=${cursor}` : '/templates');
    all.push(...(j.results || []));
    cursor = j.pagination?.next_cursor;
    if (!cursor) break;
  }
  return all;
}

// ─── HTML-Mockup ─────────────────────────────────────────────────────────────
// Variablen wie {{1}} mit display_name aus content.variables anreichern
function renderBody(body, variables) {
  if (!body) return '';
  const map = new Map((variables || []).map(v => [String(v.position), v.display_name || `var${v.position}`]));
  return escapeHtml(body)
    .replace(/\{\{(\d+)\}\}/g, (m, pos) => {
      const name = map.get(pos);
      return name
        ? `<span class="var">{{${escapeHtml(name)}}}</span>`
        : `<span class="var">{{${pos}}}</span>`;
    })
    .replace(/\n/g, '<br/>');
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function buttonsHtml(buttons) {
  if (!buttons || buttons.length === 0) return '';
  // Superchat-Schema (Template-Detail) hat content.buttons[]; falls nicht: leer
  return `<div class="buttons">${buttons.map(b => {
    const label = escapeHtml(b.text || b.label || b.url || b.phone_number || '...');
    const icon  = b.type === 'url' ? '↗' : b.type === 'phone_number' ? '☎' : '↩';
    return `<div class="btn"><span class="btn-icon">${icon}</span>${label}</div>`;
  }).join('')}</div>`;
}

function headerHtml(content) {
  // Superchat-Header-Detection: file_ids vorhanden + type → Image/Video/Document
  if (!content) return '';
  if (content.header) {
    if (content.header.text) return `<div class="header">${escapeHtml(content.header.text)}</div>`;
    if (content.header.type === 'image') return `<div class="header header-media">🖼️ Bild-Header</div>`;
    if (content.header.type === 'video') return `<div class="header header-media">🎬 Video-Header</div>`;
    if (content.header.type === 'document') return `<div class="header header-media">📄 Dokument-Header</div>`;
  }
  if ((content.file_ids || []).length > 0) {
    return `<div class="header header-media">📎 ${content.file_ids.length} Anhang${content.file_ids.length > 1 ? 'e' : ''}</div>`;
  }
  return '';
}

function htmlForTemplate(t) {
  const c       = t.content || {};
  const body    = renderBody(c.body, c.variables);
  const footer  = c.footer ? `<div class="footer">${escapeHtml(c.footer)}</div>` : '';
  const buttons = buttonsHtml(c.buttons);
  const header  = headerHtml(c);
  const time    = new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  const status  = t.status === 'approved' ? '✓ approved' : `⚠ ${t.status}`;

  return `<!doctype html>
<html lang="de"><head><meta charset="utf-8"/>
<style>
  *,*::before,*::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: #e5ddd5;
    background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='80' height='80'><circle cx='10' cy='10' r='1.2' fill='%23d2c8b8'/><circle cx='40' cy='30' r='1.2' fill='%23d2c8b8'/><circle cx='65' cy='55' r='1.2' fill='%23d2c8b8'/></svg>");
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, "Noto Sans", sans-serif;
    color: #111;
    padding: 28px 24px;
    width: 480px;
  }
  .head {
    display: flex; justify-content: space-between; align-items: center;
    background: #075e54; color: #fff;
    border-radius: 10px 10px 0 0;
    padding: 10px 14px; font-size: 13px; margin: -12px -14px 14px -14px;
  }
  .head .title { font-weight: 600; }
  .head .badge { font-size: 11px; padding: 2px 8px; background: rgba(255,255,255,0.18); border-radius: 10px; }
  .bubble {
    background: #dcf8c6;
    border-radius: 8px;
    padding: 10px 12px 7px 12px;
    box-shadow: 0 1px 1px rgba(0,0,0,0.1);
    max-width: 100%;
    position: relative;
    font-size: 14.5px; line-height: 1.45;
  }
  .header {
    font-weight: 700; margin-bottom: 6px; padding-bottom: 6px;
    border-bottom: 1px solid rgba(0,0,0,0.07);
    color: #111;
  }
  .header-media {
    background: rgba(0,0,0,0.06); border: 1px dashed rgba(0,0,0,0.2);
    border-radius: 6px; padding: 18px 10px; text-align: center;
    color: #444; font-weight: 500; margin-bottom: 8px;
  }
  .body { white-space: pre-wrap; word-wrap: break-word; }
  .var { color: #1d6f9c; background: #d6ecf6; padding: 0 4px; border-radius: 3px; font-style: italic; }
  .footer { margin-top: 8px; color: #4a4a4a; font-size: 12.5px; font-style: italic; }
  .meta { display: flex; justify-content: flex-end; gap: 6px; font-size: 11px; color: #5a5a5a; margin-top: 4px; }
  .meta .ticks { color: #4fc3f7; }
  .buttons { margin-top: 8px; display: flex; flex-direction: column; gap: 4px; }
  .btn {
    background: rgba(255,255,255,0.92); border: 1px solid rgba(0,0,0,0.08);
    border-radius: 6px; padding: 8px 10px; text-align: center;
    color: #00857d; font-weight: 600; font-size: 13px;
  }
  .btn-icon { margin-right: 6px; }
  .footer-info {
    margin-top: 12px; font-size: 10.5px; color: #777; text-align: right;
  }
</style></head>
<body>
  <div class="bubble">
    <div class="head">
      <div class="title">${escapeHtml(t.name || 'Unbenannt')}</div>
      <div class="badge">${escapeHtml(status)}</div>
    </div>
    ${header}
    <div class="body">${body || '<em>(leer)</em>'}</div>
    ${footer}
    <div class="meta"><span>${time}</span><span class="ticks">✓✓</span></div>
    ${buttons}
  </div>
  <div class="footer-info">superchat:${escapeHtml(t.id || '?')} · vars:${(c.variables || []).length} · channels:${(t.channels || []).length}</div>
</body></html>`;
}

// ─── Puppeteer-Render ────────────────────────────────────────────────────────
async function renderAll(templates) {
  const puppeteer = require('puppeteer');
  const browser   = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page      = await browser.newPage();
  await page.setViewport({ width: 480, height: 800, deviceScaleFactor: 2 });

  let done = 0;
  for (const t of templates) {
    try {
      await page.setContent(htmlForTemplate(t), { waitUntil: 'load' });
      const bubble = await page.$('.bubble');
      const buf    = await bubble.screenshot({ type: 'png' });
      const file   = path.join(OUT_DIR, `${t.id}.png`);
      fs.writeFileSync(file, buf);
      done++;
      console.log(`  ✓ ${t.id.padEnd(28)} ${(t.name || '').slice(0, 50)}`);
    } catch (err) {
      console.warn(`  ✗ ${t.id}: ${err.message}`);
    }
  }
  await browser.close();
  return done;
}

// ─── Main ────────────────────────────────────────────────────────────────────
(async () => {
  console.log('\n[Render] Hole Templates...');
  let templates = await fetchTemplates();
  if (STATUS) templates = templates.filter(t => t.status === STATUS);
  if (LIMIT)  templates = templates.slice(0, LIMIT);
  console.log(`[Render] ${templates.length} Template(s) → ${OUT_DIR}\n`);

  const start = Date.now();
  const done  = await renderAll(templates);
  const ms    = Date.now() - start;
  console.log(`\n[Render] ${done}/${templates.length} fertig in ${(ms / 1000).toFixed(1)}s\n`);
})().catch(err => { console.error('Fatal:', err); process.exit(1); });
