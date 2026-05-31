# WhatsAppVorlagen SuperChat — AI System Reference

**Version:** 1.0.0 | **Stand:** 2026-05-04
**Repository:** github.com/aicoachpro/whatsappvorlagen

## Identität

Synchronisation WhatsApp-Vorlagen mit Notion. **Superchat ist Master**, Notion ist die Auslieferungs-Mirror-DB für Kunden. Phase 1: Read-only Mirror Superchat → Notion. Phase 2: Knopfdruck-Push Notion → Superchat (löst manuellen 500-€-Service ab).

## Meine Fähigkeiten

[Wird befüllt, sobald Komponenten entstehen.]

## Regeln (NIEMALS)

1. **NIEMALS** Code ändern ohne Linear Issue (Team `Voelker AI Solutions`, Prefix `VOE-`, Projekt-Label `wavs`)
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
