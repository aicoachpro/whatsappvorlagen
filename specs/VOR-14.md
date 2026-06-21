# VOR-14 — Telegram: Registrierung + Verlängerungs-Anfrage

> Huly-Issue: VOR-14. Pre-Flight: ARCHITECTURE_DESIGN.md, CONVENTIONS.md gelesen.

## Intent
Thomas wird benachrichtigt, wenn (1) ein Kunde die Einladung annimmt (Erst-Login) und (2) eine
Verlängerung anfragt. (3) Fehler-Benachrichtigungen: Scope noch offen.

## Architektur (Hook setzt nur Flag — kein Container-Secret nötig)
`pb_hooks/telegram_notify.pb.js`:
- `onRecordAuthRequest("users")`: Erst-Login (kein `registered_at`, role≠admin) → setzt `registered_at`.
  Verifiziert: Erst-Login firstLogin=true, 2. Login false.
- `onRecordCreateRequest("renewal_requests")`: bei Anlage.
- **Telegram-Sofort-Ping nur, wenn `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` in der Container-Env**
  liegen (optional). Ohne Env: kein Ping — der tägliche `check-tenant-expiry`-Job meldet stattdessen.

`agents/check-tenant-expiry.js` (täglicher GitHub-Job, hat Telegram-Env):
- meldet neu registrierte Kunden (`registered_at` < 26h) + offene Verlängerungs-Anfragen.

`agents/setup-renewal.js`: legt `users.registered_at`-Feld an (live gesetzt).

## Akzeptanzkriterien
- [x] Erst-Login setzt `registered_at` (Hook, lokal verifiziert)
- [x] `registered_at`-Feld live angelegt
- [x] Täglicher Job meldet Registrierungen + Verlängerungs-Anfragen (Telegram)
- [x] Hook pingt sofort, falls Container-Telegram-Env vorhanden (graceful ohne)
- [ ] **Deploy:** `telegram_notify.pb.js` auf den Server kopieren (cp-Befehl, deploy-README) + Container neu starten
- [ ] **Optional (sofort statt täglich):** `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` in docker-compose-Env
- [ ] **Fehler-Benachrichtigungen:** Scope mit Operator klären (welche Fehler)

## Session-Referenz
- Datum: 2026-06-21
- Komponenten: `pb_hooks/telegram_notify.pb.js`, `agents/setup-renewal.js`, `agents/check-tenant-expiry.js`
