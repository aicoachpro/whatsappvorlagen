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

Notion-Pfad abgeschaltet mit VOE-242 (2026-06-06) — PocketBase ist die einzige Mirror-/Auslieferungs-DB.

## §2 Design-Rationale ("Das Warum")

- **Selbstgehostete Plattform statt Notion:** Volle Kontrolle (DSGVO, kein externes Rate-Limit), eigener VPS.
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
- **ADR-04 Kunden-UI als Vanilla-SPA in `pb_public/`** (kein Framework/CDN, DSGVO-freundlich).

## §4 Komponenten-Übersicht

| Komponente | Pfad | Zweck |
|---|---|---|
| Superchat-Sync | `agents/sync-superchat-to-pb.js` | Master-Katalog → PocketBase |
| Datenqualität (Header-Media, Ordner, Kategorie) | `agents/{sync-header-media,fill-ordner-from-superchat,derive-kategorie-from-ordner}.js` | Datenqualität |
| Tenancy/User-Mgmt-Setup | `agents/setup-pb-tenancy.js`, `agents/setup-user-mgmt.js` | Collections + API-Rules |
| Kunden-UI | `webui/` | Galerie, Overlay-Editor, Kundenverwaltung |
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
