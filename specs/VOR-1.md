# VOR-1 — Per-Tenant Vorlagen-Edit (Overlay) + personalisierte Galerie/Vorschau

> Spec (nachgezogen beim Abschluss). Huly-Issue: VOR-1 (ehem. Linear VOE-241).
> Migrierte Story — Code war bei Übernahme bereits weitgehend vorhanden; hier dokumentiert + verifiziert.

## Intent
Jeder Kunde sieht eine Galerie der Master-Vorlagen und kann **pro Vorlage** Text/Felder für
**seinen** Account überschreiben, aus-/einblenden, Notizen führen — der Master-Katalog bleibt
unberührt. Vorschau zeigt die **effektive** Vorlage (Master ⊕ Overlay ⊕ Personalisierung). Strikte
Mandantentrennung über PocketBase-Rules.

## Architektur (umgesetzt)
- **Master** `templates` (read-only), **Overlay** `template_overlays` (pro Tenant, Feld-Overrides +
  `hidden` + `notes`), **Effektive Vorlage** = clientseitiger Merge in `effective()` + `personalize()`.
- Rules (aus `agents/setup-pb-tenancy.js`): `own = admin || tenant = @request.auth.tenant` für
  list/view/update/delete; create = auth && own.

## Akzeptanzkriterien — verifiziert 2026-06-21
- [x] Galerie + Detail mit effektiver (gemergter) Vorschau — `render()`/`card()`/`bubbleHtml()` via `effective()` (webui/app.js)
- [x] Overlay-Edit speichert tenant-scoped, Master unverändert — `saveOverlay()` (POST/PATCH `template_overlays`, tenant=eigener), `resetOverlay()`
- [x] Cross-Tenant-Isolation getestet — `tests/tenant-isolation.js` (6 Checks: A sieht nur eigenes; B's Overlay nicht lesbar/änderbar/löschbar). Rule-Muster zusätzlich in VOR-9-Slice-1-Test bestätigt (Kunde 404 auf fremden Record).
- [x] Personalisierung (VOR-8: Firma + Links) fließt in die Vorschau — `effective()`→`personalize()`; **live verifiziert** (Detail-Modal-Screenshot: „Muster GmbH" + `muster-gmbh.de`)
- [x] Skaliert für 20–30 Tenants — Overlay-Modell, kein Vorlagen-Duplizieren
- [x] Doku + Git Push — webui committed; CHANGELOG/INDEX gepflegt

## Out of Scope (optional, nicht in dieser Story)
- Tenant-eigene Vorlagen ohne Master-Bezug (Overlay ohne `template`) — als Folge-Idee offen.

## Verifikation
- Code-Review der Merge-/Edit-/Galerie-Pfade (webui/app.js).
- Personalisierung live im Browser gerendert (Puppeteer, 2026-06-21).
- Isolations-Beweis: `npm run test:tenancy` (`tests/tenant-isolation.js`) gegen die PB-Instanz — self-cleaning.

## Session-Referenz
- Datum: 2026-06-21 (Abschluss/Doku der migrierten Story)
- Komponenten: `webui/app.js`, `agents/setup-pb-tenancy.js`, `tests/tenant-isolation.js`
