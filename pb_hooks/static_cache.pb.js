/// <reference path="../pb_data/types.d.ts" />
//
// pb_hooks/static_cache.pb.js — Browser-Cache für die Kunden-UI abschalten (WV-15)
// AI-generated: WV-15
//
// pb_public (index.html, app.js, styles.css) wurde ohne Cache-Control ausgeliefert. Browser
// cachen dann heuristisch und zeigen nach einem Deploy weiter die alte Oberfläche.
// "no-cache" = vor jeder Nutzung beim Server nachfragen; unverändert kommt nur ein 304 zurück.
// API (/api/) und Admin-Panel (/_/) bleiben unberührt.

routerUse((e) => {
  try {
    const p = e.request.url.path || "";
    if (e.request.method === "GET" && p.indexOf("/api/") !== 0 && p.indexOf("/_/") !== 0) {
      e.response.header().set("Cache-Control", "no-cache");
    }
  } catch (_) { /* Header darf die Auslieferung nie blockieren */ }
  return e.next();
});
