#!/usr/bin/env node
'use strict';

const { Command } = require('commander');
const pkg = require('../package.json');
const log = require('../src/util/logger');

const program = new Command();
program
  .name('csa')
  .description('Claude Safeguard Accelerator — safer, faster Claude Code.')
  .version(pkg.version, '-v, --version');

function handle(fn) {
  return async (...args) => {
    try {
      await fn(...args);
    } catch (e) {
      log.error(e.message || String(e));
      process.exit(e.exitCode || 1);
    }
  };
}

program
  .command('enable')
  .description('Apply safeguards to global and/or local Claude Code settings.')
  .option('--global', 'apply to ~/.claude/settings.json only')
  .option('--local', 'apply to ./.claude/settings.local.json only')
  .option('--pack <names>', 'comma-separated rule packs (e.g. node,python,git)')
  .action(handle((opts) => require('../src/commands/enable').run(opts)));

program
  .command('disable')
  .description('Revert settings to the most recent CSA backup and remove the hook.')
  .action(handle(() => require('../src/commands/disable').run()));

program
  .command('status')
  .description('Show whether CSA is active and which settings are managed.')
  .action(handle(() => require('../src/commands/status').run()));

program
  .command('stats')
  .description('Show allow/deny/hook-block counters.')
  .option('--json', 'output raw JSON')
  .option('--recent', 'include recent events')
  .action(handle((opts) => require('../src/commands/stats').run(opts)));

program
  .command('list <target>')
  .description('Print rules: allow | deny | packs | hooks.')
  .option('--pack <names>', 'comma-separated packs for allow/deny listings')
  .action(handle((target, opts) => require('../src/commands/list').run(target, opts)));

program
  .command('diff')
  .description('Show diff between current settings and most recent backup.')
  .action(handle(() => require('../src/commands/diff').run()));

program
  .command('doctor')
  .description('Validate settings, hook installation, and environment.')
  .action(handle(() => require('../src/commands/doctor').run()));

program
  .command('update')
  .description('How to update CSA.')
  .action(handle(() => require('../src/commands/update').run()));

program.parseAsync(process.argv).catch((e) => {
  log.error(e.message || String(e));
  process.exit(1);
});
