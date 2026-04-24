const test = require('node:test');
const assert = require('node:assert/strict');
const { composeRules, availablePacks, loadPack } = require('../src/rules');

test('core alone is strictly read-only (no Write/Edit/NotebookEdit)', () => {
  const { allow } = composeRules({ packs: [], includeUser: false });
  for (const forbidden of ['Write(**)', 'Edit(**)', 'NotebookEdit(**)']) {
    assert.ok(!allow.includes(forbidden), `core-allow must not contain ${forbidden}`);
  }
});

test('edits pack adds Write / Edit / NotebookEdit', () => {
  const { allow } = composeRules({ packs: ['edits'], includeUser: false });
  assert.ok(allow.includes('Write(**)'));
  assert.ok(allow.includes('Edit(**)'));
  assert.ok(allow.includes('NotebookEdit(**)'));
});

test('git pack is read-only (no add/commit/pull)', () => {
  const { allow } = composeRules({ packs: ['git'], includeUser: false });
  const forbidden = ['Bash(git add:*)', 'Bash(git commit -m:*)', 'Bash(git pull)'];
  for (const f of forbidden) {
    assert.ok(!allow.includes(f), `git pack should not contain ${f}`);
  }
  assert.ok(allow.includes('Bash(git status)'));
});

test('git-write pack contains the mutating git commands', () => {
  const { allow } = composeRules({ packs: ['git-write'], includeUser: false });
  assert.ok(allow.includes('Bash(git add:*)'));
  assert.ok(allow.includes('Bash(git commit -m:*)'));
  assert.ok(allow.includes('Bash(git pull)'));
});

test('available packs include edits and git-write', () => {
  const packs = availablePacks();
  assert.ok(packs.includes('edits'), 'edits pack must be available');
  assert.ok(packs.includes('git-write'), 'git-write pack must be available');
  assert.ok(packs.includes('git'));
  assert.ok(packs.includes('node'));
  assert.ok(packs.includes('python'));
  assert.ok(packs.includes('docker'));
});

test('node pack no longer auto-approves arbitrary --save-dev installs', () => {
  const pack = loadPack('node');
  assert.ok(!pack.allow.includes('Bash(npm install --save-dev:*)'));
});

test('core-deny drops shell-expanded pseudo-patterns', () => {
  const { deny } = composeRules({ packs: [], includeUser: false });
  const misleading = [
    'Bash(rm -rf $HOME*)',
    'Bash(rm -rf ~)',
    'Bash(rm -rf ~/*)',
    'Bash(rm -rf ..:*)',
    'Bash(rm -rf ../*)',
    'Bash(rm -rf /*)',
  ];
  for (const pat of misleading) {
    if (pat === 'Bash(rm -rf /*)') continue; // this stays — it's a plausible literal
    assert.ok(!deny.includes(pat), `core-deny should not contain misleading pattern ${pat}`);
  }
});
