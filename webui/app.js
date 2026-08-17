/* Kunden-UI für WhatsApp-Vorlagen — direkte PocketBase-REST-Calls (kein externes CDN). */
'use strict';

const API = location.origin;
// VOR-9 (SuperChat-Push) live (Hook + SUPERCHAT_ENC_KEY + Tabellen aktiv, 2026-06-22 verifiziert).
const FEATURE_SUPERCHAT = true;
const PUSH_BLOCK = '<div class="copy-block" id="push-block"><h3>📤 Direkt an SuperChat einreichen</h3><p class="placeholder">Reicht diese Vorlage in deinem SuperChat-Account zur <b>Meta-Freigabe</b> ein (kein Entwurf — Meta prüft sie). Voraussetzung: SuperChat-Verbindung in den ⚙️ Einstellungen.</p><div class="actions"><button class="btn-save" id="push-btn">Vorschau &amp; einreichen</button></div><div id="push-panel" class="hidden"></div></div>';
const SC_CONN_HTML = '<h3 style="margin-top:18px">SuperChat-Verbindung</h3><p class="placeholder">Hinterlege deinen SuperChat-API-Key (in SuperChat unter Einstellungen › Integrationen › API-Key), um Vorlagen per Knopfdruck in deinen Account einzureichen. Der Schlüssel wird verschlüsselt gespeichert und nie angezeigt — deine WhatsApp-Verbindung wird automatisch erkannt.</p><div class="edit" id="sc-conn"><div id="sc-status" class="sub">lädt…</div><label>SuperChat-API-Key<input type="password" id="sc-key" autocomplete="off" placeholder="Dein SuperChat-API-Key"></label><label>Speichern als<select id="sc-mode"><option value="stored">🔒 Verschlüsselt speichern (1-Klick-Push jederzeit)</option><option value="session">⏱️ Nur diese Sitzung (nicht speichern)</option></select></label><div class="actions"><button class="btn-save" id="sc-save">Prüfen &amp; speichern</button><button class="btn-reset hidden" id="sc-del">Entfernen</button></div><div id="sc-msg" class="hidden"></div></div>';
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
  // Hook-Routen (/api/vor/…) melden Fehler als { error }, Collection-API als { message }.
  if (!res.ok) throw new Error(json?.message || json?.error || `Fehler ${res.status}`);
  return json;
}

let STATE = { templates: [], overlays: {}, fileToken: '', filter: 'Alle', q: '' };

/* ─── Auth ─────────────────────────────────────────────────────────────── */
async function login(email, password) {
  const r = await api('POST', '/api/collections/users/auth-with-password', { identity: email, password });
  // WV-7: Session-Key des vorherigen Benutzers darf einen Benutzerwechsel nicht überleben.
  sessionStorage.removeItem('sc_session_key');
  store.token = r.token; store.user = r.record;
  await boot();
}
// WV-7: sc_session_key IMMER mit ausräumen — sonst bleibt der SuperChat-Key des vorherigen
// Mandanten auf einem geteilten Rechner bis zum Tab-Ende in sessionStorage liegen.
function logout() { store.token = null; store.user = null; sessionStorage.removeItem('sc_session_key'); show('login'); }
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
  // AI-generated: VOR-8 — Personalisierung aus tenant_settings (kunden-lesbar); tenants nur Admin.
  STATE.settings = null;
  STATE.tenant = null;
  if (store.user?.tenant) {
    const ts = await api('GET', `/api/collections/tenant_settings/records?perPage=1&filter=(tenant='${store.user.tenant}')`).catch(() => null);
    STATE.settings = ts?.items?.[0] || null;
    // tenants ist nur für Admin lesbar — best effort; Personalisierung kommt aus settings.
    STATE.tenant = await api('GET', `/api/collections/tenants/records/${store.user.tenant}`).catch(() => null);
  }
}

/* ─── Personalisierung: Master-Vorlage → Kundendaten (Firma + Links) ──────── */
const FIRMA_RE = /V[öÖ]LKER\s+Finance\s+OHG/gi;
function personalize(text) {
  // AI-generated: VOR-8 — Quelle ist tenant_settings (Self-Service), Fallback tenants (Übergang).
  const src = STATE.settings || STATE.tenant;
  if (!text || !src) return text || '';
  let s = text;
  if (src.firma) s = s.replace(FIRMA_RE, src.firma);
  for (const e of (src.ersetzungen || [])) {
    if (e && e.from) s = s.split(e.from).join(e.to || '');
  }
  return s;
}
function fileURL(t) {
  if (!t.vorschaubild) return null;
  const q = STATE.fileToken ? `?token=${STATE.fileToken}` : '';
  return `${API}/api/files/templates/${t.id}/${t.vorschaubild}${q}`;
}
function headerMediaURL(t) {
  if (!t.header_media) return null;
  const q = STATE.fileToken ? `?token=${STATE.fileToken}` : '';
  return `${API}/api/files/templates/${t.id}/${t.header_media}${q}`;
}

