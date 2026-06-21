/// <reference path="../pb_data/types.d.ts" />
//
// pb_hooks/personalize_mail.pb.js — Vorname-Anrede in der Passwort-/Willkommens-Mail (VOR-12)
// AI-generated: VOR-12
//
// Ersetzt im gesendeten Reset-/Willkommens-Mail-Body "Hallo," durch "Hallo <Vorname>,".
// Vorname = erstes Wort des Tenant-Namens (über die tenant-Relation des Users).
// Graceful: ohne Hook/ohne Name bleibt es "Hallo," — nie kaputt. Fehler brechen den Versand nicht ab.

onMailerRecordPasswordResetSend((e) => {
  try {
    const tid = e.record ? e.record.get("tenant") : "";
    if (tid && e.message && e.message.html) {
      const t = $app.findRecordById("tenants", tid);
      const full = String(t.get("name") || "").trim();
      const first = full.split(/\s+/)[0];
      if (first) e.message.html = e.message.html.replace("Hallo,", "Hallo " + first + ",");
    }
  } catch (err) {
    console.log("[personalize_mail] " + String((err && err.message) || err));
  }
  e.next();
});
