const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const testDir = __dirname;
const files = fs
  .readdirSync(testDir)
  .filter((f) => f.endsWith('.test.js'))
  .map((f) => path.join(testDir, f));

if (files.length === 0) {
  console.error('No test files found in', testDir);
  process.exit(1);
}

const res = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' });
process.exit(res.status == null ? 1 : res.status);
