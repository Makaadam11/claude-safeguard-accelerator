const fs = require('fs');
const { composeRules, availablePacks } = require('../rules');
const { globalSettingsPath, localSettingsPath } = require('../settings/paths');
const { readSettings } = require('../settings/read');
const { CSA_MARKER } = require('../settings/merge');
const log = require('../util/logger');

function listAllow(opts) {
  const packs = opts.pack ? opts.pack.split(',').map((s) => s.trim()) : [];
  const rules = composeRules({ packs });
  log.header(`Allow-list (${rules.allow.length})`);
  rules.allow.forEach((r) => process.stdout.write(r + '\n'));
}

function listDeny(opts) {
  const packs = opts.pack ? opts.pack.split(',').map((s) => s.trim()) : [];
  const rules = composeRules({ packs });
  log.header(`Deny-list (${rules.deny.length})`);
  rules.deny.forEach((r) => process.stdout.write(r + '\n'));
}

function listPacks() {
  log.header('Available packs');
  availablePacks().forEach((p) => process.stdout.write(p + '\n'));
}

function listHooksFor(label, filePath) {
  if (!fs.existsSync(filePath)) return;
  const { data } = readSettings(filePath);
  const pre = (data.hooks && data.hooks.PreToolUse) || [];
  log.header(`${label} PreToolUse (${pre.length})`);
  pre.forEach((h, i) => {
    const managed = h && h.__csa === CSA_MARKER ? ' [CSA]' : '';
    log.kv(`#${i}${managed}`, `matcher=${h.matcher || '(any)'}`);
    (h.hooks || []).forEach((hh) => {
      log.kv('  type', hh.type || '');
      log.kv('  command', hh.command || '');
    });
  });
}

function listHooks() {
  listHooksFor('global', globalSettingsPath());
  listHooksFor('local', localSettingsPath());
}

async function run(target, opts = {}) {
  switch (target) {
    case 'allow':
      return listAllow(opts);
    case 'deny':
      return listDeny(opts);
    case 'packs':
      return listPacks();
    case 'hooks':
      return listHooks();
    default: {
      const err = new Error(
        `Unknown list target: ${target}. Use: allow | deny | packs | hooks`
      );
      err.code = 'CSA_BAD_ARG';
      throw err;
    }
  }
}

module.exports = { run };
