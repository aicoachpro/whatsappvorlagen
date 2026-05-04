# WhatsAppVorlagen SuperChat — System Architecture

**Version:** 1.0.0 | **Stand:** 2026-05-04

## Überblick

Synchronisation WhatsApp-Vorlagen mit Notion. Bidirektionaler Abgleich zwischen WhatsApp Business API Templates und einer Notion-Datenbank.

## Komponenten

[Wird befüllt, sobald Komponenten entstehen.]

## Datenfluss

```
[Notion DB] ◀──── Sync ────▶ [WhatsApp Business API]
      │                              │
      └──────── Conflict Resolution ─┘
              (lib/sync, lib/diff)
```

[Detailliert beschreiben, sobald Implementierung beginnt.]

## Externe Abhängigkeiten

| Service | Zweck | Auth |
|---------|-------|------|
| Linear | Issue Tracking | API Key (.env: `LINEAR_API_KEY`) |
| GitHub | Code Repository | SSH/HTTPS |
| Notion | Datenbank für Vorlagen | Integration Token (.env: `NOTION_TOKEN`) |
| WhatsApp Business API | Template-Verwaltung + Versand | Access Token + Phone Number ID |
| Obsidian Vault | Doku-Spiegel | Filesystem |
