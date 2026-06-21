# VOR-13 — Kunden-Verlängerungs-Dialog (Anfrage-Modell)

> Huly-Issue: VOR-13. Pre-Flight: ARCHITECTURE_DESIGN.md, CONVENTIONS.md gelesen.

## Intent
Abgelaufene Kunden sehen beim Login einen Verlängerungs-Screen und können eine Verlängerung
**anfragen**. Operator wird benachrichtigt (Telegram) und verlängert selbst (+1 Jahr/Laufzeit).
Kein Self-Service (Bezahlung via Stripe).

## Entscheidungen (Operator)
- Verlängerung = Anfrage, nicht Selbstbedienung.
- Abgelaufene dürfen einloggen, sehen aber nur den Verlängerungs-Screen.

## Umsetzung
1. **Rules (per API, `agents/setup-renewal.js`):**
   - `users.authRule` → `role = "admin" || tenant.status = "active" || tenant.status = "expired"`
     (expired darf rein; suspended bleibt blockiert). `tenants.viewRule` war schon korrekt (eigener Tenant).
   - Collection `renewal_requests` (tenant, handled): createRule = auth && eigener Tenant; lesen/erledigen = admin.
2. **App (`webui/`):** `boot()` → `maybeShowRenewal()`: bei abgelaufener Laufzeit Vollbild-Overlay
   „Laufzeit abgelaufen … — Verlängerung anfragen / Abmelden". Anfrage → POST `renewal_requests`.
   Admin-Kundenliste zeigt Badge „💶 Verlängerung angefragt" (verschwindet, sobald wieder aktiv).
3. **Telegram:** `check-tenant-expiry.js` (täglicher GitHub-Job) meldet zusätzlich offene
   Verlängerungs-Anfragen (verstummt automatisch, sobald Tenant wieder `active`).

## Akzeptanzkriterien
- [x] `users.authRule` erlaubt expired (live gesetzt); suspended bleibt blockiert
- [x] `renewal_requests` (createRule eigener Tenant) angelegt
- [x] App-Overlay bei Ablauf (status=expired ODER expires_at < heute), nicht für Admin
- [x] Anfrage schreibt `renewal_requests`; „Anfrage gesendet"-Bestätigung
- [x] Admin sieht offene Anfragen (Badge); täglicher Telegram meldet sie
- [ ] **Operator-Test:** Test-Kunde via „Laufzeit" auf Vergangenheit setzen → als Kunde einloggen →
      Overlay + Anfrage → Badge im Admin

## Out of Scope (→ VOR-14)
- Sofort-Telegram bei Anfrage (Hook + Container-Env) — aktuell täglicher Agent.
- Registrierungs-/Fehler-Benachrichtigungen.

## Session-Referenz
- Datum: 2026-06-21
- Komponenten: `agents/setup-renewal.js`, `agents/check-tenant-expiry.js`, `webui/app.js`, `webui/index.html`
