// lib/config.js — Single Source of Truth
'use strict';

const VERSION = '1.0.0';

// Dokumentationsdateien — Self-Healing überwacht Versions-Sync
const DOC_FILES = {
  'CLAUDE.md': {
    path: 'CLAUDE.md',
    versionPattern: /\*\*Version:\*\*\s*([\d.]+)/
  },
  'SYSTEM_ARCHITECTURE.md': {
    path: 'SYSTEM_ARCHITECTURE.md',
    versionPattern: /\*\*Version:\*\*\s*([\d.]+)/
  },
  'COMPONENT_INVENTORY.md': {
    path: 'COMPONENT_INVENTORY.md',
    versionPattern: /\*\*Version:\*\*\s*([\d.]+)/
  },
  'DEVELOPMENT_PROCESS.md': {
    path: 'DEVELOPMENT_PROCESS.md',
    versionPattern: /\*\*Version:\*\*\s*([\d.]+)/
  },
  'GOVERNANCE.md': {
    path: 'GOVERNANCE.md',
    versionPattern: /\*\*Version:\*\*\s*([\d.]+)/
  }
};

// Projekt-spezifische Config
const CONFIG = {
  PROJECT_NAME: 'WhatsAppVorlagen SuperChat',
  ISSUE_PREFIX: 'VOE-',                                // Team-Prefix von "Voelker AI Solutions"
  PROJECT_LABEL: 'wavs',                                // Linear-Label fuer Projekt-Marker
  LINEAR_PROJECT_ID: '7ed012ad-3d68-423f-9047-4a7ef6217b2b',
  LINEAR_TEAM: 'Voelker AI Solutions',
  LINEAR_TEAM_KEY: 'VOE',
  GITHUB_REPO: 'github.com/aicoachpro/whatsappvorlagen',
  OBSIDIAN_VAULT: '/Users/togglodyte/Library/Mobile Documents/iCloud~md~obsidian/Documents/WhatsAppVorlagen SuperChat'
};

module.exports = { VERSION, DOC_FILES, CONFIG };
