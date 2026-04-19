const os = require('os');
const path = require('path');
const fs = require('fs');

function claudeHome() {
  return path.join(os.homedir(), '.claude');
}

function csaHome() {
  return path.join(claudeHome(), 'csa');
}

function csaHooksDir() {
  return path.join(csaHome(), 'hooks');
}

function csaBackupsDir() {
  return path.join(csaHome(), 'backups');
}

function csaStatsFile() {
  return path.join(csaHome(), 'stats.json');
}

function globalSettingsPath() {
  return path.join(claudeHome(), 'settings.json');
}

function localSettingsPath(cwd = process.cwd()) {
  return path.join(cwd, '.claude', 'settings.local.json');
}

function sharedSettingsPath(cwd = process.cwd()) {
  return path.join(cwd, '.claude', 'settings.json');
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function resolveTargets({ scope, cwd = process.cwd() }) {
  const targets = [];
  if (scope === 'global' || scope === 'both') {
    targets.push({ scope: 'global', path: globalSettingsPath() });
  }
  if (scope === 'local' || scope === 'both') {
    targets.push({ scope: 'local', path: localSettingsPath(cwd) });
  }
  return targets;
}

module.exports = {
  claudeHome,
  csaHome,
  csaHooksDir,
  csaBackupsDir,
  csaStatsFile,
  globalSettingsPath,
  localSettingsPath,
  sharedSettingsPath,
  ensureDir,
  resolveTargets,
};
