#!/usr/bin/env node
/*
 * Claude Safeguard Accelerator — PreToolUse hook.
 *
 * Self-contained: imports nothing from the CSA package. Copied verbatim to
 * ~/.claude/csa/hooks/pretool-guard.js at `csa enable`. Removed at `csa disable`.
 *
 * Contract: receives JSON on stdin describing the pending tool use.
 *   - exit 0       -> allow (Claude continues)
 *   - exit 2       -> block (stderr is shown to Claude)
 *   - other codes  -> non-blocking error; Claude proceeds
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const STATS_FILE = path.join(os.homedir(), '.claude', 'csa', 'stats.json');

// --- Dangerous command patterns -------------------------------------------------
// Each entry: { id, test(cmd, argv) -> string|null (reason) }
const DANGER_PATTERNS = [
  {
    id: 'rm-rf-root',
    test: (cmd) =>
      /\brm\s+(-[a-zA-Z]*r[a-zA-Z]*f[a-zA-Z]*|-[a-zA-Z]*f[a-zA-Z]*r[a-zA-Z]*|--recursive\b.*--force\b|--force\b.*--recursive\b)\s+(\/|\/\*|~|\$HOME|\.\.\/?|\*)(\s|$)/.test(
        cmd
      )
        ? 'Recursive force-remove targeting root, home, parent, or glob.'
        : null,
  },
  {
    id: 'rm-rf-unsafe',
    test: (cmd) => {
      if (!/\brm\s+/.test(cmd)) return null;
      const hasRF = /\brm\s+(-[a-zA-Z]*r[a-zA-Z]*f[a-zA-Z]*|-[a-zA-Z]*f[a-zA-Z]*r[a-zA-Z]*|--recursive\b.*--force\b)/.test(
        cmd
      );
      if (!hasRF) return null;
      // Allow rm -rf on node_modules, dist, build, .next, .cache, coverage, tmp
      const safePath = /\brm\s+-[rRfF]+\s+(\.\/)?(node_modules|dist|build|out|\.next|\.nuxt|\.cache|coverage|tmp|\.turbo|target)(\/|\s|$)/;
      if (safePath.test(cmd)) return null;
      return 'Recursive force-remove of non-standard target. Remove manually if intentional.';
    },
  },
  {
    id: 'rm-obfuscated',
    test: (cmd) => {
      // rm wrapped in command substitution ($(...) or `...`), combined with -rf somewhere.
      const rmInSubst = /\$\([^)]*\brm\b[^)]*\)|`[^`]*\brm\b[^`]*`/.test(cmd);
      const hasRF = /-[a-zA-Z]*r[a-zA-Z]*f[a-zA-Z]*\b/.test(cmd);
      if (rmInSubst && hasRF) {
        return 'Obfuscated rm via command substitution with recursive/force flag.';
      }
      return null;
    },
  },
  {
    id: 'pipe-to-shell',
    test: (cmd) =>
      /\b(curl|wget|fetch)\b[^|]*\|\s*(sh|bash|zsh|ksh|dash|fish)(\s|$)/.test(cmd)
        ? 'Piping downloaded content directly to a shell.'
        : null,
  },
  {
    id: 'sudo',
    test: (cmd) =>
      /(^|\s|[;&|])sudo(\s|$)/.test(cmd) ? 'sudo is blocked.' : null,
  },
  {
    id: 'su',
    test: (cmd) =>
      /(^|\s|[;&|])su\s+(-|[a-zA-Z])/.test(cmd) ? 'su is blocked.' : null,
  },
  {
    id: 'force-push',
    test: (cmd) =>
      /\bgit\s+push\b.*(-f\b|--force\b)/.test(cmd)
        ? 'git push --force is blocked.'
        : null,
  },
  {
    id: 'no-verify',
    test: (cmd) =>
      /\bgit\s+(commit|push)\b.*--no-verify\b/.test(cmd)
        ? 'git --no-verify bypasses hooks and is blocked.'
        : null,
  },
  {
    id: 'hard-reset',
    test: (cmd) =>
      /\bgit\s+reset\s+--hard\b/.test(cmd)
        ? 'git reset --hard discards uncommitted work.'
        : null,
  },
  {
    id: 'git-clean',
    test: (cmd) =>
      /\bgit\s+clean\s+-[a-zA-Z]*f[a-zA-Z]*d[a-zA-Z]*/.test(cmd) ||
      /\bgit\s+clean\s+-[a-zA-Z]*d[a-zA-Z]*f[a-zA-Z]*/.test(cmd)
        ? 'git clean -fd deletes untracked files.'
        : null,
  },
  {
    id: 'fork-bomb',
    test: (cmd) => (cmd.includes(':(){') ? 'Fork bomb pattern detected.' : null),
  },
  {
    id: 'dd-block',
    test: (cmd) =>
      /\bdd\b.*\bof=\/dev\//.test(cmd) ? 'dd to a device node.' : null,
  },
  {
    id: 'mkfs',
    test: (cmd) => (/\bmkfs(\.\w+)?\b/.test(cmd) ? 'Filesystem format command.' : null),
  },
  {
    id: 'shutdown',
    test: (cmd) =>
      /(^|\s|[;&|])(shutdown|reboot|halt|poweroff)(\s|$)/.test(cmd)
        ? 'Power-state command.'
        : null,
  },
  {
    id: 'npm-publish',
    test: (cmd) =>
      /\b(npm|pnpm|yarn)\s+(publish|unpublish|deprecate|login|adduser)\b/.test(cmd)
        ? 'Registry publish/auth command.'
        : null,
  },
  {
    id: 'chmod-777',
    test: (cmd) =>
      /\bchmod\s+(-R\s+)?0?777\b/.test(cmd) ? 'chmod 777 is blocked.' : null,
  },
  {
    id: 'eval-decoded',
    test: (cmd) =>
      /(base64\s+-d|base64\s+--decode)[^|]*\|\s*(sh|bash|zsh|eval)/.test(cmd)
        ? 'Piping decoded content to a shell.'
        : null,
  },
  {
    id: 'cloud-cli',
    test: (cmd) => {
      if (!/(^|\s|[;&|])(aws|gcloud|az)\s/.test(cmd)) return null;
      // Allow read-only verbs
      if (/(^|\s)(aws|gcloud|az)\s+(--version|help|configure\s+list)/.test(cmd))
        return null;
      return 'Cloud CLI write commands require manual approval.';
    },
  },
  {
    id: 'kubectl-write',
    test: (cmd) =>
      /\bkubectl\s+(delete|apply|replace|patch|scale|rollout|drain|cordon|uncordon|exec)\b/.test(
        cmd
      )
        ? 'kubectl write/exec command.'
        : null,
  },
];

