# VOR-3 — Vernünftige User-/Kundenverwaltung im Admin

> Spec vor Code (CLAUDE.md Regel 1). Huly-Issue: VOR-3 (ehem. Linear VOE-250).
> Pre-Flight: ARCHITECTURE_DESIGN.md, CONVENTIONS.md gelesen.

## Intent
Der App-Admin (`role=admin`, Login in der Kunden-UI) verwaltet User/Kunden vollständig **in der
Oberfläche** — kein Skript-/DB-Eingriff mehr. Insbesondere: eigenes Passwort zurücksetzen können
und beim Kunden-Anlegen das **Vertragsdatum** sauber erfassen (Ablauf wird berechnet, nicht getippt).

## Bestand (bereits gebaut)
`webui/app.js` Admin-Bereich: Kunde anlegen (Firma, Login, Links), +1 Jahr verlängern,
**Kunden**-Passwort zurücksetzen, löschen. Lizenz-Logik (365 Tage, `invited_at`/`expires_at`,
Ablauf-Badges) existiert.

## Lücken (diese Story schließt)
1. **Vertragsdatum:** `invited_at` ist beim Anlegen fix auf `now`. Soll ein **Eingabefeld**
   (Default heute) werden; `expires_at` = Vertragsdatum + 365 Tage (Admin tippt kein Ablaufdatum).
2. **Admin-Eigen-Passwort:** Admin kann nur Kunden-Passwörter setzen, **nicht sein eigenes** in der UI.
   (Genau der gemeldete Schmerz: Reset musste per Skript gegen die DB.)

## Akzeptanzkriterien
- [x] Anlege-Formular hat ein **Vertragsdatum**-Feld (Typ date, Default heute) — `#c-invited`
- [x] `createCustomer` nutzt das Vertragsdatum für `invited_at`; `expires_at` = Datum + 365 Tage
- [x] Admin-Bereich „Mein Admin-Zugang" → eigenes Passwort setzen (PATCH eigener Record mit `oldPassword`)
- [x] Erfolg/Fehler sichtbar; Passwort-Mindestlänge (8) + aktuelles Passwort geprüft
- [x] Kein Secret im Log; Mandantentrennung unberührt; nur `role=admin` sieht den Bereich
- [x] Doku + Git Push

> **PB-Verhalten verifiziert:** Eigen-Passwort-PATCH **ohne** `oldPassword` → 400 (abgelehnt),
> **mit** `oldPassword` → 200, Re-Login mit neuem Passwort → 200. Darum sendet `changeOwnPassword`
> `oldPassword` (+ „aktuelles Passwort"-Feld in der UI).

## Sicherheits-/Dimensions-Bezug
- **Security** — Self-Update nur des eigenen Passworts; PocketBase `users.updateRule = role=admin`
  erlaubt Admin den PATCH (inkl. eigener Record). Kunden bleiben ohne Self-Update (unverändert).
- Compliance/Personal-Data: E-Mail = personenbezogen, aber bestehende Verarbeitung; keine neue Quelle.

## Umsetzung (`webui/app.js`)
1. `renderAdmin`: Feld `#c-invited` (date, Default `toISOString().slice(0,10)`) ins Anlege-Formular.
2. `createCustomer`: `invited_at` aus `#c-invited`; `expires_at` = +365 Tage darauf.
3. Neuer Abschnitt „Mein Admin-Zugang" in `renderAdmin` (oben) + `changeOwnPassword()` →
   `PATCH /api/collections/users/records/{store.user.id}` `{password,passwordConfirm}`.

## Definition of Done
- [ ] Lokal verifiziert (Vertragsdatum→expires_at korrekt; Admin-Eigen-Passwort-Wechsel + Re-Login)
- [ ] Git push + CHANGELOG; Huly VOR-3 → Done

## Session-Referenz
- Datum: 2026-06-21
- Frontend-only (`webui/app.js`); PB-Eigen-Passwort-Verhalten (oldPassword) lokal verifiziert
- Commits: siehe Git-Historie (VOR-3)
