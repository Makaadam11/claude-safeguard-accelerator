const pc = require('picocolors');

function info(msg) {
  process.stdout.write(`${pc.cyan('→')} ${msg}\n`);
}

function success(msg) {
  process.stdout.write(`${pc.green('✓')} ${msg}\n`);
}

function warn(msg) {
  process.stdout.write(`${pc.yellow('!')} ${msg}\n`);
}

function error(msg) {
  process.stderr.write(`${pc.red('✗')} ${msg}\n`);
}

function header(msg) {
  process.stdout.write(`\n${pc.bold(msg)}\n`);
}

function kv(k, v) {
  process.stdout.write(`  ${pc.dim(k.padEnd(18))} ${v}\n`);
}

function hr() {
  process.stdout.write(pc.dim('─'.repeat(60)) + '\n');
}

module.exports = { info, success, warn, error, header, kv, hr, pc };
