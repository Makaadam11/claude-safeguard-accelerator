const fs = require('fs');
const { csaStatsFile, csaHome, ensureDir } = require('../settings/paths');

const EMPTY = () => ({
  version: 1,
  enabledAt: null,
  counts: { allow: {}, deny: {}, hookBlock: {} },
  recent: [],
});

function readStats() {
  const p = csaStatsFile();
  if (!fs.existsSync(p)) return EMPTY();
  try {
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    data.counts = data.counts || { allow: {}, deny: {}, hookBlock: {} };
    data.counts.allow = data.counts.allow || {};
    data.counts.deny = data.counts.deny || {};
    data.counts.hookBlock = data.counts.hookBlock || {};
    data.recent = data.recent || [];
    return data;
  } catch (_) {
    return EMPTY();
  }
}

function writeStats(data) {
  ensureDir(csaHome());
  const p = csaStatsFile();
  const tmp = `${p}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, p);
}

function markEnabled() {
  const data = readStats();
  data.enabledAt = new Date().toISOString();
  writeStats(data);
}

function markDisabled() {
  const data = readStats();
  data.disabledAt = new Date().toISOString();
  writeStats(data);
}

function topN(map, n = 5) {
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
}

function totals(map) {
  return Object.values(map).reduce((a, b) => a + b, 0);
}

module.exports = { readStats, writeStats, markEnabled, markDisabled, topN, totals };
