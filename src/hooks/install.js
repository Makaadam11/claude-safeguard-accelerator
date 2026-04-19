const fs = require('fs');
const path = require('path');
const { csaHooksDir, ensureDir } = require('../settings/paths');

const HOOK_FILENAME = 'pretool-guard.js';

function sourceHookPath() {
  return path.join(__dirname, HOOK_FILENAME);
}

function installedHookPath() {
  return path.join(csaHooksDir(), HOOK_FILENAME);
}

function installHook() {
  ensureDir(csaHooksDir());
  const src = sourceHookPath();
  const dst = installedHookPath();
  const contents = fs.readFileSync(src, 'utf8');
  fs.writeFileSync(dst, contents, { mode: 0o755 });
  return dst;
}

function uninstallHook() {
  const dst = installedHookPath();
  if (fs.existsSync(dst)) fs.unlinkSync(dst);
  return dst;
}

function hookCommand() {
  // Using node explicitly works on Windows where shebangs are not respected.
  return `node "${installedHookPath()}"`;
}

module.exports = {
  HOOK_FILENAME,
  sourceHookPath,
  installedHookPath,
  installHook,
  uninstallHook,
  hookCommand,
};
