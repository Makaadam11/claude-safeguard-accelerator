const fs = require('fs');
const { resolveTargets, ensureDir, csaHome } = require('../settings/paths');
const { readSettings } = require('../settings/read');
const { atomicWriteJson } = require('../settings/write');
const { mergeSettings } = require('../settings/merge');
const { composeRules, availablePacks } = require('../rules');
const { createBackup } = require('../settings/backup');
const { installHook, hookCommand } = require('../hooks/install');
const { markEnabled } = require('../stats/recorder');
const log = require('../util/logger');

function parseScope(opts) {
  if (opts.global && opts.local) return 'both';
  if (opts.global) return 'global';
  if (opts.local) return 'local';
  return 'both';
}

function parsePacks(opts) {
  if (!opts.pack) return [];
  const avail = availablePacks();
  const requested = opts.pack
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const unknown = requested.filter((p) => !avail.includes(p));
  if (unknown.length) {
    const err = new Error(
      `Unknown pack(s): ${unknown.join(', ')}. Available: ${avail.join(', ')}`
    );
    err.code = 'CSA_UNKNOWN_PACK';
    throw err;
  }
  return requested;
}

async function run(opts = {}) {
  ensureDir(csaHome());
  const scope = parseScope(opts);
  const packs = parsePacks(opts);
  const targets = resolveTargets({ scope });

  log.header('Claude Safeguard Accelerator — enable');
  log.kv('scope', scope);
  log.kv('packs', packs.length ? packs.join(', ') : '(core only)');
  for (const t of targets) log.kv(`target:${t.scope}`, t.path);

  const backup = createBackup(targets);
  log.success(`backup: ${backup.dir}`);

  const rules = composeRules({ packs });
  log.kv('allow rules', String(rules.allow.length));
  log.kv('deny rules', String(rules.deny.length));

  installHook();
  log.success('hook installed: PreToolUse/Bash');

  const cmd = hookCommand();
  const results = [];
  for (const t of targets) {
    const { data } = readSettings(t.path);
    const { next, droppedAllow } = mergeSettings(data, rules, cmd);
    atomicWriteJson(t.path, next);
    results.push({ scope: t.scope, path: t.path, droppedAllow });
    log.success(`patched ${t.scope}: ${t.path}`);
    if (droppedAllow.length) {
      log.warn(
        `${t.scope}: dropped ${droppedAllow.length} allow rules that conflict with deny-list`
      );
    }
  }

  markEnabled();
  log.success('CSA active. Run `csa status` to verify or `csa disable` to revert.');
  return { scope, packs, targets: results, backupDir: backup.dir };
}

module.exports = { run };
