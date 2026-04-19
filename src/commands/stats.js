const { readStats, topN, totals } = require('../stats/recorder');
const log = require('../util/logger');

function section(title, map, limit = 5) {
  const entries = topN(map, limit);
  log.header(title + `  (total: ${totals(map)})`);
  if (entries.length === 0) {
    log.kv('(none)', '');
    return;
  }
  for (const [k, v] of entries) {
    log.kv(String(v).padStart(6), k);
  }
}

async function run(opts = {}) {
  const data = readStats();
  if (opts.json) {
    process.stdout.write(JSON.stringify(data, null, 2) + '\n');
    return data;
  }
  log.header('Claude Safeguard Accelerator — stats');
  log.kv('enabledAt', data.enabledAt || '(never)');
  if (data.disabledAt) log.kv('disabledAt', data.disabledAt);

  section('Allow hits', data.counts.allow);
  section('Deny hits', data.counts.deny);
  section('Hook blocks', data.counts.hookBlock);

  if (opts.recent) {
    log.header('Recent events (up to 20)');
    (data.recent || []).slice(0, 20).forEach((e) => {
      log.kv(e.ts, `${e.verdict.padEnd(10)} ${e.key}`);
    });
  }
  return data;
}

module.exports = { run };
