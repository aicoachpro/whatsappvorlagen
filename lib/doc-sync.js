/**
 * lib/doc-sync.js — WhatsAppVorlagen SuperChat Documentation Sync
 *
 * Template from OpenCLAW Governance Framework
 * Source: github.com/vibercoder79/openclaw_trading
 *
 * WHAT IT DOES:
 *   1. Reads all DOC_FILES from config.js
 *   2. Updates the version string in each file (Check M in self-healing)
 *   3. Optionally mirrors files to Obsidian Vault (frontmatter + wikilinks)
 *   4. Creates timestamped changelog entries
 *
 * SETUP:
 *   1. Copy this file to your project: lib/doc-sync.js
 *   2. Configure OBSIDIAN_MAPPING below (or leave empty)
 *   3. Called by self-healing.js when version mismatch is detected
 *   4. Can also be called manually: node lib/doc-sync.js
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const PROJECT_PATH = process.env.PROJECT_PATH || path.join(__dirname, '..');
const config       = require(path.join(PROJECT_PATH, 'lib/config'));

// ─── Obsidian Vault Mapping (optional) ───────────────────────────────────────
// Map source files to their Obsidian vault destinations
// Leave empty if no Obsidian sync is needed

const VAULT_BASE = '/Users/togglodyte/Library/Mobile Documents/iCloud~md~obsidian/Documents/WhatsAppVorlagen SuperChat';

const OBSIDIAN_MAPPING = {
  'CLAUDE.md': `${VAULT_BASE}/CLAUDE.md`,
  'SYSTEM_ARCHITECTURE.md': `${VAULT_BASE}/SYSTEM_ARCHITECTURE.md`,
  'COMPONENT_INVENTORY.md': `${VAULT_BASE}/COMPONENT_INVENTORY.md`,
  'DEVELOPMENT_PROCESS.md': `${VAULT_BASE}/DEVELOPMENT_PROCESS.md`,
  'GOVERNANCE.md': `${VAULT_BASE}/GOVERNANCE.md`,
  'CHANGELOG.md': `${VAULT_BASE}/CHANGELOG.md`,
};

// ─── Changelog ───────────────────────────────────────────────────────────────

const CHANGELOG_PATH = path.join(PROJECT_PATH, 'CHANGELOG.md');

function appendChangelog(version, description) {
  if (!fs.existsSync(CHANGELOG_PATH)) return;

  const today   = new Date().toISOString().slice(0, 10);
  const entry   = `\n## v${version} — ${today}\n\n${description}\n`;
  const content = fs.readFileSync(CHANGELOG_PATH, 'utf8');

  // Only append if this version isn't already in changelog
  if (!content.includes(`## v${version}`)) {
    fs.writeFileSync(CHANGELOG_PATH, entry + content);
    console.log(`[DocSync] Changelog entry added for v${version}`);
  }
}

// ─── Obsidian: Frontmatter Injection ─────────────────────────────────────────

function injectFrontmatter(content, filename, version) {
  const timestamp = new Date().toISOString();
  const frontmatter = [
    '---',
    `sync_source: "${filename}"`,
    `sync_version: "${version}"`,
    `sync_timestamp: "${timestamp}"`,
    '---',
    '',
  ].join('\n');

  // Remove existing frontmatter if present
  const withoutFm = content.startsWith('---')
    ? content.replace(/^---[\s\S]*?---\n/, '')
    : content;

  return frontmatter + withoutFm;
}

// ─── Core: Sync All Docs ─────────────────────────────────────────────────────

/**
 * Updates the version string in all DOC_FILES to targetVersion.
 * Called by self-healing when a mismatch is detected.
 *
 * @param {string} targetVersion - The version to sync all docs to
 * @returns {number} Number of files that were updated
 */
async function syncAllDocs(targetVersion) {
  const { DOC_FILES } = config;
  if (!DOC_FILES) {
    console.error('[DocSync] DOC_FILES not found in config.js');
    return 0;
  }

  let synced = 0;
  let obsidianSynced = 0;

  for (const [name, def] of Object.entries(DOC_FILES)) {
    const filePath = path.join(PROJECT_PATH, def.path);
    if (!fs.existsSync(filePath)) {
      console.warn(`[DocSync] File not found, skipping: ${filePath}`);
      continue;
    }

    const original = fs.readFileSync(filePath, 'utf8');

    // Replace version using the file's own regex pattern
    const updated = original.replace(def.versionPattern, (match, oldVersion) => {
      return match.replace(oldVersion, targetVersion);
    });

    if (updated !== original) {
      fs.writeFileSync(filePath, updated, 'utf8');
      synced++;
      console.log(`[DocSync] Updated ${name}: v${_extractVersion(original, def)} → v${targetVersion}`);
    } else {
      console.log(`[DocSync] ${name}: already at v${targetVersion} ✓`);
    }

    // Mirror to Obsidian if mapping exists
    if (OBSIDIAN_MAPPING[name]) {
      try {
        const vaultPath = OBSIDIAN_MAPPING[name];
        const vaultContent = injectFrontmatter(updated, name, targetVersion);
        fs.mkdirSync(path.dirname(vaultPath), { recursive: true });
        fs.writeFileSync(vaultPath, vaultContent, 'utf8');
        obsidianSynced++;
      } catch (err) {
        console.warn(`[DocSync] Obsidian sync failed for ${name}: ${err.message}`);
      }
    }
  }

  const total = Object.keys(DOC_FILES).length;
  console.log(`[DocSync] Done: ${synced}/${total} files updated to v${targetVersion}` +
    (obsidianSynced > 0 ? ` | ${obsidianSynced} mirrored to Obsidian` : ''));

  if (synced > 0) {
    appendChangelog(targetVersion, `- Documentation synced to v${targetVersion} (auto-sync by self-healing)`);
  }

  return synced;
}

function _extractVersion(content, def) {
  const match = content.match(def.versionPattern);
  return match ? match[1] : '?';
}

// ─── Export + CLI ─────────────────────────────────────────────────────────────

module.exports = { syncAllDocs };

// CLI: node lib/doc-sync.js [targetVersion]
if (require.main === module) {
  const targetVersion = process.argv[2] || config.VERSION;
  if (!targetVersion) {
    console.error('Usage: node lib/doc-sync.js [version]');
    process.exit(1);
  }
  syncAllDocs(targetVersion)
    .then(count => {
      console.log(`[DocSync] CLI complete — ${count} files updated`);
      process.exit(0);
    })
    .catch(err => {
      console.error('[DocSync] Error:', err);
      process.exit(1);
    });
}
