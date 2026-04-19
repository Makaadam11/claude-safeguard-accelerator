const { latestBackup, restoreBackup } = require('../settings/backup');
const { uninstallHook } = require('../hooks/install');
const { markDisabled } = require('../stats/recorder');
const log = require('../util/logger');

async function run(opts = {}) {
  log.header('Claude Safeguard Accelerator — disable');
  const backup = latestBackup();
  if (!backup) {
    log.error('No backup found. Nothing to restore.');
    const err = new Error('No CSA backup found');
    err.code = 'CSA_NO_BACKUP';
    err.exitCode = 2;
    throw err;
  }
  log.kv('restoring from', backup.path);
  const { restored } = restoreBackup(backup.path);
  for (const r of restored) {
    log.success(`${r.action}: ${r.scope} (${r.path})`);
  }
  const hookPath = uninstallHook();
  log.success(`hook removed: ${hookPath}`);
  markDisabled();
  log.success('CSA disabled. Backups preserved for re-enable.');
  return { restored, backupPath: backup.path };
}

module.exports = { run };
