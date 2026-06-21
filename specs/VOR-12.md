# VOR-12 — CSV-Bulk-Import + Migrations-Willkommensmail

> Huly-Issue: VOR-12. Pre-Flight: ARCHITECTURE_DESIGN.md, CONVENTIONS.md gelesen.

## Intent
Bestandskunden per CSV anlegen; **nur neue** bekommen eine Willkommens-/Migrations-Mail mit
„Passwort setzen"-Link. Bestehende E-Mails werden übersprungen (kein erneutes Anschreiben).

## Entscheidung (geändert vs. ursprünglich)
Ursprünglich „separate, reichere Mail" gewünscht — technisch bräuchte das einen serverseitigen
Token (PocketBase-JSVM 0.37 stellt **keine** `$tokens`-Funktion zum Erzeugen eines Reset-Tokens
bereit; nur `$mails.sendRecordPasswordReset` + JWT-Helfer). Statt fragilem Token-Nachbau:
**reichere `resetPasswordTemplate`** = Migrations-Willkommensnachricht (via `setup-mail.js`), gesendet
über den **eingebauten** `request-password-reset`-Flow. Vorteil: **kein pb_hook, kein Terminal/SSH** —
läuft live, da webui auto-deployt und das Template per Settings-API gesetzt wird.
Nebeneffekt: „Passwort vergessen" zeigt im Migrationszeitraum denselben (freundlichen) Text — ok,
alle Nutzer sind neu in der App. Später slimmbar.

## Was (umgesetzt)
1. **CSV-Import im Admin** (`webui/app.js`): Datei (Latin-1/Semikolon) → Vorschau (neu vs. bestehend) →
   „neue anlegen & einladen" mit Pro-Zeilen-Status. Spalten-Mapping: `Kunde`→Name+Firma,
   `Vertragsstart`→`invited_at` (Lizenz +365), `E-Mail`→Login. Dedupe gegen vorhandene users + innerhalb CSV.
2. **Migrations-Mail** = `resetPasswordTemplate` (Notion→App, mehr Konfig, SuperChat-Knopfdruck,
   Video folgt, Passwort-setzen-Link). Nur neue Kunden lösen `request-password-reset` aus.

## Akzeptanzkriterien
- [x] CSV-Import: Latin-1/Semikolon, Titel-/Kopfzeile erkannt, Spalten gemappt
- [x] Bestehende E-Mails übersprungen (Dedupe gegen users + innerhalb CSV)
- [x] Neue Kunden: tenant + user + tenant_settings + Willkommens-Mail (request-password-reset)
- [x] Firma/Footer = Personenname (Kunde); Lizenz = Vertragsstart + 365
- [x] Migrations-Text im Template (setup-mail.js)
- [ ] **Operator-Lauf:** Test-Import (zuerst nur thomas@voelker.vip-Zeile / Test an dich), dann alle;
      Mail-Zustellung prüfen (ggf. „Kein Spam" markieren)

## Verifikation
- `node --check webui/app.js` grün. CSV-Parser/Encoding gegen die echte Kundenliste ausgelegt
  (Umlaute via `TextDecoder('windows-1252')`).
- Anlegen nutzt dieselben API-Calls wie das geprüfte `createCustomer` (VOR-3).

## Out of Scope
- Echt-separate Mail über eigenen Hook (verworfen, s. o.). Falls später gewünscht: pb_hook +
  Token-Workaround oder PB-Version mit `$tokens`.

## Session-Referenz
- Datum: 2026-06-21
- Komponenten: `webui/app.js`, `agents/setup-mail.js`
- Commits: siehe Git-Historie (VOR-12)
