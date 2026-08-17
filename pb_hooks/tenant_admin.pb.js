/// <reference path="../pb_data/types.d.ts" />
//
// pb_hooks/tenant_admin.pb.js — transaktionaler Kunden-Lifecycle für die Admin-UI (WV-9)
// AI-generated: WV-9
//
// Vorher liefen Kunden-Anlage und -Löschung als einzelne REST-Calls aus dem Browser:
// nicht atomar (Waisen-User bei Teilfehlern), Last-User-Check aus einem veraltbaren
// Client-Snapshot (nur erste 500 User), Fehler beim Mandanten-Delete verschluckt.
// Diese Routen bündeln jeden Vorgang in $app.runInTransaction; der Client schickt nur
// noch die Absicht. Die Willkommens-Mail (Passwort-Reset) bleibt Sache des Clients und
// läuft NACH dem Commit — ein Mailfehler rollt nie Daten zurück.
//
// Routen (requireAuth; nur role=admin bzw. Superuser):
//   POST   /api/vor/admin/customer                       { name, email, password, firma, ersetzungen, invitedAt? }
//   POST   /api/vor/admin/customer-user                  { tenantId, email, password }
//   DELETE /api/vor/admin/customer-user/{id}?expectLast=0|1

routerAdd("POST", "/api/vor/admin/customer", (e) => {
  try {
    const isSu = typeof e.hasSuperuserAuth === "function" && e.hasSuperuserAuth();
    if (!isSu && (!e.auth || e.auth.get("role") !== "admin")) return e.json(403, { ok: false, error: "Nur für Admins." });

    const b = (e.requestInfo() && e.requestInfo().body) || {};
    const email = String(b.email || "").trim();
    const password = String(b.password || "");
    const name = String(b.name || "").trim() || email.split("@")[0];
    const firma = String(b.firma || "").trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return e.json(400, { ok: false, error: "Ungültige E-Mail-Adresse." });
    if (password.length < 8) return e.json(400, { ok: false, error: "Passwort: mindestens 8 Zeichen." });

    const ers = [];
    if (Array.isArray(b.ersetzungen)) {
      for (let i = 0; i < b.ersetzungen.length; i++) {
        const en = b.ersetzungen[i];
        if (en && typeof en.from === "string" && en.from.trim()) ers.push({ from: en.from, to: typeof en.to === "string" ? en.to : "" });
      }
    }

    let invited = new Date();
    const rawInv = String(b.invitedAt || "").trim();
    if (rawInv) {
      const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(rawInv) ? rawInv + "T00:00:00" : rawInv);
      if (isNaN(d.getTime())) return e.json(400, { ok: false, error: "Ungültiges Vertragsdatum." });
      invited = d;
    }
    const expires = new Date(invited); expires.setDate(expires.getDate() + 365);

    function slugify(s) { return String(s || "").toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
    const slug = slugify(name) + "-" + $security.randomStringWithAlphabet(5, "abcdefghijkmnpqrstuvwxyz23456789");

    let tenantId = "", userId = "";
    $app.runInTransaction((tx) => {
      const t = new Record(tx.findCollectionByNameOrId("tenants"));
      t.set("name", name); t.set("slug", slug); t.set("status", "active");
      t.set("firma", firma); t.set("ersetzungen", ers);
      t.set("invited_at", invited.toISOString()); t.set("expires_at", expires.toISOString());
      tx.save(t);

      // Settings sind Pflichtteil der Anlage (WV-10): ohne sie personalisiert der Push nicht.
      const s = new Record(tx.findCollectionByNameOrId("tenant_settings"));
      s.set("tenant", t.id); s.set("firma", firma); s.set("ersetzungen", ers);
      tx.save(s);

      const u = new Record(tx.findCollectionByNameOrId("users"));
      u.set("email", email); u.set("password", password); u.set("passwordConfirm", password);
      u.set("role", "customer"); u.set("tenant", t.id); u.set("emailVisibility", false);
      tx.save(u);

      tenantId = t.id; userId = u.id;
    });
    return e.json(200, { ok: true, tenantId: tenantId, userId: userId });
  } catch (err) {
    const msg = String((err && err.message) || err);
    console.log("[tenant_admin] create error:", msg);
    if (/unique|already exists|not unique/i.test(msg)) return e.json(400, { ok: false, error: "Es gibt bereits einen Zugang mit dieser E-Mail (oder einen Kunden mit diesem Namen)." });
    return e.json(400, { ok: false, error: "Anlegen fehlgeschlagen: " + msg.slice(0, 200) });
  }
}, $apis.requireAuth());

