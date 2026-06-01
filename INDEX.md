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

## Code
- `lib/` — config.js (SSoT), doc-sync.js
- `agents/` — Superchat-/Notion-Sync, Datenqualität, PocketBase-Setup, Self-Healing, Previews
- `webui/` — Kunden-UI (index.html, app.js, styles.css)
- `tests/` — tenant-isolation.js
- `deploy/vorlagen/` — docker-compose.yml, README.md (Setup/Backup/Restore)

## Betrieb
- Live: https://vorlagen.voelkergroup.cloud/ (Kunden-UI) · `/_/` (Admin-Panel)
- Deploy: `git push origin main` → Server-Cron-Pull (siehe deploy/vorlagen/README.md)
