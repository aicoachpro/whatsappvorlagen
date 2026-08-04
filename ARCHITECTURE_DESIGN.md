# WhatsAppVorlagen SuperChat — Architecture Design

**Version:** 1.0.0 | **Stand:** 2026-06-01
**Hub:** Einstiegspunkt für `/ideation`, `/architecture-review`, `/implement`. §6 verlinkt alle Dokumente.

## §1 Big Picture

Synchronisation von WhatsApp-Vorlagen. **Superchat ist Master** (BSP für WhatsApp Business),
eine selbstgehostete **PocketBase-Plattform** auf dem Hostinger-VPS spiegelt den Katalog und
liefert ihn an Kunden aus (löst die frühere Notion-Mirror-DB ab).

```
Superchat (Master) ──sync──▶ PocketBase (vorlagen.voelkergroup.cloud)
                                   │  Master-Katalog ⊕ Kunden-Overlays
                                   ▼
                            Kunden-UI (webui/)  +  Admin-Kundenverwaltung
```

Notion ist abgeschaltet (Phase 6 / VOR-2, 2026-06-21, ehem. VOE-242) — Code, Scripts und Env-Token entfernt.

## §2 Design-Rationale ("Das Warum")

- **Notion-Ablösung:** Volle Kontrolle (DSGVO, kein externes Rate-Limit), eigener VPS.
- **Tenancy-Modell A:** Master-Katalog (Superchat-Mirror + Völker-Anreicherung) ⊕ Kunden-Overlay — Superchat-Wahrheit bleibt unberührt, Kundenänderungen isoliert.
- **PocketBase statt Eigenbau:** DB + Auth + Admin-Panel + File-Storage + REST out-of-the-box.

### KI-Architektur-Prinzipien + Anti-Patterns (Pflicht)
- **Superchat = einzige Quelle der Wahrheit** für den Katalog; die Plattform spiegelt, erfindet nichts.
- **Sync fasst Anreicherung nur kontrolliert an:** echte Superchat-Felder (category/buttons/header/variables) überschreiben; reine Admin-Pflege (notizen, vorschaubild) bleibt.
- **Mandantentrennung serverseitig erzwingen** (PocketBase API-Rules), nicht clientseitig.
- **Compliance vor Versand:** nie direkt gegen Meta, immer via Superchat (BSP).
- **Anti-Pattern vermieden:** keine Klartext-Secrets im Code/Chat; keine geratenen Compliance-Werte (echte Superchat-`category` statt Heuristik).

## §3 ADR — Architecture Decision Records

- **ADR-01 Tenancy-Modell A** (Master ⊕ Overlay) — siehe specs/VPS_PLATTFORM_KONZEPT.md §2.
- **ADR-02 Stack: PocketBase + Docker + Traefik** auf bestehendem VPS-Hausmuster — §5 des Konzepts.
- **ADR-03 Auto-Deploy via Git-Pull-Cron** (read-only Deploy-Key), da SSH-Push netzseitig gedrosselt — deploy/vorlagen/README.md.
  Seit 2026-08-04 auf **srv1186348** (vorher fälschlich auf srv1537054 eingerichtet, wo die Anwendung nie lief)
  und inklusive `pb_hooks/` — die Trennung „nur webui automatisch, Hooks von Hand" hat sich als Fehlerquelle erwiesen.
- **ADR-04 Kunden-UI als Vanilla-SPA in `pb_public/`** (kein Framework/CDN, DSGVO-freundlich).
- **ADR-05 Sync-Löschungen als Papierkorb, nicht als Hard-Delete** (2026-07-29). Superchat ist Master
  und gewinnt bei allen Feldern, die es liefert. Verschwundene Vorlagen bekommen `geloescht_am` gesetzt
  statt gelöscht zu werden — als Flag im Record, **nicht** als eigene Collection, weil `template_overlays`
  per `cascadeDelete` an `templates` hängt und ein Umzug die Kunden-Personalisierungen mitrisse.
  Endgültiges Löschen ist ein bewusster Admin-Klick im „Gelöscht"-Tab. Gegen Teilantworten der
  Superchat-API schützt eine 10%-Schwelle (Abbruch + Telegram statt Massen-Papierkorb).
  Sichtbarkeit serverseitig über die `listRule`, nicht nur im Frontend.

## §4 Komponenten-Übersicht

| Komponente | Pfad | Zweck |
|---|---|---|
| Superchat-Sync | `agents/sync-superchat-to-pb.js` + `.github/workflows/sync-superchat.yml` | Master-Katalog → PocketBase, täglich 05:00 UTC (Upsert + Papierkorb + Heartbeat, ADR-05) |
| Header-Media / Ordner / Kategorie | `agents/{sync-header-media,fill-ordner,derive-kategorie}-*.js` | Datenqualität |
| Tenancy/User-Mgmt-Setup | `agents/setup-pb-tenancy.js`, `agents/setup-user-mgmt.js`, `agents/setup-tenant-settings.js`, `agents/setup-tenant-secrets.js` | Collections + API-Rules (inkl. `tenant_settings`, VOR-8; `tenant_secrets` superuser-only, VOR-9) |
| Server-Hooks | `pb_hooks/superchat_creds.pb.js`, `pb_hooks/superchat_push.pb.js` | PocketBase-JS-Hooks: verschlüsselte Per-Tenant-Anbindung (AES-256-GCM, `SUPERCHAT_ENC_KEY`) + Push = Meta-Einreichung (effektive Vorlage serverseitig, Ordner-Auto, Audit `tenant_push_log`), VOR-9 |
| Kunden-UI | `webui/` | Galerie, Overlay-Editor, Kundenverwaltung, SuperChat-Verbindung |
| Config (SSoT) | `lib/config.js` | VERSION + DOC_FILES + CONFIG |
| Self-Healing / DocSync | `agents/self-healing.js`, `lib/doc-sync.js` | Versions-Drift, Obsidian-Spiegel |
| Deploy | `deploy/vorlagen/` | docker-compose + Backup/Restore-Doku |

## §5 Qualitäts-Dimensionen

Reliability · Data Integrity · Security · Performance · Observability · Maintainability ·
**Compliance** (Meta WhatsApp Business API + DSGVO). Mandantentrennung per Cross-Tenant-Test
verifiziert (tests/tenant-isolation.js, 8/8).

## §6 Referenzen

- [CLAUDE.md](CLAUDE.md) · [AGENTS.md](AGENTS.md) · [CONVENTIONS.md](CONVENTIONS.md) · [CONTEXT.md](CONTEXT.md) · [INDEX.md](INDEX.md)
- [SYSTEM_ARCHITECTURE.md](SYSTEM_ARCHITECTURE.md) · [GOVERNANCE.md](GOVERNANCE.md) · [SECURITY.md](SECURITY.md) · [DEVELOPMENT_PROCESS.md](DEVELOPMENT_PROCESS.md) · [COMPONENT_INVENTORY.md](COMPONENT_INVENTORY.md)
- [specs/VPS_PLATTFORM_KONZEPT.md](specs/VPS_PLATTFORM_KONZEPT.md) · [specs/UI-REVIEW.md](specs/UI-REVIEW.md) · [specs/TEMPLATE.md](specs/TEMPLATE.md)
- [deploy/vorlagen/README.md](deploy/vorlagen/README.md) · [CHANGELOG.md](CHANGELOG.md)
