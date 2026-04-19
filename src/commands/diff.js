const fs = require('fs');
const path = require('path');
const { latestBackup, readManifest } = require('../settings/backup');
const log = require('../util/logger');

function normalize(raw) {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2).split('\n');
  } catch (_) {
    return (raw || '').split('\n');
  }
}

function simpleDiff(aLines, bLines, label) {
  log.header(label);
  const max = Math.max(aLines.length, bLines.length);
  let changes = 0;
  for (let i = 0; i < max; i++) {
    const a = aLines[i];
    const b = bLines[i];
    if (a === b) continue;
    changes++;
    if (a !== undefined) process.stdout.write(`- ${a}\n`);
    if (b !== undefined) process.stdout.write(`+ ${b}\n`);
  }
  if (changes === 0) log.kv('(no changes)', '');
}

async function run() {
  const backup = latestBackup();
  if (!backup) {
    log.warn('No backup found.');
    return;
  }
  const manifest = readManifest(backup.path);
  log.header('Diff: backup vs current');
  log.kv('backup', backup.path);
  for (const t of manifest.targets) {
    const label = `${t.scope} — ${t.originalPath}`;
    const backupContents = t.existed
      ? fs.readFileSync(path.join(backup.path, t.backupFile), 'utf8')
      : '';
    const currentContents = fs.existsSync(t.originalPath)
      ? fs.readFileSync(t.originalPath, 'utf8')
      : '';
    simpleDiff(normalize(backupContents), normalize(currentContents), label);
  }
}

module.exports = { run };
