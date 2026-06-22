/// <reference path="../pb_data/types.d.ts" />
//
// pb_hooks/superchat_push.pb.js — Push einer effektiven Vorlage nach SuperChat (VOR-9 Slice 2)
// AI-generated: VOR-9
//
// "Push" = die Vorlage wird bei SuperChat angelegt → reicht sie DIREKT bei Meta zur Freigabe ein
// (kein Entwurf; Status pending→approved/rejected). Darum: action="preview" zeigt exakt, was gesendet
// würde (KEINE Writes), action="submit" reicht tatsächlich ein (mit Ordner-Auto-Anlage + Audit-Log).
//
// Effektive Vorlage = Master ⊕ Overlay ⊕ Personalisierung (Firma + ersetzungen) — serverseitig
// autoritativ gebaut (nicht dem Client vertraut). Key kommt aus tenant_secrets (stored→entschlüsselt)
// oder bei mode=session aus dem mitgesendeten sessionKey.
//
// Routen (requireAuth, tenant-scoped):
//   POST /api/vor/push-template   { templateId, action:"preview"|"submit", sessionKey? }
//   GET  /api/vor/push-log                                   → letzte Einreichungen des Tenants

routerAdd("POST", "/api/vor/push-template", (e) => {
  try {
    const tenant = e.auth ? (e.auth.get("tenant") || "") : "";
    if (!tenant) return e.json(400, { ok: false, error: "Kein Tenant." });

    const body = new DynamicModel({ templateId: "", action: "", sessionKey: "" });
    e.bindBody(body);
    const templateId = (body.templateId || "").trim();
    const action = body.action === "submit" ? "submit" : "preview";
    if (!templateId) return e.json(400, { ok: false, error: "templateId fehlt." });

    // ── Anbindung + Key ──
    let sec = null;
    try { sec = $app.findFirstRecordByFilter("tenant_secrets", "tenant = {:t}", { t: tenant }); } catch (_) { sec = null; }
    if (!sec) return e.json(400, { ok: false, error: "Keine SuperChat-Verbindung hinterlegt." });
    const wabaId = sec.get("waba_id");
    if (!wabaId) return e.json(400, { ok: false, error: "WABA-ID fehlt." });
    let apiKey = "";
    if (sec.get("mode") === "session") {
      apiKey = (body.sessionKey || "").trim();
      if (!apiKey) return e.json(400, { ok: false, error: "Session-Key fehlt (Modus: nur Sitzung)." });
    } else {
      const encK = $os.getenv("SUPERCHAT_ENC_KEY") || "";
      if (encK.length !== 32) return e.json(500, { ok: false, error: "Server nicht konfiguriert (SUPERCHAT_ENC_KEY)." });
      const cipher = sec.get("sc_api_key_enc") || "";
      if (!cipher) return e.json(400, { ok: false, error: "Kein Key gespeichert." });
      try { apiKey = $security.decrypt(cipher, encK); } catch (_) { return e.json(500, { ok: false, error: "Entschlüsselung fehlgeschlagen." }); }
    }

    // ── Vorlage + Overlay + Einstellungen laden ──
    let t = null;
    try { t = $app.findRecordById("templates", templateId); } catch (_) { t = null; }
    if (!t) return e.json(404, { ok: false, error: "Vorlage nicht gefunden." });
    let ov = null;
    try { ov = $app.findFirstRecordByFilter("template_overlays", "tenant = {:t} && template = {:tpl}", { t: tenant, tpl: templateId }); } catch (_) { ov = null; }
    if (ov && ov.get("hidden")) return e.json(400, { ok: false, error: "Vorlage ist für diesen Tenant ausgeblendet." });
    let st = null;
    try { st = $app.findFirstRecordByFilter("tenant_settings", "tenant = {:t}", { t: tenant }); } catch (_) { st = null; }
    const firma = st ? (st.get("firma") || "") : "";
    // PocketBase liefert JSON-Felder als Roh-Bytes → über String() + JSON.parse lesen.
    function jparse(v) { if (v === null || v === undefined) return null; try { const s = String(v); return s === "" ? null : JSON.parse(s); } catch (_) { return null; } }
    let ersetzungen = st ? jparse(st.get("ersetzungen")) : null;
    if (!Array.isArray(ersetzungen)) ersetzungen = [];

    // ── Personalisierung (spiegelt webui personalize()) ──
    function personalize(s) {
      if (!s) return "";
      let out = String(s);
      if (firma) out = out.replace(/V[ÖO]LKER\s+Finance\s+OHG/gi, firma);
      for (let i = 0; i < ersetzungen.length; i++) {
        const en = ersetzungen[i];
        if (en && en.from) out = out.split(en.from).join(en.to || "");
      }
      return out;
    }

    // ── Effektive Vorlage → SuperChat content ──
    const name = (ov && ov.get("name_override")) || t.get("name") || "Vorlage";
    const category = (t.get("kategorie") === "Marketing") ? "marketing" : "utility";
    const content = {
      type: "whats_app_template",
      category: category,
      language: "de",
      body: personalize((ov && ov.get("body_override")) || t.get("body") || ""),
    };
    const footer = personalize((ov && ov.get("footer_override")) || t.get("footer") || "");
    if (footer) content.footer = footer;

    const warnings = [];
    const header = jparse(t.get("header"));
    if (header && header.type) {
      if (header.type === "text") content.header = { type: "text", value: personalize(header.value || "") };
      else warnings.push("Medien-Header (" + header.type + ") wird NICHT automatisch übertragen — bitte in SuperChat ergänzen.");
    }
    // SuperChat-Create-Button-Format weicht vom Sync/Read-Format ab:
    //   type:  static_url → url (akzeptiert: dynamic_url, phone_number, quick_reply, url)
    //   label: title → text (Pflichtfeld)
    //   ziel:  target bleibt target (URL bzw. Telefonnummer) — Pflichtfeld bei url/phone_number
    const BTN_TYPE_MAP = { static_url: "url" };
    const buttons = jparse(t.get("buttons"));
    if (Array.isArray(buttons) && buttons.length) {
      content.buttons = buttons.map((b) => {
        if (!b) return b;
        const out = { type: BTN_TYPE_MAP[b.type] || b.type };
        if (b.title) out.text = b.title;
        if (b.target) out.target = personalize(b.target);
        return out;
      });
    }
    // SuperChat verlangt content.variables IMMER (Pflichtfeld) — auch leer. Fehlt es → 400 "Ungültiger Parameter: variables".
    //
    // Create-Schema (laut Doku createatemplate-1): { position, attribute_identifier }.
    //   attribute_identifier = Standard-Kennung (first_name | last_name | gender | wildcard)
    //   ODER die ca_-ID eines Custom-Contact-Attributs.
    // Beim LESEN liefert SuperChat aber eine andere Form (deshalb scheiterte der Push lange):
    //   Custom:   { position, display_name, attribute_id: "ca_…", type: "contact_attribute" }
    //   Standard: { position, display_name, type: "static" }   ← KEIN Identifier enthalten!
    // → hier zurückübersetzen. Custom: attribute_id direkt nutzen. Standard: per Map raten.
    // Smart-/Sender-Attribute (Aktueller Benutzer, Grußformel, Workspacename) haben kein
    // Create-Pendant → als Freitext-Platzhalter (wildcard) einreichen + Warnung (in SuperChat
    // ggf. manuell auf das Smart-Attribut umstellen). "Freitext"/URL-Suffix = von Haus aus wildcard.
    const STD_VAR_MAP = { "Vorname": "first_name", "Nachname": "last_name", "Geschlecht": "gender", "Freitext": "wildcard" };
    const rawVars = jparse(t.get("variables"));
    content.variables = (Array.isArray(rawVars) ? rawVars : []).map((v) => {
      if (!v) return { position: 0, type: "static", attribute_identifier: "wildcard" };
      let ident = v.attribute_id || v.attribute_identifier || STD_VAR_MAP[v.display_name];
      if (!ident) {
        ident = "wildcard";
        warnings.push('Variable "' + (v.display_name || ("#" + v.position)) + '" wird als Freitext-Platzhalter (wildcard) eingereicht — in SuperChat ggf. auf das passende Smart-Attribut umstellen.');
      }
      return { position: v.position, type: "static", attribute_identifier: ident };
    });

    const base = ($os.getenv("SUPERCHAT_BASE_URL") || "https://api.superchat.com/v1.0").replace(/\/$/, "");
    const authHeaders = { "X-API-Key": apiKey, "Accept": "application/json" };

    // ── Ordner auflösen (reuse-or-create) ──
    const folderName = (t.get("ordner") || "").trim();
    let folderId = null, folderExists = false;
    if (folderName) {
      try {
        const lf = $http.send({ url: base + "/template-folders?limit=100", method: "GET", headers: authHeaders, timeout: 15 });
        if (lf.statusCode >= 200 && lf.statusCode < 300) {
          const arr = (lf.json && (lf.json.results || lf.json.data || lf.json.items)) || [];
          for (let i = 0; i < arr.length; i++) { if (arr[i] && arr[i].name === folderName) { folderId = arr[i].id; folderExists = true; break; } }
        }
      } catch (_) { /* Ordner-Liste optional */ }
    }

    // ── PREVIEW: nichts schreiben ──
    if (action === "preview") {
      return e.json(200, {
        ok: true, action: "preview", wabaId: wabaId,
        preview: {
          name: name, category: category, language: "de",
          folderName: folderName, folderExists: folderExists,
          body: content.body, footer: content.footer || "",
          header: content.header || null,
          buttonCount: (content.buttons || []).length,
          variableCount: (content.variables || []).length,
          warnings: warnings,
        },
      });
    }

    // ── SUBMIT: ggf. Ordner anlegen, dann bei Meta einreichen ──
    if (folderName && !folderId) {
      try {
        const cf = $http.send({ url: base + "/template-folders", method: "POST", headers: Object.assign({ "Content-Type": "application/json" }, authHeaders), body: JSON.stringify({ name: folderName }), timeout: 15 });
        if (cf.statusCode >= 200 && cf.statusCode < 300 && cf.json && cf.json.id) folderId = cf.json.id;
      } catch (_) { /* ohne Ordner weiter */ }
    }

    // SuperChat führt den lesbaren Anzeigenamen (so wie er im Sync geliefert wird) und erzeugt den
    // Meta-konformen technischen Namen selbst — daher lesbaren Namen senden, NICHT slugifizieren.
    const payload = { name: name, whats_app_business_account_id: wabaId, content: content };
    if (folderId) payload.folder_id = folderId;

    // Bei Namenskonflikt (409 "Vorlage existiert bereits") automatisch mit " Kopie"-Suffix erneut
    // einreichen — wie SuperChats eigenes Duplizieren ("Name Kopie", "Name Kopie 2", …).
    let res, usedName = name;
    for (let attempt = 0; attempt <= 5; attempt++) {
      usedName = attempt === 0 ? name : (name + " Kopie" + (attempt > 1 ? " " + attempt : ""));
      payload.name = usedName;
      try {
        res = $http.send({ url: base + "/templates", method: "POST", headers: Object.assign({ "Content-Type": "application/json" }, authHeaders), body: JSON.stringify(payload), timeout: 30 });
      } catch (_) {
        return e.json(502, { ok: false, error: "SuperChat nicht erreichbar." });
      }
      if (res.statusCode !== 409) break; // kein Konflikt mehr → fertig (Erfolg oder anderer Fehler)
    }

    let status = "", scId = "", errMsg = "";
    if (res.statusCode >= 200 && res.statusCode < 300) {
      status = (res.json && res.json.status) || "pending";
      scId = (res.json && res.json.id) || "";
    } else {
      let detail = "";
      try { detail = res.json ? JSON.stringify(res.json) : ""; } catch (_) { detail = ""; }
      errMsg = "SuperChat " + res.statusCode + (detail ? (": " + detail.slice(0, 400)) : "");
    }

    // Audit-Log
    try {
      const lg = new Record($app.findCollectionByNameOrId("tenant_push_log"));
      lg.set("tenant", tenant);
      lg.set("template", templateId);
      lg.set("template_name", usedName);
      lg.set("sc_template_id", scId);
      lg.set("status", status || "error");
      lg.set("error", errMsg);
      $app.save(lg);
    } catch (_) { /* Log darf den Push nicht blockieren */ }

    if (errMsg) return e.json(200, { ok: false, error: errMsg });
    return e.json(200, { ok: true, action: "submit", status: status, scTemplateId: scId, folderAssigned: !!folderId, name: usedName, renamed: usedName !== name });
  } catch (err) {
    console.log("[superchat_push] error:", String((err && err.message) || err));
    return e.json(500, { ok: false, error: "Interner Fehler beim Push." });
  }
}, $apis.requireAuth());

// ─── GET: letzte Einreichungen des Tenants ───────────────────────────────────
routerAdd("GET", "/api/vor/push-log", (e) => {
  try {
    const tenant = e.auth ? (e.auth.get("tenant") || "") : "";
    if (!tenant) return e.json(400, { ok: false, error: "Kein Tenant." });
    let recs = [];
    try { recs = $app.findRecordsByFilter("tenant_push_log", "tenant = {:t}", "-created", 30, 0, { t: tenant }); } catch (_) { recs = []; }
    const items = recs.map((r) => ({
      templateName: r.get("template_name"),
      scTemplateId: r.get("sc_template_id"),
      status: r.get("status"),
      error: r.get("error"),
      created: r.get("created"),
    }));
    return e.json(200, { ok: true, items: items });
  } catch (err) {
    console.log("[superchat_push] log error:", String((err && err.message) || err));
    return e.json(500, { ok: false, error: "Verlauf nicht verfügbar." });
  }
}, $apis.requireAuth());
