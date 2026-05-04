/**
 * agents/self-healing.js — WhatsAppVorlagen SuperChat Self-Healing Agent
 *
 * Template from OpenCLAW Governance Framework
 * Source: github.com/vibercoder79/openclaw_trading
 *
 * SETUP:
 *   1. Copy this file to your project: agents/self-healing.js
 *   2. Adapt: PROJECT_PATH, alert(), DAEMON_CHECKS, CRON_JOB
 *   3. Add to cron (every 15 min): cd /your/project && node agents/self-healing.js >> self-healing.log 2>&1
 *
 * WHAT IT DOES:
 *   - Check M: Verifies all DOC_FILES in config.js have the correct VERSION
 *   - Check U: Verifies documented components exist on filesystem
 *   - Check P: Verifies daemon processes are running (via lock files or PIDs)
 *   - Alerts via Telegram (optional) or console
 *   - Backoff: max 3 restarts/h per daemon
 */
'use strict';

const fs   = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');

// ─── Configuration ────────────────────────────────────────────────────────────

const PROJECT_PATH = process.env.PROJECT_PATH || path.join(__dirname, '..');
const config       = require(path.join(PROJECT_PATH, 'lib/config'));
const VERSION      = config.VERSION;
const DOC_FILES    = config.DOC_FILES;

// Optional Telegram alerts (set in .env)
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID   = process.env.TELEGRAM_CHAT_ID   || '';

// Daemon definitions — adapt to your project
// Each entry: { name, lockFile, startScript, pidFile (optional) }
const DAEMON_CHECKS = [
  // Example:
  // { name: 'my-daemon', lockFile: '.my-daemon.lock', startScript: 'agents/my-daemon-start.sh' },
];

// Restart backoff tracking
const RESTART_HISTORY_PATH = path.join(PROJECT_PATH, 'journal/restart-history.json');
const BACKOFF = { maxPerHour: 3, cooldownMs: 5 * 60 * 1000 };

// ─── Alert ───────────────────────────────────────────────────────────────────