/* ─── Merge Master ⊕ Overlay ───────────────────────────────────────────── */
function effective(t) {
  const o = STATE.overlays[t.id];
  const header = t.header ? { ...t.header, value: personalize(t.header.value) } : null;
  const buttons = (t.buttons || []).map(b => b.target ? { ...b, target: personalize(b.target) } : b);
  return {
    ...t,
    name:    o?.name_override   || t.name,
    body:    personalize(o?.body_override   || t.body),
    footer:  personalize(o?.footer_override || t.footer),
    header,                              // Superchat-Header (json, personalisiert)
    buttons,                             // Superchat-Buttons (json, Links personalisiert)
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
function headerHtml(t) {
  const h = t.header; if (!h) return '';
  if (h.type === 'text') return `<div class="wa-hdr">${esc(h.value || '')}</div>`;
  const url = headerMediaURL(t);
  if (url && h.type === 'image') return `<div class="wa-hdr-img"><img src="${url}" loading="lazy" alt=""></div>`;
  if (url && h.type === 'video') return `<div class="wa-hdr-img"><video src="${url}" controls preload="metadata"></video></div>`;
  if (url && h.type === 'document') return `<a class="wa-hdr-media" href="${url}" target="_blank" rel="noopener">📄 ${esc(HEADER_LABEL[h.type] || h.type)} öffnen</a>`;
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
    ${headerHtml(t)}
    <div class="wa-body">${bodyHtml(t.body, t.variables) || '<span class="placeholder">(kein Text)</span>'}</div>
    ${t.footer ? `<div class="wa-ftr">${esc(t.footer)}</div>` : ''}
  </div>${buttonsHtml(t.buttons)}`;
}

/* ─── Galerie ──────────────────────────────────────────────────────────── */
// Papierkorb: Vorlagen mit `geloescht_am` gibt es in Superchat nicht mehr. Kunden bekommen
// sie serverseitig gar nicht erst geliefert (listRule); der Admin sieht sie in einem eigenen
// Tab und löscht dort endgültig — einzeln oder alle. Siehe agents/sync-superchat-to-pb.js.
const TRASH_KEY = '__geloescht__';
const trashDatum = (iso) => (iso || '').slice(0, 10).split('-').reverse().join('.');

function render() {
  $('#who').textContent = store.user?.email || '';
  const aktiv     = STATE.templates.filter(t => !t.geloescht_am);
  const geloescht = STATE.templates.filter(t => t.geloescht_am);
  const trashOn   = STATE.filter === TRASH_KEY;

  const cats = ['Alle', ...new Set(aktiv.map(t => t.ordner).filter(Boolean))].slice(0, 40);
  let chips = cats.map(c =>
    `<button class="chip ${c === STATE.filter ? 'active' : ''}" data-f="${esc(c)}">${esc(c)}</button>`).join('');
  if (isAdmin() && geloescht.length)
    chips += `<button class="chip trash ${trashOn ? 'active' : ''}" data-f="${TRASH_KEY}">🗑 Gelöscht (${geloescht.length})</button>`;
  $('#filters').innerHTML = chips;

  const q = STATE.q.toLowerCase();
  let items = (trashOn ? geloescht : aktiv).map(effective).filter(t => {
    if (!trashOn && STATE.filter !== 'Alle' && t.ordner !== STATE.filter) return false;
    if (q && !(`${t.name} ${t.body} ${t.ordner}`.toLowerCase().includes(q))) return false;
    return true;
  });
  $('#empty').classList.toggle('hidden', items.length > 0);

  const kopf = trashOn ? `<div class="trash-bar">
      <div><b>Papierkorb</b> — ${geloescht.length} Vorlage${geloescht.length === 1 ? '' : 'n'}, die es in Superchat nicht mehr gibt.
      Deine Kunden sehen sie bereits nicht mehr. Tauchen sie in Superchat wieder auf, holt der nächste Sync sie automatisch zurück.</div>
      <button class="btn-reset" id="trash-empty">Alle ${geloescht.length} endgültig löschen</button>
    </div>` : '';

  const groups = {};
  for (const t of items) (groups[t.ordner || 'Ohne Ordner'] ||= []).push(t);
  $('#gallery').innerHTML = kopf + Object.keys(groups).sort().map(g =>
    `<div class="group-title">${esc(g)}</div>${groups[g].map(t => card(t, trashOn)).join('')}`).join('');
}

function card(t, trash = false) {
  const img = fileURL(t);
  const cover = img ? `<img src="${img}" loading="lazy" alt="">` : `<span class="noimg">💬</span>`;
  const katBadge = t.kategorie === 'Marketing' ? `<span class="badge mk">Marketing</span>`
                 : t.kategorie === 'Verwaltung' ? `<span class="badge vw">Verwaltung</span>`
                 : t.kategorie === 'Authentifizierung' ? `<span class="badge au">Authentifizierung</span>` : '';
  const nBtn = (t.buttons || []).length;
  const btnBadge = nBtn ? `<span class="badge btn-b">${nBtn} Button${nBtn > 1 ? 's' : ''}</span>` : '';
  const edited = t._ov ? `<span class="badge edited">bearbeitet</span>` : '';
  const hidden = t.hidden ? `<span class="badge hidden-b">ausgeblendet</span>` : '';
  const weg    = trash ? `<span class="badge hidden-b">gelöscht am ${esc(trashDatum(t.geloescht_am))}</span>` : '';
  const delBtn = trash ? `<button class="mini danger" data-del="${t.id}">Endgültig löschen</button>` : '';
  return `<article class="card${trash ? ' is-trash' : ''}" data-id="${t.id}">
    <div class="card-cover">${cover}</div>
    <div class="card-body">
      <div class="card-name">${esc(t.name)}</div>
      <div class="card-text">${bodyHtml((t.body || '').slice(0, 120), t.variables)}</div>
      <div class="badges">${katBadge}${btnBadge}${edited}${hidden}${weg}</div>
      ${delBtn}
    </div></article>`;
}

/* ─── Papierkorb leeren (nur Admin; deleteRule der Collection erzwingt das serverseitig) ── */
async function deleteEndgueltig(id) {
  const t = STATE.templates.find(x => x.id === id);
  if (!confirm(`„${t?.name || 'Vorlage'}" endgültig löschen?\n\nDas lässt sich nicht rückgängig machen. Kunden-Anpassungen zu dieser Vorlage werden mitgelöscht.`)) return;
  try {
    await api('DELETE', `/api/collections/templates/records/${id}`);
    STATE.templates = STATE.templates.filter(x => x.id !== id);
    if (!STATE.templates.some(x => x.geloescht_am)) STATE.filter = 'Alle';
    render();
  } catch (e) { alert('Löschen fehlgeschlagen: ' + e.message); }
}

async function emptyTrash() {
  const weg = STATE.templates.filter(t => t.geloescht_am);
  if (!weg.length) return;
  if (!confirm(`Alle ${weg.length} Vorlagen im Papierkorb endgültig löschen?\n\nDas lässt sich nicht rückgängig machen. Kunden-Anpassungen zu diesen Vorlagen werden mitgelöscht.`)) return;
  const btn = $('#trash-empty');
  if (btn) { btn.disabled = true; btn.textContent = 'Löscht…'; }
  let fail = 0;
  for (const t of weg) {
    try { await api('DELETE', `/api/collections/templates/records/${t.id}`); }
    catch { fail++; }
  }
  STATE.filter = 'Alle';
  await loadData();
  render();
  if (fail) alert(`${fail} Vorlage(n) konnten nicht gelöscht werden.`);
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
    <div class="copy-block">
      <h3>📋 So überträgst du diese Vorlage nach Superchat</h3>
      <ol class="sc-steps">
        <li>In Superchat <b>„Vorlage erstellen"</b> öffnen.</li>
        ${t.kategorie ? `<li>Feld <b>Vorlagen-Kategorie</b> → <b>${esc(t.kategorie)}</b></li>` : ''}
        ${t.header && t.header.type === 'text'
          ? `<li>Feld <b>Anhang / Überschrift</b> → Überschrift: „${esc(t.header.value || '')}"</li>`
          : (t.header && t.header.type ? `<li>Feld <b>Anhang / Überschrift</b> → <b>${esc(HEADER_LABEL[t.header.type] || t.header.type)}</b> hochladen (siehe Bild oben)</li>` : '')}
        <li>Feld <b>Nachricht</b>: <button class="copy-row inline" id="copy-body">📋 Vorlagentext kopieren</button>
          ${t.variables && t.variables.length ? `<div class="var-legend">Platzhalter in Superchat als Variable einfügen: ${t.variables.map(v => `<span class="var">{{${v.position}}}</span>=${esc(v.display_name || '')}`).join(' · ')}</div>` : ''}</li>
        ${t.footer ? `<li>Feld <b>Fußzeile</b>: <button class="copy-row inline" id="copy-footer">📋 „${esc(t.footer)}"</button></li>` : ''}
        ${t.buttons && t.buttons.length ? `<li>Bei <b>Button hinzufügen</b> ${t.buttons.length} Button(s) anlegen:
          <div class="sc-btns">${t.buttons.map((b, i) => `<div class="sc-btn"><span class="btn-pos">${i + 1}</span> Typ <b>${esc(btnTypeLabel(b.type))}</b>, Label <button class="copy-row inline" data-cb="${i}">📋 „${esc(b.title || '')}"</button>${b.target ? ` · Wert: ${esc(b.target)}` : ''}</div>`).join('')}</div></li>` : ''}
      </ol>
    </div>
    ${FEATURE_SUPERCHAT ? PUSH_BLOCK : ''}
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
  if (FEATURE_SUPERCHAT && $('#push-btn')) $('#push-btn').onclick = () => pushPreview(base.id);
  if ($('#f-reset')) $('#f-reset').onclick = () => resetOverlay(base.id);
  if ($('#copy-body')) $('#copy-body').onclick = () => copyText(t.body, $('#copy-body'), '📋 Vorlagentext kopieren');
  if ($('#copy-footer')) $('#copy-footer').onclick = () => copyText(t.footer, $('#copy-footer'), '📋 Fußzeile kopieren');
  $$('[data-cb]').forEach(el => el.onclick = () => copyText((t.buttons[+el.dataset.cb] || {}).title, el, el.textContent));
}
async function copyText(text, btnEl, restore) {
  try { await navigator.clipboard.writeText(text || ''); }
  catch { const ta = document.createElement('textarea'); ta.value = text || ''; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.focus(); ta.select(); try { document.execCommand('copy'); } catch {} ta.remove(); }
  if (btnEl) { btnEl.textContent = '✓ kopiert'; btnEl.classList.add('copied'); setTimeout(() => { btnEl.textContent = restore; btnEl.classList.remove('copied'); }, 1300); }
}
function closeModal() { $('#modal').classList.add('hidden'); }

/* ─── Push nach SuperChat = Einreichen bei Meta (VOR-9 Slice 2) ─────────────── */
// AI-generated: VOR-9 — Vorschau (serverseitig gebaute effektive Vorlage), KEINE Writes
async function pushPreview(id) {
  const panel = $('#push-panel'); panel.classList.remove('hidden');
  panel.innerHTML = '<p class="sub">Vorschau lädt…</p>';
  try {
    const r = await api('POST', '/api/vor/push-template', { templateId: id, action: 'preview' });
    if (!r.ok) {
      const hint = /Verbindung/.test(r.error || '') ? ' → trag deine SuperChat-API in den ⚙️ Einstellungen ein.' : '';
      panel.innerHTML = `<p class="error">${esc(r.error || 'Fehler')}${hint}</p>`;
      return;
    }
    const p = r.preview;
    const folderTxt = p.folderName
      ? (p.folderExists ? `Ordner „${esc(p.folderName)}" (vorhanden)` : `Ordner „${esc(p.folderName)}" (wird neu angelegt)`)
      : 'kein Ordner';
    const warn = (p.warnings || []).map(w => `<li class="error">${esc(w)}</li>`).join('');
    panel.innerHTML = `
      <div class="push-preview">
        <p><b>Das wird bei Meta zur Freigabe eingereicht:</b></p>
        <ul class="sc-steps">
          <li>Name: <b>${esc(p.name)}</b></li>
          <li>Kategorie: <b>${esc(p.category)}</b> · Sprache: <b>${esc(p.language)}</b></li>
          <li>${folderTxt}</li>
          <li>${p.buttonCount} Button(s), ${p.variableCount} Variable(n)</li>
          ${warn}
        </ul>
        <p class="placeholder">⚠️ Verbindlich: Meta prüft die Vorlage (kann abgelehnt werden, zählt gegen dein Template-Limit).</p>
        <div class="actions">
          <button class="btn-save" id="push-go">Jetzt verbindlich einreichen</button>
          <button class="btn-reset" id="push-cancel">Abbrechen</button>
        </div>
        <div id="push-msg" class="hidden"></div>
      </div>`;
    $('#push-go').onclick = () => pushSubmit(id);
    $('#push-cancel').onclick = () => { panel.classList.add('hidden'); panel.innerHTML = ''; };
  } catch (e) { panel.innerHTML = `<p class="error">Fehler: ${esc(e.message)}</p>`; }
}
// AI-generated: VOR-9 — verbindliches Einreichen bei Meta (session-Key falls Modus „nur Sitzung")
async function pushSubmit(id) {
  const msg = $('#push-msg'), btn = $('#push-go');
  msg.className = 'hidden'; btn.disabled = true; btn.textContent = 'Reicht ein…';
  try {
    const sessionKey = sessionStorage.getItem('sc_session_key') || '';
    const r = await api('POST', '/api/vor/push-template', { templateId: id, action: 'submit', sessionKey });
    if (r.ok) {
      msg.className = 'ok-msg';
      msg.textContent = `✓ Eingereicht — Status: ${esc(r.status || 'pending')}${r.folderAssigned ? ' · Ordner zugeordnet' : ''}. Meta prüft die Vorlage.`;
      btn.classList.add('hidden');
    } else { msg.className = 'error'; msg.textContent = 'Fehler: ' + esc(r.error || 'unbekannt'); }
  } catch (e) { msg.className = 'error'; msg.textContent = 'Fehler: ' + e.message; }
  finally { btn.disabled = false; btn.textContent = 'Jetzt verbindlich einreichen'; }
}

/* ─── Bulk-Push: alle Vorlagen einreichen (VOR-9 Slice 3) ───────────────────── */
// AI-generated: VOR-9 — Bulk nutzt sequenziell die geprüfte Single-Submit-Route (Pro-Vorlage-Status)
async function refreshScButton() {
  if (!FEATURE_SUPERCHAT) { $('#bulk-btn').classList.add('hidden'); return; }
  try { const s = await api('GET', '/api/vor/superchat-key'); $('#bulk-btn').classList.toggle('hidden', !s.configured); }
  catch (_) { $('#bulk-btn').classList.add('hidden'); }
}
function closeBulk() { $('#bulk').classList.add('hidden'); }
function openBulkPush() {
  const items = STATE.templates.filter(t => !effective(t).hidden).map(t => ({ id: t.id, name: effective(t).name }));
  $('#bulk').classList.remove('hidden');
  if (!items.length) { $('#bulk-body').innerHTML = '<h2>Alle einreichen</h2><p class="sub">Keine Vorlagen vorhanden.</p>'; return; }
  const rows = items.map(it => `<div class="bp-row" id="bp-${it.id}"><span class="bp-name">${esc(it.name)}</span><span class="bp-status">wartet</span></div>`).join('');
  $('#bulk-body').innerHTML = `
    <h2>📤 Alle Vorlagen einreichen</h2>
    <p class="sub">${items.length} Vorlage(n) werden in deinem SuperChat-Account <b>bei Meta zur Freigabe</b> eingereicht.</p>
    <p class="placeholder">⚠️ Verbindlich: jede Einreichung zählt gegen dein Template-Limit, Ablehnungen drücken die Quality-Rating. Personalisierung (Firma + Links) wird angewendet.</p>
    <div class="actions">
      <button class="btn-save" id="bulk-go">Alle ${items.length} verbindlich einreichen</button>
      <button class="btn-reset" id="bulk-cancel">Abbrechen</button>
    </div>
    <div id="bulk-sum" class="hidden"></div>
    <div class="bp-list">${rows}</div>`;
  $('#bulk-go').onclick = () => { const b = $('#bulk-go'); b.disabled = true; b.textContent = 'Läuft…'; runBulkPush(items, b); };
  $('#bulk-cancel').onclick = closeBulk;
}
async function runBulkPush(items, goBtn) {
  const sessionKey = sessionStorage.getItem('sc_session_key') || '';
  let ok = 0, fail = 0;
  for (const it of items) {
    const row = document.getElementById('bp-' + it.id);
    const st = row && row.querySelector('.bp-status');
    if (st) st.textContent = '… reicht ein';
    try {
      const r = await api('POST', '/api/vor/push-template', { templateId: it.id, action: 'submit', sessionKey });
      if (r.ok) { ok++; if (row) { row.classList.add('bp-ok'); if (st) st.textContent = '✓ ' + (r.status || 'pending'); } }
      else { fail++; if (row) { row.classList.add('bp-fail'); if (st) st.textContent = '✗ ' + (r.error || 'Fehler'); } }
    } catch (e) { fail++; if (row) { row.classList.add('bp-fail'); if (st) st.textContent = '✗ ' + e.message; } }
    await new Promise(res => setTimeout(res, 250)); // sanft gegen SuperChat-Rate-Limits
  }
  const sum = $('#bulk-sum'); sum.className = fail ? 'error' : 'ok-msg';
  sum.textContent = `Fertig: ${ok} eingereicht${fail ? ', ' + fail + ' Fehler' : ''}.`;
  if (goBtn) { goBtn.disabled = false; goBtn.textContent = 'Erneut einreichen'; }
}

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

/* ─── Admin: Kundenverwaltung (nur role=admin) ─────────────────────────── */
const isAdmin = () => store.user?.role === 'admin';
// WV-9: kryptographisch zufällig (vorher Math.random) — Backup-Passwörter sind echte Zugangsdaten.
const genPass = () => {
  const a = 'abcdefghijkmnpqrstuvwxyz23456789';
  const buf = crypto.getRandomValues(new Uint32Array(9));
  let s = '';
  for (const n of buf) s += a[n % a.length];
  return 'K' + s.slice(0, 6) + s.slice(6).toUpperCase() + '7!';
};

async function openAdmin() {
  $('#admin').classList.remove('hidden');
  $('#admin-body').innerHTML = '<p class="sub">lädt…</p>';
  try {
    const [tenants, users, rr] = await Promise.all([
      api('GET', '/api/collections/tenants/records?perPage=500&sort=name'),
      api('GET', '/api/collections/users/records?perPage=500'),
      api('GET', '/api/collections/renewal_requests/records?perPage=200').catch(() => ({ items: [] })),
    ]);
    const tById = Object.fromEntries(tenants.items.map(t => [t.id, t]));
    const renewalSet = new Set((rr.items || []).filter(r => !r.handled).map(r => r.tenant));
    const customers = users.items.filter(u => u.role !== 'admin');
    STATE.adminCustomers = customers;   // deleteCustomer() braucht die Geschwister im Mandanten
    renderAdmin(customers, tById, renewalSet);
  } catch (e) { $('#admin-body').innerHTML = `<p class="error">Fehler: ${esc(e.message)}</p>`; }
}
function daysUntil(dateStr) {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr) - new Date()) / 86400000);
}
function ablaufBadge(t) {
  if (!t || !t.expires_at) return '';
  const d = daysUntil(t.expires_at);
  const datum = new Date(t.expires_at).toLocaleDateString('de-DE');
  if (t.status === 'expired' || d < 0) return `<span class="badge hidden-b">abgelaufen (${datum})</span>`;
  if (d <= 14) return `<span class="badge mk">läuft in ${d} Tg. ab (${datum})</span>`;
  return `<span class="cust-sub">aktiv bis ${datum}</span>`;
}
function renderAdmin(customers, tById, renewalSet = new Set()) {
  // Nach Mandant gruppieren: ein Kunde darf mehrere Benutzer haben. Overlays, Einstellungen und
  // die SuperChat-Verbindung hängen am Mandanten, nicht am Benutzer — alle teilen sich also
  // denselben Stand. Gruppen mit ablaufender Lizenz zuerst.
  const byTenant = new Map();
  for (const u of customers) {
    const key = u.tenant || '_ohne';
    if (!byTenant.has(key)) byTenant.set(key, []);
    byTenant.get(key).push(u);
  }
  const gruppen = [...byTenant.entries()].sort((a, b) =>
    (daysUntil(tById[a[0]]?.expires_at) ?? 9999) - (daysUntil(tById[b[0]]?.expires_at) ?? 9999));
  $('#admin-body').innerHTML = `
    <div class="edit" style="border-bottom:1px solid var(--line);padding-bottom:18px;margin-bottom:18px">
      <h3>Mein Admin-Zugang</h3>
      <p class="placeholder">Eingeloggt als <b>${esc(store.user.email)}</b>. Hier dein eigenes Passwort ändern — kein Skript nötig.</p>
      <label>Aktuelles Passwort<input type="password" id="adm-old" autocomplete="current-password"></label>
      <label>Neues Passwort (mind. 8 Zeichen)<input type="text" id="adm-pass" autocomplete="new-password"></label>
      <div class="actions">
        <button type="button" class="btn-save" id="adm-pw-save">Mein Passwort ändern</button>
        <button type="button" class="btn-reset" id="adm-pw-gen">Vorschlag</button>
      </div>
      <div id="adm-pw-msg" class="hidden"></div>
    </div>
    <h2>Kunden verwalten</h2>
    <p class="sub">${gruppen.length} Kunde(n) · ${customers.length} Benutzer</p>
    <form id="cust-form" class="edit" style="border-bottom:1px solid var(--line);padding-bottom:18px;margin-bottom:18px">
      <h3>Neuen Kunden anlegen</h3>
      <label>Firma / Mandant (intern)<input type="text" id="c-name" required placeholder="z. B. Muster GmbH"></label>
      <label>Firmenname für die Verabschiedung (Footer in den Vorlagen)<input type="text" id="c-firma" required placeholder="z. B. Muster Finanz OHG"></label>
      <label>E-Mail (Login)<input type="email" id="c-email" required placeholder="kunde@firma.de"></label>
      <label>Passwort<input type="text" id="c-pass" required></label>
      <label>Vertragsdatum (Start — Ablauf = +365 Tage)<input type="date" id="c-invited" required></label>
      <h3 style="margin-top:6px">Links des Kunden (ersetzen die Völker-Links)</h3>
      <label>Website (ersetzt <code>www.voelker-allianz.de</code>)<input type="text" id="c-web" placeholder="www.muster-finanz.de"></label>
      <label>Weitere Ersetzungen — eine pro Zeile, Format <code>alt = neu</code>
        <textarea id="c-more" placeholder="https://review.superchat.de/?rc=... = https://g.page/r/...&#10;https://tidycal.com/team/voelkerfinance/tkv = https://tidycal.com/muster/tkv"></textarea></label>
      <p class="placeholder">Zugang läuft automatisch nach 365 Tagen ab (verlängerbar).</p>
      <div class="actions"><button type="submit" class="btn-save" id="c-save">Kunde anlegen</button>
        <button type="button" class="btn-reset" id="c-gen">Passwort neu</button></div>
      <div id="c-msg" class="hidden"></div>
    </form>
    <div class="edit" style="border-bottom:1px solid var(--line);padding-bottom:18px;margin-bottom:18px">
      <h3>Kunden importieren (CSV)</h3>
      <p class="placeholder">CSV mit Spalten <code>Kunde</code>, <code>Vertragsstart</code>, <code>E-Mail</code> (Semikolon-getrennt). <b>Bestehende E-Mails werden übersprungen.</b> Neue Kunden bekommen die Willkommens-Mail mit Passwort-Link.</p>
      <input type="file" id="csv-file" accept=".csv,text/csv">
      <div class="actions"><button type="button" class="btn-reset" id="csv-read">Vorschau</button></div>
      <div id="csv-preview"></div>
    </div>
    <h3>Bestehende Kunden</h3>
    <p class="placeholder">Ein Kunde kann mehrere Benutzer haben — sie teilen sich Vorlagen-Anpassungen, Einstellungen und die SuperChat-Verbindung.</p>
    <div class="cust-list">
      ${gruppen.length ? gruppen.map(([tid, us]) => {
        const t = tById[tid];
        const renew = (renewalSet.has(tid) && t && t.status !== 'active') ? ' <span class="badge mk">💶 Verlängerung angefragt</span>' : '';
        return `<div class="cust-group" data-tid="${t ? tid : ''}">
          <div class="cust-head">
            <div><div class="cust-mail">${esc(t?.firma || t?.name || '— kein Mandant')}</div>
              <div class="cust-sub">${us.length} Benutzer</div>
              <div style="margin-top:3px">${ablaufBadge(t)}${renew}</div></div>
            <div class="cust-act">
              ${t ? '<button class="mini" data-act="lz">Laufzeit</button>' : ''}
              ${t ? '<button class="mini" data-act="ext">+1 Jahr</button>' : ''}
              ${t ? '<button class="mini" data-act="adduser">+ Benutzer</button>' : ''}
            </div>
          </div>
          ${us.map(u => `<div class="cust-row" data-uid="${u.id}" data-tid="${u.tenant || ''}">
            <div class="cust-user">${esc(u.email)}</div>
            <div class="cust-act">
              <button class="mini" data-act="pw">Passwort</button>
              <button class="mini danger" data-act="del">${us.length > 1 ? 'Entfernen' : 'Löschen'}</button>
            </div></div>`).join('')}
        </div>`;
      }).join('') : '<p class="placeholder">Noch keine Kunden.</p>'}
    </div>`;
  $('#c-pass').value = genPass();
  $('#c-invited').value = new Date().toISOString().slice(0, 10);
  $('#c-gen').onclick = () => { $('#c-pass').value = genPass(); };
  $('#cust-form').onsubmit = createCustomer;
  $('#csv-read').onclick = csvImportPreview;
  $('#adm-pw-save').onclick = changeOwnPassword;
  $('#adm-pw-gen').onclick = () => { $('#adm-pass').value = genPass(); };
  $$('.cust-group .mini').forEach(b => b.onclick = (e) => {
    const grp = e.target.closest('.cust-group');
    const row = e.target.closest('.cust-row');
    const act = b.dataset.act;
    if (act === 'pw') resetCustomerPass(row.dataset.uid);
    else if (act === 'del') deleteCustomer(row.dataset.uid, row.dataset.tid);
    else if (act === 'ext') extendTenant(grp.dataset.tid);
    else if (act === 'lz') editLaufzeit(grp.dataset.tid);
    else if (act === 'adduser') addUserToTenant(grp.dataset.tid);
  });
}

