# Deployment — Vorlagen-Plattform (PocketBase)

**Server:** srv1537054 / `187.124.165.1` (Ubuntu 24.04) · **URL:** https://vorlagen.voelkergroup.cloud
**Admin-Panel:** `/_/` · **Kunden-UI:** `/` (aus `pb_public/`)

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

## Kunden-UI deployen (Inhalt von webui/)
```bash
scp webui/*.html webui/*.js webui/*.css root@187.124.165.1:/opt/vorlagen-pb/pb_public/
```
> Hinweis: SSH-Verbindungen drosseln — der Hostinger-Netzwerkschutz sperrt die Quell-IP
> bei zu vielen SSH-Verbindungen in kurzer Zeit (Port 443 bleibt erreichbar).

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

## Server-Hooks deployen (`pb_hooks/`, VOR-9)
Die Per-Tenant-SuperChat-Anbindung läuft als PocketBase-JS-Hook serverseitig.
```bash
scp ../../pb_hooks/*.pb.js root@187.124.165.1:/opt/vorlagen-pb/pb_hooks/
docker compose restart   # Hooks werden beim Start geladen
```
**Pflicht-Env `SUPERCHAT_ENC_KEY`** (genau 32 Zeichen) — Schlüssel zum Ver-/Entschlüsseln der
Kunden-API-Keys (AES-256-GCM). Liegt NUR in der Server-Env, **nie** in der DB/Git. In
`docker-compose.yml` unter `vorlagen-pb` ergänzen:
```yaml
    environment:
      - SUPERCHAT_ENC_KEY=<32-Zeichen-Schlüssel>   # z. B. openssl rand -hex 16
```
> Schlüssel rotieren = alle gespeicherten Kunden-Keys werden unlesbar (Kunden müssen neu hinterlegen).
> Optional `SUPERCHAT_BASE_URL` (Default `https://api.superchat.com/v1.0`).

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
