# WhatsAppVorlagen SuperChat — System Architecture

**Version:** 1.0.0 | **Stand:** 2026-05-04

## Überblick

Synchronisation WhatsApp-Vorlagen mit Notion. Bidirektionaler Abgleich zwischen WhatsApp Business API Templates und einer Notion-Datenbank.

## Komponenten

[Wird befüllt, sobald Code entsteht.]

## Notion-Datenquelle

**Database:** `Whatsapp Vorlagen autoabgleich`
**Pfad in Notion:** `🚀 CRM & Sales Hub` › `💬 Superchat Workflows & Vorlagen` › `Vorlagen Repository` › `Whatsapp Vorlagen autoabgleich`
**Database ID:** `07ee35a1-94de-82d2-8748-81c0763b26df`
**Data Source ID:** `c1ce35a1-94de-8215-be2f-874936629ea4`
**URL:** https://www.notion.so/voelkergrp/07ee35a194de82d2874881c0763b26df

### Schema

| Feld | Typ | Anmerkung |
|------|-----|-----------|
| `Name` | title | Vorlagen-Name (Title) |
| `Vorlagentext` | text | Hauptinhalt der Nachricht |
| `Überschrift` | text | optionale Header-Zeile |
| `Fusszeile` | text | optionaler Footer |
| `Kategorie` | select | `Verwaltung` \| `Marketing` |
| `Ordner` | select | 18 Ordner-Codes (z.B. `#1 Kommunikation`, `#52 Leads`, `#8 DSGVO/EWEn`) |
| `Anhang` | file | Datei-Anhänge |
| `Anhang / Überschrift hinzufügen(optional)` | select | `Bild` \| `Video` \| `PDF` \| `Überschrift` |
| `Vorschaubild` | file | Card-Cover für Notion-Galerie |
| `Button hinzufügen` | multi_select | `Schnellantwort` \| `Statische URL` \| `Dynamische URL` \| `Telefonnummer` |
| `Button Name` | text | Button-Beschriftung |
| `Schnellantwort` | text | Quick-Reply-Inhalt |
| `URL's` | url | Link für URL-Buttons |
| `Telefonnummer` | phone_number | Rufnummer für Phone-Buttons |
| `Notizen` | text | interne Notizen |

### Mapping-Hinweise (Notion → Superchat/WhatsApp)

| Notion-Konzept | WhatsApp-Konzept | Mapping-Regel |
|----------------|------------------|---------------|
| `Kategorie` Marketing | `MARKETING` Template-Category | direkt |
| `Kategorie` Verwaltung | `UTILITY` Template-Category | direkt |
| `Überschrift` | Header-Component (TEXT) | bei Bedarf mit Anhang-Typ kombinieren |
| `Anhang` + Anhang-Typ Bild/Video/PDF | Header-Component (IMAGE/VIDEO/DOCUMENT) | mutually exclusive mit Text-Header |
| `Vorlagentext` | Body-Component | Pflicht |
| `Fusszeile` | Footer-Component | optional |
| `Button hinzufügen` | Button-Component | max 3 Buttons (WA-Limit) |
| `Schnellantwort` | QUICK_REPLY-Button | |
| `URL's` (statisch) | URL-Button | |
| `URL's` (dynamisch) | URL-Button mit Variable | Variable-Pattern dokumentieren |
| `Telefonnummer` | PHONE_NUMBER-Button | |

## Datenfluss

```
[Notion DB]  ◀──── Sync ────▶  [Superchat]  ◀──── BSP ────▶  [WhatsApp / Meta]
      │                              │
      └──────── Conflict Resolution ─┘
              (lib/sync, lib/diff)
```

Superchat ist der **BSP (Business Solution Provider)** und kapselt die WhatsApp Business API
(Template-Erstellung, Genehmigungs-Status, Versand, Inbox). Wir sprechen nie direkt mit Meta —
immer nur mit der Superchat-API.

[Detailliert beschreiben, sobald Implementierung beginnt.]

## Externe Abhängigkeiten

| Service | Zweck | Auth |
|---------|-------|------|
| Linear | Issue Tracking | API Key (.env: `LINEAR_API_KEY`) |
| GitHub | Code Repository | SSH/HTTPS |
| Notion | Datenbank für Vorlagen (SSoT der Inhalte) | Integration Token (.env: `NOTION_TOKEN`, `NOTION_DATABASE_ID`) |
| Superchat | BSP für WhatsApp Business — Template-Verwaltung + Versand + Inbox | `X-API-Key: $SUPERCHAT_API_KEY` Header gegen Base `https://api.superchat.com/v1.0` |
| Obsidian Vault | Doku-Spiegel | Filesystem |