/* ─── Weiteren Benutzer zu einem bestehenden Kunden anlegen ─────────────────── */
// Mehrere Mitarbeiter eines Kunden arbeiten am selben Vorlagen-Stand: Overlays, Einstellungen
// und SuperChat-Key hängen am Mandanten. Der neue Benutzer bekommt denselben Onboarding-Weg
// wie ein Neukunde (Willkommens-Mail mit Passwort-Link, Backup-Passwort als Fallback).
async function addUserToTenant(tid) {
  if (!tid) return;
  const email = (prompt('E-Mail des weiteren Benutzers:') || '').trim();
  if (!email) return;
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { alert('Das sieht nicht nach einer E-Mail-Adresse aus.'); return; }
  const pass = genPass();
  try {
    // WV-9: serverseitig (tenant_admin.pb.js) — erzwingt role=customer + existierenden Mandanten.
    await api('POST', '/api/vor/admin/customer-user', { tenantId: tid, email, password: pass });
    let mailed = false;
    try { await api('POST', '/api/collections/users/request-password-reset', { email }); mailed = true; } catch (_) {}
    alert(mailed
      ? `Benutzer ${email} angelegt.\n\nEine Willkommens-Mail mit Passwort-Link ist unterwegs.\n\nBackup-Passwort, falls keine Mail ankommt:\n${pass}`
      : `Benutzer ${email} angelegt.\n\nMailversand nicht möglich — bitte Zugangsdaten manuell weitergeben:\nLogin: ${location.origin}/\nE-Mail: ${email}\nPasswort: ${pass}`);
    openAdmin();
  } catch (e) {
    alert('Anlegen fehlgeschlagen: ' + e.message);
  }
}
// Onboarding-Felder → ersetzungen-Liste
function buildErsetzungen() {
  return parseErsetzungen($('#c-web').value, $('#c-more').value);
}
// AI-generated: VOR-8 — generischer Parser (Website-Feld + freie „alt = neu"-Zeilen), von Admin + Settings genutzt.
function parseErsetzungen(webVal, moreVal) {
  const list = [];
  const web = (webVal || '').trim();
  if (web) list.push({ from: 'www.voelker-allianz.de', to: web });
  for (const line of (moreVal || '').split('\n')) {
    const i = line.indexOf('=');
    if (i < 0) continue;
    const from = line.slice(0, i).trim(), to = line.slice(i + 1).trim();
    if (from && to) list.push({ from, to });
  }
  return list;
}
async function extendTenant(tid) {
  if (!tid) return;
  try {
    const t = await api('GET', `/api/collections/tenants/records/${tid}`);
    const base = t.expires_at && new Date(t.expires_at) > new Date() ? new Date(t.expires_at) : new Date();
    base.setDate(base.getDate() + 365);
    await api('PATCH', `/api/collections/tenants/records/${tid}`, { expires_at: base.toISOString(), status: 'active' });
    openAdmin();
  } catch (e) { alert('Fehler: ' + e.message); }
}
// AI-generated: VOR-12 — Laufzeit nachträglich setzen: Vertragsbeginn eingeben → Ablauf = +365 Tage
async function editLaufzeit(tid) {
  if (!tid) return;
  let t;
  try { t = await api('GET', `/api/collections/tenants/records/${tid}`); } catch (e) { alert('Fehler: ' + e.message); return; }
  const curStart = t.invited_at ? new Date(t.invited_at).toLocaleDateString('de-DE') : '';
  const curEnd = t.expires_at ? new Date(t.expires_at).toLocaleDateString('de-DE') : '—';
  const inp = prompt(`Vertragsbeginn für „${t.name}" (TT.MM.JJJJ). Ablauf wird automatisch = +365 Tage.\nAktueller Beginn: ${curStart || '—'}  ·  Ablauf: ${curEnd}`, curStart);
  if (inp === null) return;
  const d = parseDeDate(inp.trim());
  if (!d) { alert('Ungültiges Datum. Bitte Format TT.MM.JJJJ (z. B. 01.07.2025).'); return; }
  const exp = new Date(d); exp.setDate(exp.getDate() + 365);
  try {
    await api('PATCH', `/api/collections/tenants/records/${tid}`, { invited_at: d.toISOString(), expires_at: exp.toISOString(), status: 'active' });
    openAdmin();
  } catch (e) { alert('Fehler: ' + e.message); }
}
async function createCustomer(e) {
  e.preventDefault();
  const name = $('#c-name').value.trim(), email = $('#c-email').value.trim(), pass = $('#c-pass').value.trim();
  const firma = $('#c-firma').value.trim();
  const ersetzungen = buildErsetzungen();
  const msg = $('#c-msg'), btn = $('#c-save');
  msg.className = 'hidden'; btn.disabled = true; btn.textContent = 'Legt an…';
  try {
    // WV-9: Mandant + Benutzer + tenant_settings entstehen serverseitig in EINER Transaktion
    // (pb_hooks/tenant_admin.pb.js) — kein Client-Rollback, keine Waisen-Records mehr.
    // Vertragsdatum (Start) aus dem Formular; Ablauf = +365 Tage (VOR-3, serverseitig).
    await api('POST', '/api/vor/admin/customer', { name, email, password: pass, firma, ersetzungen, invitedAt: $('#c-invited').value });
    // Willkommens-Mail mit „Passwort setzen"-Link (VOR-11) NACH dem Commit; Backup-Passwort als Fallback.
    let mailed = false;
    try { await api('POST', '/api/collections/users/request-password-reset', { email }); mailed = true; } catch (_) {}
    msg.className = 'ok-msg';
    msg.innerHTML = `✓ Kunde <b>${esc(email)}</b> angelegt. `
      + (mailed
        ? `<b>Willkommens-Mail mit Passwort-Link</b> verschickt — der Kunde setzt sein eigenes Passwort.`
        : `<b>Mailversand nicht möglich</b> (SMTP in PocketBase prüfen) — bitte Zugangsdaten manuell geben.`)
      + `<br><small>Backup-Passwort (falls keine Mail ankommt): <code>${esc(pass)}</code></small>
      <button type="button" class="copy-row" id="copy-cred" style="margin-top:6px">📋 Zugangsdaten kopieren</button>`;
    $('#copy-cred').onclick = () => copyText(`WhatsApp-Vorlagen\nLogin: ${location.origin}/\nE-Mail: ${email}\nPasswort: ${pass}`, $('#copy-cred'), '📋 Zugangsdaten kopieren');
    $('#c-name').value = ''; $('#c-email').value = ''; $('#c-firma').value = ''; $('#c-web').value = ''; $('#c-more').value = ''; $('#c-pass').value = genPass();
    // Liste nicht sofort neu rendern (würde die Zugangsdaten-Anzeige überschreiben)
  } catch (ex) {
    msg.className = 'error'; msg.textContent = 'Fehler: ' + ex.message;
  } finally { btn.disabled = false; btn.textContent = 'Kunde anlegen'; }
}
/* ─── CSV-Bulk-Import (VOR-12) ──────────────────────────────────────────────── */
// AI-generated: VOR-12 — Latin-1/Semikolon-CSV; Bestehende übersprungen; neue → anlegen + Willkommens-Mail
function csvCellId(s) { return 'ci-' + s.replace(/[^a-z0-9]/gi, '_'); }
function parseDeDate(s) {
  const m = (s || '').match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  return m ? new Date(+m[3], +m[2] - 1, +m[1], 12, 0, 0) : null; // 12:00 gegen TZ-Verschub
}
function parseCsvText(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim() && !/^;+$/.test(l.trim()));
  let hi = lines.findIndex(l => /(^|;)\s*e-?mail\s*(;|$)/i.test(l));
  if (hi < 0) hi = 0;
  const head = lines[hi].split(';').map(h => h.trim().toLowerCase());
  const col = (names) => head.findIndex(h => names.some(n => h === n || h.includes(n)));
  const iEmail = col(['e-mail', 'email', 'e mail']);
  const iName = col(['kunde', 'name']);
  const iStart = col(['vertragsstart', 'vertragsdatum', 'start']);
  const rows = [];
  for (let i = hi + 1; i < lines.length; i++) {
    const c = lines[i].split(';');
    const email = (c[iEmail] || '').trim().toLowerCase();
    if (!email || !email.includes('@')) continue;
    rows.push({ email, name: (c[iName] || '').trim(), start: iStart >= 0 ? (c[iStart] || '').trim() : '' });
  }
  return rows;
}
async function csvImportPreview() {
  const f = $('#csv-file').files[0], box = $('#csv-preview');
  if (!f) { box.innerHTML = '<p class="error">Bitte zuerst eine CSV-Datei wählen.</p>'; return; }
  box.innerHTML = '<p class="sub">lese…</p>';
  try {
    const buf = await f.arrayBuffer();
    // Robust: erst UTF-8; ist das ungültig (Ersatzzeichen), war es Windows-1252 (Excel-Export).
    let text = new TextDecoder('utf-8', { fatal: false }).decode(buf);
    if (text.includes('�')) text = new TextDecoder('windows-1252').decode(buf);
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1); // BOM entfernen
    const rows = parseCsvText(text);
    const ul = await api('GET', '/api/collections/users/records?perPage=500&fields=email');
    const have = new Set(ul.items.map(u => (u.email || '').toLowerCase()));
    const seen = new Set();
    for (const r of rows) { r.exists = have.has(r.email) || seen.has(r.email); seen.add(r.email); }
    const neu = rows.filter(r => !r.exists);
    box.innerHTML = `
      <p class="sub">${rows.length} Zeilen — <b>${neu.length} neu</b>, ${rows.length - neu.length} bestehend (übersprungen)</p>
      <div class="bp-list">${rows.map(r => `<div class="bp-row ${r.exists ? '' : 'bp-ok'}" id="${csvCellId(r.email)}">
        <span class="bp-name">${esc(r.name || '—')} · ${esc(r.email)}</span>
        <span class="bp-status">${r.exists ? 'bestehend' : esc(r.start || 'neu')}</span></div>`).join('')}</div>
      <div class="actions"><button type="button" class="btn-save" id="csv-go" ${neu.length ? '' : 'disabled'}>${neu.length} neue Kunden anlegen &amp; einladen</button></div>
      <div id="csv-sum" class="hidden"></div>`;
    if (neu.length) $('#csv-go').onclick = () => { $('#csv-go').disabled = true; $('#csv-go').textContent = 'Läuft…'; runCsvImport(neu); };
  } catch (e) { box.innerHTML = `<p class="error">Fehler: ${esc(e.message)}</p>`; }
}
async function createCustomerRow(r) {
  // WV-9: Anlage serverseitig transaktional. Ein MAILFEHLER rollt nichts mehr zurück —
  // vorher blieb dann ein Benutzer ohne Mandant zurück (users.tenant kaskadiert nicht),
  // den ein erneuter Import wegen der bestehenden E-Mail auch noch übersprang.
  const name = r.name || r.email.split('@')[0];
  const invited = parseDeDate(r.start) || new Date();
  const pass = genPass();
  await api('POST', '/api/vor/admin/customer', { name, email: r.email, password: pass, firma: name, ersetzungen: [], invitedAt: invited.toISOString() });
  let mailed = true;
  try { await api('POST', '/api/collections/users/request-password-reset', { email: r.email }); } catch (_) { mailed = false; }
  return { mailed, pass };
}
async function runCsvImport(rows) {
  let ok = 0, fail = 0;
  for (const r of rows) {
    const el = document.getElementById(csvCellId(r.email)), st = el && el.querySelector('.bp-status');
    if (st) st.textContent = '… legt an';
    try {
      const res = await createCustomerRow(r); ok++;
      if (st) st.textContent = res.mailed ? '✓ angelegt + Mail' : `✓ angelegt — Mail fehlgeschlagen, Backup-PW: ${res.pass}`;
    }
    catch (e) { fail++; if (el) { el.classList.remove('bp-ok'); el.classList.add('bp-fail'); } if (st) st.textContent = '✗ ' + (e.message || 'Fehler'); }
    await new Promise(res => setTimeout(res, 300)); // sanft gegen Rate-Limits/Mailversand
  }
  const sum = $('#csv-sum'); sum.className = fail ? 'error' : 'ok-msg';
  sum.textContent = `✓ Fertig: ${ok} angelegt + eingeladen${fail ? ', ' + fail + ' Fehler' : ''}. (Mails ggf. im Spam — „Kein Spam" markieren.)`;
  const go = document.getElementById('csv-go');
  if (go) { go.disabled = false; go.textContent = 'Erneut importieren'; }
  if (!fail && ok) setTimeout(openAdmin, 2200); // Liste frisch laden → neue Kunden mit Laufzeit/Löschen sichtbar
}

