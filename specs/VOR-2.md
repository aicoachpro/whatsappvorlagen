# VOR-2 — Phase 6: Notion-Abschaltung

> Spec vor Code (CLAUDE.md Regel 1). Huly-Issue: VOR-2 (ehem. Linear VOE-242).
> Operator-Freigabe 2026-06-21: „Notion wird abgeklemmt und ist gekündigt." Voraussetzung erfüllt
> (Anreicherung via Phase 2 nach PocketBase migriert) → reines Abklemmen, keine Datenrettung nötig.

## Intent
Notion vollständig aus dem aktiven System entfernen — Code, Scripts, Env, Doku. PocketBase
(vorlagen.voelkergroup.cloud) ist alleinige Auslieferungs-Plattform.

## Was wird entfernt / geändert
1. **Agenten löschen:** `agents/sync-superchat-to-notion.js` (Mirror Superchat→Notion),
   `agents/notion-enrich-to-pb.js` (Anreicherung Notion→PB, Migration erledigt → dead).
2. **`agents/test-env.js`:** Notion-Health-Check (`testNotion`, NOTION_TOKEN/NOTION_DATABASE_ID) entfernen.
3. **`package.json`:** Scripts `sync:notion` + `enrich:pb` entfernen; `description` (kein „Notion (Mirror)").
4. **Kommentare** in funktionalen Agenten (`sync-superchat-to-pb.js`, `derive-kategorie-from-ordner.js`,
   `fill-ordner-from-superchat.js`): Notion-aktiv-Bezug auf Vergangenheit/Historie entschärfen
   (Funktion unverändert).
5. **Doku:** CLAUDE.md (Identität/Regeln), ARCHITECTURE_DESIGN.md, SYSTEM_ARCHITECTURE.md,
   COMPONENT_INVENTORY.md, INDEX.md, SECURITY.md — Notion-Rolle auf „abgeschaltet 2026-06-21".
6. **`.env` (Operator):** `NOTION_TOKEN` + `NOTION_DATABASE_ID` entfernen — ich fasse `.env` nicht an.

## Out of Scope
- Linear-Reste in `test-env.js` (separates Thema, Huly-Migration; nicht VOR-2).
- Historische Journal-/Audit-Dateien (Vergangenheits-Dokumente, bleiben als Historie).

## Akzeptanzkriterien
- [x] Keine ausführbare Notion-Anbindung mehr im Code — `sync-superchat-to-notion.js` + `notion-enrich-to-pb.js` gelöscht; `test-env.js` Notion-Check entfernt (Rest sind nur historische Kommentare)
- [x] `package.json` ohne Notion-Scripts (`sync:notion`/`enrich:pb`); Beschreibung aktualisiert
- [x] Aktive Doku (CLAUDE.md, ARCHITECTURE_DESIGN, SYSTEM_ARCHITECTURE-Banner, COMPONENT_INVENTORY, INDEX, SECURITY) nennt Notion nur noch als „abgeschaltet/Historie"
- [x] `.env`-Hinweis an Operator (NOTION_TOKEN + NOTION_DATABASE_ID entfernen)
- [x] Doku + Git Push; Huly VOR-2 → Done

## Verifikation
- `grep -rni notion` über aktiven Code → nur noch historische Kommentare/Changelog.
- `npm run test:env` läuft ohne Notion-Abschnitt.

## Session-Referenz
- Datum: 2026-06-21
- 2 Agenten gelöscht, test-env/package.json bereinigt, 6 Doku-SSoTs aktualisiert
- Commits: siehe Git-Historie (VOR-2)