routerAdd("POST", "/api/vor/admin/customer-user", (e) => {
  try {
    const isSu = typeof e.hasSuperuserAuth === "function" && e.hasSuperuserAuth();
    if (!isSu && (!e.auth || e.auth.get("role") !== "admin")) return e.json(403, { ok: false, error: "Nur für Admins." });

    const b = (e.requestInfo() && e.requestInfo().body) || {};
    const tenantId = String(b.tenantId || "").trim();
    const email = String(b.email || "").trim();
    const password = String(b.password || "");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return e.json(400, { ok: false, error: "Ungültige E-Mail-Adresse." });
    if (password.length < 8) return e.json(400, { ok: false, error: "Passwort: mindestens 8 Zeichen." });

    let tenantRec = null;
    try { tenantRec = $app.findRecordById("tenants", tenantId); } catch (_) { tenantRec = null; }
    if (!tenantRec) return e.json(404, { ok: false, error: "Kunde (Mandant) nicht gefunden — Liste neu laden." });

    let userId = "";
    $app.runInTransaction((tx) => {
      const u = new Record(tx.findCollectionByNameOrId("users"));
      u.set("email", email); u.set("password", password); u.set("passwordConfirm", password);
      u.set("role", "customer"); u.set("tenant", tenantRec.id); u.set("emailVisibility", false);
      tx.save(u);
      userId = u.id;
    });
    return e.json(200, { ok: true, userId: userId });
  } catch (err) {
    const msg = String((err && err.message) || err);
    console.log("[tenant_admin] add-user error:", msg);
    if (/unique|already exists|not unique/i.test(msg)) return e.json(400, { ok: false, error: "Es gibt bereits einen Zugang mit dieser E-Mail." });
    return e.json(400, { ok: false, error: "Anlegen fehlgeschlagen: " + msg.slice(0, 200) });
  }
}, $apis.requireAuth());

routerAdd("DELETE", "/api/vor/admin/customer-user/{id}", (e) => {
  try {
    const isSu = typeof e.hasSuperuserAuth === "function" && e.hasSuperuserAuth();
    if (!isSu && (!e.auth || e.auth.get("role") !== "admin")) return e.json(403, { ok: false, error: "Nur für Admins." });

    const uid = e.request.pathValue("id");
    let expectLast = null;
    try {
      const m = String(e.request.url.rawQuery || "").match(/(?:^|&)expectLast=([^&]*)/);
      if (m) expectLast = m[1] === "1";
    } catch (_) { expectLast = null; }

    let userRec = null;
    try { userRec = $app.findRecordById("users", uid); } catch (_) { userRec = null; }
    if (!userRec) return e.json(404, { ok: false, error: "Benutzer nicht gefunden — Liste neu laden." });
    if (userRec.get("role") === "admin") return e.json(403, { ok: false, error: "Admin-Zugänge lassen sich hier nicht löschen." });

    const tid = userRec.get("tenant") || "";
    let deletedTenant = false;
    $app.runInTransaction((tx) => {
      // Last-User-Check IN der Transaktion, frisch aus der DB — nie aus der Client-Ansicht.
      let isLast = true;
      if (tid) {
        const siblings = tx.findRecordsByFilter("users", "tenant = {:t} && id != {:u}", "", 1, 0, { t: tid, u: uid });
        isLast = !(siblings && siblings.length);
        if (expectLast !== null && expectLast !== isLast) throw new Error("__VERALTET__");
      }
      tx.delete(userRec);
      if (tid && isLast) {
        const tenantRec = tx.findRecordById("tenants", tid);
        tx.delete(tenantRec); // Kaskade: Overlays, Settings, Secrets, Push-Log, Renewal-Requests
        deletedTenant = true;
      }
    });
    return e.json(200, { ok: true, deletedTenant: deletedTenant });
  } catch (err) {
    const msg = String((err && err.message) || err);
    if (msg.indexOf("__VERALTET__") !== -1) return e.json(409, { ok: false, error: "Die Kundenliste war veraltet — die Benutzer dieses Kunden haben sich inzwischen geändert. Bitte neu laden und erneut prüfen." });
    console.log("[tenant_admin] delete error:", msg);
    return e.json(400, { ok: false, error: "Löschen fehlgeschlagen: " + msg.slice(0, 200) });
  }
}, $apis.requireAuth());
