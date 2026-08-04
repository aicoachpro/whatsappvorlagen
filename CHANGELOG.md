# WhatsAppVorlagen SuperChat — Changelog

## 2026-08-04

### Der Auto-Deploy lief seit jeher auf dem falschen Server

**Symptom:** Die am 29.07. fertiggestellte Mehrbenutzer-Verwaltung war am Folgetag live nicht zu sehen. Auch nach manuellem Kopieren im Browser-Terminal nicht.

**Befund:** `vorlagen.voelkergroup.cloud` löst auf **72.62.63.41 = srv1186348** auf. Die gesamte Doku (`deploy/vorlagen/README.md`, `CONVENTIONS.md`, `specs/VPS_PLATTFORM_KONZEPT.md`, `docker-compose.yml`) nannte **srv1537054 / 187.124.165.1**. Dort liegt eine vollständige Kopie — Repo-Klon `/root/vorlagen-src`, Deploy-Key, `/opt/vorlagen-pb/pb_public/` und der Cron `*/2 * * * *`. Der pullte zuverlässig und kopierte ins Leere. Auf dem echten Server gab es weder Klon noch Cron: dort wurde **nie** automatisch deployt.

| Betroffen | Eingefroren seit | Wirkung |
| --- | --- | --- |
| `webui/` | 03.07.2026 | Mehrbenutzer-Verwaltung und Papierkorb kamen nie beim Kunden an |
| `pb_hooks/` | 22.06.2026 | `attribute_identifier`-Fix fehlte → Push-Fehler bei Herger Verwaltungs GmbH |

Damit ist der Kundenfehler vom 29.07. abschließend erklärt — die Diagnose „Server läuft veralteten Hook-Code" stimmte, nur war der untersuchte Server der falsche.

**Behoben:** Auto-Deploy auf srv1186348 eingerichtet (Klon `/root/vorlagen-src` über HTTPS, `/root/vorlagen-deploy.sh`, Cron `*/2 * * * *`). Das Skript liefert jetzt **auch `pb_hooks/`** aus — bei Änderung per `cmp` erkannt, gefolgt von `docker restart vorlagen-pb`. Die bisherige „optionale" Hook-Kopie von Hand entfällt.

**Live verifiziert:** `app.js` = 64.646 Bytes (= Repo-Stand), `addUserToTenant`/`cust-group`/`emptyTrash` vorhanden, `/api/health` = 200.

**Lehre für die Diagnose** — zwei Sekunden-Checks von außen hätten das sofort aufgedeckt und stehen jetzt in `deploy/vorlagen/README.md`:

```bash
curl -sI https://vorlagen.voelkergroup.cloud/app.js | grep last-modified   # Datum vs. letzter Commit
dig +short vorlagen.voelkergroup.cloud                                     # IP vs. Doku
```

Widerspricht ein Fehlerbild dem Repo-Code, ist zuerst zu prüfen, ob der Server den Code überhaupt hat — und ob es der richtige Server ist.

## 2026-07-29 (2)

### Push-Fehler beim Kunden: Server läuft veralteten Hook-Code
**Symptom:** Herger Verwaltungs GmbH (eigener SuperChat-Key) reicht „AVR 2027 Sie in Automation" ein → `SuperChat 400: Ungültiger Parameter: attribute_identifier`.