// After path normalization (\ -> /), patterns only need to match forward slashes.
const SECRET_PATH_PATTERNS = [
  /(^|\/)\.env(\.|$)/,
  /(^|\/)\.env$/,
  /\.aws\/credentials/,
  /\.aws\/config/,
  /(^|\/)\.ssh\//,
  /\/id_rsa(\.|$)/,
  /\/id_ed25519(\.|$)/,
  /\/id_ecdsa(\.|$)/,
  /\.pem$/,
  /\.key$/,
  /(^|\/)\.netrc$/,
  /(^|\/)\.npmrc$/,
  /(^|\/)\.pypirc$/,
];

// Write/Edit targets that would compromise the system or shell init.
// Read of these is fine; only block mutations.
const SYSTEM_PATH_PATTERNS = [
  /^\/etc\//i,
  /^\/usr\//i,
  /^\/System\//,
  /^\/Library\/(LaunchDaemons|LaunchAgents)\//,
  /^[a-z]:\/Windows\//i,
  /^[a-z]:\/Program Files( \(x86\))?\//i,
  /(^|\/)\.bashrc$/,
  /(^|\/)\.zshrc$/,
  /(^|\/)\.profile$/,
  /(^|\/)\.bash_profile$/,
  /(^|\/)\.zprofile$/,
  /(^|\/)\.bash_logout$/,
  /(^|\/)\.zshenv$/,
];

