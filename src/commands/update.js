const https = require('https');
const pkg = require('../../package.json');
const log = require('../util/logger');

function fetchLatestVersion(timeoutMs = 3000) {
  return new Promise((resolve) => {
    const req = https.get(
      'https://registry.npmjs.org/claude-safeguard-accelerator/latest',
      { headers: { Accept: 'application/json' } },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          resolve(null);
          return;
        }
        let buf = '';
        res.setEncoding('utf8');
        res.on('data', (c) => (buf += c));
        res.on('end', () => {
          try {
            const data = JSON.parse(buf);
            resolve(typeof data.version === 'string' ? data.version : null);
          } catch (_) {
            resolve(null);
          }
        });
      }
    );
    req.on('error', () => resolve(null));
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      resolve(null);
    });
  });
}

async function run() {
  log.header('Claude Safeguard Accelerator — update');
  log.kv('installed', pkg.version);

  const latest = await fetchLatestVersion();
  if (!latest) {
    log.warn('Could not reach the npm registry to check for updates.');
  } else if (latest === pkg.version) {
    log.success(`You are on the latest version (${latest}).`);
  } else {
    log.kv('latest', latest);
    log.info('A newer version is available. To update:');
    log.info('  npm i -g claude-safeguard-accelerator@latest');
    log.info('Then re-apply rules:');
    log.info('  csa enable');
  }
}

module.exports = { run };