// AI-generated: VOR-3 — Admin ändert sein EIGENES Passwort in der UI (kein Skript/DB-Eingriff)
async function changeOwnPassword() {
  const oldP = $('#adm-old').value, np = $('#adm-pass').value.trim();
  const msg = $('#adm-pw-msg'); msg.className = 'hidden';
  if (!oldP) { msg.className = 'error'; msg.textContent = 'Bitte aktuelles Passwort eingeben.'; return; }
  if (np.length < 8) { msg.className = 'error'; msg.textContent = 'Neues Passwort: mindestens 8 Zeichen.'; return; }
  const btn = $('#adm-pw-save'); btn.disabled = true; btn.textContent = 'Ändert…';
  try {
    // PocketBase verlangt oldPassword bei Änderung des eigenen Auth-Records.
    await api('PATCH', `/api/collections/users/records/${store.user.id}`, { oldPassword: oldP, password: np, passwordConfirm: np });
    msg.className = 'ok-msg'; msg.textContent = '✓ Passwort geändert. Beim nächsten Login das neue verwenden.';
    $('#adm-old').value = ''; $('#adm-pass').value = '';
  } catch (e) { msg.className = 'error'; msg.textContent = 'Fehler: ' + (e.message || 'Passwortwechsel fehlgeschlagen'); }
  finally { btn.disabled = false; btn.textContent = 'Mein Passwort ändern'; }
}
async function resetCustomerPass(uid) {
  if (!confirm('Neues Passwort für diesen Kunden erzeugen?')) return;
  const np = genPass();
  try {
    await api('PATCH', `/api/collections/users/records/${uid}`, { password: np, passwordConfirm: np });
    await copyText(np, null);
    alert('Neues Passwort gesetzt und in die Zwischenablage kopiert:\n\n' + np + '\n\nJetzt an den Kunden geben.');
  } catch (e) { alert('Fehler: ' + e.message); }
}
async function deleteCustomer(uid, tid) {
  // Hat der Mandant weitere Benutzer, darf NUR der Benutzer weg — `tenants` löscht per
  // cascadeDelete alle Overlays mit, das würde sonst die Arbeit der Kollegen vernichten.
  // WV-9: Die Ansicht liefert nur noch den DIALOGTEXT; entschieden wird serverseitig in der
  // Transaktion (tenant_admin.pb.js). Weicht der Server-Stand von der Ansicht ab → 409.
  const geschwister = (STATE.adminCustomers || []).filter(u => u.tenant && u.tenant === tid && u.id !== uid);
  const user = (STATE.adminCustomers || []).find(u => u.id === uid);
  const wer = user ? user.email : 'diesen Benutzer';
  const istLetzter = !(tid && geschwister.length);

  const frage = istLetzter
    ? `${wer} ist der letzte Benutzer dieses Kunden.\n\nLöschen entfernt den kompletten Mandanten — inklusive aller Vorlagen-Anpassungen, Einstellungen und der SuperChat-Verbindung. Das lässt sich nicht rückgängig machen.\n\nWirklich löschen?`
    : `Benutzer ${wer} entfernen?\n\nDer Kunde bleibt bestehen (${geschwister.length} weitere${geschwister.length === 1 ? 'r' : ''} Benutzer). Vorlagen-Anpassungen, Einstellungen und die SuperChat-Verbindung bleiben erhalten.`;
  if (!confirm(frage)) return;

  try {
    await api('DELETE', `/api/vor/admin/customer-user/${uid}?expectLast=${istLetzter ? 1 : 0}`);
    openAdmin();
  } catch (e) {
    alert(e.message);
    if (/veraltet/i.test(e.message)) openAdmin();
  }
}
function closeAdmin() { $('#admin').classList.add('hidden'); }

