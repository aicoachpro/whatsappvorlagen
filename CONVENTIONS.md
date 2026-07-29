# CONVENTIONS.md — Adapter-Vertrag (WhatsAppVorlagen SuperChat)

Projektlokaler Vertrag zwischen Skills und Runtime. Quelle der Wahrheit für Runtime,
Backlog-Adapter, Governance-Modus und aktive Gates.

| Feld | Wert |
|------|------|
| **Runtime-Target** | `claude-code` (CLAUDE.md = aktiver Einstieg; AGENTS.md = portabler Codex-Einstieg) |
| **Backlog-Adapter** | `huly` — Workspace „VOELKER AI" (`voelkerai`), Projekt `WhatsAppVorlagen SuperChat` (`VOR`). Migriert von Linear am 2026-06-19 (offene Stories → VOR-1..8; Done/Canceled-Historie bleibt in Linear/`VOE-`) |
| **Issue-Prefix** | `VOR-` (vormals `VOE-` in Linear) |
| **Governance-Modus** | `lite` — kleines internes Tool (2 Personen). Kernkontext + Spec-Gate + Basis-Linting; keine schweren CI-/Coverage-/Performance-Gates |
| **Execution-Isolation** | `none` — lineare Arbeit, keine parallelen Agenten |
| **Doku-SSoT** | Repo (`/`-Root-MDs + `specs/` + `docs/`) + Obsidian-Vault-Spiegel (DocSync, siehe lib/doc-sync.js) |
| **Deployment** | Hostinger-VPS (srv1537054), PocketBase, Auto-Deploy via `git push origin main` → Server-Cron-Pull (`deploy/vorlagen/README.md`) |

## Aktive Gates (lite)

| Gate | Mechanismus | Status |
|------|-------------|--------|
| Spec-Gate | Kein Code ohne TaskNote (Obsidian)| aktiv (manuell/Konvention) |
| Doc-Version-Sync | `lib/config.js` VERSION = SSoT; `agents/self-healing.js` prüft Versions-Drift der DOC_FILES | aktiv (Self-Healing) |
| Secret-Schutz | Nie `.env`/Keys committen oder loggen; Telefonnummern maskieren | aktiv (Konvention + .gitignore) |
| Compliance | Meta WhatsApp Business Policy + DSGVO vor Versand/Push | aktiv (Konvention) |

## Bewusst NICHT aktiv (zu schwer für Projektgröße)

Semgrep-CI, Coverage-Gate, Performance-Baseline, Reliability-Skelette, Branch-Protection,
SonarQube. Nachrüstbar, wenn das Projekt wächst/reguliert wird (siehe Bootstrap v3.0 Voll-Modus).

## Postflight-Status

| Provider | Status |
|----------|--------|
| GitHub (aicoachpro/whatsappvorlagen) | OK — Auto-Deploy-Key (read-only) hinterlegt |
| Huly (Workspace „VOELKER AI", Projekt VOR) | OK — aktiver Tracker seit 2026-06-19 |
| Linear (Voelker AI Solutions) | nur noch Historie (Done/Canceled), keine neuen Stories |
| Hostinger-VPS / PocketBase | OK — live unter vorlagen.voelkergroup.cloud |
| Obsidian-Vault | OK — DocSync |
