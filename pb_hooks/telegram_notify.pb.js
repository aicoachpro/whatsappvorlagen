/// <reference path="../pb_data/types.d.ts" />
//
// pb_hooks/telegram_notify.pb.js — Registrierung + Verlängerungs-Anfrage erkennen (VOR-14)
// AI-generated: VOR-14
//
// 1. Erst-Login eines Kunden ("Einladung angenommen") → setzt users.registered_at.
// 2. Telegram-Sofort-Ping (Registrierung + Verlängerungs-Anfrage) — NUR wenn TELEGRAM_BOT_TOKEN
//    und TELEGRAM_CHAT_ID in der Container-Env liegen. Ohne Env: kein Ping, der tägliche
//    check-tenant-expiry-Job meldet stattdessen (registered_at + offene renewal_requests).
// Fehler brechen Login/Anlegen nie ab (try/catch + e.next()).

// ── Erst-Login → registered_at + optional Telegram ──────────────────────────
onRecordAuthRequest((e) => {
  try {
    const u = e.record;
    if (u && u.get("role") !== "admin" && !u.get("registered_at")) {
      u.set("registered_at", new Date().toISOString());
      $app.save(u);
      const TG = $os.getenv("TELEGRAM_BOT_TOKEN"), CHAT = $os.getenv("TELEGRAM_CHAT_ID");
      if (TG && CHAT) {
        let name = u.email();
        try { const t = $app.findRecordById("tenants", u.get("tenant")); name = (t.get("name") || u.email()) + " (" + u.email() + ")"; } catch (_) {}
        try { $http.send({ url: "https://api.telegram.org/bot" + TG + "/sendMessage", method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: CHAT, text: "✅ Registriert / Einladung angenommen: " + name }), timeout: 10 }); } catch (_) {}
      }
    }
  } catch (err) { console.log("[telegram_notify auth] " + String((err && err.message) || err)); }
  e.next();
}, "users");

// ── Verlängerungs-Anfrage → optional Telegram ───────────────────────────────
onRecordCreateRequest((e) => {
  e.next();
  try {
    const TG = $os.getenv("TELEGRAM_BOT_TOKEN"), CHAT = $os.getenv("TELEGRAM_CHAT_ID");
    if (TG && CHAT && e.record) {
      let name = e.record.get("tenant");
      try { const t = $app.findRecordById("tenants", e.record.get("tenant")); name = t.get("firma") || t.get("name") || name; } catch (_) {}
      try { $http.send({ url: "https://api.telegram.org/bot" + TG + "/sendMessage", method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: CHAT, text: "💶 Verlängerung angefragt: " + name }), timeout: 10 }); } catch (_) {}
    }
  } catch (err) { console.log("[telegram_notify renewal] " + String((err && err.message) || err)); }
}, "renewal_requests");