**Ursache — nicht kundenspezifisch, sondern ein Deploy-Loch:**
- Derselbe Fehler steht im `tenant_push_log` auch für Tenant „Thomas Völker" („Allgemeiner Unterhaltungsstarter Du", „Kunde hat gekündig Sie").
- Das Format, das der Repo-Hook sendet, wird von SuperChat **akzeptiert** — live verifiziert: `{position:1, type:"static", attribute_identifier:"wildcard"}` → **HTTP 200** (Testvorlage sofort gelöscht). Der wildcard-Fallback für Smart-Attribute wie „Informelle Grußformel" funktioniert also.
- Im Kunden-Screenshot fehlt die wildcard-Warnung, die der aktuelle Hook für genau diese Variable erzeugen würde ([app.js:311](webui/app.js#L311) rendert `p.warnings`).
- **`pb_hooks/` wird vom Auto-Deploy nicht ausgeliefert** — so dokumentiert in `deploy/vorlagen/README.md` („nur `webui/` → `pb_public/`, **nicht** `pb_hooks/` … bei jeder Hook-Änderung erneut"). Die automatische Variante steht dort als „optional" und wurde nie eingerichtet.

→ Auf dem Server liegt ein Stand **vor Commit `31a1b79`** (attribute_identifier-Mapping, ~22.06.). Der sendet das Feld gar nicht; SuperChat meldet ein fehlendes Pflichtfeld als „Ungültiger Parameter: X". **Fix = Hook-Deploy** (hPanel-Browser-Terminal, SSH ist gesperrt), keine Code-Änderung nötig.

### SuperChat-Multi-Variablen-Bug ist behoben — 195 Vorlagen wieder einreichbar
Der HTTP-500-Crash ab 2 Variablen (Blocker seit 2026-06-23) existiert nicht mehr. Gegengeprüft: `first_name + wildcard` → 200, `wildcard + wildcard` → 200 (beide Testvorlagen sofort gelöscht). Von 284 aktiven Vorlagen haben 195 zwei oder mehr Variablen — die waren bis jetzt gar nicht per Knopfdruck einreichbar. Der 500er-Zweig im Hook bleibt als Sicherheitsnetz, Kommentar und Kundenmeldung auf den aktuellen Stand gebracht.

### Mehrere Benutzer pro Kunde
**Befund:** Das Datenmodell konnte das längst — `users.tenant` ist eine Relation, und Overlays, Einstellungen sowie der SuperChat-Key hängen am **Mandanten**, nicht am Benutzer. Es fehlte nur die Oberfläche.

**Kritischer Fallstrick vorab behoben:** `deleteCustomer()` löschte **immer** Benutzer *und* Mandant. Da `tenants` per `cascadeDelete` an den Overlays hängt, hätte das Entfernen einer Person alle Vorlagen-Anpassungen und die SuperChat-Verbindung des gesamten Kunden vernichtet — auch für die verbleibenden Kollegen.

- Kundenliste ist nach Mandant gruppiert (Kopfzeile = Kunde mit Laufzeit-Aktionen, darunter seine Benutzer) statt einer flachen Benutzerliste.
- **„+ Benutzer"** pro Kunde: legt einen weiteren Login im selben Mandanten an, mit demselben Onboarding wie bei Neukunden (Willkommens-Mail mit Passwort-Link, Backup-Passwort als Fallback).
- Löschen unterscheidet jetzt: weitere Benutzer vorhanden → nur der Benutzer geht, Mandant und Anpassungen bleiben („Entfernen"); letzter Benutzer → Mandant mit Rückfrage, die die Folgen ausdrücklich benennt.

**Verifiziert gegen Live** (temporäre Testdaten, restlos entfernt): 9/9 — zwei Benutzer im selben Mandanten, beide login-fähig, geteilter Anpassungsstand in beide Richtungen, und nach Entfernen des zweiten Benutzers bleiben Mandant, Anpassung und der erste Benutzer erhalten.

## 2026-07-29

### Täglicher Superchat-Sync mit Papierkorb — der Sync lief seit 8 Wochen gar nicht
**Befund:** Der erwartete tägliche Abgleich existierte nie. `agents/sync-superchat-to-pb.js` war ein reines npm-Script ohne Scheduler — in `.github/workflows/` lagen nur Health- und Lizenz-Check. Letzter Lauf laut `journal/audit.log`: **2026-06-01 06:34 UTC**, danach 58 Tage nichts. In der Zwischenzeit sind in Superchat 19 Vorlagen entstanden, die auf der Plattform fehlten (269 PB-Records vs. 284 in Superchat). Zwei Folgefehler hätten den Job auch dann blockiert, wenn er gelaufen wäre: das Skript las Credentials ausschließlich per `fs.readFileSync` aus `.env` (in CI nicht vorhanden), und `SUPERCHAT_API_KEY` war nie als Repo-Secret hinterlegt.

**Zweiter Befund — Löschen war nie implementiert:** `syncOne()` machte ausschließlich Upsert per `superchat_id`. Ein Abgleich der PB-Records gegen die Superchat-Liste fehlte vollständig, in Superchat gelöschte Vorlagen wären dauerhaft stehen geblieben.

**Dritter Befund — irreführender Kontrakt:** Der Kopfkommentar versprach, `kategorie`/`ordner`/`buttons` würden „NIE überschrieben" — `buildScFields()` schrieb genau diese drei Felder. Bei manuellen Läufen fiel das kaum auf; ein täglicher Job hätte die gepflegte Kategorisierung jede Nacht überbügelt. Aufgelöst zugunsten von **Superchat = Master** (Entscheidung Thomas), Kommentar korrigiert. Reine Völker-Felder (`ueberschrift`, `urls`, `telefonnummer`, `schnellantwort`, `notizen`, `vorschaubild`) und alle Kunden-Overlays bleiben unangetastet.

**Umgesetzt:**
- **`.github/workflows/sync-superchat.yml`** — täglich 05:00 UTC + manuell auslösbar (`dry_run`, `force`). Skript liest jetzt `process.env` mit `.env`-Fallback, läuft also lokal wie in CI.
- **Papierkorb statt Hard-Delete (ADR-05):** verschwundene Vorlagen bekommen `geloescht_am` gesetzt. Als Flag im Record, **nicht** als eigene Collection — `template_overlays` hängt per `cascadeDelete` an `templates`, ein Umzug hätte die Kunden-Personalisierungen mitgerissen. Taucht eine Vorlage in Superchat wieder auf, holt der nächste Lauf sie automatisch zurück (`restore`).
- **Schutzschwelle gegen Teilantworten:** fehlen >10% der aktiven Records (und mind. 5 Stück), wird **nichts** in den Papierkorb verschoben — stattdessen Telegram-Warnung + Exit 1. Bewusstes Großaufräumen per `force`-Input. Eine Antwort mit 0 Vorlagen bricht immer ab. `--limit` überspringt den Papierkorb-Abgleich komplett (eine gekürzte Liste hätte sonst alles andere als gelöscht markiert).
- **Sichtbarkeit serverseitig:** `listRule`/`viewRule` der `templates`-Collection filtern gelöschte für Kunden weg (`@request.auth.role = "admin" || geloescht_am = ""`), nicht nur im Frontend.
- **„Gelöscht"-Tab in der WebUI** (nur `role=admin`): zeigt Papierkorb-Inhalt mit Löschdatum, einzeln oder alle auf einmal endgültig löschbar. `deleteRule` war bereits admin-only.
- **Totmann-Schalter:** Der Sync schreibt bei jedem sauberen Lauf einen Heartbeat nach `sync_state`; `health-check.js` meldet per Telegram, wenn >48h kein Erfolg vorliegt (Cooldown 24h, damit nicht 48 Pings/Tag rausgehen). Genau die Lücke, durch die der Stillstand 8 Wochen unbemerkt blieb.
- **Telegram nur bei Änderungen oder Fehlern** — ruhige Läufe bleiben still.
- **Nebenbei behoben:** `syncOne()` machte pro Template eine eigene `findBySuperchatId`-Abfrage (284 Requests); PB-Records werden jetzt einmal geladen und über eine Map aufgelöst. Superchat-Calls haben Retry mit Backoff, weil eine Teilantwort hier wie eine Massenlöschung aussähe.

**Dry-Run-Verifikation gegen Live:** 284 Superchat-Templates, 19 create, 265 update, 4 Papierkorb-Kandidaten (Tippfehler- und „Kopie"-Dubletten), 0 Fehler. Schwelle greift korrekt nicht (4 < 5).

## 2026-07-14

### Ursache der Health-Check-Fehlalarme gefunden (VOR-15)
**Der VPS verwirft die Pakete einzelner GitHub-Runner-IPs stillschweigend (DROP). Der Server ist gesund, Kunden sind nicht betroffen.**

Beweisführung:
- **IP-spezifisch, nicht Server-Problem:** 20 Runner kontaktierten den Server *gleichzeitig* — 19 kamen durch (HTTP 200, connect ~0,2s), **einer lief in den Timeout** (`48.217.107.113`, connect=0.000000s). Derselbe Server, dieselbe Sekunde. Quote 1/20 = 5 %, deckt sich mit der Produktionsrate (12 Fehl-Runs seit 07.07.).
- **Server nachweislich gesund:** Hostinger-Metriken zu allen 5 Ausfallzeitpunkten am 12.07.: CPU **0,61–0,67 %**, RAM 1,55/8 GB, Uptime monoton steigend (**kein Neustart**), Traffic unauffällig. Überlastung, Crash und Reboot sind damit ausgeschlossen.
- **DROP, nicht REJECT:** kein RST, kein ICMP, Traceroute stumm („Destination not reached"). **Port 80 ebenfalls dicht** → kein Dienst-/Port-Problem, die ganze IP wird verworfen. Auch nach 60 s noch blockiert.
- **Nicht die Hostinger-Firewall:** die erlaubt 80/443 von `any`. Gegenprobe: SSH-Regel für die eigene IP angelegt + synchronisiert → **Port 22 blieb trotzdem DROP** (8 s Timeout, identische Signatur). Es gibt also einen **zweiten Paketfilter auf dem Server selbst** (unterhalb der Hostinger-Firewall) — dort sitzt die Blockade. Regel danach wieder entfernt, Firewall im Ursprungszustand.
- **Keine Blocklist-Ursache:** die geblockte IP steht zwar auf Spamhaus — aber `172.172.86.230` mit *identischem* Listing-Muster kam gleichzeitig problemlos durch. Widerlegt (Spamhaus `127.0.0.4` trifft Azure-Ranges pauschal).
- **Kein IPv6-Problem:** kein AAAA-Record, Node löst ausschließlich IPv4 auf.

**Nicht abschließend geklärt:** *welches* Tool auf dem Server bannt (fail2ban / CrowdSec / ufw-Regel). Der Server ist per SSH nicht erreichbar — durch genau denselben DROP-Mechanismus. Weiter käme man nur über einen Recovery-Boot (= Kunden-Downtime), unverhältnismäßig. Vermutung: fail2ban/CrowdSec bannt Azure-IPs mit Scan-Vorgeschichte (durch Vorbesitzer der IP), nicht wegen unseres Monitorings.

**Konsequenz:** Die 90-s-Gegenprobe aus dem Vorgänger-Fix **hilft hier nicht** — beide Prüfrunden laufen auf demselben Runner mit derselben blockierten IP (belegt durch den Fehl-Run 13.07. 23:24 *nach* dem Fix). Von einem einzelnen Punkt aus sind „VPS weg" und „meine IP gebannt" grundsätzlich nicht unterscheidbar. GitHub-Runner sind als Monitoring-Quelle für diesen Server untauglich → Umstieg auf externen Uptime-Dienst mit Multi-Standort-Prüfung (VOR-16).

## 2026-07-13

### Health-Check: Telegram-Fehlalarme abgestellt (VOR-15)
- **Befund:** 9 Telegram-Störungsmeldungen in 4 Tagen (1× 10.07., 3× 11.07., 5× 12.07.) — **alle Fehlalarme**, die Plattform lief durchgehend. Jeder Fehl-Run zeigte dasselbe Muster `PB=0 Site=0 Hook=0`: Status 0 = `fetch` hat geworfen, es kam gar keine HTTP-Antwort an. Nie ein echter Fehlercode (kein 502/503) — bei einem realen Ausfall hätte Traefik mindestens einmal einen 5xx geliefert. Telegram ging in denselben Runs raus (`gesendet ✓`), der Runner hatte also Netz, kam aber nicht an den VPS. Ursache: **GitHub-Runner erreichen den VPS sporadisch nicht**, `health-check.js` hatte keinen Retry und alarmierte beim ersten Blip.
- `agents/health-check.js`: **Retry pro Check** (3 Versuche, Backoff — fängt Sekunden-Blips) + **Gegenprobe nach 90s** (fängt Minuten-Blips). Alarm erst, wenn die Störung beides überlebt. Echte Ausfälle werden weiterhin gemeldet, nur ~90s später. Verifiziert gegen Mock-PB: Blip (30s tot → gesund) = kein Alarm/exit 0; Totalausfall = Telegram/exit 1.
- **Fehlergrund landet jetzt im Log**, nicht nur im Telegram — vorher wurde `err` weggeworfen und die Ursache war nachträglich nicht diagnostizierbar. Node verpackt Netzwerkfehler als nichtssagendes `TypeError: fetch failed`; der echte Grund steckt in `e.cause` und wird jetzt ausgelesen: `PB=ECONNREFUSED` (Server weg) vs. `PB=Timeout nach 15s` (Verbindung hängt, Firewall/Netz).
- **Hook-Check war falsch-negativ:** prüfte nur auf 404 und 0 — ein 500/502 galt als bestanden, obwohl der Docstring „→ 401" versprach. Prüft jetzt auf 401; 5xx = Störung (gegen Mock verifiziert). 5xx wird zusätzlich als transient-verdächtig behandelt und wiederholt.
- `telegram()` hatte **keinen Timeout** (anders als in `check-tenant-expiry.js`) und verschluckte Versandfehler — beides gefixt.
- `agents/check-tenant-expiry.js`: `mailByTenant` **überschrieb** bei mehreren Nutzern pro Mandant (willkürlich der letzte gewann → falsche Kontakt-Mail in der Meldung). Zeigt jetzt alle Adressen.
- `pb_hooks/telegram_notify.pb.js`: Registrierungs-Meldung las nur `name`, während der restliche Code `firma || name` nutzt — bei gepflegtem `firma`-Feld stand dort nur die E-Mail.

## 2026-06-24

### SuperChat-Bug bei 2+ Variablen abgefangen (VOR-9)
- Live-E2E-Test ergab: SuperChats `POST /v1.0/templates` crasht reproduzierbar mit **HTTP 500 bei Templates mit 2+ Variablen** (1 Variable funktioniert). Externer SuperChat-Bug, nicht unser Code (Schema/Mapping verifiziert korrekt). Re-Test 2026-06-24: weiterhin 500. SuperChat-Support-Repro liegt vor.
- `pb_hooks/superchat_push.pb.js`: Multi-Var-500 wird jetzt mit klarer Kundenmeldung abgefangen („Vorlage mit mehreren Variablen — SuperChat kann das aktuell nicht per Knopfdruck annehmen, bitte direkt in SuperChat anlegen") statt rohem „SuperChat 500". Greift auch im Bulk-Push (gleiche Route).
- Einzel-Variablen-Templates bleiben voll push-fähig.

## 2026-06-22

### Variablen-Templates push-fähig — `attribute_identifier` geklärt (VOR-9)
- Monatelanger Blocker gelöst: SuperChats Create verlangt pro Variable `{ position, attribute_identifier }`. `attribute_identifier` = Standard `first_name | last_name | gender | wildcard` **oder** die `ca_…`-ID eines Custom-Contact-Attributs (Doku `createatemplate-1` + live in Thomas' Account verifiziert; 3 Test-Templates erstellt und wieder gelöscht).
- Ursache der 400er: Read ≠ Create. Custom-Attr liefert beim Lesen `attribute_id` (anderer Feldname), Standard-Attr liefern gar keinen Identifier (`type:"static"`).
- `pb_hooks/superchat_push.pb.js`: Variablen-Rückübersetzung — `attribute_id`-Auto für Custom, `STD_VAR_MAP` (Vorname→first_name, Nachname→last_name, Freitext→wildcard), `wildcard`-Fallback für Smart-/Sender-Attribute (Aktueller Benutzer, Grußformel, Workspacename — kein API-Pendant) mit sichtbarer Preview-Warnung.
- `agents/probe-template-variables.js`: Probe-Tool (Default read-only Recon, `--create … --confirm` schreibt real).
- **Offen:** Hook deployen + Operator-Live-Submit eines echten Variablen-Templates (prüft `wildcard` ohne Beispielwert gegen Meta).

## 2026-06-21

### Telegram: Registrierung + Verlängerungs-Anfrage (VOR-14)
- `pb_hooks/telegram_notify.pb.js`: Erst-Login eines Kunden setzt `users.registered_at` (lokal verifiziert); optional Sofort-Telegram bei Registrierung/Anfrage, wenn `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` in der Container-Env liegen (graceful ohne).
- `check-tenant-expiry.js` (täglicher Job) meldet zusätzlich neu registrierte Kunden + offene Verlängerungs-Anfragen. `registered_at`-Feld via `setup-renewal.js` live angelegt.
- Deploy: `telegram_notify.pb.js` per cp auf den Server (deploy-README).
- **Störungs-Monitor:** `agents/health-check.js` + `.github/workflows/health-check.yml` (alle 30 Min) prüfen PB/Website/Hooks/Login und melden Ausfälle per Telegram (gesund = still). Gegen Live verifiziert.

### Kunden-Verlängerungs-Dialog (VOR-13)
- Abgelaufene Kunden dürfen einloggen (`users.authRule` um `tenant.status="expired"` erweitert; suspended bleibt blockiert) und sehen ein Vollbild-Overlay „Laufzeit abgelaufen — Verlängerung anfragen" (`webui/`). Anfrage → neue Collection `renewal_requests` (`agents/setup-renewal.js`).
- Admin-Kundenliste zeigt Badge „💶 Verlängerung angefragt"; täglicher Telegram-Job (`check-tenant-expiry.js`) meldet offene Anfragen (verstummt, sobald wieder aktiv).
- Verlängerung bleibt Operator-Aktion (Anfrage-Modell, kein Self-Service).

### CSV-Bulk-Import + Migrations-Willkommensmail (VOR-12)
- **CSV-Import im Admin** (`webui/app.js`): Datei (Latin-1/Semikolon) → Vorschau (neu vs. bestehend, Bestehende übersprungen) → „neue anlegen & einladen" mit Pro-Zeilen-Status. Mapping: `Kunde`→Name+Firma, `Vertragsstart`→Lizenzbeginn (+365), `E-Mail`→Login.
- **Migrations-Mail** = reicheres `resetPasswordTemplate` (Notion→App, mehr Konfig, SuperChat-Knopfdruck, Video folgt, „Passwort setzen"-Link), gesendet über den eingebauten `request-password-reset`-Flow — **kein pb_hook/Terminal nötig**. Befund: PocketBase-JSVM 0.37 hat keine `$tokens`-Token-Funktion → separater Hook-Versand verworfen.
- Absender-Name „Völker Vorlagen" (Spam-Trigger „WhatsApp" entfernt).

### E-Mail-Flows: Passwort-vergessen + Willkommens-Mail (VOR-11)
- **Login:** „Passwort vergessen?" → PB `request-password-reset` (neutrale Meldung); **Reset-Seite** liest `?reset=TOKEN` und setzt neues Passwort via `confirm-password-reset`.
- **Onboarding:** `createCustomer` löst automatisch eine Willkommens-Mail mit „Passwort setzen"-Link aus (kein Klartext per Mail); **Backup-Passwort** bleibt als Fallback sichtbar (funktioniert auch ohne SMTP).
- **`agents/setup-mail.js`** (`npm run setup:mail`): konfiguriert PB-Mail automatisch (SMTP smtp.hostinger.com + App-URL + Reset-Template-Link auf die Kunden-UI) per Settings-API; Postfach-Passwort aus `.env` (`MAIL_PASSWORD`). Gegen lokale PB verifiziert (Settings- + Template-PATCH → 200).
- Endpoints lokal verifiziert (request → 204, confirm bad-token → 400). **E2E braucht** nur noch: Postfach existiert (✓) + `MAIL_PASSWORD` in `.env` + `npm run setup:mail` (`deploy/vorlagen/README.md`).

### Notion abgeschaltet (VOR-2)
- Notion gekündigt & abgeklemmt. Gelöscht: `agents/sync-superchat-to-notion.js`, `agents/notion-enrich-to-pb.js`. `agents/test-env.js` Notion-Health-Check entfernt; `package.json` ohne `sync:notion`/`enrich:pb`, Beschreibung aktualisiert.
- Doku-SSoTs bereinigt (CLAUDE.md, ARCHITECTURE_DESIGN, SYSTEM_ARCHITECTURE-„veraltet"-Banner, COMPONENT_INVENTORY, INDEX, SECURITY) — Notion nur noch Historie. PocketBase ist alleinige Auslieferungs-Plattform.
- **Operator-Aktion:** `NOTION_TOKEN` + `NOTION_DATABASE_ID` aus `.env` entfernen.

### Verifiziert & abgeschlossen: Per-Tenant Overlay-Edit (VOR-1)
- Migrierte Story verifiziert + Spec nachgezogen (`specs/VOR-1.md`): effektive Galerie/Vorschau (`effective()`), tenant-scoped Overlay-Edit, Personalisierung (live im Browser), Cross-Tenant-Isolation via `tests/tenant-isolation.js`. Keine Code-Änderung — Doku/Abschluss.

### Admin: Eigen-Passwort + Vertragsdatum (VOR-3)
- **Admin-Eigen-Passwort in der UI:** Abschnitt „Mein Admin-Zugang" — Admin setzt sein eigenes Passwort selbst (PATCH eigener Record mit `oldPassword`; kein Skript/DB-Eingriff mehr). PB-Verhalten verifiziert (ohne `oldPassword` → 400, mit → 200, Re-Login ok).
- **Vertragsdatum beim Kunden-Anlegen:** neues `date`-Feld (Default heute) → `invited_at`; `expires_at` = Vertragsdatum + 365 Tage (Admin tippt kein Ablaufdatum).

### Per-Tenant SuperChat-Key — verschlüsselt (VOR-9, Slice 1)
- **`agents/setup-tenant-secrets.js`** — neue **superuser-only** Collection `tenant_secrets` (`sc_api_key_enc`, `waba_id`, `mode`); Browser kommt nie direkt ran.
- **`pb_hooks/superchat_creds.pb.js`** — neues serverseitiges Bauteil (PocketBase-JS-Hooks): Routen `POST/GET/DELETE /api/vor/superchat-key`. Validiert den Key per SuperChat-Test-Call, **verschlüsselt** ihn at-rest (AES-256-GCM via `$security.encrypt`, Schlüssel `SUPERCHAT_ENC_KEY` nur in Server-Env), gibt **nie** den Klartext zurück. Modi: `stored` (1-Klick) / `session` (nicht speichern).
- **Kunden-UI** (`webui/`): Einstellungen-Abschnitt „SuperChat-Verbindung" (Key write-only, WABA-ID, Modus-Wahl, Prüfen & Speichern, Entfernen).
- **Befund:** SuperChat hat **kein „Entwurf"** — `POST /templates` reicht direkt bei Meta zur Freigabe ein (Slice 2). Ordner per `POST /template-folders` + `folder_id` automatisierbar.

### SuperChat-Push = Meta-Einreichung (VOR-9, Slice 2)
- **`pb_hooks/superchat_push.pb.js`** — Routen `POST /api/vor/push-template` (action `preview`/`submit`) + `GET /api/vor/push-log`. Baut die **effektive Vorlage serverseitig autoritativ** (Master ⊕ Overlay ⊕ Personalisierung), löst Ordner reuse-or-create (`folder_id`), reicht via `POST /v1.0/templates` bei Meta ein (Status pending/approved/rejected).
- **`tenant_push_log`** (superuser-only) — Audit je Einreichung; Setup in `agents/setup-tenant-secrets.js`.
- **Kunden-UI:** Detail-Modal „📤 Direkt an SuperChat einreichen" — Preview (zeigt exakt was gesendet wird, keine Writes) → Compliance-Bestätigung → verbindliches Einreichen + Status.
- **Verifiziert:** Preview + Personalisierung + Folder-List gegen echte SuperChat-API (lokal). **Live-Submit bewusst nicht in Dev ausgeführt** (reicht real bei Meta ein) — braucht gezielten Operator-Test.
- **JSVM-Fix:** PocketBase liefert JSON-Felder als Roh-Bytes → über `JSON.parse(String(v))` lesen.

### Bulk-Push (VOR-9, Slice 3)
- Topbar-Button „📤 Alle einreichen" (sichtbar wenn SuperChat verbunden) → Bestätigungs-Overlay mit Pro-Vorlage-Statusliste; sequenzielle Submits über die geprüfte Single-Route, 250 ms Pause gegen Rate-Limits, Continue-on-Error + Summary.

### UI-Modernisierung — Design-System v2 (VOR-10)
- `webui/styles.css` komplett überarbeitet: Verlaufs-Topbar + Brand-Badge, Pill-Filter mit aktivem Verlauf, erhöhte Karten mit Hover-Lift & gestaffelten Schatten, glasige Modals (Backdrop-Blur, Slide-in), Verlaufs-Buttons mit Gloss/Shadow, Fokus-Ringe, Hintergrund-Verläufe; `prefers-reduced-motion` respektiert. Alle Klassennamen erhalten (kein JS-Bruch).
- Per Puppeteer gerendert/verifiziert (Login, Galerie, Detail-Modal).

## 2026-06-19

### Issue-Tracker Linear → Huly migriert
- Aktiver Tracker ist jetzt **Huly** (Workspace „VOELKER AI", Projekt `VOR`, Präfix `VOR-`). 8 offene Stories migriert (VOR-1…8), Linear-Originale (`VOE-`) auf Canceled + Migrations-Kommentar; Done/Canceled-Historie bleibt in Linear.
- `.claude/environment.json` (`backlog.adapter: huly`) + CLAUDE.md/CONVENTIONS.md/CONTEXT.md/AGENTS.md/ARCHITECTURE_DESIGN.md nachgezogen.

### Kunden-Self-Service: Firma + Links selbst pflegen (VOR-8)
- **`agents/setup-tenant-settings.js`** — neue tenant-scoped Collection `tenant_settings` (`firma`, `ersetzungen`) + Migration bestehender Kunden. Kundeneditierbare Felder von den Lizenzfeldern am `tenants` getrennt → Kunde kann **nicht** seine eigene Lizenz (`expires_at`/`status`) ändern.
- **Kunden-UI** (`webui/`): neue Einstellungen-Seite (⚙️) — jeder Kunde pflegt Firmenname (Footer) + personalisierte Links selbst; `personalize()` liest aus `tenant_settings`. Admin-Onboarding legt `tenant_settings` mit an.

## v1.0.0 — 2026-06-02

### Telegram-Anbindung + automatischer Lizenz-Check (VOE-247)
- `agents/setup-telegram.js` — ermittelt Chat-ID aus Bot-Updates, schreibt `TELEGRAM_CHAT_ID` in `.env`, sendet Test-Nachricht
- Bot `@voelker_vorlagen_bot` verbunden, Test erfolgreich zugestellt
- Fix: Token wurde nicht erkannt, weil die `.env`-Zeile auskommentiert (`#`) war
- **`.github/workflows/lizenz-check.yml`** — täglicher GitHub-Actions-Lauf (06:00 UTC) von `check-tenant-expiry.js`; ersetzt den geplanten VPS-Cron (SSH netzseitig gesperrt). Zugangsdaten als GitHub-Secrets, Dry-Run-Test erfolgreich
- VOE-247 damit abgeschlossen (Schema, Login-Sperre, +1-Jahr-Button, Erinnerung, Admin-Hervorhebung)

## v1.0.0 — 2026-06-01

### User-Verwaltung + Infrastruktur (VOE-246, VOE-237)
- **Kundenverwaltung** (Admin-Onboarding): Admin-Bereich in der Kunden-UI (nur role=admin) — Kunden anlegen (Mandant + Login), Passwort zurücksetzen, löschen; Kundenliste
- `setup-user-mgmt.js` — PocketBase-Rules: role=admin verwaltet `tenants`/`users`, kein Self-Update (keine role-Eskalation)
- Admin-Account `thomas@voelker.digital` (role=admin) in der users-Collection
- **VOE-237:** Server-Config + Backup-/Restore-Doku ins Repo (`deploy/vorlagen/`)
- Feature-Branches nach `main` zusammengeführt

### Vorlagen-Komponenten vollständig (VOE-243)
- Superchat-`content` vollständig erschlossen: echte `category`, `buttons` (Typ/Label/Reihenfolge), `header`, benannte `variables`, `channels`, `track_links`
- `extend-templates-schema.js` + Sync-Erweiterung: echte Meta-Kategorie ersetzt Heuristik (251 Marketing / 15 Verwaltung)
- Kunden-UI: WhatsApp-Vorschau mit **Buttons als Knöpfe**, **Variablen-Chips**, Header-Typen; Button-Liste im Detail; Kategorie-/Button-Badges in der Galerie
- Deploy nach `pb_public` (über Server-Terminal, da SSH-IP temporär netzseitig gesperrt)

### VPS-Plattform (Notion-Ablösung) — Phase 1 + 2 (VOE-237, VOE-238)
- Architektur-Konzept `specs/VPS_PLATTFORM_KONZEPT.md` v0.2.0 — Tenancy-Modell A (Master-Katalog ⊕ Kunden-Overlay), Stack PocketBase/Docker/Traefik
- **Phase 1:** PocketBase-Instanz live unter `vorlagen.voelkergroup.cloud` (Docker + Traefik, Let's-Encrypt-TLS), DNS-A-Record angelegt
- **Phase 2:** `sync-superchat-to-pb.js` — 269 Templates + 262 Vorschaubilder nach PocketBase (Upsert nur Superchat-Felder)
- **Phase 2:** `notion-enrich-to-pb.js` — einmaliger Notion-Export: 174 Records mit Anreicherung (Kategorie/Ordner/Buttons/…) migriert, Match per `superchat_id`
- Notion bleibt im Parallelbetrieb bis Phase 6
- npm-Scripts: `sync:pb`, `enrich:pb`, `sync:notion`
- Linear-Roadmap VOE-236…242 angelegt

### Datenqualität + Phase 4 (VOE-240)
- `fill-ordner-from-superchat.js` — Ordner aus Superchat-`folder` ergänzt (174→264/269)
- `derive-kategorie-from-ordner.js` — Kategorie-Heuristik aus Ordner (169→264/269; Marketing 164 / Verwaltung 100)
- **Phase 4:** `setup-pb-tenancy.js` — Multi-Tenant-Unterbau: Collections `tenants`, `template_overlays` (Tenant-Scoping-Rules), `users` um `tenant`/`role` erweitert, `templates`-Rules (read=auth, write=admin)
- `tests/tenant-isolation.js` — Cross-Tenant-Sicherheitstest, 8/8 PASS (Mandantentrennung bestätigt)
- npm-Scripts: `setup:tenancy`, `test:tenancy`

## v1.0.0 — 2026-05-04

### Initial Setup
- OpenCLAW Governance Framework eingerichtet
- Basis-Dokumentation erstellt (CLAUDE.md, SYSTEM_ARCHITECTURE.md, COMPONENT_INVENTORY.md, DEVELOPMENT_PROCESS.md, GOVERNANCE.md, SECURITY.md)
- Self-Healing Agent + Doc-Sync Module eingerichtet (launchd-Job, alle 15 min)
- Linear-Labels angelegt: compliance, notion-sync, whatsapp-template, wavs (Team Voelker AI Solutions)
- Architektur-Dimensionen: Standard + Compliance (Meta WhatsApp Business + DSGVO)
- BSP geklärt: **Superchat** als WhatsApp Business Solution Provider — direkter Meta-Zugriff entfällt
- Notion-DB `Whatsapp Vorlagen autoabgleich` (`07ee35a1-94de-82d2-8748-81c0763b26df`) als Sync-Quelle festgelegt — Schema dokumentiert (15 Felder, Mapping zu WhatsApp-Komponenten)
- Linear-Projekt `WhatsAppVorlagen SuperChat` angelegt (ID `7ed012ad-3d68-423f-9047-4a7ef6217b2b`)
- Issue-Prefix von `WAVS-` zu **`VOE-`** korrigiert (echtes Team-Prefix von `Voelker AI Solutions`)
