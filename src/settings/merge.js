const CSA_MARKER = 'csa-managed';

function uniq(arr) {
  return Array.from(new Set(arr));
}

function mergePermissions(existing = {}, rules = {}) {
  const existingAllow = Array.isArray(existing.allow) ? existing.allow : [];
  const existingDeny = Array.isArray(existing.deny) ? existing.deny : [];
  const existingAsk = Array.isArray(existing.ask) ? existing.ask : [];

  const ruleAllow = Array.isArray(rules.allow) ? rules.allow : [];
  const ruleDeny = Array.isArray(rules.deny) ? rules.deny : [];

  const denySet = new Set([...ruleDeny, ...existingDeny]);
  const deny = uniq([...ruleDeny, ...existingDeny]);

  const allowCandidates = uniq([...existingAllow, ...ruleAllow]);
  const droppedAllow = [];
  const allow = allowCandidates.filter((rule) => {
    if (denySet.has(rule)) {
      droppedAllow.push(rule);
      return false;
    }
    return true;
  });

  const next = { ...existing, allow, deny };
  if (existingAsk.length > 0) next.ask = existingAsk;
  if (existing.defaultMode == null) next.defaultMode = 'default';
  return { permissions: next, droppedAllow };
}

function mergeHooks(existingHooks = {}, hookEntry) {
  const preexisting = Array.isArray(existingHooks.PreToolUse)
    ? existingHooks.PreToolUse
    : [];
  const filtered = preexisting.filter(
    (h) => !(h && h.__csa === CSA_MARKER)
  );
  return {
    ...existingHooks,
    PreToolUse: [...filtered, hookEntry],
  };
}

function buildHookEntry(hookCommand) {
  return {
    __csa: CSA_MARKER,
    matcher: 'Bash',
    hooks: [
      {
        type: 'command',
        command: hookCommand,
        timeout: 5000,
      },
    ],
  };
}

function mergeSettings(existing, rules, hookCommand) {
  const { permissions, droppedAllow } = mergePermissions(
    existing.permissions || {},
    rules
  );
  const hooks = mergeHooks(existing.hooks || {}, buildHookEntry(hookCommand));
  const next = {
    ...existing,
    permissions,
    hooks,
  };
  return { next, droppedAllow };
}

function stripCsa(existing) {
  const out = { ...existing };
  if (out.hooks && Array.isArray(out.hooks.PreToolUse)) {
    const filtered = out.hooks.PreToolUse.filter(
      (h) => !(h && h.__csa === CSA_MARKER)
    );
    if (filtered.length === 0) {
      const { PreToolUse, ...rest } = out.hooks;
      out.hooks = rest;
    } else {
      out.hooks = { ...out.hooks, PreToolUse: filtered };
    }
    if (Object.keys(out.hooks).length === 0) delete out.hooks;
  }
  return out;
}

module.exports = {
  CSA_MARKER,
  mergePermissions,
  mergeHooks,
  buildHookEntry,
  mergeSettings,
  stripCsa,
};
