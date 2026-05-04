# WhatsAppVorlagen SuperChat — Development Process

**Version:** 1.0.0 | **Stand:** 2026-05-04

## Übersicht

Dieser Prozess basiert auf [GOVERNANCE.md](./GOVERNANCE.md) §4 (Development Lifecycle).
Hier nur projekt-spezifische Ergänzungen.

## Lifecycle (Kurzfassung)

```
Idee → /ideation → Linear Issue (VOE-XX, Label: wavs) → /backlog → /implement → Code + Doku → Git Push → Done
```

**Linear-Setup:**
- Team: `Voelker AI Solutions` (Key `VOE`)
- Projekt: `WhatsAppVorlagen SuperChat` (ID: `7ed012ad-3d68-423f-9047-4a7ef6217b2b`)
- Projekt-Marker-Label: `wavs` (zur Filterung)

Siehe GOVERNANCE.md §4 für Details.

## Projekt-spezifische Regeln

### Notion-Sync

- Jede Änderung am Sync-Modul **muss** mit einem Trockendurchlauf gegen Notion-Sandbox getestet werden.
- Konflikt-Resolution-Strategie ist projektweit einheitlich (siehe `lib/sync/conflict.js`, sobald implementiert).

### Superchat (WhatsApp BSP)

- Alle WhatsApp-Operationen laufen über **Superchat-API** — niemals direkt gegen Meta.
- Template-Änderungen werden via Superchat eingereicht; Superchat leitet zur Meta-Genehmigung weiter.
- Status-Polling auf Genehmigungen läuft async — niemals blockierend.
- Superchat-Rate-Limits beachten (Doku prüfen vor jedem Push).
- Inbox-ID ist Pflicht-Header für Versand-Calls.

### Compliance (Custom-Dimension)

- Meta WhatsApp Business Policy: keine OPT-OUT-Templates, keine Werbung ohne Marketing-Template-Kategorie.
- DSGVO: Empfänger-Telefonnummern werden **nur** verschlüsselt gespeichert; Logs maskieren die letzten 4 Stellen.

## Branch-Naming

```
feature/VOE-{nummer}-{slug}
fix/VOE-{nummer}-{slug}
```

## Commit-Format

```
v{VERSION} — VOE-{nummer}: {Titel}
```

## Change-Checklist

Siehe GOVERNANCE.md §4.6.
