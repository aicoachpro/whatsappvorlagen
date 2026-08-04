# Architektur-Konzept: VPS-Plattform (Notion-Ablösung)

**Version:** 0.2.0 (Konzept, Stack auf reale Server-Umgebung angepasst) | **Stand:** 2026-05-31
**Status:** Freigegeben — Roadmap angelegt (VOE-236…242), Phase 1 startbereit

## 1. Ziel

Notion als Mirror- und Auslieferungs-DB ablösen durch eine selbstgehostete
Multi-Tenant-Plattform auf dem Hostinger-VPS. Superchat bleibt **Master** (Wahrheit für
den WhatsApp-Template-Katalog). Notion läuft im **Parallelbetrieb** weiter, bis die neue
Plattform stabil ist, danach Abschaltung.

### Was Notion heute leistet (und ersetzt werden muss)

| Rolle | Notion heute | Ersatz auf VPS |
|-------|--------------|----------------|
| Datenspeicher | Notion-DB `autoabgleich` | PocketBase (SQLite) |
| Admin-Oberfläche | Galerie-View + Edit | PocketBase-Admin-Panel |
| Kunden-Auslieferung | geteilte Workspace-Kopien | Kunden-UI (SPA), Login pro Kunde |
| Multi-User/Auth | Notion-Accounts | PocketBase Auth-Collection, Tenant = Kunde |
| File-Storage (Vorschaubilder) | Notion-Files | PocketBase File-Storage |

## 2. Tenancy-Modell: A — Master-Katalog + Kunden-Overlay

- **Master-Katalog:** Die ~271 Templates = ein global kuratierter Katalog, gehört VÖLKER.
  Besteht aus ZWEI Feld-Herkünften:
  - **Superchat-Felder** (`name`, `body`, `footer`, `variables`, `status`): Read-only aus
    Superchat gespiegelt, bei jedem Sync überschrieben. Superchat bleibt Master.
  - **Völker-Anreicherungsfelder** (`Kategorie`, `Ordner`, `Überschrift`, `Buttons`, `URL's`,
    `Telefonnummer`, `Schnellantwort`, `Notizen`, `Vorschaubild`): von Admins gepflegt,
    existieren NICHT in Superchat, vom Sync NIE angefasst. (Heute in Notion gepflegt —
    Stichprobe: Kategorie/Ordner 100%, Überschrift/Buttons je 39%, weitere 6–22% befüllt.)
- **Kunden-Overlay:** Jeder Kunde (Tenant) speichert nur seine **Abweichungen** pro
  Template (überschriebene Felder, ein-/ausgeblendet, Notizen). Der Kunde sieht das
  "effektive" Template = Master ⊕ sein Overlay.
- **Tenant-eigene Templates** (optional): Ein Kunde kann eigene neue Vorlagen anlegen
  (Overlay ohne Master-Bezug). Bleibt tenant-scoped.

Vorteil: Master-Katalog bleibt eine Quelle, Updates aus Superchat erreichen alle Kunden
automatisch, Kundenänderungen kollidieren nie mit dem Master.

## 3. Datenmodell (PocketBase-Collections)

| Collection | Typ | Felder (Auszug) | Zugriff |
|---|---|---|---|
| `tenants` | base | name, slug, status | nur Admin |
| `users` | **auth** (eingebaut, erweitert) | + `tenant`→tenants (rel), `role` [admin\|customer] | self + Admin |
| `templates` | base | **Superchat (read-only):** superchat_id (unique), status, name, body, footer, variables (json), superchat_updated · **Anreicherung (admin-editierbar):** kategorie, ordner, ueberschrift, buttons (json), urls, telefonnummer, schnellantwort, notizen, vorschaubild (file) | Lesen: alle Auth · Schreiben: Admin |
| `template_overlays` | base | `tenant`→tenants, `template`→templates (NULL = tenant-eigen), name/body/header/footer-override, buttons (json), hidden (bool), notes | **tenant-scoped** via Rule |

