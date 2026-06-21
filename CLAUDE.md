# WhatsAppVorlagen SuperChat — AI System Reference

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

1. **NIEMALS** Code ändern ohne Huly Issue (Workspace `VOELKER AI`, Projekt `WhatsAppVorlagen SuperChat`, Prefix `VOR-`). Linear/`VOE-` ist seit 2026-06-19 nur noch Historie.
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
