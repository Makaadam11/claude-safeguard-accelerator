const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function freshHome() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'csa-home-'));
  process.env.HOME = tmp;
  process.env.USERPROFILE = tmp;
  return tmp;
}

test('backup + restore round-trip preserves file bytes', () => {
  freshHome();
  // Must require AFTER setting HOME so paths are re-evaluated.
  delete require.cache[require.resolve('../src/settings/paths')];
  delete require.cache[require.resolve('../src/settings/backup')];
  const { globalSettingsPath } = require('../src/settings/paths');
  const { createBackup, restoreBackup } = require('../src/settings/backup');

  const target = globalSettingsPath();
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const original = JSON.stringify({ permissions: { allow: ['Bash(ls)'] } }, null, 2) + '\n';
  fs.writeFileSync(target, original);

  const { dir } = createBackup([{ scope: 'global', path: target }]);
  fs.writeFileSync(target, '{"mutated": true}');
  assert.notEqual(fs.readFileSync(target, 'utf8'), original);

  restoreBackup(dir);
  assert.equal(fs.readFileSync(target, 'utf8'), original);
});

test('restore removes files that did not exist pre-CSA', () => {
  freshHome();
  delete require.cache[require.resolve('../src/settings/paths')];
  delete require.cache[require.resolve('../src/settings/backup')];
  const { globalSettingsPath } = require('../src/settings/paths');
  const { createBackup, restoreBackup } = require('../src/settings/backup');

  const target = globalSettingsPath();
  // Do NOT create the file — simulate fresh install.
  const { dir } = createBackup([{ scope: 'global', path: target }]);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, '{"added_by_csa": true}');
  assert.ok(fs.existsSync(target));

  restoreBackup(dir);
  assert.equal(fs.existsSync(target), false);
});