- **Sync schreibt NUR die Superchat-Felder** von `templates` (Upsert per `superchat_id`),
  die Anreicherungsfelder werden NIE überschrieben.
- **Effektives Template** = `templates` ⊕ passendes `template_overlays` (Merge in der
  Kunden-UI bzw. via PocketBase JS-SDK / `pb_hooks`).
- **Mandantentrennung** über PocketBase **API-Rules**: `template_overlays` List/View/Update
  nur wo `tenant = @request.auth.tenant`. Keine handgeschriebene WHERE-Klausel nötig —
  PocketBase erzwingt die Rule serverseitig.

## 4. Architektur (real, auf bestehendem Server-Stack)

```
            Traefik (vorhanden) ── certresolver "mytlschallenge" (Let's Encrypt)
                   │  Host(`vorlagen.voelkergroup.cloud`) → :8090
            PocketBase-Container (eigene Instanz, /root/vorlagen)
            ┌──────────┬──────────────┬───────────────┐
        Admin-Panel  REST/Realtime  Auth+Rules   pb_public/ (Kunden-UI SPA)
            │            │             │              │
            └──────── SQLite (/opt/vorlagen-pb) + File-Storage ┘
                   ▲
            Sync-Worker (Node-Script, cron) ── liest Superchat-API, schreibt via PB-REST
                   │
        bestehender sync-superchat-to-notion.js (läuft parallel weiter bis Phase 6)
```

- **Reverse-Proxy:** vorhandener **Traefik** (Docker-Provider, Netzwerk `root_default`).
  Kein Caddy/eigener Proxy — nur Traefik-Labels am neuen Container.
- **PocketBase:** eigene Instanz unter `vorlagen.voelkergroup.cloud` (getrennt von der
  bestehenden `pb.voelkergroup.cloud`-Instanz → Projekt-Mandantentrennung).
- **Admin-UI:** PocketBase-Admin-Panel (`/_/`) — ersetzt direkt die Notion-Admin-Pflege.
- **Kunden-UI:** schlanke SPA in `pb_public/`, nutzt PocketBase JS-SDK (Auth + Daten).
- **Sync-Worker:** bestehende Superchat-`fetch`-Logik wiederverwenden, schreibt statt nach
  Notion (bzw. zusätzlich) in PocketBase. Puppeteer-Previews → PocketBase File-Upload.

## 5. Stack-Entscheidungen

| Schicht | Wahl | Begründung |
|---------|------|------------|
| DB + Auth + Admin + Files + API | **PocketBase** (eigene Instanz) | Liefert DB, Auth/Rollen, Admin-Panel, File-Storage, REST/Realtime out-of-the-box → spart Phase 1/3/4 großteils; bereits auf dem Server im Einsatz |
| Reverse-Proxy / TLS | **Traefik** (vorhanden) | Schon installiert, Auto-HTTPS via `mytlschallenge`; nur Labels ergänzen |
| Deploy | **Docker Compose** in `/root/vorlagen` | Folgt exakt dem Hausmuster (fitness, versicherungsengel, pocketbase) |
| Kunden-UI | SPA in `pb_public/` (PB JS-SDK) | Ein Container, keine separate Frontend-Infra |
| Sync-Worker | Node ≥20 (bestehender Code) | Superchat-`fetch`-Anbindung bleibt 1:1 |

## 6. Phasen / Roadmap (→ Linear VOE-Issues)

