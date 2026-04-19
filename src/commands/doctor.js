const fs = require('fs');
const { globalSettingsPath, localSettingsPath } = require('../settings/paths');
const { readSettings } = require('../settings/read');
const { installedHookPath } = require('../hooks/install');
const { CSA_MARKER } = require('../settings/merge');
const log = require('../util/logger');

function check(label, ok, detail) {
  if (ok) log.success(`${label}  ${detail || ''}`);
  else log.error(`${label}  ${detail || ''}`);
  return ok;
}

async function run() {
  log.header('Claude Safeguard Accelerator — doctor');
  let ok = true;

  const nodeOk = Number(process.versions.node.split('.')[0]) >= 18;
  ok &= check('node >= 18', nodeOk, `(current: ${process.versions.node})`);

  const hookPath = installedHookPath();
  const hookExists = fs.existsSync(hookPath);
  ok &= check('hook script present', hookExists, hookPath);

  for (const [label, p] of [
    ['global', globalSettingsPath()],
    ['local', localSettingsPath()],
  ]) {
    if (!fs.existsSync(p)) {
      check(`${label} settings`, true, '(not present)');
      continue;
    }
    try {
      const { data } = readSettings(p);
      const pre = (data.hooks && data.hooks.PreToolUse) || [];
      const csaHook = pre.find((h) => h && h.__csa === CSA_MARKER);
      check(`${label} settings valid JSON`, true, p);
      if (csaHook) {
        const cmd = csaHook.hooks && csaHook.hooks[0] && csaHook.hooks[0].command;
        const refsScript = cmd && cmd.includes(hookPath.replace(/\\/g, '\\\\').slice(0, 10));
        check(`${label} CSA hook wired`, Boolean(cmd), cmd || '(missing command)');
        const reachable = cmd && hookExists;
        ok &= check(`${label} hook reachable`, Boolean(reachable));
      } else {
        log.warn(`${label}: no CSA hook installed`);
      }
      const allow = (data.permissions && data.permissions.allow) || [];
      const deny = (data.permissions && data.permissions.deny) || [];
      const overlap = allow.filter((r) => deny.includes(r));
      ok &= check(
        `${label} allow/deny disjoint`,
        overlap.length === 0,
        overlap.length ? `(overlap: ${overlap.join(', ')})` : ''
      );
    } catch (e) {
      ok &= check(`${label} settings valid JSON`, false, e.message);
    }
  }

  log.header(ok ? 'All good.' : 'Issues detected.');
  if (!ok) {
    const err = new Error('doctor failed');
    err.exitCode = 3;
    throw err;
  }
}

module.exports = { run };
