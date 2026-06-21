# WhatsAppVorlagen SuperChat — Changelog

## 2026-06-21

### Per-Tenant SuperChat-Key — verschlüsselt (VOR-9, Slice 1)
- **`agents/setup-tenant-secrets.js`** — neue **superuser-only** Collection `tenant_secrets` (`sc_api_key_enc`, `waba_id`, `mode`); Browser kommt nie direkt ran.
- **`pb_hooks/superchat_creds.pb.js`** — neues serverseitiges Bauteil (PocketBase-JS-Hooks): Routen `POST/GET/DELETE /api/vor/superchat-key`. Validiert den Key per SuperChat-Test-Call, **verschlüsselt** ihn at-rest (AES-256-GCM via `$security.encrypt`, Schlüssel `SUPERCHAT_ENC_KEY` nur in Server-Env), gibt **nie** den Klartext zurück. Modi: `stored` (1-Klick) / `session` (nicht speichern).
- **Kunden-UI** (`webui/`): Einstellungen-Abschnitt „SuperChat-Verbindung" (Key write-only, WABA-ID, Modus-Wahl, Prüfen & Speichern, Entfernen).
- **Befund:** SuperChat hat **kein „Entwurf"** — `POST /templates` reicht direkt bei Meta zur Freigabe ein (Slice 2). Ordner per `POST /template-folders` + `folder_id` automatisierbar.

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
