# WhatsAppVorlagen SuperChat — System Architecture

**Version:** 1.0.0 | **Stand:** 2026-06-06

## Überblick

Synchronisation von WhatsApp-Vorlagen aus Superchat (BSP / Master) in eine eigene, selbstgehostete PocketBase-Plattform. Die Plattform spiegelt den Master-Katalog und liefert ihn — mit tenant-spezifischen Anpassungen (Overlays) und Personalisierung — an Coach-Kunden aus.

```
   Superchat (Master)                     PocketBase (vorlagen.voelkergroup.cloud)
   ───────────────────                    ──────────────────────────────────────
   /v1.0/templates  ───── sync ──────▶    templates (Master-Spiegel + Anreicherung)
                                          template_overlays (Tenant-Änderungen)
                                          tenants / users (Mandanten + Login)
                                                            │
                                                            ▼
                                          webui/ (Coach-Login, Galerie, Editor)
                                          /_/   (PocketBase-Admin)
```

Notion-Pfad abgeschaltet mit VOE-242 (2026-06-06). Hub-Dokument: [ARCHITECTURE_DESIGN.md](ARCHITECTURE_DESIGN.md).

## Datenfluss

1. **Sync (Superchat → PocketBase):** `agents/sync-superchat-to-pb.js` ruft `GET /v1.0/templates` (cursor-paginiert) und macht Upsert per `superchat_id`. Echte Superchat-Felder (`name`, `body`, `footer`, `variables`, `category`, `buttons`, `header`, `channels`, `folder`) werden überschrieben — Admin-Anreicherung bleibt unangetastet.
2. **Coach-Login:** Coach meldet sich am `webui/` an. PocketBase-API-Rules erzwingen Mandantentrennung serverseitig (Cross-Tenant-Test 8/8 PASS, VOE-240).
3. **Overlay-Editor:** Coach passt einzelne Vorlagen an (Body, Footer, Buttons …). Änderungen landen in `template_overlays` und werden im UI als „Master + Overlay" gerendert (`effective(t)` in `webui/app.js`).
4. **Personalisierung beim Rendern:** Onboarding-Felder des Coaches werden zur Anzeigezeit über `personalize(text)` ersetzt (z.B. `VÖLKER Finance OHG` → Coach-Firma).
5. **Coach-Push (geplant):** Vorlagen aus dem PocketBase-Master-Katalog werden personalisiert in den Superchat-Account des Coaches gepusht. Roadmap: VOE-248 (Personalisierung), VOE-249 (Onboarding).

## PocketBase-Datenmodell

Quelle: `agents/setup-pb-tenancy.js`, `agents/setup-user-mgmt.js`, `agents/setup-tenant-lifecycle.js`, `agents/extend-templates-schema.js`.

### `templates` (Master-Katalog)

| Feld | Typ | Quelle | Anmerkung |
|---|---|---|---|
| `superchat_id` | text (unique) | Superchat | Stabile Korrelation |
| `name` | text | Superchat | |
| `status` | text | Superchat | `approved` / `external_deleted` / … |
| `body`, `footer` | text/editor | Superchat | |
| `variables` | json | Superchat | benannte Variablen |
| `sc_category` | text | Superchat | echte Meta-Kategorie |
| `kategorie` | select | Anreicherung | `Verwaltung` / `Marketing` (deutsch) |
| `ordner` | text | Superchat | Folder-Name |
| `ueberschrift` | text | Anreicherung | Header-Variante |
| `buttons`, `header` | json | Superchat | Vollständige Komponenten (VOE-243) |
| `channels` | json | Superchat | Inbox-Namen |
| `track_links` | bool | Superchat | |
| `urls`, `telefonnummer`, `schnellantwort`, `notizen` | text | Anreicherung | Admin-Pflege |
| `vorschaubild` | file | Sync optional | Wird nur gesetzt, wenn leer |
| `superchat_updated` | text | Superchat | ISO-8601 |

### `tenants` (Mandanten)

Tenant-Metadaten inkl. Lizenz-Ablauf (`tenant_expires_at`), Personalisierungs-Felder (Firmenname, Webseite, FlixCheck-Basis, …). Ablauf-Logik in `agents/check-tenant-expiry.js` (GitHub-Actions täglich 06:00 UTC).

### `template_overlays` (Tenant-Änderungen)

Scope: `tenant` × `template`. PB-Rules erzwingen `tenant.id = currentUser.tenant.id`. Master bleibt unberührt; das Overlay verschmilzt zur Anzeige.

### `users`

Felder: `email`, `password`, `role` (`admin` | …), `tenant` (relation). `role=admin` darf andere User/Tenants verwalten, aber sich nicht selbst auf `admin` heben (No-Self-Escalation).

## Superchat-API

**Base:** `https://api.superchat.com/v1.0` · **Auth:** Header `X-API-Key: $SUPERCHAT_API_KEY`

| Verwendet | Endpoint | Zweck |
|---|---|---|
| Sync | `GET /templates` (cursor-paginiert) | Master-Spiegel |
| Helper | `GET /templates/{id}` | Einzel-Lookup |
| Helper | `GET /inboxes` | Channel-Übersicht |

**Bekannte API-Einschränkungen** (VOE-217 stillgelegt — Superchat schaltet das nicht frei):
- `GET /analytics/templates` → HTTP 403 für diesen Workspace (Nutzungszahlen nicht über API).
- `PATCH /templates/{id}` akzeptiert nur `name`, `folder_id`, `file_ids` — keine `content.category` (Kategorie-Wechsel = neu anlegen + löschen).
- Vorlagen vom alten Typ `generic_template` (Pre-WA-Categories-Ära) lassen sich gar nicht updaten.

## Tenancy-Modell (ADR-01)

Modell A: **Master-Katalog ⊕ Kunden-Overlay**. Master ist die Wahrheit, Overlays sind tenant-isoliert. Vorteile: zentrale Pflege, isolierte Anpassungen, klare Trennung. Cross-Tenant-Isolation per Test gesichert (`tests/tenant-isolation.js`).

## Deployment (ADR-02 / ADR-03)

| Was | Wo |
|---|---|
| PocketBase | Docker-Container auf Hostinger-VPS `srv1537054` (`/opt/vorlagen-pb/`) |
| Reverse-Proxy / TLS | Traefik (Let's-Encrypt) |
| Auto-Deploy | `git push origin main` → Server-Cron-Pull (read-only Deploy-Key) — SSH netzseitig gedrosselt |
| Backup | Täglich 03:30, 14 Tage Vorhaltung in `/root/backups/` |
| Lizenz-Check | GitHub-Actions täglich 06:00 UTC (`.github/workflows/lizenz-check.yml`) |

Details: [deploy/vorlagen/README.md](deploy/vorlagen/README.md).

## Externe Abhängigkeiten

| Service | Zweck | Auth |
|---|---|---|
| Superchat | Master der Vorlagen (BSP für WhatsApp Business) | `SUPERCHAT_API_KEY` |
| PocketBase | Mirror/Auslieferungs-DB + Auth + File-Storage | `PB_ADMIN_EMAIL` / `PB_ADMIN_PASSWORD` |
| Linear | Issue-Tracking | `LINEAR_API_KEY` |
| GitHub | Code-Repository + Actions | SSH/HTTPS + Secrets |
| Telegram | Lizenz-Reminder | `TELEGRAM_BOT_TOKEN` (optional) |
| Obsidian-Vault | Doku-Spiegel (lokal) | Filesystem (`lib/doc-sync.js`) |
