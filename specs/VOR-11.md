# VOR-11 — E-Mail/SMTP: Passwort-vergessen + Willkommens-Mail

> Huly-Issue: VOR-11. Pre-Flight: ARCHITECTURE_DESIGN.md, CONVENTIONS.md gelesen.

## Intent
Self-Service rund ums Passwort: (1) ausgesperrte Kunden setzen ihr Passwort über „Passwort
vergessen?" selbst neu; (2) neue Kunden erhalten automatisch eine Willkommens-Mail mit einem
**„Passwort setzen"-Link** — der Admin muss keine Zugangsdaten mehr manuell weitergeben.

## Wurzel-Befund
Die Plattform hatte **keinen E-Mail-Versand** (kein SMTP). Beide Wünsche hängen daran.

## Entscheidungen (Operator 2026-06-21)
- Versand via **eigenem Mailserver/Postfach** (PocketBase-Mail-Settings, Credentials nur dort).
- Willkommens-Mail = **„Passwort setzen"-Link** (kein Klartext-Passwort).

## Architektur
PocketBase-eingebauter Mailversand + Auth-Flows:
- `POST /api/collections/users/request-password-reset` {email} → PB mailt Reset-Link.
- `POST /api/collections/users/confirm-password-reset` {token, password, passwordConfirm}.
- Mail-Template-Link → `{APP_URL}/?reset={TOKEN}`; webui liest `?reset=` und zeigt die Setz-Seite.
- Willkommen = beim Anlegen zusätzlich `request-password-reset` (gleicher generischer Mail-Flow).

## Akzeptanzkriterien
- [x] „Passwort vergessen?"-Link im Login → `request-password-reset`; neutrale Datenschutz-Meldung
- [x] Reset-Seite (Token aus `?reset=`) setzt neues Passwort via `confirm-password-reset` (min. 8, Match-Check)
- [x] `createCustomer` löst Willkommens-Mail aus; **Backup-Passwort** als Fallback sichtbar (SMTP-unabhängig)
- [x] Kein Klartext-Passwort per Mail (Set-Link-Flow); Mandantentrennung unberührt
- [x] Endpoints lokal verifiziert (request → 204, confirm bad-token → 400; keine 404)
- [x] Operator-Doku: PB-Mail-Settings + App-URL + Template (`deploy/vorlagen/README.md`)
- [ ] **End-to-End mit echtem SMTP** — Operator richtet PB-Mail ein + testet (Mail kommt an, Link funktioniert)

## Verifikation
- `node --check webui/app.js` grün; Endpoints gegen lokale PB 0.37.5 getestet.
- E2E erst nach SMTP-Setup durch Operator (PB-Mail-Settings).

## Out of Scope
- Eigene HTML-Mail-Templates/Branding (PB-Standard-Template reicht zunächst).
- E-Mail-Verifikation beim Login (separat).

## Session-Referenz
- Datum: 2026-06-21
- Komponenten: `webui/index.html`, `webui/app.js`, `webui/styles.css`, `deploy/vorlagen/README.md`
- Commits: siehe Git-Historie (VOR-11)
