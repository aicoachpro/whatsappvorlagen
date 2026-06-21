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

### Akzeptanzkriterien (Slice 1) — lokal verifiziert 2026-06-21
- [x] Collection `tenant_secrets` (superuser-only Rules), idempotenter Setup-Agent — `agents/setup-tenant-secrets.js`
- [x] `POST /api/vor/superchat-key`: validiert via Test-Call, verschlüsselt (stored) / verwirft (session),
      upsert, gibt nur `{ok, validated, masked, wabaId, mode}` zurück — Test: gültiger Key → validated:true, `••••5d28`
- [x] `GET /api/vor/superchat-key`: Status `{configured, mode, wabaId, hasStoredKey}` ohne Klartext
- [x] `DELETE /api/vor/superchat-key`: entfernt die Anbindung
- [x] WABA-ID-Format `waba_…` (Pattern-Check) — Test: falsche WABA → 400
- [x] UI in Einstellungen: „SuperChat-Verbindung" (Key write-only, WABA-Feld, Modus-Wahl, Prüfen & Speichern, Entfernen)
- [x] Mandantentrennung: tenant aus `e.auth.tenant`; kein Key im Log/Response; at-rest Cipher ≠ Klartext (verifiziert)
- [x] Doku + Git Push

> **PocketBase-JSVM-Lesson:** Route-Handler laufen in isolierten VMs — Top-Level-Funktionen der
> `.pb.js`-Datei sind im Handler NICHT sichtbar (`tenantOf is not defined`). Helfer müssen IN den
> Handler inlined (oder via `require`). Globals `$app/$os/$security/$http/$apis` sind immer da.

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

## Slice 2 — Einzel-Push = Einreichen bei Meta (gebaut 2026-06-21)
`pb_hooks/superchat_push.pb.js` (Routen `POST /api/vor/push-template`, `GET /api/vor/push-log`) +
Audit-Collection `tenant_push_log` (superuser-only) + UI im Detail-Modal.

- **Effektive Vorlage serverseitig autoritativ** gebaut (Master ⊕ Overlay ⊕ Personalisierung) —
  nicht dem Client vertraut. `kategorie` Verwaltung→`utility`, Marketing→`marketing`; Sprache `de`.
- **Preview-zuerst (`action:"preview"`, KEINE Writes):** zeigt exakt Name/Kategorie/Sprache/Ordner/
  Buttons/Variablen/Warnungen. Bestätigung im UI, dann `action:"submit"`.
- **Ordner reuse-or-create:** `GET /template-folders` (Reuse) bzw. `POST /template-folders` (anlegen) → `folder_id`.
- **Submit:** `POST /v1.0/templates` (X-API-Key, WABA-ID, content, folder_id) → Status pending/approved/rejected.
- **Audit-Log** je Submit in `tenant_push_log`. Medien-Header → Warnung (nicht auto-übertragbar).
- Key: stored→serverseitig entschlüsselt; session→`sessionKey` aus dem Request.

### Akzeptanzkriterien (Slice 2)
- [x] Effektive Vorlage serverseitig gebaut + personalisiert (Firma + Links) — Preview verifiziert (Muster GmbH, muster-gmbh.de)
- [x] Preview ohne Writes; Compliance-Bestätigung vor Submit (UI)
- [x] Ordner-Auflösung (reuse-or-create) — Folder-List gegen echte SuperChat-API verifiziert
- [x] Audit-Log-Collection `tenant_push_log` + `GET /api/vor/push-log`
- [x] JSON-Felder korrekt gelesen (PocketBase JSONRaw → `JSON.parse(String(v))`)
- [ ] **Live-Submit gegen Meta** — bewusst NICHT in Dev ausgeführt (reicht real bei Meta ein, Quota/Quality).
      Braucht EINEN gezielten Operator-Test mit echter WABA-ID. Code folgt der dokumentierten API.

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
- Datum: 2026-06-21
- Slice 1 lokal gegen PocketBase 0.37.5 + echte SuperChat-API verifiziert (alle 6 Testfälle grün)
- Dateien: `agents/setup-tenant-secrets.js`, `pb_hooks/superchat_creds.pb.js`, `webui/app.js`
- Commits: siehe Git-Historie (VOR-9 Slice 1)
