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
const genPass = () => 'K' + Math.random().toString(36).slice(2, 8) + Math.random().toString(36).slice(2, 5).toUpperCase() + '7!';

async function openAdmin() {
  $('#admin').classList.remove('hidden');
  $('#admin-body').innerHTML = '<p class="sub">lädt…</p>';
  try {
    const [tenants, users] = await Promise.all([
      api('GET', '/api/collections/tenants/records?perPage=500&sort=name'),
      api('GET', '/api/collections/users/records?perPage=500'),
    ]);
    const tById = Object.fromEntries(tenants.items.map(t => [t.id, t]));
    const customers = users.items.filter(u => u.role !== 'admin');
    renderAdmin(customers, tById);
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
function renderAdmin(customers, tById) {
  // ablaufende/abgelaufene zuerst
  customers.sort((a, b) => {
    const da = daysUntil(tById[a.tenant]?.expires_at) ?? 9999, db = daysUntil(tById[b.tenant]?.expires_at) ?? 9999;
    return da - db;
  });
  $('#admin-body').innerHTML = `
    <h2>Kunden verwalten</h2>
    <p class="sub">${customers.length} Kunde(n)</p>
    <form id="cust-form" class="edit" style="border-bottom:1px solid var(--line);padding-bottom:18px;margin-bottom:18px">
      <h3>Neuen Kunden anlegen</h3>
      <label>Firma / Mandant (intern)<input type="text" id="c-name" required placeholder="z. B. Muster GmbH"></label>
      <label>Firmenname für die Verabschiedung (Footer in den Vorlagen)<input type="text" id="c-firma" required placeholder="z. B. Muster Finanz OHG"></label>
      <label>E-Mail (Login)<input type="email" id="c-email" required placeholder="kunde@firma.de"></label>
      <label>Passwort<input type="text" id="c-pass" required></label>
      <h3 style="margin-top:6px">Links des Kunden (ersetzen die Völker-Links)</h3>
      <label>Website (ersetzt <code>www.voelker-allianz.de</code>)<input type="text" id="c-web" placeholder="www.muster-finanz.de"></label>
      <label>Weitere Ersetzungen — eine pro Zeile, Format <code>alt = neu</code>
        <textarea id="c-more" placeholder="https://review.superchat.de/?rc=... = https://g.page/r/...&#10;https://tidycal.com/team/voelkerfinance/tkv = https://tidycal.com/muster/tkv"></textarea></label>
      <p class="placeholder">Zugang läuft automatisch nach 365 Tagen ab (verlängerbar).</p>
      <div class="actions"><button type="submit" class="btn-save" id="c-save">Kunde anlegen</button>
        <button type="button" class="btn-reset" id="c-gen">Passwort neu</button></div>
      <div id="c-msg" class="hidden"></div>
    </form>
    <h3>Bestehende Kunden</h3>
    <div class="cust-list">
      ${customers.length ? customers.map(u => {
        const t = tById[u.tenant];
        return `<div class="cust-row" data-uid="${u.id}" data-tid="${u.tenant || ''}">
          <div><div class="cust-mail">${esc(u.email)}</div>
            <div class="cust-sub">${esc(t?.firma || t?.name || '— kein Mandant')}</div>
            <div style="margin-top:3px">${ablaufBadge(t)}</div></div>
          <div class="cust-act">
            ${t ? '<button class="mini" data-act="ext">+1 Jahr</button>' : ''}
            <button class="mini" data-act="pw">Passwort</button>
            <button class="mini danger" data-act="del">Löschen</button>
          </div></div>`;
      }).join('') : '<p class="placeholder">Noch keine Kunden.</p>'}
    </div>`;
  $('#c-pass').value = genPass();
  $('#c-gen').onclick = () => { $('#c-pass').value = genPass(); };
  $('#cust-form').onsubmit = createCustomer;
  $$('.cust-row .mini').forEach(b => b.onclick = (e) => {
    const row = e.target.closest('.cust-row');
    if (b.dataset.act === 'pw') resetCustomerPass(row.dataset.uid);
    else if (b.dataset.act === 'ext') extendTenant(row.dataset.tid);
    else deleteCustomer(row.dataset.uid, row.dataset.tid);
  });
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
async function createCustomer(e) {
  e.preventDefault();
  const name = $('#c-name').value.trim(), email = $('#c-email').value.trim(), pass = $('#c-pass').value.trim();
  const firma = $('#c-firma').value.trim();
  const ersetzungen = buildErsetzungen();
  const msg = $('#c-msg'), btn = $('#c-save');
  msg.className = 'hidden'; btn.disabled = true; btn.textContent = 'Legt an…';
  let tenant = null;
  try {
    // 1) Mandant mit Lizenz (365 Tage) + Personalisierung
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + Math.random().toString(36).slice(2, 6);
    const now = new Date(), exp = new Date(); exp.setDate(exp.getDate() + 365);
    tenant = await api('POST', '/api/collections/tenants/records', {
      name, slug, status: 'active', firma, ersetzungen,
      invited_at: now.toISOString(), expires_at: exp.toISOString(),
    });
    // 2) Kunde (immer role=customer). Kein `verified` — das darf nur der Superuser setzen;
    //    unbestätigte Kunden dürfen sich trotzdem einloggen (authRule der users-Collection ist leer).
    await api('POST', '/api/collections/users/records', { email, password: pass, passwordConfirm: pass, tenant: tenant.id, role: 'customer', emailVisibility: false });
    // 3) Self-Service-Einstellungen (Firma + Links) als tenant_settings — kundeneditierbar (VOR-8).
    //    catch: bricht das Onboarding nicht, falls die Collection (noch) nicht ausgerollt ist.
    await api('POST', '/api/collections/tenant_settings/records', { tenant: tenant.id, firma, ersetzungen }).catch(() => {});
    msg.className = 'ok-msg';
    msg.innerHTML = `✓ Kunde <b>${esc(email)}</b> angelegt.<br>Passwort: <code>${esc(pass)}</code>
      <button type="button" class="copy-row" id="copy-cred" style="margin-top:6px">📋 Zugangsdaten kopieren</button>
      <br><small>Jetzt notieren/kopieren und an den Kunden geben — danach nicht mehr abrufbar.</small>`;
    $('#copy-cred').onclick = () => copyText(`WhatsApp-Vorlagen\nLogin: ${location.origin}/\nE-Mail: ${email}\nPasswort: ${pass}`, $('#copy-cred'), '📋 Zugangsdaten kopieren');
    $('#c-name').value = ''; $('#c-email').value = ''; $('#c-firma').value = ''; $('#c-web').value = ''; $('#c-more').value = ''; $('#c-pass').value = genPass();
    // Liste nicht sofort neu rendern (würde die Zugangsdaten-Anzeige überschreiben)
  } catch (ex) {
    // Rollback: eben angelegten Mandant wieder entfernen, damit nichts verwaist
    if (tenant) await api('DELETE', `/api/collections/tenants/records/${tenant.id}`).catch(() => {});
    msg.className = 'error'; msg.textContent = 'Fehler: ' + ex.message;
  } finally { btn.disabled = false; btn.textContent = 'Kunde anlegen'; }
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
  if (!confirm('Diesen Kunden inkl. Mandant und allen Anpassungen löschen?')) return;
  try {
    await api('DELETE', `/api/collections/users/records/${uid}`);
    if (tid) await api('DELETE', `/api/collections/tenants/records/${tid}`).catch(() => {});
    openAdmin();
  } catch (e) { alert('Fehler: ' + e.message); }
}
function closeAdmin() { $('#admin').classList.add('hidden'); }

/* ─── Einstellungen: Self-Service (Firma + Links) ──────────────────────────── */
// AI-generated: VOR-8
function splitErsetzungen(list) {
  let web = '';
  const more = [];
  for (const e of (list || [])) {
    if (!e || !e.from) continue;
    if (e.from === 'www.voelker-allianz.de') web = e.to || '';
    else more.push(`${e.from} = ${e.to || ''}`);
  }
  return { web, more: more.join('\n') };
}
function openSettings() {
  if (!store.user?.tenant) { alert('Für deinen Zugang sind keine Einstellungen verfügbar.'); return; }
  $('#settings').classList.remove('hidden');
  const s = STATE.settings || {};
  const { web, more } = splitErsetzungen(s.ersetzungen);
  $('#settings-body').innerHTML = `
    <h2>Meine Einstellungen</h2>
    <p class="sub">Diese Werte personalisieren deine Vorlagen — nur für deinen Zugang.</p>
    <div class="edit">
      <label>Firmenname (Verabschiedung / Footer in den Vorlagen)
        <input type="text" id="s-firma" value="${esc(s.firma || '')}" placeholder="z. B. Muster Finanz OHG"></label>
      <h3 style="margin-top:6px">Meine Links</h3>
      <label>Website (ersetzt <code>www.voelker-allianz.de</code>)
        <input type="text" id="s-web" value="${esc(web)}" placeholder="www.muster-finanz.de"></label>
      <label>Weitere Ersetzungen — eine pro Zeile, Format <code>alt = neu</code>
        <textarea id="s-more" placeholder="https://review.superchat.de/?rc=... = https://g.page/r/...&#10;https://tidycal.com/team/voelkerfinance/tkv = https://tidycal.com/muster/tkv">${esc(more)}</textarea></label>
      <div class="actions"><button class="btn-save" id="s-save">Speichern</button></div>
      <div id="s-msg" class="hidden"></div>
    </div>`;
  $('#s-save').onclick = saveSettings;
}
async function saveSettings() {
  const firma = $('#s-firma').value.trim();
  const ersetzungen = parseErsetzungen($('#s-web').value, $('#s-more').value);
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

/* ─── Boot ─────────────────────────────────────────────────────────────── */
async function boot() {
  show('app');
  $('#admin-btn').classList.toggle('hidden', !isAdmin());
  await loadData(); render();
}

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
$('#admin-btn').addEventListener('click', openAdmin);
$('#admin-close').addEventListener('click', closeAdmin);
$('#admin').addEventListener('click', (e) => { if (e.target.id === 'admin') closeAdmin(); });
$('#settings-btn').addEventListener('click', openSettings);
$('#settings-close').addEventListener('click', closeSettings);
$('#settings').addEventListener('click', (e) => { if (e.target.id === 'settings') closeSettings(); });

(async () => {
  if (store.token) { try { await boot(); return; } catch {} }
  show('login');
})();
