const fs = require('fs');
const path = require('path');
const { csaBackupsDir, ensureDir } = require('./paths');
const { checksum, atomicWriteJson } = require('./write');

function timestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    '-' +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds())
  );
}

function createBackup(targets) {
  const dir = path.join(csaBackupsDir(), timestamp());
  ensureDir(dir);
  const manifest = {
    version: 1,
    createdAt: new Date().toISOString(),
    targets: [],
  };
  for (const t of targets) {
    const entry = {
      scope: t.scope,
      originalPath: t.path,
      existed: fs.existsSync(t.path),
    };
    if (entry.existed) {
      const raw = fs.readFileSync(t.path, 'utf8');
      const fname = `${t.scope}.json`;
      fs.writeFileSync(path.join(dir, fname), raw, 'utf8');
      entry.backupFile = fname;
      entry.checksum = checksum(raw);
    }
    manifest.targets.push(entry);
  }
  atomicWriteJson(path.join(dir, 'manifest.json'), manifest);
  return { dir, manifest };
}

function listBackups() {
  const dir = csaBackupsDir();
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => fs.existsSync(path.join(dir, name, 'manifest.json')))
    .sort()
    .reverse()
    .map((name) => ({
      name,
      path: path.join(dir, name),
    }));
}

function latestBackup() {
  return listBackups()[0] || null;
}

function readManifest(backupDir) {
  const p = path.join(backupDir, 'manifest.json');
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function restoreBackup(backupDir) {
  const manifest = readManifest(backupDir);
  if (!manifest) {
    const err = new Error(`No manifest found in ${backupDir}`);
    err.code = 'CSA_NO_MANIFEST';
    throw err;
  }
  const restored = [];
  for (const t of manifest.targets) {
    if (!t.existed) {
      if (fs.existsSync(t.originalPath)) {
        fs.unlinkSync(t.originalPath);
      }
      restored.push({ scope: t.scope, action: 'removed', path: t.originalPath });
      continue;
    }
    const backupFilePath = path.join(backupDir, t.backupFile);
    if (!fs.existsSync(backupFilePath)) {
      const err = new Error(`Backup file missing: ${backupFilePath}`);
      err.code = 'CSA_BACKUP_MISSING';
      throw err;
    }
    const raw = fs.readFileSync(backupFilePath, 'utf8');
    if (t.checksum && checksum(raw) !== t.checksum) {
      const err = new Error(`Backup checksum mismatch for ${t.scope}`);
      err.code = 'CSA_CHECKSUM_MISMATCH';
      throw err;
    }
    fs.mkdirSync(path.dirname(t.originalPath), { recursive: true });
    const tmp = `${t.originalPath}.csa-restore.tmp`;
    fs.writeFileSync(tmp, raw, 'utf8');
    fs.renameSync(tmp, t.originalPath);
    restored.push({ scope: t.scope, action: 'restored', path: t.originalPath });
  }
  return { manifest, restored };
}

module.exports = {
  createBackup,
  listBackups,
  latestBackup,
  readManifest,
  restoreBackup,
  timestamp,
};
