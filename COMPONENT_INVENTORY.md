# WhatsAppVorlagen SuperChat — Component Inventory

**Version:** 1.0.0 | **Stand:** 2026-06-06

## Verzeichnisstruktur

```
/Users/togglodyte/developer/whatsappvorlagen
├── lib/
│   ├── config.js                       ← VERSION + DOC_FILES + Config (SSoT)
│   └── doc-sync.js                     ← Obsidian-Vault-Sync (Doku-Spiegel)
├── agents/
│   ├── sync-superchat-to-pb.js         ← Phase-1-Mirror: Superchat → PocketBase
│   ├── extend-templates-schema.js      ← Schema-Migration der templates-Collection
│   ├── fill-ordner-from-superchat.js   ← Gap-Fill: Superchat `folder.name` → PB `ordner`
│   ├── derive-kategorie-from-ordner.js ← Heuristik Ordner → Kategorie für Records ohne Kategorie
│   ├── sync-header-media.js            ← Header-Bilder/Videos/PDFs aus Superchat ziehen
│   ├── render-template-preview.js      ← Vorschaubilder per Puppeteer rendern
│   ├── setup-pb-tenancy.js             ← Tenancy-Setup (tenants, template_overlays, API-Rules)
│   ├── setup-user-mgmt.js              ← User-Mgmt-Setup (role=admin Self-Service)
│   ├── setup-tenant-lifecycle.js       ← Lizenz-/Ablauf-Schema auf tenants
│   ├── check-tenant-expiry.js          ← Lizenz-Ablauf-Check (Telegram-Reminder, GitHub-Actions-Cron)
│   ├── setup-telegram.js               ← Telegram-Bot-Setup (Chat-ID + Test-Send)
│   ├── list-superchat-inboxes.js       ← Helper: listet Superchat-Inboxes
│   ├── list-superchat-templates.js     ← Helper: listet alle WA-Templates (paginiert)
│   ├── self-healing.js                 ← Self-Healing (Doku-Versions-Drift)
│   └── test-env.js                     ← .env Smoke-Test (Linear / Superchat / Telegram)
├── webui/
│   ├── index.html                      ← Login + App + Detail/Edit-Modal + Admin-Modal
│   ├── app.js                          ← SPA: Login, Galerie, Overlay-Editor, Kundenverwaltung
│   └── styles.css
├── deploy/vorlagen/
│   ├── docker-compose.yml              ← PocketBase-Container-Definition
│   └── README.md                       ← Server-Setup, Backup/Restore, Deploy-Pfad
├── tests/
│   └── tenant-isolation.js             ← Cross-Tenant-Sicherheitstest (8/8 PASS, VOE-240)
├── .github/workflows/
│   └── lizenz-check.yml                ← Täglicher GitHub-Actions-Lauf für check-tenant-expiry
├── docs/                               ← Audit-/Briefing-Doks
├── specs/                              ← Spec-/Konzept-Files (VPS_PLATTFORM_KONZEPT, UI-REVIEW, TEMPLATE)
├── journal/                            ← Audit-Log, Self-Healing-Log, Sync-Reports
├── assets/previews/                    ← gerenderte Template-Vorschauen (PNG, nicht in Git)
├── package.json                        ← Dependencies (puppeteer) + npm-Scripts
├── CLAUDE.md · AGENTS.md · CONVENTIONS.md · CONTEXT.md · INDEX.md
├── ARCHITECTURE_DESIGN.md (Hub) · SYSTEM_ARCHITECTURE.md · COMPONENT_INVENTORY.md
├── DEVELOPMENT_PROCESS.md · GOVERNANCE.md · SECURITY.md · CHANGELOG.md
├── .env                                ← API Keys (nicht committen!)
├── .env.example                        ← Vorlage ohne echte Keys
└── .claude/
    ├── ISSUE_WRITING_GUIDELINES.md
    └── skills/                         ← Installierte Skills
```

## Betrieb (Stand v1.0.0)

| Komponente | URL / Pfad |
|---|---|
| Kunden-UI | <https://vorlagen.voelkergroup.cloud/> |
| PocketBase-Admin | <https://vorlagen.voelkergroup.cloud/_/> |
| Server | Hostinger-VPS `srv1537054` / `187.124.165.1` (Ubuntu 24.04, Docker + Traefik) |
| Deploy | `git push origin main` → Server-Cron-Pull |
| Backup | täglich 03:30, 14 Tage Vorhaltung (`/root/backups/vorlagen-pb-*.tgz`) |
