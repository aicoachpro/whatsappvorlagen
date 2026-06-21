/// <reference path="../pb_data/types.d.ts" />
//
// pb_hooks/superchat_creds.pb.js — Per-Tenant-SuperChat-Anbindung (VOR-9 Slice 1)
// AI-generated: VOR-9
//
// Serverseitige Ver-/Entschlüsselung + Validierung des Kunden-SuperChat-API-Keys.
// Der Klartext-Key kommt genau EINMAL rein (HTTPS POST) und verlässt den Server NIE wieder.
// Speicherung verschlüsselt (AES-256-GCM via $security.encrypt) in der superuser-only Collection
// `tenant_secrets`. Schlüssel `SUPERCHAT_ENC_KEY` (32 Zeichen) NUR aus der Server-Env, nie in der DB.
//
// WICHTIG (PocketBase-JSVM): Route-Handler laufen in ISOLIERTEN VMs und sehen KEINE Top-Level-
// Funktionen/Variablen dieser Datei. Darum sind alle Helfer INNERHALB jedes Handlers definiert.
//
// Routen (alle requireAuth, tenant-scoped über e.auth.tenant):
//   POST   /api/vor/superchat-key   { apiKey, wabaId, mode }  → validiert + speichert/verwirft
//   GET    /api/vor/superchat-key                              → Status (kein Klartext)
//   DELETE /api/vor/superchat-key                              → Anbindung entfernen
//
// Env: SUPERCHAT_ENC_KEY (32 Zeichen), SUPERCHAT_BASE_URL (optional, Default api.superchat.com/v1.0)

// ─── POST: validieren + (verschlüsselt) speichern ────────────────────────────
routerAdd("POST", "/api/vor/superchat-key", (e) => {
  try {
    const tenant = e.auth ? (e.auth.get("tenant") || "") : "";
    if (!tenant) return e.json(400, { ok: false, error: "Kein Tenant für diesen Zugang." });

    const body = new DynamicModel({ apiKey: "", wabaId: "", mode: "" });
    e.bindBody(body);
    const apiKey = (body.apiKey || "").trim();
    const wabaId = (body.wabaId || "").trim();
    const mode = body.mode === "session" ? "session" : "stored";

    if (!apiKey) return e.json(400, { ok: false, error: "API-Key fehlt." });
    if (!/^waba_[A-Za-z0-9]{21}$/.test(wabaId)) return e.json(400, { ok: false, error: "WABA-ID ungültig (Format waba_…)." });

    const encK = $os.getenv("SUPERCHAT_ENC_KEY") || "";
    if (encK.length !== 32) return e.json(500, { ok: false, error: "Server nicht konfiguriert (SUPERCHAT_ENC_KEY)." });
    const base = ($os.getenv("SUPERCHAT_BASE_URL") || "https://api.superchat.com/v1.0").replace(/\/$/, "");

    // 1) Validierung gegen SuperChat (read-only Test-Call).
    let res;
    try {
      res = $http.send({ url: base + "/templates?limit=1", method: "GET", headers: { "X-API-Key": apiKey, "Accept": "application/json" }, timeout: 15 });
    } catch (err) {
      return e.json(502, { ok: false, error: "SuperChat nicht erreichbar." });
    }
    if (res.statusCode === 401 || res.statusCode === 403) return e.json(200, { ok: false, validated: false, error: "Key von SuperChat abgelehnt." });
    if (res.statusCode < 200 || res.statusCode >= 300) return e.json(200, { ok: false, validated: false, error: "SuperChat-Antwort " + res.statusCode + "." });

    // 2) Speichern: stored = verschlüsselt; session = Key NICHT speichern.
    const enc = mode === "stored" ? $security.encrypt(apiKey, encK) : "";

    let rec = null;
    try { rec = $app.findFirstRecordByFilter("tenant_secrets", "tenant = {:t}", { t: tenant }); } catch (_) { rec = null; }
    if (!rec) {
      rec = new Record($app.findCollectionByNameOrId("tenant_secrets"));
      rec.set("tenant", tenant);
    }
    rec.set("sc_api_key_enc", enc);
    rec.set("waba_id", wabaId);
    rec.set("mode", mode);
    $app.save(rec);

    return e.json(200, { ok: true, validated: true, mode: mode, wabaId: wabaId, masked: "••••" + apiKey.slice(-4), stored: mode === "stored" });
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
    return e.json(500, { ok: false, error: "Interner Fehler bei der SuperChat-Anbindung." });
  }
}, $apis.requireAuth());