/* ─── Einstellungen: Self-Service (Firma + Links) ──────────────────────────── */
// AI-generated: VOR-8 — bekannte Völker-Master-Links als benannte Felder (aus Vorlagen-Beispielen 2026-06-19).
// `from` = Völker-Master (fest), Kunde trägt nur `to` (seinen eigenen) ein. Bei der Service-Basis
// wird nur der Vorderteil ersetzt, der per-Nachricht-Suffix bleibt erhalten.
const LINK_FIELDS = [
  { key: 'web',     label: 'Website (ersetzt www.voelker-allianz.de)', from: 'www.voelker-allianz.de',                                ph: 'www.muster-finanz.de' },
  { key: 'service', label: 'Service-/Flixlink-Basis',                  from: 'https://service.voelker.finance/s/',                     ph: 'https://service.muster.finance/s/' },
  { key: 'review',  label: 'Bewertungslink',                           from: 'https://review.superchat.de/?rc=tc_muwZslmXFD3qgxb7580M', ph: 'eigener Bewertungslink (z. B. https://g.page/r/…)' },
  { key: 'termin',  label: 'Termin-Link',                              from: 'https://tidycal.com/team/voelkerfinance/tkv',            ph: 'https://tidycal.com/muster/tkv' },
];
function splitErsetzungen(list) {
  const byKey = {};
  const more = [];
  for (const e of (list || [])) {
    if (!e || !e.from) continue;
    const f = LINK_FIELDS.find(x => x.from === e.from);
    if (f) byKey[f.key] = e.to || '';
    else more.push(`${e.from} = ${e.to || ''}`);
  }
  return { byKey, more: more.join('\n') };
}
// benannte Felder + freie „alt = neu"-Zeilen → ersetzungen-Liste
function buildSettingsErsetzungen() {
  const list = [];
  for (const f of LINK_FIELDS) {
    const to = $(`#s-link-${f.key}`).value.trim();
    if (to) list.push({ from: f.from, to });
  }
  for (const line of ($('#s-more').value || '').split('\n')) {
    const i = line.indexOf('=');
    if (i < 0) continue;
    const from = line.slice(0, i).trim(), to = line.slice(i + 1).trim();
    if (from && to) list.push({ from, to });
  }
  return list;
}
function openSettings() {
  if (!store.user?.tenant) { alert('Für deinen Zugang sind keine Einstellungen verfügbar.'); return; }
  $('#settings').classList.remove('hidden');
  const s = STATE.settings || {};
  const { byKey, more } = splitErsetzungen(s.ersetzungen);
  const linkInputs = LINK_FIELDS.map(f => `
      <label>${esc(f.label)}
        <input type="text" id="s-link-${f.key}" value="${esc(byKey[f.key] || '')}" placeholder="${esc(f.ph)}"></label>`).join('');
  $('#settings-body').innerHTML = `
    <h2>Meine Einstellungen</h2>
    <p class="sub">Diese Werte personalisieren deine Vorlagen — nur für deinen Zugang.</p>
    <div class="edit">
      <label>Firmenname (Verabschiedung / Footer in den Vorlagen)
        <input type="text" id="s-firma" value="${esc(s.firma || '')}" placeholder="z. B. Muster Finanz OHG"></label>
      <h3 style="margin-top:6px">Meine Links</h3>
      <p class="placeholder">Trage deinen eigenen Link ein — er ersetzt überall den Völker-Link. Leer lassen = unverändert.</p>
      ${linkInputs}
      <label>Weitere Ersetzungen — eine pro Zeile, Format <code>alt = neu</code>
        <textarea id="s-more" placeholder="alter Text = neuer Text">${esc(more)}</textarea></label>
      <div class="actions"><button class="btn-save" id="s-save">Speichern</button></div>
      <div id="s-msg" class="hidden"></div>
    </div>
    ${FEATURE_SUPERCHAT ? SC_CONN_HTML : ''}`;
  $('#s-save').onclick = saveSettings;
  if (FEATURE_SUPERCHAT) { $('#sc-save').onclick = saveSuperchatKey; $('#sc-del').onclick = deleteSuperchatKey; loadSuperchatStatus(); }
}

