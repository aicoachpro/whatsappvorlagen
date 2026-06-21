# INDEX — WhatsAppVorlagen SuperChat

Datei-Register. Jede neue Datei wird hier UND in [ARCHITECTURE_DESIGN.md §6](ARCHITECTURE_DESIGN.md) eingetragen.

## Runtime-Einstieg & Verträge
- [CLAUDE.md](CLAUDE.md) — Claude-Code-Einstieg, Identität, Regeln
- [AGENTS.md](AGENTS.md) — Codex-Einstieg (portabel)
- [CONVENTIONS.md](CONVENTIONS.md) — Adapter-Vertrag (Runtime, Backlog, Gates)
- [CONTEXT.md](CONTEXT.md) — Ubiquitous Language

## Architektur & Governance
- [ARCHITECTURE_DESIGN.md](ARCHITECTURE_DESIGN.md) — Hub
- [SYSTEM_ARCHITECTURE.md](SYSTEM_ARCHITECTURE.md) — System-Architektur + Superchat-/Notion-Schema
- [GOVERNANCE.md](GOVERNANCE.md) · [SECURITY.md](SECURITY.md) · [DEVELOPMENT_PROCESS.md](DEVELOPMENT_PROCESS.md)
- [COMPONENT_INVENTORY.md](COMPONENT_INVENTORY.md) · [CHANGELOG.md](CHANGELOG.md)

## Specs
- [specs/VPS_PLATTFORM_KONZEPT.md](specs/VPS_PLATTFORM_KONZEPT.md) — Notion-Ablösung, Tenancy-Modell A
- [specs/UI-REVIEW.md](specs/UI-REVIEW.md) — 6-Säulen-UI-Audit
- [specs/TEMPLATE.md](specs/TEMPLATE.md) — Spec-Vorlage
- [specs/VOR-8.md](specs/VOR-8.md) — Kunden-Self-Service: Firma + Links (`tenant_settings`)
- [specs/VOR-9.md](specs/VOR-9.md) — Per-Tenant SuperChat-Key (verschlüsselt) + Meta-Push; Slice 1: `tenant_secrets` + `pb_hooks/`
- [specs/VOR-3.md](specs/VOR-3.md) — Admin-Verwaltung: Eigen-Passwort (UI) + Vertragsdatum
- [specs/VOR-1.md](specs/VOR-1.md) — Per-Tenant Overlay-Edit + personalisierte Galerie/Vorschau

## Code
- `lib/` — config.js (SSoT), doc-sync.js
- `agents/` — Superchat-/Notion-Sync, Datenqualität, PocketBase-Setup, Self-Healing, Previews
- `webui/` — Kunden-UI (index.html, app.js, styles.css)
- `pb_hooks/` — serverseitige PocketBase-JS-Hooks (z. B. `superchat_creds.pb.js`: verschlüsselte Per-Tenant-Anbindung, VOR-9)
- `tests/` — tenant-isolation.js
- `deploy/vorlagen/` — docker-compose.yml, README.md (Setup/Backup/Restore)

## Betrieb
- Live: https://vorlagen.voelkergroup.cloud/ (Kunden-UI) · `/_/` (Admin-Panel)
- Deploy: `git push origin main` → Server-Cron-Pull (siehe deploy/vorlagen/README.md)
