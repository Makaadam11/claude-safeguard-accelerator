const fs = require('fs');
const { globalSettingsPath, localSettingsPath } = require('../settings/paths');
const { readSettings } = require('../settings/read');
const { CSA_MARKER } = require('../settings/merge');
const { installedHookPath } = require('../hooks/install');
const { latestBackup } = require('../settings/backup');
const { readStats } = require('../stats/recorder');
const pkg = require('../../package.json');
const log = require('../util/logger');

function hasCsaHook(settings) {
  const pre = settings && settings.hooks && settings.hooks.PreToolUse;
  if (!Array.isArray(pre)) return false;
  return pre.some((h) => h && h.__csa === CSA_MARKER);
}

function describeTarget(label, filePath) {
  const exists = fs.existsSync(filePath);
  if (!exists) {
    log.kv(label, '(not present)');
    return { label, path: filePath, exists, managed: false };
  }
  const { data } = readSettings(filePath);
  const managed = hasCsaHook(data);
  const allow = (data.permissions && data.permissions.allow) || [];
  const deny = (data.permissions && data.permissions.deny) || [];
  log.kv(label, `${filePath}`);
  log.kv('  managed', managed ? 'yes' : 'no');
  log.kv('  allow', String(allow.length));
  log.kv('  deny', String(deny.length));
  return { label, path: filePath, exists, managed, allow: allow.length, deny: deny.length };
}

async function run() {
  log.header(`Claude Safeguard Accelerator v${pkg.version}`);
  const hookPath = installedHookPath();
  const hookInstalled = fs.existsSync(hookPath);
  log.kv('hook', hookInstalled ? hookPath : '(not installed)');

  const backup = latestBackup();
  log.kv('latest backup', backup ? backup.path : '(none)');

  const stats = readStats();
  log.kv('enabled at', stats.enabledAt || '(never)');
  if (stats.disabledAt) log.kv('disabled at', stats.disabledAt);

  log.header('Settings');
  const g = describeTarget('global', globalSettingsPath());
  const l = describeTarget('local', localSettingsPath());

  const active = hookInstalled && (g.managed || l.managed);
  log.header('Overall');
  log.kv('state', active ? 'ACTIVE' : 'inactive');
  return { active, hookInstalled, global: g, local: l, backup: backup && backup.path };
}

module.exports = { run };
