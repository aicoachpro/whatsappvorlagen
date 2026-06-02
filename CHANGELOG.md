# WhatsAppVorlagen SuperChat — Changelog

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