function normPath(p) {
  if (typeof p !== 'string') return '';
  return p.replace(/\\/g, '/');
}

function isSecretPath(p) {
  const norm = normPath(p);
  if (!norm) return false;
  return SECRET_PATH_PATTERNS.some((r) => r.test(norm));
}

function isSystemPath(p) {
  const norm = normPath(p);
  if (!norm) return false;
  return SYSTEM_PATH_PATTERNS.some((r) => r.test(norm));
}

// --- stdin helpers --------------------------------------------------------------
function readStdin() {
  return new Promise((resolve) => {
    let buf = '';
    if (process.stdin.isTTY) {
      resolve('');
      return;
    }
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => (buf += chunk));
    process.stdin.on('end', () => resolve(buf));
    process.stdin.on('error', () => resolve(buf));
    setTimeout(() => resolve(buf), 4500);
  });
}

// --- stats ----------------------------------------------------------------------
function recordStat(verdict, key) {
  try {
    const dir = path.dirname(STATS_FILE);
    fs.mkdirSync(dir, { recursive: true });
    let data = { version: 1, counts: { allow: {}, deny: {}, hookBlock: {} }, recent: [] };
    if (fs.existsSync(STATS_FILE)) {
      try {
        data = JSON.parse(fs.readFileSync(STATS_FILE, 'utf8')) || data;
      } catch (_) {}
    }
    data.counts = data.counts || { allow: {}, deny: {}, hookBlock: {} };
    data.counts[verdict] = data.counts[verdict] || {};
    data.counts[verdict][key] = (data.counts[verdict][key] || 0) + 1;
    data.recent = data.recent || [];
    data.recent.unshift({
      ts: new Date().toISOString(),
      verdict,
      key,
    });
    if (data.recent.length > 500) data.recent = data.recent.slice(0, 500);
    const tmp = `${STATS_FILE}.tmp-${process.pid}`;
    fs.writeFileSync(tmp, JSON.stringify(data));
    fs.renameSync(tmp, STATS_FILE);
  } catch (_) {
    // stats must never break the hook
  }
}

// --- main -----------------------------------------------------------------------
function evaluate(payload) {
  const toolName = payload && payload.tool_name;
  const input = (payload && payload.tool_input) || {};

  if (toolName === 'Bash') {
    const cmd = typeof input.command === 'string' ? input.command : '';
    if (!cmd) return { decision: 'allow' };
    for (const p of DANGER_PATTERNS) {
      const reason = p.test(cmd);
      if (reason) {
        return {
          decision: 'block',
          reason: `[CSA] ${reason} (rule: ${p.id})`,
          key: `Bash:${p.id}`,
        };
      }
    }
    return { decision: 'allow' };
  }

  if (toolName === 'Read' || toolName === 'Write' || toolName === 'Edit' || toolName === 'NotebookEdit') {
    const fp = input.file_path || input.notebook_path;
    if (isSecretPath(fp)) {
      return {
        decision: 'block',
        reason: `[CSA] Access to secret-like path is blocked: ${fp}`,
        key: `${toolName}:secret-path`,
      };
    }
    if (toolName !== 'Read' && isSystemPath(fp)) {
      return {
        decision: 'block',
        reason: `[CSA] Write/Edit to system or shell-init path is blocked: ${fp}`,
        key: `${toolName}:system-path`,
      };
    }
    return { decision: 'allow' };
  }

  return { decision: 'allow' };
}

async function main() {
  const raw = await readStdin();
  let payload = {};
  if (raw && raw.trim()) {
    try {
      payload = JSON.parse(raw);
    } catch (_) {
      process.exit(0);
    }
  }

  const verdict = evaluate(payload);
  if (verdict.decision === 'block') {
    recordStat('hookBlock', verdict.key || 'unknown');
    process.stderr.write(verdict.reason + '\n');
    process.exit(2);
  }
  process.exit(0);
}

main().catch(() => process.exit(0));