async function alert(message) {
  const prefix = `[Self-Healing][${new Date().toISOString()}]`;
  console.warn(prefix, message);

  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;

  try {
    const https = require('https');
    const text  = `⚠️ ${config.CONFIG?.PROJECT_NAME || 'System'} Self-Healing\n${message}`;
    const body  = JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text, parse_mode: 'HTML' });
    await new Promise((resolve, reject) => {
      const req = https.request(
        { hostname: 'api.telegram.org', path: `/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
          method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
        res => { res.resume(); resolve(); }
      );
      req.on('error', reject);
      req.end(body);
    });
  } catch (err) {
    console.error('[Self-Healing] Telegram alert failed:', err.message);
  }
}

// ─── Check M: Version Sync ───────────────────────────────────────────────────

async function checkVersionSync() {
  const warnings = [];
  if (!DOC_FILES || typeof DOC_FILES !== 'object') {
    warnings.push('M0: DOC_FILES not defined in config.js');
    return warnings;
  }

  for (const [name, def] of Object.entries(DOC_FILES)) {
    const filePath = path.join(PROJECT_PATH, def.path);
    if (!fs.existsSync(filePath)) {
      warnings.push(`M1: MISSING doc file: ${name} (${def.path})`);
      continue;
    }
    const content    = fs.readFileSync(filePath, 'utf8');
    const match      = content.match(def.versionPattern);
    const docVersion = match ? match[1] : null;
    if (docVersion !== VERSION) {
      warnings.push(`M1: VERSION MISMATCH in ${name}: found "${docVersion}", expected "${VERSION}"`);
    }
  }

  if (warnings.length === 0) {
    console.log(`[M] All ${Object.keys(DOC_FILES).length} docs at version ${VERSION} ✓`);
  }
  return warnings;
}

// ─── Check U: Component Inventory ───────────────────────────────────────────

async function checkComponentInventory() {
  const warnings = [];
  const inventoryPath = path.join(PROJECT_PATH, 'COMPONENT_INVENTORY.md');
  if (!fs.existsSync(inventoryPath)) return warnings;

  const content  = fs.readFileSync(inventoryPath, 'utf8');
  // Extract all ├── or └── file references from the inventory
  // Reihenfolge der Alternation wichtig: laengere zuerst (json vor js, sonst matcht "package.json" als "package.js")
  const fileRefs = [...content.matchAll(/[├└]── ([^\s←]+\.(json|md|py|sh|js))/g)].map(m => m[1]);

  for (const ref of fileRefs) {
    const fullPath = path.join(PROJECT_PATH, ref);
    if (fs.existsSync(fullPath)) continue;

    // Fallback: tree-format gibt nur den Basename — rekursiv suchen
    const basename = path.basename(ref);
    let found = false;
    try {
      const out = execSync(
        `find "${PROJECT_PATH}" -name "${basename}" -not -path '*/node_modules/*' -not -path '*/.git/*' -print -quit`,
        { encoding: 'utf8' }
      ).trim();
      found = out.length > 0;
    } catch { /* find failed → not found */ }

    if (!found) {
      warnings.push(`U: Documented file missing on filesystem: ${ref}`);
    }
  }

  if (warnings.length === 0) {
    console.log(`[U] Component inventory OK (${fileRefs.length} files checked) ✓`);
  }
  return warnings;
}

// ─── Check P: Daemon Health ──────────────────────────────────────────────────

function readRestartHistory() {
  try {
    return JSON.parse(fs.readFileSync(RESTART_HISTORY_PATH, 'utf8'));
  } catch { return {}; }
}

function writeRestartHistory(history) {
  const dir = path.dirname(RESTART_HISTORY_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(RESTART_HISTORY_PATH, JSON.stringify(history, null, 2));
}

function canRestart(name, history) {
  const now      = Date.now();
  const entries  = (history[name] || []).filter(ts => now - ts < 60 * 60 * 1000);
  history[name]  = entries;
  if (entries.length >= BACKOFF.maxPerHour) return false;
  const lastTs   = entries[entries.length - 1] || 0;
  return (now - lastTs) > BACKOFF.cooldownMs;
}

async function checkDaemons() {
  const warnings = [];
  if (DAEMON_CHECKS.length === 0) return warnings;

  const history = readRestartHistory();

  for (const daemon of DAEMON_CHECKS) {
    const lockPath = path.join(PROJECT_PATH, daemon.lockFile);
    const isHeld   = fs.existsSync(lockPath);

    // Quick lock-file check (non-blocking)
    let running = false;
    try {
      execSync(`flock -n ${lockPath} true 2>/dev/null`, { stdio: 'ignore' });
      running = false; // could acquire lock → not running
    } catch {
      running = true; // could not acquire → lock held → running
    }

    if (!running) {
      if (canRestart(daemon.name, history)) {
        history[daemon.name] = [...(history[daemon.name] || []), Date.now()];
        console.log(`[P] Restarting ${daemon.name}...`);
        try {
          spawn('bash', [path.join(PROJECT_PATH, daemon.startScript)],
            { detached: true, stdio: 'ignore' }).unref();
          warnings.push(`P: ${daemon.name} was down — restart triggered`);
        } catch (err) {
          warnings.push(`P: ${daemon.name} down — restart failed: ${err.message}`);
        }
      } else {
        warnings.push(`P: ${daemon.name} down — backoff active (>${BACKOFF.maxPerHour} restarts/h)`);
      }
    } else {
      console.log(`[P] ${daemon.name} running ✓`);
    }
  }

  writeRestartHistory(history);
  return warnings;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function run() {
  console.log(`\n[Self-Healing] ${new Date().toISOString()} — Start (v${VERSION})`);

  const allWarnings = [
    ...await checkVersionSync(),
    ...await checkComponentInventory(),
    ...await checkDaemons(),
  ];

  if (allWarnings.length === 0) {
    console.log('[Self-Healing] All checks passed — system healthy ✓\n');
    return;
  }

  console.log(`\n[Self-Healing] ${allWarnings.length} warning(s):`);
  for (const w of allWarnings) {
    console.warn('  ⚠', w);
  }

  // Send single combined alert (avoid spam)
  await alert(allWarnings.join('\n'));
}

run().catch(err => {
  console.error('[Self-Healing] Fatal error:', err);
  process.exit(1);
});
