const log = require('../util/logger');

async function run() {
  log.header('Claude Safeguard Accelerator — update');
  log.info('Rule packs ship with the published npm package.');
  log.info('To update, run:  npm i -g claude-safeguard-accelerator@latest');
  log.info('Then:            csa enable   (re-applies latest rules; prior backup preserved)');
}

module.exports = { run };
