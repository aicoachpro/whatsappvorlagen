# VOR-8 — Kunden-Einstellungen (Self-Service): Firma-Footer + personalisierte Links

> Spec vor Code (CLAUDE.md Regel 1). Pre-Flight: [ARCHITECTURE_DESIGN.md](../ARCHITECTURE_DESIGN.md),
> [CONVENTIONS.md](../CONVENTIONS.md), [CONTEXT.md](../CONTEXT.md) gelesen.
> Huly-Issue: VOR-8 (Projekt VOR, ehem. Linear VOE-251). Teil des Kern-Features
> `feature-kunden-self-service-superchat`.

## Intent
Ein eingeloggter Kunde kann **selbst** — ohne Admin — seinen **Firmennamen** (Footer/Verabschiedung,
fester Text) und seine **personalisierten Links** in einer Einstellungsseite pflegen. Die Werte
wirken sofort in der Vorlagen-Vorschau (Personalisierung). Skaliert sicher für 20–30 Kunden;
ein Kunde kann **niemals** Lizenz-/Status-Felder anderer oder seines eigenen Tenants ändern.

## Kontext
- Huly-Issue: VOR-8
- Betroffene Komponenten: `webui/app.js`, `webui/index.html`, `webui/styles.css`,
  neuer/erweiterter Setup-Agent für die PocketBase-Schema-Änderung.
- Bezug: Personalisierung existiert bereits (`personalize()` in app.js liest `tenant.firma`
  + `tenant.ersetzungen`), wird aber bisher **nur vom Admin** beim Kunden-Anlegen gesetzt.

## Sicherheits-Befund (Grund für die Architektur-Entscheidung)
`firma`/`ersetzungen` liegen am `tenants`-Record. Dessen Rules: lesen=admin, schreiben=superuser.
Liesse man Kunden den `tenants`-Record patchen, könnten sie auch `expires_at`/`status` ändern
(Lizenz-Bypass). PocketBase-Rules sind record-, nicht feldgenau → kundeneditierbare Felder
müssen in eine **eigene Collection**.

## Architektur-Entscheidung
Neue Collection **`tenant_settings`** (1:1 zum Tenant) nur für kundeneditierbare Felder:
- `tenant` (relation → tenants, unique, cascadeDelete)
- `firma` (text)
- `ersetzungen` (json)
- Rules (tenant-scoped, wie `template_overlays`):
  `own = @request.auth.role = "admin" || tenant = @request.auth.tenant`
  list/view/update/delete = `own`; create = auth && own.

Lizenz-/Status-Felder bleiben am `tenants` (Admin/Superuser). Migration: bestehende
`tenants.firma`/`ersetzungen` → `tenant_settings` kopieren; Admin-`createCustomer` legt
künftig `tenant_settings` mit an.

## Akzeptanzkriterien
- [ ] Collection `tenant_settings` existiert (tenant-scoped Rules), idempotenter Setup-Agent
- [ ] Bestand migriert: jeder Tenant mit firma/ersetzungen hat einen `tenant_settings`-Record
- [ ] Kunde hat in der UI eine **Einstellungen**-Seite (Firma-Feld + Link-Editor), nur eigene Daten
- [ ] Speichern schreibt nach `tenant_settings`; Vorschau personalisiert sofort danach
- [ ] Kunde kann seinen `tenants`-Record (expires_at/status) **nicht** ändern (Rule-Test)
- [ ] Admin-`createCustomer` legt `tenant_settings` mit an (kein Personalisierungs-Bruch)
- [ ] Personalisierung (`loadData`/`personalize`) liest aus `tenant_settings`
- [ ] Doku + Git Push

## Architektur-Dimensionen (relevant)
- **Security** ✓ — Lizenz-Bypass verhindert (Felder-Trennung), tenant-scoped Rules.
- **Data Integrity** ✓ — 1:1 tenant_settings, Unique-Index auf `tenant`, Migration ohne Verlust.
- **Maintainability** ✓ — folgt bestehendem Overlay-Rule-Muster.
- Compliance: kein Versand, keine Meta-API berührt — n/a für diesen Schritt.

## Umsetzung
1. Setup-Agent `agents/setup-tenant-settings.js` (idempotent, Muster wie setup-pb-tenancy.js):
   Collection anlegen + Rules + Migration aus `tenants`.
2. `webui/index.html`: Settings-Button im Topbar + `#settings`-Modal-Container.
3. `webui/app.js`:
   - `loadData`: `tenant_settings` des eigenen Tenants laden → STATE.settings; `personalize`
     liest firma/ersetzungen daraus (Fallback auf tenants für Übergang).
   - `openSettings()`: Firma-Feld + Link-Editor (Zeilen `alt = neu`, wie Admin-`buildErsetzungen`),
     Speichern via POST/PATCH `tenant_settings`.
   - Admin-`createCustomer`: zusätzlich `tenant_settings` anlegen.
4. `webui/styles.css`: minimal, vorhandene Klassen wiederverwenden.

## Definition of Done
- [ ] Setup-Agent läuft idempotent gegen PB (lokal/PB-Instanz) ohne Fehler
- [ ] Kein Secret im Code/Chat; sensible Daten maskiert
- [ ] Compliance-Check: n/a (kein Versand)
- [ ] Git push + CHANGELOG-Eintrag
- [ ] Neue Datei in ARCHITECTURE_DESIGN.md §6 + INDEX.md eingetragen
- [ ] Huly-Issue VOR-8 auf „Done"

## Session-Referenz
<!-- /implement trägt hier Session-Infos für Audit-Rekonstruktion ein -->
- Datum: …
- Commits: …
