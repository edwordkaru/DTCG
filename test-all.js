#!/usr/bin/env node
// Round 22DF: stable root regression entrypoint.
// `npm test` must not depend on missing root test files or on legacy tests being
// run from a directory where `require('./game-state.js')` cannot resolve.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = __dirname;
const LEGACY_DIR = path.join(ROOT, 'test report');
const CHECK_FILES = [
  'server.js',
  'i18n.js',
  'tournament-admin.js',
  'game-state.js',
  'auto-mechanics.js',
  'fetch-cards.js',
  'official-report-writer.js',
  'audit-mechanics.js',
  'meta-match-sim.js'
];

function runNode(args, label) {
  const result = spawnSync(process.execPath, args, {
    cwd: ROOT,
    stdio: 'inherit',
    env: process.env
  });
  if (result.error) {
    console.error(`\n❌ ${label} failed to start: ${result.error.message}`);
    return false;
  }
  if (result.status !== 0) {
    console.error(`\n❌ ${label} failed with exit code ${result.status}`);
    return false;
  }
  console.log(`✅ ${label}`);
  return true;
}

function ensureLegacyRequireShims() {
  if (!fs.existsSync(LEGACY_DIR)) return;
  const jsShim = path.join(LEGACY_DIR, 'game-state.js');
  if (!fs.existsSync(jsShim)) {
    fs.writeFileSync(jsShim, "module.exports = require('../game-state.js');\n", 'utf8');
  }
  const cardsShim = path.join(LEGACY_DIR, 'cards.json');
  if (!fs.existsSync(cardsShim)) {
    try {
      fs.symlinkSync(path.join(ROOT, 'cards.json'), cardsShim);
    } catch (e) {
      // Windows without symlink permission: copy once. This is only a local test shim.
      fs.copyFileSync(path.join(ROOT, 'cards.json'), cardsShim);
    }
  }
}

function runLegacy(fileName) {
  const candidates = [path.join(ROOT, fileName), path.join(LEGACY_DIR, fileName)];
  const target = candidates.find(fs.existsSync);
  if (!target) {
    console.log(`⚠️  Legacy test not found, skipped: ${fileName}`);
    return true;
  }
  ensureLegacyRequireShims();
  return runNode([target], `legacy ${fileName}`);
}

function runCore() {
  let ok = true;
  for (const file of CHECK_FILES) {
    if (!fs.existsSync(path.join(ROOT, file))) continue;
    ok = runNode(['--check', file], `syntax ${file}`) && ok;
  }
  ok = runNode(['audit-mechanics.js'], 'audit-mechanics') && ok;
  ok = runNode(['meta-match-sim.js'], 'meta-match-sim') && ok;
  return ok;
}

const args = process.argv.slice(2);
let ok = true;
if (args[0] === '--legacy') {
  ok = runLegacy(args[1] || 'test-all.js');
} else {
  ok = runCore();
  if (args.includes('--all') && fs.existsSync(path.join(LEGACY_DIR, 'test-all.js'))) {
    ok = runLegacy('test-all.js') && ok;
  }
}
process.exit(ok ? 0 : 1);
