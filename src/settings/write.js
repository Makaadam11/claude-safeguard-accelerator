const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function atomicWriteJson(filePath, data) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${filePath}.csa-${process.pid}-${Date.now()}.tmp`;
  const contents = JSON.stringify(data, null, 2) + '\n';
  fs.writeFileSync(tmp, contents, { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(tmp, filePath);
  return contents;
}

function checksum(str) {
  return crypto.createHash('sha256').update(str).digest('hex');
}

module.exports = { atomicWriteJson, checksum };
