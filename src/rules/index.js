const fs = require('fs');
const path = require('path');
const { claudeHome } = require('../settings/paths');

const RULES_DIR = __dirname;
const PACKS_DIR = path.join(RULES_DIR, 'packs');

function loadJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function loadCoreAllow() {
  return loadJson(path.join(RULES_DIR, 'core-allow.json'));
}

function loadCoreDeny() {
  return loadJson(path.join(RULES_DIR, 'core-deny.json'));
}

function availablePacks() {
  if (!fs.existsSync(PACKS_DIR)) return [];
  return fs
    .readdirSync(PACKS_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace(/\.json$/, ''));
}

function loadPack(name) {
  const p = path.join(PACKS_DIR, `${name}.json`);
  if (!fs.existsSync(p)) {
    const err = new Error(`Unknown pack: ${name}`);
    err.code = 'CSA_UNKNOWN_PACK';
    throw err;
  }
  return loadJson(p);
}

function userRulesPath() {
  return path.join(claudeHome(), 'csa', 'rules.user.json');
}

function loadUserRules() {
  const p = userRulesPath();
  if (!fs.existsSync(p)) return { allow: [], deny: [] };
  try {
    const data = loadJson(p);
    return {
      allow: Array.isArray(data.allow) ? data.allow : [],
      deny: Array.isArray(data.deny) ? data.deny : [],
    };
  } catch (e) {
    return { allow: [], deny: [] };
  }
}

function composeRules({ packs = [], includeUser = true } = {}) {
  const coreAllow = loadCoreAllow().allow || [];
  const coreDeny = loadCoreDeny().deny || [];
  const allow = [...coreAllow];
  const deny = [...coreDeny];
  for (const name of packs) {
    const pack = loadPack(name);
    if (Array.isArray(pack.allow)) allow.push(...pack.allow);
    if (Array.isArray(pack.deny)) deny.push(...pack.deny);
  }
  if (includeUser) {
    const user = loadUserRules();
    allow.push(...user.allow);
  }
  const denySet = new Set(deny);
  const dedupedAllow = Array.from(new Set(allow)).filter((r) => !denySet.has(r));
  const dedupedDeny = Array.from(new Set(deny));
  return { allow: dedupedAllow, deny: dedupedDeny };
}

module.exports = {
  loadCoreAllow,
  loadCoreDeny,
  availablePacks,
  loadPack,
  loadUserRules,
  userRulesPath,
  composeRules,
};
