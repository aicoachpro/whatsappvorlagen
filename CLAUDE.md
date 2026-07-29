# WhatsAppVorlagen SuperChat — AI System Reference

## Aufgaben- & Doku-Plattform (SSoT) — verbindlich

- **SSoT für Aufgaben UND Doku ist der Obsidian-Vault „TheBrain"** (PARA), Aufgaben im **TaskNotes**-Format.
  - Aufgaben-Zentrale: `TaskNotes/_Aufgaben-Hub.md`
  - Projekt-Key dieses Repos: `whatsappvorlagen` → im Task-Frontmatter `projects: [whatsappvorlagen]`
- **Kein Code ohne Aufgabe:** jede Änderung startet mit einer TaskNote (`status: open → in-progress → done`), nicht mit einem Linear-/Huly-Issue.
- **Linear & Huly sind abgelöst** (Linear verlassen, Huly abgeschaltet). Alte `VOE-`/`MT-`/`CTS-`/`VOR-`-Verweise sind historisch.


**Version:** 1.0.0 | **Stand:** 2026-05-04
**Repository:** github.com/aicoachpro/whatsappvorlagen

## Identität

WhatsApp-Vorlagen-Plattform. **Superchat ist Master**, die selbstgehostete **PocketBase-Plattform** (live unter vorlagen.voelkergroup.cloud) ist die Auslieferungs-/Self-Service-DB für Kunden. Kern: Per-Tenant-Personalisierung + Overlay-Edit + Knopfdruck-Push der effektiven Vorlage zur Meta-Freigabe (löst manuellen 500-€-Service ab).
> **Notion ist abgeschaltet (VOR-2, 2026-06-21)** — gekündigt, Code/Scripts/Env entfernt; nur noch Historie im Changelog. Aktueller Architektur-Stand: siehe **[ARCHITECTURE_DESIGN.md](ARCHITECTURE_DESIGN.md)** (Hub).

## Pflichtlektüre (Framework v3.0 Kern-Upgrade)

Vor jeder Arbeit lesen: **[ARCHITECTURE_DESIGN.md](ARCHITECTURE_DESIGN.md)** (Hub) · **[CONVENTIONS.md](CONVENTIONS.md)** (Runtime/Backlog/Gates) · **[CONTEXT.md](CONTEXT.md)** (Vokabular) · **[INDEX.md](INDEX.md)** (Datei-Register). Jede neue Datei sofort in ARCHITECTURE_DESIGN.md §6 + INDEX.md eintragen.

## Meine Fähigkeiten

[Wird befüllt, sobald Komponenten entstehen.]

## Regeln (NIEMALS)

1. **NIEMALS** Code ändern ohne **TaskNote** (Obsidian `TaskNotes/`, `projects: [whatsappvorlagen]`) — Status open→in-progress→done. *(früher: Linear-/Huly-Issue; abgelöst.)*
2. **NIEMALS** Issue schließen ohne Git Push + Changelog
3. **NIEMALS** API Keys im Chat — User trägt direkt in `.env` ein
4. **NIEMALS** Issue ohne Labels anlegen
5. **NIEMALS** Superchat-API-Keys oder Notion-Tokens loggen
6. **NIEMALS** Vorlagen-Inhalte ohne Compliance-Check (Meta-Richtlinien) versenden
7. **NIEMALS** direkt gegen die Meta WhatsApp Business API sprechen — immer nur via Superchat (BSP)

## System-Architektur

[Wird befüllt, sobald Komponenten entstehen — siehe SYSTEM_ARCHITECTURE.md.]

## Config-Werte

Alle Config-Werte kommen aus `lib/config.js`. `VERSION` ist dort SSoT.

## Architektur-Dimensionen

| Dimension | Relevant |
|-----------|:--------:|
| Reliability | ✓ |
| Data Integrity | ✓ |
| Security | ✓ |
| Performance | ✓ |
| Observability | ✓ |
| Maintainability | ✓ |
| **Compliance** (Meta WhatsApp Business API + DSGVO) | ✓ |

## Handoff-Prozess

Nach Feature-Entwicklung:
1. Code committen + pushen
2. CLAUDE.md updaten
3. Operator informieren: "Feature X fertig"
4. Operator weist AI-Operator an: "Lies CLAUDE.md neu"
