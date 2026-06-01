/* Kunden-UI für WhatsApp-Vorlagen — direkte PocketBase-REST-Calls (kein externes CDN). */
'use strict';

const API = location.origin;
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => (s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const store = {
  get token() { return localStorage.getItem('pb_token'); },
  set token(v) { v ? localStorage.setItem('pb_token', v) : localStorage.removeItem('pb_token'); },
  get user() { try { return JSON.parse(localStorage.getItem('pb_user')); } catch { return null; } },
  set user(v) { v ? localStorage.setItem('pb_user', JSON.stringify(v)) : localStorage.removeItem('pb_user'); },
};

async function api(method, path, body) {
  const headers = { 'Accept': 'application/json' };
  if (store.token) headers['Authorization'] = store.token;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${API}${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  if (res.status === 401) { logout(); throw new Error('Sitzung abgelaufen'); }
  const txt = await res.text();
  const json = txt ? JSON.parse(txt) : null;
  if (!res.ok) throw new Error(json?.message || `Fehler ${res.status}`);
  return json;
}

let STATE = { templates: [], overlays: {}, fileToken: '', filter: 'Alle', q: '' };

/* ─── Auth ─────────────────────────────────────────────────────────────── */
async function login(email, password) {
  const r = await api('POST', '/api/collections/users/auth-with-password', { identity: email, password });
  store.token = r.token; store.user = r.record;
  await boot();
}
function logout() { store.token = null; store.user = null; show('login'); }
function show(view) {
  $('#login').classList.toggle('hidden', view !== 'login');
  $('#app').classList.toggle('hidden', view !== 'app');
}

/* ─── Daten laden ──────────────────────────────────────────────────────── */
async function loadData() {
  const [tpls, ovs, ft] = await Promise.all([
    api('GET', '/api/collections/templates/records?perPage=500&sort=ordner,name'),
    api('GET', '/api/collections/template_overlays/records?perPage=500'),
    api('POST', '/api/files/token').catch(() => ({ token: '' })),
  ]);
  STATE.templates = tpls.items;
  STATE.overlays = {};
  for (const o of ovs.items) if (o.template) STATE.overlays[o.template] = o;
  STATE.fileToken = ft.token || '';
}
function fileURL(t) {
  if (!t.vorschaubild) return null;
  const q = STATE.fileToken ? `?token=${STATE.fileToken}` : '';
  return `${API}/api/files/templates/${t.id}/${t.vorschaubild}${q}`;
}

/* ─── Merge Master ⊕ Overlay ───────────────────────────────────────────── */
function effective(t) {
  const o = STATE.overlays[t.id];
  return {
    ...t,
    name:    o?.name_override   || t.name,
    body:    o?.body_override   || t.body,
    footer:  o?.footer_override || t.footer,
    header:  t.header || null,          // Superchat-Header (json)
    buttons: t.buttons || [],           // Superchat-Buttons (json)
    variables: t.variables || [],
    hidden:  !!o?.hidden,
    _ov: o || null,
  };
}

/* ─── WhatsApp-Komponenten rendern ─────────────────────────────────────── */
// Body mit benannten Variablen-Chips ({{1}} → "Vorname")
function bodyHtml(body, vars) {
  let s = esc(body || '');
  for (const v of (vars || [])) {
    const chip = `<span class="var">${esc(v.display_name || ('Variable ' + v.position))}</span>`;
    s = s.split(`{{${v.position}}}`).join(chip);
  }
  return s.replace(/\n/g, '<br>');
}
// deutsche Bezeichnungen wie im Superchat-Editor (für 1:1-Übertragung)
const HEADER_LABEL = { text: 'Text', image: 'Bild', video: 'Video', document: 'PDF' };
function headerHtml(h) {
  if (!h) return '';
  if (h.type === 'text') return `<div class="wa-hdr">${esc(h.value || '')}</div>`;
  const ic = h.type === 'image' ? '🖼️' : h.type === 'video' ? '🎬' : h.type === 'document' ? '📄' : '📎';
  return `<div class="wa-hdr-media">${ic} ${esc(HEADER_LABEL[h.type] || h.type)}</div>`;
}
const BTN_ICON  = { quick_reply: '↩︎', static_url: '🔗', dynamic_url: '🔗', phone_number: '📞' };
const BTN_LABEL = { quick_reply: 'Schnellantwort', static_url: 'Statische URL', dynamic_url: 'Dynamische URL', phone_number: 'Telefonnummer' };
const btnTypeLabel = (t) => BTN_LABEL[t] || t;
function buttonsHtml(buttons) {
  if (!buttons || !buttons.length) return '';
  return `<div class="wa-buttons">${buttons.map(b =>
    `<div class="wa-btn">${BTN_ICON[b.type] || '•'} ${esc(b.title || '')}</div>`).join('')}</div>`;
}
// vollständige WhatsApp-Vorschau-Bubble
function bubbleHtml(t) {
  return `<div class="wa-bubble">
    ${headerHtml(t.header)}
    <div class="wa-body">${bodyHtml(t.body, t.variables) || '<span class="placeholder">(kein Text)</span>'}</div>
    ${t.footer ? `<div class="wa-ftr">${esc(t.footer)}</div>` : ''}
  </div>${buttonsHtml(t.buttons)}`;
}

/* ─── Galerie ──────────────────────────────────────────────────────────── */
function render() {
  $('#who').textContent = store.user?.email || '';
  const cats = ['Alle', ...new Set(STATE.templates.map(t => t.ordner).filter(Boolean))].slice(0, 40);
  $('#filters').innerHTML = cats.map(c =>
    `<button class="chip ${c === STATE.filter ? 'active' : ''}" data-f="${esc(c)}">${esc(c)}</button>`).join('');

  const q = STATE.q.toLowerCase();
  let items = STATE.templates.map(effective).filter(t => {
    if (STATE.filter !== 'Alle' && t.ordner !== STATE.filter) return false;
    if (q && !(`${t.name} ${t.body} ${t.ordner}`.toLowerCase().includes(q))) return false;
    return true;
  });
  $('#empty').classList.toggle('hidden', items.length > 0);

  const groups = {};
  for (const t of items) (groups[t.ordner || 'Ohne Ordner'] ||= []).push(t);
  $('#gallery').innerHTML = Object.keys(groups).sort().map(g =>
    `<div class="group-title">${esc(g)}</div>${groups[g].map(card).join('')}`).join('');
}

function card(t) {
  const img = fileURL(t);
  const cover = img ? `<img src="${img}" loading="lazy" alt="">` : `<span class="noimg">💬</span>`;
  const katBadge = t.kategorie === 'Marketing' ? `<span class="badge mk">Marketing</span>`
                 : t.kategorie === 'Verwaltung' ? `<span class="badge vw">Verwaltung</span>`
                 : t.kategorie === 'Authentifizierung' ? `<span class="badge au">Authentifizierung</span>` : '';
  const nBtn = (t.buttons || []).length;
  const btnBadge = nBtn ? `<span class="badge btn-b">${nBtn} Button${nBtn > 1 ? 's' : ''}</span>` : '';
  const edited = t._ov ? `<span class="badge edited">bearbeitet</span>` : '';
  const hidden = t.hidden ? `<span class="badge hidden-b">ausgeblendet</span>` : '';
  return `<article class="card" data-id="${t.id}">
    <div class="card-cover">${cover}</div>
    <div class="card-body">
      <div class="card-name">${esc(t.name)}</div>
      <div class="card-text">${bodyHtml((t.body || '').slice(0, 120), t.variables)}</div>
      <div class="badges">${katBadge}${btnBadge}${edited}${hidden}</div>
    </div></article>`;
}

/* ─── Detail / Edit ────────────────────────────────────────────────────── */
function openModal(id) {
  const base = STATE.templates.find(t => t.id === id);
  const t = effective(base);
  const ov = t._ov || {};
  const chans = (base.channels || []).join(', ');
  $('#modal-body').innerHTML = `
    <h2>${esc(t.name)}</h2>
    <p class="sub">${esc(t.ordner || '')}${t.kategorie ? ' · ' + esc(t.kategorie) : ''}${chans ? ' · ' + esc(chans) : ''}</p>
    <div class="preview">${bubbleHtml(t)}</div>
    ${base.buttons && base.buttons.length ? `<div class="btn-list">
      <h3>Buttons der Vorlage</h3>
      ${base.buttons.map((b, i) => `<div class="btn-row"><span class="btn-pos">${i + 1}</span>
        <span class="btn-type">${esc(btnTypeLabel(b.type))}</span><span class="btn-label">${esc(b.title || '')}</span>
        ${b.target ? `<span class="btn-target">${esc(b.target)}</span>` : ''}</div>`).join('')}
    </div>` : ''}
    <div class="edit">
      <h3>Deine Anpassungen</h3>
      <label>Eigener Text (überschreibt Vorlagentext)
        <textarea id="f-body" placeholder="${esc((base.body || '').slice(0, 80))}…">${esc(ov.body_override || '')}</textarea></label>
      <label>Eigene Fußzeile
        <input type="text" id="f-footer" value="${esc(ov.footer_override || '')}" placeholder="${esc(base.footer || '')}"></label>
      <label>Notizen
        <textarea id="f-notes">${esc(ov.notes || '')}</textarea></label>
      <div class="row"><input type="checkbox" id="f-hidden" ${ov.hidden ? 'checked' : ''}><label for="f-hidden" style="flex-direction:row">Diese Vorlage für mich ausblenden</label></div>
      <div class="actions">
        <button class="btn-save" id="f-save">Speichern</button>
        ${t._ov ? '<button class="btn-reset" id="f-reset">Anpassungen zurücksetzen</button>' : ''}
      </div>
    </div>`;
  $('#modal').classList.remove('hidden');
  $('#f-save').onclick = () => saveOverlay(base.id);
  if ($('#f-reset')) $('#f-reset').onclick = () => resetOverlay(base.id);
}
function closeModal() { $('#modal').classList.add('hidden'); }

async function saveOverlay(templateId) {
  const data = {
    body_override:   $('#f-body').value.trim(),
    footer_override: $('#f-footer').value.trim(),
    notes:           $('#f-notes').value.trim(),
    hidden:          $('#f-hidden').checked,
  };
  const existing = STATE.overlays[templateId];
  const btn = $('#f-save'); btn.disabled = true; btn.textContent = 'Speichert…';
  try {
    let rec;
    if (existing) rec = await api('PATCH', `/api/collections/template_overlays/records/${existing.id}`, data);
    else rec = await api('POST', '/api/collections/template_overlays/records', { ...data, tenant: store.user.tenant, template: templateId });
    STATE.overlays[templateId] = rec;
    closeModal(); render();
  } catch (e) { btn.disabled = false; btn.textContent = 'Speichern'; alert('Fehler: ' + e.message); }
}
async function resetOverlay(templateId) {
  const ov = STATE.overlays[templateId]; if (!ov) return;
  if (!confirm('Alle deine Anpassungen für diese Vorlage löschen?')) return;
  await api('DELETE', `/api/collections/template_overlays/records/${ov.id}`);
  delete STATE.overlays[templateId];
  closeModal(); render();
}

/* ─── Boot ─────────────────────────────────────────────────────────────── */
async function boot() { show('app'); await loadData(); render(); }

document.addEventListener('click', (e) => {
  const card = e.target.closest('.card'); if (card) return openModal(card.dataset.id);
  const chip = e.target.closest('.chip'); if (chip) { STATE.filter = chip.dataset.f; render(); }
});
$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('#login-error'); err.classList.add('hidden');
  const btn = $('#login-btn'); btn.disabled = true; btn.textContent = 'Anmelden…';
  try { await login($('#email').value.trim(), $('#password').value); }
  catch { err.textContent = 'Anmeldung fehlgeschlagen. Bitte E-Mail/Passwort prüfen.'; err.classList.remove('hidden'); }
  finally { btn.disabled = false; btn.textContent = 'Anmelden'; }
});
$('#logout').addEventListener('click', logout);
$('#modal-close').addEventListener('click', closeModal);
$('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });
$('#search').addEventListener('input', (e) => { STATE.q = e.target.value; render(); });

(async () => {
  if (store.token) { try { await boot(); return; } catch {} }
  show('login');
})();
