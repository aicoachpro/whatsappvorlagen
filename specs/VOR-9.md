# VOR-9 — Per-Tenant SuperChat-Key + Push-to-Meta (Einreichen zur Freigabe)

> Spec vor Code (CLAUDE.md Regel 1). Pre-Flight: ARCHITECTURE_DESIGN.md, CONVENTIONS.md, CONTEXT.md gelesen.
> Huly-Issue: VOR-9. Teil des Kern-Features `feature-kunden-self-service-superchat`.

## Intent
Jeder Kunde hinterlegt **seine eigene SuperChat-Anbindung** und reicht seine (personalisierten)
Vorlagen per Knopfdruck im **eigenen SuperChat-Account** ein. Ersetzt den manuellen 500-€-Service.
Skaliert für 20–30 Tenants, mandantengetrennt, Key niemals im Klartext nach außen.

## Recherche-Befund (2026-06-21, developers.superchat.com)
- **Kein „Entwurf".** `POST /v1.0/templates` reicht direkt bei **Meta zur Freigabe** ein →
  Status `pending` → `approved`/`rejected`. Pflichtfelder u. a. `name`, `whats_app_business_account_id`
  (`waba_…`), `content` {type `whats_app_template`, category `marketing|utility`, language, body,
  optional header/footer/buttons/variables}, optional **`folder_id`**.
- **Ordner automatisierbar:** `POST /v1.0/template-folders` ({name, parent_id?}) → `id` (`tn_…`);
  `folder_id` beim Template-Create mitgeben. Reuse-or-create über `GET /template-folders`
  (Namen nicht garantiert eindeutig).
- Auth: Header `X-API-Key`.

## Architektur-Entscheidung (neu: serverseitige Logik)
Heute: statisches Frontend → PocketBase (Daten); SuperChat nur via Node-Agenten (1 Master-Key).
Für Per-Kunde-Key braucht es **serverseitige** Ver-/Entschlüsselung + Outbound-Call (CORS!) →
**PocketBase-JS-Hooks (`pb_hooks/`)** als neues, in PocketBase eingebettetes Bauteil (kein Extra-Server).

**Krypto:** AES-256-GCM via `$security.encrypt/decrypt(data, key)`; Schlüssel `SUPERCHAT_ENC_KEY`
(32 Zeichen) nur in der **Server-Env**, nie in der DB. Ehrliche Grenze: schützt DB-Leak/Backup/Git,
**nicht** Server-Vollkompromittierung (Env + DB beim Root-Hack zusammen). Bei 20–30 Nutzern akzeptiert.

**Speichermodell (Operator-Entscheid „Komfort-Default"):**
- `stored` (Default): Key verschlüsselt at-rest, 1-Klick-Push jederzeit.
- `session`: Key wird **nicht** serverseitig gespeichert (nur Validierung); Frontend hält ihn in
  `sessionStorage`, Key muss bei Push erneut mitgegeben werden.
- Key-Feld **write-only**: Kunde sieht nie den Wert, nur `••••1234 hinterlegt`. Kein Key in Log/Response.

## Datenmodell — neue Collection `tenant_secrets` (NICHT client-lesbar)
- `tenant` (relation → tenants, unique, cascadeDelete)
- `sc_api_key_enc` (text, AES-Cipher; leer bei mode=session)
- `waba_id` (text; kein Secret)
- `mode` (select: stored | session)
- Rules: list/view/create/update/delete = `null` (**nur Superuser/Hooks**) — Browser kommt nie direkt ran.

## Slice 1 (DIESE Spec) — Einstellungen: Key + WABA-ID + Validierung
Kein Meta-Versand. Liefert genau das fehlende Eingabefeld + sichere Speicherung.

### Akzeptanzkriterien (Slice 1)
- [ ] Collection `tenant_secrets` (superuser-only Rules), idempotenter Setup-Agent
- [ ] `pb_hooks` Route `POST /api/vor/superchat-key` (requireAuth, tenant-scoped):
      validiert Key via SuperChat-Test-Call, verschlüsselt (mode=stored) oder verwirft (mode=session),
      upsert `tenant_secrets`. Gibt nur `{ok, validated, masked, wabaId, mode}` zurück — **nie den Key**.
- [ ] `GET /api/vor/superchat-key` (requireAuth): Status `{configured, masked, wabaId, mode}` ohne Klartext
- [ ] `DELETE /api/vor/superchat-key` (requireAuth): entfernt die Anbindung
- [ ] WABA-ID-Format `waba_…` (Pattern-Check)
- [ ] UI in Einstellungen: „SuperChat-Verbindung" (Key-Feld write-only, WABA-Feld, Modus-Wahl,
      „Prüfen & speichern", Status/„Entfernen")
- [ ] Mandantentrennung: Kunde sieht/setzt nur eigene Anbindung; kein Key im Log/Response
- [ ] Doku + Git Push

### Umsetzung
1. `agents/setup-tenant-secrets.js` (idempotent, Muster wie setup-tenant-settings.js).
2. `pb_hooks/superchat_creds.pb.js` — 3 Routen (POST/GET/DELETE), `$security.encrypt`,
   `$http.send` Test-Call gegen `${SUPERCHAT_BASE_URL}/templates?limit=1`.
3. `webui/app.js` `openSettings()`: Abschnitt „SuperChat-Verbindung" + Lade-/Speicher-Logik gegen die Routen.
4. `webui/index.html`/`styles.css`: minimal, vorhandene Klassen wiederverwenden.

### Sicherheits-/Dimensions-Bezug
- **Security** ✓ — write-only Key, serverseitige Krypto, superuser-only Collection, kein Klartext-Leak.
- **Compliance** — Slice 1 sendet nichts an Meta; Compliance-Gate erst in Slice 2 (Einreichen).
- **Maintainability** ✓ — folgt Rule-/Setup-Muster aus VOR-8.

## Slice 2 (separat) — Einzel-Push = Einreichen bei Meta
Effektive Vorlage (Master ⊕ Overlay ⊕ Personalisierung) → `POST /templates`; Ordner reuse-or-create
(`folder_id`); **Compliance-Bestätigung** vor Einreichen; Status-Report (pending/approved/rejected);
Audit-Log. Entschlüsselung serverseitig im Hook.

## Slice 3 (separat) — Bulk-Push
Alle Vorlagen, Pro-Vorlage-Status, Rate-/Fehler-Handling (SuperChat-Limits, Teil-Fehlschläge).

## Definition of Done (Slice 1)
- [ ] Setup-Agent idempotent gegen PB ohne Fehler
- [ ] Hook lokal getestet: gültiger Key → validated; falscher Key → Fehler; Key nie in Response/Log
- [ ] `SUPERCHAT_ENC_KEY` (32 Zeichen) in Server-Env dokumentiert (Deploy-README)
- [ ] Kein Secret im Code/Chat; sensible Daten maskiert
- [ ] Git push + CHANGELOG-Eintrag; neue Dateien in ARCHITECTURE_DESIGN.md §6 + INDEX.md
- [ ] Huly-Issue-Kommentar mit AC-Verifikation

## Session-Referenz
<!-- /implement trägt hier Session-Infos ein -->
- Datum: …
- Commits: …
