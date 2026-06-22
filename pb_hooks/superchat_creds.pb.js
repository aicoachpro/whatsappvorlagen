/// <reference path="../pb_data/types.d.ts" />
//
// pb_hooks/superchat_creds.pb.js — Per-Tenant-SuperChat-Anbindung (VOR-9 Slice 1, überarbeitet)
// AI-generated: VOR-9
//
// Kunde gibt NUR den SuperChat-API-Key ein. Die WhatsApp-Business-Account-ID (WABA) wird
// AUTOMATISCH über GET /channels geholt (jeder whats_app-Channel trägt whats_app_business_account_id) —
// in SuperChat selbst gibt es kein WABA-Feld, darum nie manuell.
// Key wird (mode=stored) verschlüsselt at-rest gespeichert (AES-256-GCM, SUPERCHAT_ENC_KEY, 32 Z., nur Server-Env).
//
// Routen (requireAuth, tenant-scoped):
//   POST   /api/vor/superchat-key   { apiKey, mode }  → validiert via /channels, holt WABA, speichert
//   GET    /api/vor/superchat-key                      → Status (kein Klartext)
//   DELETE /api/vor/superchat-key                      → Anbindung entfernen

// Helfer (inline, da JSVM-Handler isoliert laufen): erste WhatsApp-WABA aus /channels holen.
routerAdd("POST", "/api/vor/superchat-key", (e) => {
  try {
    const tenant = e.auth ? (e.auth.get("tenant") || "") : "";
    if (!tenant) return e.json(400, { ok: false, error: "Kein Tenant für diesen Zugang." });

    const body = new DynamicModel({ apiKey: "", mode: "" });
    e.bindBody(body);
    const apiKey = (body.apiKey || "").trim();
    const mode = body.mode === "session" ? "session" : "stored";
    if (!apiKey) return e.json(400, { ok: false, error: "API-Key fehlt." });

    const encK = $os.getenv("SUPERCHAT_ENC_KEY") || "";
    if (mode === "stored" && encK.length !== 32) return e.json(500, { ok: false, error: "Server nicht konfiguriert (SUPERCHAT_ENC_KEY)." });
    const base = ($os.getenv("SUPERCHAT_BASE_URL") || "https://api.superchat.com/v1.0").replace(/\/$/, "");

    // 1) Key validieren + WABA automatisch holen (GET /channels)
    let res;
    try {
      res = $http.send({ url: base + "/channels?limit=100", method: "GET", headers: { "X-API-Key": apiKey, "Accept": "application/json" }, timeout: 15 });
    } catch (err) { return e.json(502, { ok: false, error: "SuperChat nicht erreichbar." }); }
    if (res.statusCode === 401 || res.statusCode === 403) return e.json(200, { ok: false, validated: false, error: "API-Key von SuperChat abgelehnt." });
    if (res.statusCode < 200 || res.statusCode >= 300) return e.json(200, { ok: false, validated: false, error: "SuperChat-Antwort " + res.statusCode + "." });

    const channels = (res.json && res.json.results) || [];
    let wabaId = "", channelName = "";
    for (let i = 0; i < channels.length; i++) {
      const c = channels[i];
      if (c && c.type === "whats_app" && c.whats_app_business_account_id) { wabaId = c.whats_app_business_account_id; channelName = c.name || ""; break; }
    }
    if (!wabaId) return e.json(200, { ok: false, validated: false, error: "Keine WhatsApp-Verbindung in deinem SuperChat-Account gefunden." });

    // 2) Speichern: stored = verschlüsselt; session = Key NICHT speichern.
    const enc = mode === "stored" ? $security.encrypt(apiKey, encK) : "";
    let rec = null;
    try { rec = $app.findFirstRecordByFilter("tenant_secrets", "tenant = {:t}", { t: tenant }); } catch (_) { rec = null; }
    if (!rec) { rec = new Record($app.findCollectionByNameOrId("tenant_secrets")); rec.set("tenant", tenant); }
    rec.set("sc_api_key_enc", enc);
    rec.set("waba_id", wabaId);
    rec.set("mode", mode);
    $app.save(rec);

    return e.json(200, { ok: true, validated: true, mode: mode, wabaId: wabaId, channelName: channelName, masked: "••••" + apiKey.slice(-4), stored: mode === "stored" });
  } catch (err) {
    console.log("[superchat_creds] error:", String((err && err.message) || err));
    return e.json(500, { ok: false, error: "Interner Fehler bei der SuperChat-Anbindung." });
  }
}, $apis.requireAuth());

// ─── GET: Status (kein Klartext) ─────────────────────────────────────────────
routerAdd("GET", "/api/vor/superchat-key", (e) => {
  try {
    const tenant = e.auth ? (e.auth.get("tenant") || "") : "";
    if (!tenant) return e.json(400, { configured: false, error: "Kein Tenant." });
    let rec = null;
    try { rec = $app.findFirstRecordByFilter("tenant_secrets", "tenant = {:t}", { t: tenant }); } catch (_) { rec = null; }
    if (!rec) return e.json(200, { configured: false });
    return e.json(200, { configured: true, mode: rec.get("mode"), wabaId: rec.get("waba_id"), hasStoredKey: !!rec.get("sc_api_key_enc") });
  } catch (err) {
    console.log("[superchat_creds] error:", String((err && err.message) || err));
    return e.json(500, { configured: false, error: "Status nicht verfügbar." });
  }
}, $apis.requireAuth());

// ─── DELETE: Anbindung entfernen ─────────────────────────────────────────────
routerAdd("DELETE", "/api/vor/superchat-key", (e) => {
  try {
    const tenant = e.auth ? (e.auth.get("tenant") || "") : "";
    if (!tenant) return e.json(400, { ok: false, error: "Kein Tenant." });
    let rec = null;
    try { rec = $app.findFirstRecordByFilter("tenant_secrets", "tenant = {:t}", { t: tenant }); } catch (_) { rec = null; }
    if (rec) $app.delete(rec);
    return e.json(200, { ok: true });
  } catch (err) {
    console.log("[superchat_creds] error:", String((err && err.message) || err));
    return e.json(500, { ok: false, error: "Interner Fehler." });
  }
}, $apis.requireAuth());