/* ─── SuperChat-Verbindung (VOR-9 Slice 1) ─────────────────────────────────── */
// AI-generated: VOR-9 — Status laden (nie Klartext-Key)
async function loadSuperchatStatus() {
  const el = $('#sc-status'); const del = $('#sc-del');
  try {
    const s = await api('GET', '/api/vor/superchat-key');
    if (s.configured) {
      const modeLbl = s.mode === 'session' ? 'nur Sitzung' : (s.hasStoredKey ? 'verschlüsselt gespeichert' : 'kein Key gespeichert');
      el.innerHTML = `✅ Verbunden — WhatsApp-Account erkannt · ${esc(modeLbl)}. Zum Ändern Key neu eingeben.`;
      del.classList.remove('hidden');
      if (s.mode) $('#sc-mode').value = s.mode;
    } else {
      el.textContent = 'Noch keine SuperChat-Verbindung hinterlegt.';
      del.classList.add('hidden');
    }
  } catch (e) { el.textContent = 'Status nicht verfügbar.'; }
}
// AI-generated: VOR-9 — Key validieren + speichern via Server-Hook
async function saveSuperchatKey() {
  const apiKey = $('#sc-key').value.trim();
  const mode = $('#sc-mode').value;
  const msg = $('#sc-msg'), btn = $('#sc-save');
  msg.className = 'hidden';
  if (!apiKey) { msg.className = 'error'; msg.textContent = 'Bitte API-Key eingeben.'; return; }
  btn.disabled = true; btn.textContent = 'Prüfe…';
  try {
    const r = await api('POST', '/api/vor/superchat-key', { apiKey, mode });
    if (r.ok && r.validated) {
      $('#sc-key').value = '';
      if (mode === 'session') sessionStorage.setItem('sc_session_key', apiKey);
      else sessionStorage.removeItem('sc_session_key');
      msg.className = 'ok-msg';
      msg.textContent = `✓ Verbunden${r.channelName ? ' (' + esc(r.channelName) + ')' : ''} — ${mode === 'stored' ? 'verschlüsselt gespeichert' : 'nur für diese Sitzung'}.`;
      loadSuperchatStatus(); refreshScButton();
    } else {
      msg.className = 'error'; msg.textContent = 'Fehler: ' + (r.error || 'Key nicht akzeptiert.');
    }
  } catch (e) { msg.className = 'error'; msg.textContent = 'Fehler: ' + e.message; }
  finally { btn.disabled = false; btn.textContent = 'Prüfen & speichern'; }
}
// AI-generated: VOR-9 — Anbindung entfernen
async function deleteSuperchatKey() {
  const msg = $('#sc-msg');
  try {
    await api('DELETE', '/api/vor/superchat-key');
    sessionStorage.removeItem('sc_session_key');
    msg.className = 'ok-msg'; msg.textContent = '✓ Verbindung entfernt.';
    loadSuperchatStatus(); refreshScButton();
  } catch (e) { msg.className = 'error'; msg.textContent = 'Fehler: ' + e.message; }
}
async function saveSettings() {
  const firma = $('#s-firma').value.trim();
  const ersetzungen = buildSettingsErsetzungen();
  const msg = $('#s-msg'), btn = $('#s-save');
  msg.className = 'hidden'; btn.disabled = true; btn.textContent = 'Speichert…';
  try {
    let rec;
    if (STATE.settings?.id) rec = await api('PATCH', `/api/collections/tenant_settings/records/${STATE.settings.id}`, { firma, ersetzungen });
    else rec = await api('POST', '/api/collections/tenant_settings/records', { tenant: store.user.tenant, firma, ersetzungen });
    STATE.settings = rec;
    msg.className = 'ok-msg'; msg.textContent = '✓ Gespeichert. Deine Vorlagen sind aktualisiert.';
    render();
  } catch (e) { msg.className = 'error'; msg.textContent = 'Fehler: ' + e.message; }
  finally { btn.disabled = false; btn.textContent = 'Speichern'; }
}
function closeSettings() { $('#settings').classList.add('hidden'); }

