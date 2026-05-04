# WhatsAppVorlagen SuperChat — Development Process

**Version:** 1.0.0 | **Stand:** 2026-05-04

## Übersicht

Dieser Prozess basiert auf [GOVERNANCE.md](./GOVERNANCE.md) §4 (Development Lifecycle).
Hier nur projekt-spezifische Ergänzungen.

## Lifecycle (Kurzfassung)

```
Idee → /ideation → Linear Issue (WAVS-XX) → /backlog → /implement → Code + Doku → Git Push → Done
```

Siehe GOVERNANCE.md §4 für Details.

## Projekt-spezifische Regeln

### Notion-Sync

- Jede Änderung am Sync-Modul **muss** mit einem Trockendurchlauf gegen Notion-Sandbox getestet werden.
- Konflikt-Resolution-Strategie ist projektweit einheitlich (siehe `lib/sync/conflict.js`, sobald implementiert).

### WhatsApp Business API

- Template-Änderungen müssen **vor** dem Versand bei Meta zur Genehmigung eingereicht werden.
- Status-Polling auf Genehmigungen läuft async — niemals blockierend.
- Rate Limits beachten: Tier-abhängig (1k/10k/100k pro 24h).

### Compliance (Custom-Dimension)

- Meta WhatsApp Business Policy: keine OPT-OUT-Templates, keine Werbung ohne Marketing-Template-Kategorie.
- DSGVO: Empfänger-Telefonnummern werden **nur** verschlüsselt gespeichert; Logs maskieren die letzten 4 Stellen.

## Branch-Naming

```
feature/WAVS-{nummer}-{slug}
fix/WAVS-{nummer}-{slug}
```

## Commit-Format

```
v{VERSION} — WAVS-{nummer}: {Titel}
```

## Change-Checklist

Siehe GOVERNANCE.md §4.6.
