# WhatsAppVorlagen SuperChat — Changelog

## 2026-06-21

### E-Mail-Flows: Passwort-vergessen + Willkommens-Mail (VOR-11)
- **Login:** „Passwort vergessen?" → PB `request-password-reset` (neutrale Meldung); **Reset-Seite** liest `?reset=TOKEN` und setzt neues Passwort via `confirm-password-reset`.
- **Onboarding:** `createCustomer` löst automatisch eine Willkommens-Mail mit „Passwort setzen"-Link aus (kein Klartext per Mail); **Backup-Passwort** bleibt als Fallback sichtbar (funktioniert auch ohne SMTP).
- **`agents/setup-mail.js`** (`npm run setup:mail`): konfiguriert PB-Mail automatisch (SMTP smtp.hostinger.com + App-URL + Reset-Template-Link auf die Kunden-UI) per Settings-API; Postfach-Passwort aus `.env` (`MAIL_PASSWORD`). Gegen lokale PB verifiziert (Settings- + Template-PATCH → 200).
- Endpoints lokal verifiziert (request → 204, confirm bad-token → 400). **E2E braucht** nur noch: Postfach existiert (✓) + `MAIL_PASSWORD` in `.env` + `npm run setup:mail` (`deploy/vorlagen/README.md`).

### Notion abgeschaltet (VOR-2)
- Notion gekündigt & abgeklemmt. Gelöscht: `agents/sync-superchat-to-notion.js`, `agents/notion-enrich-to-pb.js`. `agents/test-env.js` Notion-Health-Check entfernt; `package.json` ohne `sync:notion`/`enrich:pb`, Beschreibung aktualisiert.
- Doku-SSoTs bereinigt (CLAUDE.md, ARCHITECTURE_DESIGN, SYSTEM_ARCHITECTURE-„veraltet"-Banner, COMPONENT_INVENTORY, INDEX, SECURITY) — Notion nur noch Historie. PocketBase ist alleinige Auslieferungs-Plattform.
- **Operator-Aktion:** `NOTION_TOKEN` + `NOTION_DATABASE_ID` aus `.env` entfernen.

### Verifiziert & abgeschlossen: Per-Tenant Overlay-Edit (VOR-1)
- Migrierte Story verifiziert + Spec nachgezogen (`specs/VOR-1.md`): effektive Galerie/Vorschau (`effective()`), tenant-scoped Overlay-Edit, Personalisierung (live im Browser), Cross-Tenant-Isolation via `tests/tenant-isolation.js`. Keine Code-Änderung — Doku/Abschluss.

### Admin: Eigen-Passwort + Vertragsdatum (VOR-3)
- **Admin-Eigen-Passwort in der UI:** Abschnitt „Mein Admin-Zugang" — Admin setzt sein eigenes Passwort selbst (PATCH eigener Record mit `oldPassword`; kein Skript/DB-Eingriff mehr). PB-Verhalten verifiziert (ohne `oldPassword` → 400, mit → 200, Re-Login ok).
- **Vertragsdatum beim Kunden-Anlegen:** neues `date`-Feld (Default heute) → `invited_at`; `expires_at` = Vertragsdatum + 365 Tage (Admin tippt kein Ablaufdatum).

### Per-Tenant SuperChat-Key — verschlüsselt (VOR-9, Slice 1)
- **`agents/setup-tenant-secrets.js`** — neue **superuser-only** Collection `tenant_secrets` (`sc_api_key_enc`, `waba_id`, `mode`); Browser kommt nie direkt ran.
- **`pb_hooks/superchat_creds.pb.js`** — neues serverseitiges Bauteil (PocketBase-JS-Hooks): Routen `POST/GET/DELETE /api/vor/superchat-key`. Validiert den Key per SuperChat-Test-Call, **verschlüsselt** ihn at-rest (AES-256-GCM via `$security.encrypt`, Schlüssel `SUPERCHAT_ENC_KEY` nur in Server-Env), gibt **nie** den Klartext zurück. Modi: `stored` (1-Klick) / `session` (nicht speichern).
- **Kunden-UI** (`webui/`): Einstellungen-Abschnitt „SuperChat-Verbindung" (Key write-only, WABA-ID, Modus-Wahl, Prüfen & Speichern, Entfernen).
- **Befund:** SuperChat hat **kein „Entwurf"** — `POST /templates` reicht direkt bei Meta zur Freigabe ein (Slice 2). Ordner per `POST /template-folders` + `folder_id` automatisierbar.

### SuperChat-Push = Meta-Einreichung (VOR-9, Slice 2)
- **`pb_hooks/superchat_push.pb.js`** — Routen `POST /api/vor/push-template` (action `preview`/`submit`) + `GET /api/vor/push-log`. Baut die **effektive Vorlage serverseitig autoritativ** (Master ⊕ Overlay ⊕ Personalisierung), löst Ordner reuse-or-create (`folder_id`), reicht via `POST /v1.0/templates` bei Meta ein (Status pending/approved/rejected).
- **`tenant_push_log`** (superuser-only) — Audit je Einreichung; Setup in `agents/setup-tenant-secrets.js`.
- **Kunden-UI:** Detail-Modal „📤 Direkt an SuperChat einreichen" — Preview (zeigt exakt was gesendet wird, keine Writes) → Compliance-Bestätigung → verbindliches Einreichen + Status.
- **Verifiziert:** Preview + Personalisierung + Folder-List gegen echte SuperChat-API (lokal). **Live-Submit bewusst nicht in Dev ausgeführt** (reicht real bei Meta ein) — braucht gezielten Operator-Test.
- **JSVM-Fix:** PocketBase liefert JSON-Felder als Roh-Bytes → über `JSON.parse(String(v))` lesen.

### Bulk-Push (VOR-9, Slice 3)
- Topbar-Button „📤 Alle einreichen" (sichtbar wenn SuperChat verbunden) → Bestätigungs-Overlay mit Pro-Vorlage-Statusliste; sequenzielle Submits über die geprüfte Single-Route, 250 ms Pause gegen Rate-Limits, Continue-on-Error + Summary.

### UI-Modernisierung — Design-System v2 (VOR-10)
- `webui/styles.css` komplett überarbeitet: Verlaufs-Topbar + Brand-Badge, Pill-Filter mit aktivem Verlauf, erhöhte Karten mit Hover-Lift & gestaffelten Schatten, glasige Modals (Backdrop-Blur, Slide-in), Verlaufs-Buttons mit Gloss/Shadow, Fokus-Ringe, Hintergrund-Verläufe; `prefers-reduced-motion` respektiert. Alle Klassennamen erhalten (kein JS-Bruch).
- Per Puppeteer gerendert/verifiziert (Login, Galerie, Detail-Modal).

## 2026-06-19

### Issue-Tracker Linear → Huly migriert
- Aktiver Tracker ist jetzt **Huly** (Workspace „VOELKER AI", Projekt `VOR`, Präfix `VOR-`). 8 offene Stories migriert (VOR-1…8), Linear-Originale (`VOE-`) auf Canceled + Migrations-Kommentar; Done/Canceled-Historie bleibt in Linear.
- `.claude/environment.json` (`backlog.adapter: huly`) + CLAUDE.md/CONVENTIONS.md/CONTEXT.md/AGENTS.md/ARCHITECTURE_DESIGN.md nachgezogen.

### Kunden-Self-Service: Firma + Links selbst pflegen (VOR-8)
- **`agents/setup-tenant-settings.js`** — neue tenant-scoped Collection `tenant_settings` (`firma`, `ersetzungen`) + Migration bestehender Kunden. Kundeneditierbare Felder von den Lizenzfeldern am `tenants` getrennt → Kunde kann **nicht** seine eigene Lizenz (`expires_at`/`status`) ändern.
- **Kunden-UI** (`webui/`): neue Einstellungen-Seite (⚙️) — jeder Kunde pflegt Firmenname (Footer) + personalisierte Links selbst; `personalize()` liest aus `tenant_settings`. Admin-Onboarding legt `tenant_settings` mit an.

## v1.0.0 — 2026-06-02

### Telegram-Anbindung + automatischer Lizenz-Check (VOE-247)
- `agents/setup-telegram.js` — ermittelt Chat-ID aus Bot-Updates, schreibt `TELEGRAM_CHAT_ID` in `.env`, sendet Test-Nachricht
- Bot `@voelker_vorlagen_bot` verbunden, Test erfolgreich zugestellt
- Fix: Token wurde nicht erkannt, weil die `.env`-Zeile auskommentiert (`#`) war
- **`.github/workflows/lizenz-check.yml`** — täglicher GitHub-Actions-Lauf (06:00 UTC) von `check-tenant-expiry.js`; ersetzt den geplanten VPS-Cron (SSH netzseitig gesperrt). Zugangsdaten als GitHub-Secrets, Dry-Run-Test erfolgreich
- VOE-247 damit abgeschlossen (Schema, Login-Sperre, +1-Jahr-Button, Erinnerung, Admin-Hervorhebung)

## v1.0.0 — 2026-06-01

### User-Verwaltung + Infrastruktur (VOE-246, VOE-237)
- **Kundenverwaltung** (Admin-Onboarding): Admin-Bereich in der Kunden-UI (nur role=admin) — Kunden anlegen (Mandant + Login), Passwort zurücksetzen, löschen; Kundenliste
- `setup-user-mgmt.js` — PocketBase-Rules: role=admin verwaltet `tenants`/`users`, kein Self-Update (keine role-Eskalation)
- Admin-Account `thomas@voelker.digital` (role=admin) in der users-Collection
- **VOE-237:** Server-Config + Backup-/Restore-Doku ins Repo (`deploy/vorlagen/`)
- Feature-Branches nach `main` zusammengeführt

### Vorlagen-Komponenten vollständig (VOE-243)
- Superchat-`content` vollständig erschlossen: echte `category`, `buttons` (Typ/Label/Reihenfolge), `header`, benannte `variables`, `channels`, `track_links`
- `extend-templates-schema.js` + Sync-Erweiterung: echte Meta-Kategorie ersetzt Heuristik (251 Marketing / 15 Verwaltung)
- Kunden-UI: WhatsApp-Vorschau mit **Buttons als Knöpfe**, **Variablen-Chips**, Header-Typen; Button-Liste im Detail; Kategorie-/Button-Badges in der Galerie
- Deploy nach `pb_public` (über Server-Terminal, da SSH-IP temporär netzseitig gesperrt)

### VPS-Plattform (Notion-Ablösung) — Phase 1 + 2 (VOE-237, VOE-238)
- Architektur-Konzept `specs/VPS_PLATTFORM_KONZEPT.md` v0.2.0 — Tenancy-Modell A (Master-Katalog ⊕ Kunden-Overlay), Stack PocketBase/Docker/Traefik
- **Phase 1:** PocketBase-Instanz live unter `vorlagen.voelkergroup.cloud` (Docker + Traefik, Let's-Encrypt-TLS), DNS-A-Record angelegt
- **Phase 2:** `sync-superchat-to-pb.js` — 269 Templates + 262 Vorschaubilder nach PocketBase (Upsert nur Superchat-Felder)
- **Phase 2:** `notion-enrich-to-pb.js` — einmaliger Notion-Export: 174 Records mit Anreicherung (Kategorie/Ordner/Buttons/…) migriert, Match per `superchat_id`
- Notion bleibt im Parallelbetrieb bis Phase 6
- npm-Scripts: `sync:pb`, `enrich:pb`, `sync:notion`
- Linear-Roadmap VOE-236…242 angelegt

### Datenqualität + Phase 4 (VOE-240)
- `fill-ordner-from-superchat.js` — Ordner aus Superchat-`folder` ergänzt (174→264/269)
- `derive-kategorie-from-ordner.js` — Kategorie-Heuristik aus Ordner (169→264/269; Marketing 164 / Verwaltung 100)
- **Phase 4:** `setup-pb-tenancy.js` — Multi-Tenant-Unterbau: Collections `tenants`, `template_overlays` (Tenant-Scoping-Rules), `users` um `tenant`/`role` erweitert, `templates`-Rules (read=auth, write=admin)
- `tests/tenant-isolation.js` — Cross-Tenant-Sicherheitstest, 8/8 PASS (Mandantentrennung bestätigt)
- npm-Scripts: `setup:tenancy`, `test:tenancy`

## v1.0.0 — 2026-05-04

### Initial Setup
- OpenCLAW Governance Framework eingerichtet
- Basis-Dokumentation erstellt (CLAUDE.md, SYSTEM_ARCHITECTURE.md, COMPONENT_INVENTORY.md, DEVELOPMENT_PROCESS.md, GOVERNANCE.md, SECURITY.md)
- Self-Healing Agent + Doc-Sync Module eingerichtet (launchd-Job, alle 15 min)
- Linear-Labels angelegt: compliance, notion-sync, whatsapp-template, wavs (Team Voelker AI Solutions)
- Architektur-Dimensionen: Standard + Compliance (Meta WhatsApp Business + DSGVO)
- BSP geklärt: **Superchat** als WhatsApp Business Solution Provider — direkter Meta-Zugriff entfällt
- Notion-DB `Whatsapp Vorlagen autoabgleich` (`07ee35a1-94de-82d2-8748-81c0763b26df`) als Sync-Quelle festgelegt — Schema dokumentiert (15 Felder, Mapping zu WhatsApp-Komponenten)
- Linear-Projekt `WhatsAppVorlagen SuperChat` angelegt (ID `7ed012ad-3d68-423f-9047-4a7ef6217b2b`)
- Issue-Prefix von `WAVS-` zu **`VOE-`** korrigiert (echtes Team-Prefix von `Voelker AI Solutions`)
