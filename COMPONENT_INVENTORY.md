# WhatsAppVorlagen SuperChat — Component Inventory

**Version:** 1.0.0 | **Stand:** 2026-05-04

## Verzeichnisstruktur

```
/Users/togglodyte/developer/whatsappvorlagen
├── lib/
│   ├── config.js          ← VERSION + DOC_FILES + Config (SSoT)
│   └── doc-sync.js        ← Obsidian Vault Sync
├── agents/
│   ├── self-healing.js              ← Self-Healing Agent (Check M, U, P)
│   ├── test-env.js                  ← .env Smoke-Test (Linear / Notion / Superchat / Telegram)
│   ├── list-superchat-inboxes.js    ← Helper: listet Superchat-Inboxes (ID + Name)
│   ├── list-superchat-templates.js  ← Helper: listet alle WA-Templates (paginiert)
│   ├── render-template-preview.js   ← Helper: rendert WhatsApp-Bubble-Mockups (Puppeteer)
│   └── sync-superchat-to-notion.js  ← Phase 1: Mirror Superchat → Notion (mit Vorschaubild)
├── assets/
│   └── previews/                    ← gerenderte Template-Vorschauen (PNG, nicht in Git)
├── package.json                     ← Dependencies (puppeteer)
├── journal/               ← Restart-History, Automation-Queue
├── specs/                 ← Spec-Files (Feature-Specs vor Code)
├── CLAUDE.md              ← AI-Operator Identität + Regeln
├── SYSTEM_ARCHITECTURE.md ← System-Architektur
├── COMPONENT_INVENTORY.md ← Diese Datei
├── DEVELOPMENT_PROCESS.md ← Entwicklungsprozesse
├── GOVERNANCE.md          ← Governance Framework
├── SECURITY.md            ← Security-Regeln + Threat Model
├── CHANGELOG.md           ← Änderungshistorie
├── .env                   ← API Keys (nicht committen!)
├── .env.example           ← Vorlage ohne echte Keys
└── .claude/
    ├── ISSUE_WRITING_GUIDELINES.md
    └── skills/            ← Installierte Skills
```
