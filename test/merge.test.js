const test = require('node:test');
const assert = require('node:assert/strict');
const {
  mergeSettings,
  mergePermissions,
  stripCsa,
  CSA_MARKER,
} = require('../src/settings/merge');

test('mergePermissions unions allow and prepends deny', () => {
  const existing = { allow: ['Bash(ls)'], deny: ['Bash(sudo:*)'] };
  const rules = {
    allow: ['Bash(ls)', 'Bash(pwd)'],
    deny: ['Bash(rm -rf:*)'],
  };
  const { permissions } = mergePermissions(existing, rules);
  assert.deepEqual(permissions.allow.sort(), ['Bash(ls)', 'Bash(pwd)'].sort());
  assert.ok(permissions.deny.includes('Bash(rm -rf:*)'));
  assert.ok(permissions.deny.includes('Bash(sudo:*)'));
});

test('deny wins over allow on conflict', () => {
  const existing = { allow: ['Bash(sudo:*)'] };
  const rules = { deny: ['Bash(sudo:*)'] };
  const { permissions, droppedAllow } = mergePermissions(existing, rules);
  assert.deepEqual(permissions.allow, []);
  assert.deepEqual(droppedAllow, ['Bash(sudo:*)']);
});

test('mergeSettings installs a single marked CSA hook and replaces prior one', () => {
  const existing = {
    hooks: {
      PreToolUse: [
        { __csa: CSA_MARKER, matcher: 'Bash', hooks: [{ type: 'command', command: 'old' }] },
        { matcher: 'Write', hooks: [{ type: 'command', command: 'user-script' }] },
      ],
    },
  };
  const rules = { allow: [], deny: [] };
  const { next } = mergeSettings(existing, rules, 'node /new/path.js');
  const pre = next.hooks.PreToolUse;
  const csa = pre.filter((h) => h && h.__csa === CSA_MARKER);
  assert.equal(csa.length, 1, 'only one CSA hook should remain');
  assert.equal(csa[0].hooks[0].command, 'node /new/path.js');
  const user = pre.find((h) => h.matcher === 'Write');
  assert.ok(user, 'user hook should be preserved');
});

test('stripCsa removes CSA hook and leaves user hooks', () => {
  const existing = {
    hooks: {
      PreToolUse: [
        { __csa: CSA_MARKER, matcher: 'Bash', hooks: [] },
        { matcher: 'Write', hooks: [{ type: 'command', command: 'user' }] },
      ],
      Stop: [{ matcher: '*' }],
    },
  };
  const out = stripCsa(existing);
  assert.equal(out.hooks.PreToolUse.length, 1);
  assert.equal(out.hooks.PreToolUse[0].matcher, 'Write');
  assert.ok(out.hooks.Stop);
});

test('stripCsa removes empty hooks object', () => {
  const existing = {
    hooks: { PreToolUse: [{ __csa: CSA_MARKER, matcher: 'Bash', hooks: [] }] },
  };
  const out = stripCsa(existing);
  assert.equal(out.hooks, undefined);
});