| Phase | Issue | Inhalt | Liefert |
|-------|-------|--------|---------|
| **0** | VOE-236 | Konzept + Roadmap | ✅ Done |
| **1** | VOE-237 | PocketBase-Instanz aufsetzen (`/root/vorlagen`, Traefik-Labels, TLS, DNS ✅) | lauffähige Basis unter `vorlagen.voelkergroup.cloud` |
| **2** | VOE-238 | Collections-Schema + `sync-superchat-to-pb.js` (parallel zu Notion) + **einmaliger Notion-Export** der Anreicherungsfelder | Master-Katalog in PocketBase (inkl. Handarbeit) |
| **3** | VOE-239 | Admin-Pflege im PB-Admin-Panel einrichten (Felder, Galerie-Sicht) | interner Notion-Ersatz |
| **4** | VOE-240 | Auth + Tenancy: `tenants`, `users.role`, API-Rules, Cross-Tenant-Tests | Mandantenfähigkeit |
| **5** | VOE-241 | Kunden-UI (SPA in `pb_public`): Overlay-Bearbeitung, Self-Service | Kunden-Auslieferung |
| **6** | VOE-242 | Notion-Abschaltung: Sync umstellen, Dienst/Token entfernen | Notion raus |

## 7. Compliance & Security (Pflicht-Dimensionen)

- **DSGVO:** Daten liegen auf eigenem VPS (volle Kontrolle); Telefonnummern sensibel
  behandeln, Logs maskieren letzte 4 Stellen (vgl. DEVELOPMENT_PROCESS.md).
- **Meta-Policy:** Versand/Template-Push weiterhin nur via Superchat; Compliance-Check
  vor Push bleibt Pflicht (CLAUDE.md Regel 6 + 7).
- **Secrets:** PocketBase-Admin-Credentials, Superchat-/Notion-Keys nur in `.env` /
  Server-Env, nie loggen, nie committen.
- **Mandantentrennung:** über PocketBase-API-Rules (`tenant = @request.auth.tenant`);
  Tests gegen Cross-Tenant-Leaks (Phase 4).
- **Eigene PB-Instanz:** getrennt von `pb.voelkergroup.cloud`, eigener Datastore + Backup.
- **Input-Validation:** PocketBase-Field-Constraints + Rules an allen Schreib-Endpunkten.

## 8. Server-Umgebung (Stand 2026-05-31)

> ⚠️ **Korrektur 2026-08-04:** Die hier genannte Maschine ist falsch. Die Plattform läuft auf
> **srv1186348 / `72.62.63.41`**, dorthin zeigt auch der DNS-A-Record. Aktueller Stand:
> `deploy/vorlagen/README.md`. Der folgende Abschnitt bleibt als Historie stehen.

- **VPS:** srv1537054, Ubuntu 24.04 LTS, 2 vCPU / 8 GB, IP `187.124.165.1` (root-SSH ok)
- **Proxy:** Traefik (Docker), Netzwerk `root_default`, certresolver `mytlschallenge`
- **Bestehende Apps:** versicherungsengel (:3000), fitness (nginx), pocketbase (`pb.…`:8090)
- **DNS:** `vorlagen.voelkergroup.cloud` → `187.124.165.1` (A-Record, TTL 300) ✅ angelegt
- **Deploy-Muster:** `/root/<app>/docker-compose.yml`, Traefik-Labels am Container

## 9. Offene Punkte (vor jeweiliger Phase zu klären)

1. **Push Notion/Overlay→Superchat (späteres Feature):** Hat jeder Kunde einen eigenen
   Superchat-Channel/Inbox, in den sein Overlay gepusht wird? → klärt Versand-Architektur.
2. **Onboarding:** Wie werden neue Kunden-Tenants angelegt (manuell im Admin / self-service)?
3. ~~**Migration der Notion-Inhalte:**~~ **GEKLÄRT:** Notion war für Kunden read-only, Admins
   haben angereichert (verifiziert: Kategorie/Ordner 100%, Überschrift/Buttons 39%, weitere
   6–22%). → **Einmaliger Notion-Export Pflicht** (Phase 2), sonst Verlust der Handarbeit.
4. ~~**Hosting-Details:**~~ **GEKLÄRT (§8):** Server, Stack, DNS stehen. Offen nur noch:
   Backup-Strategie für den PocketBase-Datastore (Phase 1).
