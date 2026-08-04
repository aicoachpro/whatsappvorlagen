# Deployment — Vorlagen-Plattform (PocketBase)

**Server:** `srv1186348.hstgr.cloud` / `72.62.63.41` (Hostinger-VPS-ID 1186348, KVM 2, Ubuntu 24.04)
**URL:** https://vorlagen.voelkergroup.cloud · **Admin-Panel:** `/_/` · **Kunden-UI:** `/` (aus `pb_public/`)

> ⚠️ **Bis 2026-08-04 stand hier srv1537054 / `187.124.165.1` — das war falsch.** Die Anwendung
> lief nie dort; der Auto-Deploy kopierte auf den falschen Server, `webui/` hing seit dem 03.07.
> fest, `pb_hooks/` seit dem 22.06. (Ursache des `attribute_identifier`-Kundenfehlers).
> **Vor jeder Serverarbeit `hostname` prüfen — muss `srv1186348` zeigen.**
> Auf srv1537054 liegt noch eine stillgelegte Kopie (`/root/vorlagen-src`, `/opt/vorlagen-pb`).

## Struktur auf dem Server
```
/root/vorlagen/docker-compose.yml     ← Container-Definition (siehe docker-compose.yml hier)
/opt/vorlagen-pb/
  ├── pocketbase                       ← Binary v0.37.5
  ├── pb_data/                         ← SQLite-DB + File-Storage (Vorschaubilder)
  └── pb_public/                       ← Kunden-UI (Inhalt aus webui/ dieses Repos)
```

## Container verwalten
```bash
cd /root/vorlagen
docker compose up -d        # starten
docker compose restart      # neu starten
docker compose logs -f      # Logs
```

## Deployen = `git push origin main` (Auto-Deploy, ≤ 2 min)

Auf srv1186348 liegt der Klon `/root/vorlagen-src`; `/root/vorlagen-deploy.sh` läuft per Cron
(`*/2 * * * *`) und liefert **beides** aus:

| Quelle | Ziel | Nachlauf |
|--------|------|----------|
| `webui/{index.html,app.js,styles.css}` | `/opt/vorlagen-pb/pb_public/` | — |
| `pb_hooks/*.pb.js` | `/opt/vorlagen-pb/pb_hooks/` | nur bei Änderung (`cmp`) → `docker restart vorlagen-pb` |

Manueller Anstoß, falls es eilt: `/root/vorlagen-deploy.sh`

**Kontrolle von außen** (ohne Serverzugang) — deckt einen hängenden Deploy sofort auf:
```bash
curl -sI https://vorlagen.voelkergroup.cloud/app.js | grep last-modified   # vs. letzter Commit
dig +short vorlagen.voelkergroup.cloud                                     # muss 72.62.63.41 sein
```

> Zugang zum Server: **hPanel → VPS → srv1186348.hstgr.cloud → Browser-Terminal** (als root).
> Direktes `ssh`/`scp` von außen ist netzseitig geDROPt (Hostinger-Schutz, siehe VOR-15).

## E-Mail / Passwort-Reset (VOR-11) — automatisiert via `setup-mail.js`
„Passwort vergessen" + Willkommens-Mail nutzen den eingebauten PB-Mailversand. Die Konfiguration
(SMTP + App-URL + Reset-Template-Link auf die Kunden-UI) setzt **`agents/setup-mail.js`** per
PocketBase-Settings-API — kein manuelles Klicken im Panel nötig.

**Voraussetzung:** Postfach `noreply@voelkergroup.cloud` existiert (hPanel). DNS (SPF/DKIM/DMARC/MX)
ist für `voelkergroup.cloud` bereits auf Hostinger-Mail eingerichtet.

```bash
# 1. Postfach-Passwort in .env (lokal, nie committen):
#    MAIL_PASSWORD=<passwort von noreply@voelkergroup.cloud>
# 2. Setzen (Defaults: smtp.hostinger.com:465, Absender noreply@…, App-URL vorlagen.…cloud):
npm run setup:mail            # bzw. node agents/setup-mail.js --dry-run  (Vorschau)
```
Optional via `.env` überschreibbar: `MAIL_SMTP_HOST/PORT/USER`, `MAIL_SENDER_NAME/ADDRESS`, `APP_URL`.
Der Agent braucht gültige `PB_ADMIN_EMAIL`/`PB_ADMIN_PASSWORD` (Superuser) in `.env`.

**Test danach:** im Login „Passwort vergessen?" → Mail muss ankommen; Link (`{APP_URL}/?reset={TOKEN}`)
→ Passwort setzen → Login.

> Ohne SMTP funktioniert die App weiter: Kunde-Anlegen zeigt dann das **Backup-Passwort** zur
> manuellen Weitergabe (Fallback). Reset-Mails werden erst nach `setup:mail` zugestellt.

## Server-Hooks (`pb_hooks/`) — seit 2026-08-04 automatisch
Die Hooks (`personalize_mail` = Vorname-Anrede VOR-12; `telegram_notify` = Registrierung/Verlängerung
VOR-14; `superchat_creds`/`superchat_push` = SuperChat-Push VOR-9) gehen mit dem Auto-Deploy raus:
`vorlagen-deploy.sh` vergleicht sie per `cmp` und startet bei Änderung `vorlagen-pb` neu.
**Kein manuelles Kopieren mehr.**

Manuell nachziehen (Notfall, im Browser-Terminal auf **srv1186348**):
```bash
cd /root/vorlagen-src && git pull --ff-only
cp pb_hooks/*.pb.js /opt/vorlagen-pb/pb_hooks/ && docker restart vorlagen-pb
```

> Warum das hier so ausführlich steht: Bis 2026-08-04 stand die Hook-Kopie nur als „optional" in
> dieser Datei und lief nie — der Server hatte monatelang einen alten Hook-Stand. Ein Kundenfehler
> (`SuperChat 400: attribute_identifier`) sah dadurch wie ein API-Problem aus, obwohl der Repo-Code
> längst korrekt war.

### Nur für VOR-9 (SuperChat-Push) zusätzlich: `SUPERCHAT_ENC_KEY`
`personalize_mail` (Vorname) braucht das **nicht**. Für SuperChat-Push: 32-Zeichen-Schlüssel in
`/root/vorlagen/docker-compose.yml` unter `vorlagen-pb` ergänzen, dann `docker compose up -d`:
```yaml
    environment:
      - SUPERCHAT_ENC_KEY=<32-Zeichen-Schlüssel>   # z. B. openssl rand -hex 16
```
> Schlüssel rotieren = gespeicherte Kunden-Keys werden unlesbar. Optional `SUPERCHAT_BASE_URL`.
> Collections `tenant_secrets`/`tenant_push_log` legt `node agents/setup-tenant-secrets.js` an.

## Backup (empfohlen: täglicher Cron auf dem Server)
PocketBase-Datastore sichern (DB + Vorschaubilder). `crontab -e` als root:
```cron
# täglich 03:30 — Datastore-Snapshot, 14 Tage Vorhaltung
30 3 * * * tar czf /root/backups/vorlagen-pb-$(date +\%F).tgz -C /opt vorlagen-pb && find /root/backups -name 'vorlagen-pb-*.tgz' -mtime +14 -delete
```
Vorher einmalig: `mkdir -p /root/backups`

## Restore
```bash
cd /root/vorlagen && docker compose down
tar xzf /root/backups/vorlagen-pb-<DATUM>.tgz -C /opt
docker compose up -d
```