/* ─── Passwort-Reset / Willkommen (VOR-11) ─────────────────────────────────── */
// AI-generated: VOR-11 — Self-Service „Passwort vergessen": PB request-password-reset (mailt Link)
async function requestReset() {
  const email = $('#email').value.trim();
  const err = $('#login-error'), msg = $('#login-msg');
  err.classList.add('hidden'); msg.className = 'hidden';
  if (!email) { err.textContent = 'Bitte zuerst deine E-Mail oben eingeben.'; err.classList.remove('hidden'); $('#email').focus(); return; }
  const btn = $('#forgot-btn'); btn.disabled = true;
  // PB antwortet aus Datenschutzgründen neutral — wir zeigen immer dieselbe Meldung.
  try { await api('POST', '/api/collections/users/request-password-reset', { email }); } catch (_) {}
  msg.className = 'ok-msg';
  msg.textContent = 'Falls ein Zugang zu dieser E-Mail existiert, haben wir dir einen Link zum Passwort-Setzen geschickt.';
  btn.disabled = false;
}
// AI-generated: VOR-11 — Reset-Bestätigung: Token aus URL → neues Passwort (confirm-password-reset)
function showResetConfirm(token) {
  show('login');
  $('#login').innerHTML = `
    <form class="login-card" id="reset-form">
      <div class="brand"><span class="brand-mark">💬</span> WhatsApp-Vorlagen</div>
      <p class="login-sub">Neues Passwort setzen.</p>
      <label>Neues Passwort (mind. 8 Zeichen)<input type="password" id="r-pass" autocomplete="new-password" required minlength="8"></label>
      <label>Passwort wiederholen<input type="password" id="r-pass2" autocomplete="new-password" required></label>
      <button type="submit" id="r-btn">Passwort setzen</button>
      <div id="r-msg" class="hidden"></div>
    </form>`;
  $('#reset-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const p1 = $('#r-pass').value, p2 = $('#r-pass2').value, msg = $('#r-msg'), btn = $('#r-btn');
    msg.className = 'hidden';
    if (p1.length < 8) { msg.className = 'error'; msg.textContent = 'Mindestens 8 Zeichen.'; return; }
    if (p1 !== p2) { msg.className = 'error'; msg.textContent = 'Passwörter stimmen nicht überein.'; return; }
    btn.disabled = true; btn.textContent = 'Setzt…';
    try {
      await api('POST', '/api/collections/users/confirm-password-reset', { token, password: p1, passwordConfirm: p2 });
      msg.className = 'ok-msg'; msg.textContent = '✓ Passwort gesetzt. Weiter zur Anmeldung…';
      setTimeout(() => { location.href = location.origin + '/'; }, 1800);
    } catch (_) {
      msg.className = 'error'; msg.textContent = 'Link ungültig oder abgelaufen. Bitte „Passwort vergessen?" erneut nutzen.';
      btn.disabled = false; btn.textContent = 'Passwort setzen';
    }
  });
}

