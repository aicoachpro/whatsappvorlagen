# WhatsAppVorlagen SuperChat — Changelog

## v1.0.0 — 2026-06-01

### VPS-Plattform (Notion-Ablösung) — Phase 1 + 2 (VOE-237, VOE-238)
- Architektur-Konzept `specs/VPS_PLATTFORM_KONZEPT.md` v0.2.0 — Tenancy-Modell A (Master-Katalog ⊕ Kunden-Overlay), Stack PocketBase/Docker/Traefik
- **Phase 1:** PocketBase-Instanz live unter `vorlagen.voelkergroup.cloud` (Docker + Traefik, Let's-Encrypt-TLS), DNS-A-Record angelegt
- **Phase 2:** `sync-superchat-to-pb.js` — 269 Templates + 262 Vorschaubilder nach PocketBase (Upsert nur Superchat-Felder)
- **Phase 2:** `notion-enrich-to-pb.js` — einmaliger Notion-Export: 174 Records mit Anreicherung (Kategorie/Ordner/Buttons/…) migriert, Match per `superchat_id`
- Notion bleibt im Parallelbetrieb bis Phase 6
- npm-Scripts: `sync:pb`, `enrich:pb`, `sync:notion`
- Linear-Roadmap VOE-236…242 angelegt

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