/* ─── Boot ─────────────────────────────────────────────────────────────── */
async function boot() {
  show('app');
  $('#admin-btn').classList.toggle('hidden', !isAdmin());
  // VOR-12: „Einstellungen" (persönliche Kunden-Seite) nur für Konten mit Mandant — Admin hat keinen.
  $('#settings-btn').classList.toggle('hidden', !store.user?.tenant);
  await loadData(); render();
  refreshScButton();
  maybeShowRenewal();
}

/* ─── Laufzeit abgelaufen → Verlängerung anfragen (VOR-13) ──────────────────── */
// AI-generated: VOR-13
function isExpiredTenant(t) {
  return !!t && (t.status === 'expired' || (t.expires_at && new Date(t.expires_at) < new Date()));
}
function maybeShowRenewal() {
  if (isAdmin() || !isExpiredTenant(STATE.tenant)) { $('#renewal').classList.add('hidden'); return; }
  const t = STATE.tenant;
  const datum = t.expires_at ? new Date(t.expires_at).toLocaleDateString('de-DE') : '';
  $('#renewal-body').innerHTML = `
    <h2>Laufzeit abgelaufen</h2>
    <p class="sub">Dein Zugang ist ${datum ? 'am <b>' + esc(datum) + '</b> ' : ''}abgelaufen. Fordere eine Verlängerung an — wir melden uns und schalten dich wieder frei.</p>
    <div class="actions">
      <button class="btn-save" id="renew-go">Verlängerung anfragen</button>
      <button class="btn-reset" id="renew-logout">Abmelden</button>
    </div>
    <div id="renew-msg" class="hidden"></div>`;
  $('#renewal').classList.remove('hidden');
  $('#renew-go').onclick = requestRenewal;
  $('#renew-logout').onclick = () => { $('#renewal').classList.add('hidden'); logout(); };
}
async function requestRenewal() {
  const btn = $('#renew-go'), msg = $('#renew-msg');
  msg.className = 'hidden'; btn.disabled = true; btn.textContent = 'Sende…';
  try {
    await api('POST', '/api/collections/renewal_requests/records', { tenant: store.user.tenant });
    msg.className = 'ok-msg'; msg.textContent = '✓ Anfrage gesendet. Wir melden uns und schalten dich wieder frei.';
    btn.classList.add('hidden');
  } catch (e) { msg.className = 'error'; msg.textContent = 'Fehler: ' + e.message; btn.disabled = false; btn.textContent = 'Verlängerung anfragen'; }
}

document.addEventListener('click', (e) => {
  // Papierkorb-Aktionen zuerst — sonst öffnet der Klick die Karte statt zu löschen.
  const del = e.target.closest('[data-del]');
  if (del) { e.stopPropagation(); return deleteEndgueltig(del.dataset.del); }
  if (e.target.id === 'trash-empty') return emptyTrash();
  // Papierkorb-Karten öffnen keinen Detail-Dialog — sonst ließe sich von dort eine
  // in Superchat bereits gelöschte Vorlage bei Meta einreichen.
  const card = e.target.closest('.card');
  if (card) { if (card.classList.contains('is-trash')) return; return openModal(card.dataset.id); }
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
$('#forgot-btn').addEventListener('click', requestReset);
$('#logout').addEventListener('click', logout);
$('#modal-close').addEventListener('click', closeModal);
$('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });
$('#search').addEventListener('input', (e) => { STATE.q = e.target.value; render(); });
$('#admin-btn').addEventListener('click', openAdmin);
$('#admin-close').addEventListener('click', closeAdmin);
$('#admin').addEventListener('click', (e) => { if (e.target.id === 'admin') closeAdmin(); });
$('#settings-btn').addEventListener('click', openSettings);
$('#settings-close').addEventListener('click', closeSettings);
$('#settings').addEventListener('click', (e) => { if (e.target.id === 'settings') closeSettings(); });
$('#bulk-btn').addEventListener('click', openBulkPush);
$('#bulk-close').addEventListener('click', closeBulk);
$('#bulk').addEventListener('click', (e) => { if (e.target.id === 'bulk') closeBulk(); });

(async () => {
  // VOR-11: Reset-Link aus der Willkommens-/Passwort-vergessen-Mail.
  // WV-7: Token kommt jetzt im Fragment (`#reset=TOKEN`) — das verlässt den Browser nicht und
  // landet nicht in Server-Logs. `?reset=` bleibt als Fallback für bereits verschickte Mails
  // (Token-Laufzeit 48 h). In beiden Fällen: Token sofort aus der sichtbaren URL entfernen.
  let resetToken = '';
  if (location.hash.startsWith('#reset=')) resetToken = decodeURIComponent(location.hash.slice(7));
  if (!resetToken) resetToken = new URLSearchParams(location.search).get('reset') || '';
  if (resetToken) {
    history.replaceState(null, '', location.pathname);
    showResetConfirm(resetToken);
    return;
  }
  if (store.token) { try { await boot(); return; } catch {} }
  show('login');
})();
