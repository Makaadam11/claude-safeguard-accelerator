# Claude Safeguard Accelerator (CSA)

[![CI](https://github.com/Makaadam11/claude-safeguard-accelerator/actions/workflows/ci.yml/badge.svg)](https://github.com/Makaadam11/claude-safeguard-accelerator/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/claude-safeguard-accelerator.svg)](https://www.npmjs.com/package/claude-safeguard-accelerator)
[![npm downloads](https://img.shields.io/npm/dm/claude-safeguard-accelerator.svg)](https://www.npmjs.com/package/claude-safeguard-accelerator)
[![node](https://img.shields.io/node/v/claude-safeguard-accelerator.svg)](https://nodejs.org)
[![license](https://img.shields.io/npm/l/claude-safeguard-accelerator.svg)](./LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/Makaadam11/claude-safeguard-accelerator.svg?style=social)](https://github.com/Makaadam11/claude-safeguard-accelerator)

A zero-config Node module that accelerates your Claude Code workflow by
auto-approving a **curated allow-list** of safe commands while **hard-denying
dangerous ones** — drastically reducing permission prompts without opening
the door to destructive actions.

CSA writes to both the **global** `~/.claude/settings.json` and the
**project-local** `.claude/settings.local.json`, backs up whatever was there
before, installs a `PreToolUse` hook as a second line of defense, and lets
you cleanly `disable` to restore the original state.

---

## Status

Early preview (`0.x`). API and rule-pack format may change between minor versions.
Bug reports very welcome — open an issue at
https://github.com/Makaadam11/claude-safeguard-accelerator/issues.

---

## Goals

| Goal                           | Why                                                              |
| ------------------------------ | ---------------------------------------------------------------- |
| Fewer permission prompts       | Dev velocity — Claude stops blocking on every `ls`, `git status` |
| Never auto-approve danger      | `rm -rf`, force-push, secret exfiltration stay manual (or denied)|
| Reversible                     | One command to restore the pre-install settings                  |
| Transparent                    | `csa stats` shows exactly what was changed, where, and why       |
| Layered defense                | `permissions` list + `PreToolUse` hook (regex on resolved argv)  |

---

## Install

```bash
# Global CLI (recommended)
npm install -g claude-safeguard-accelerator

# Or run without install
npx claude-safeguard-accelerator enable
```

Node >= 18 required.

---

## CLI

```
csa enable              Apply safeguards to global + project settings (backs up existing).
                        By default includes the `git` read-only pack.
csa enable --global     Apply only to ~/.claude/settings.json
csa enable --local      Apply only to ./.claude/settings.local.json
csa enable --pack N     Use these packs INSTEAD of the git default (e.g. --pack node,python)
csa enable --edits      Also auto-approve Write/Edit/NotebookEdit and mutating git commands
                        (add/commit/pull/checkout). Secret & system paths stay blocked.
csa enable --no-git     Skip the git pack that is enabled by default
csa disable             Revert to the most recent backup; remove CSA hook
csa status              Show whether CSA is active, version, backup path
csa stats               Show hook-block counters (allow/deny counts are not currently tracked)
csa list allow          Print the full allow-list
csa list deny           Print the full deny-list
csa list packs          Print available rule packs
csa list hooks          Print installed hooks
csa diff                Show diff between current settings and pre-CSA backup
csa update              Check npm for a newer version and print the upgrade command
csa doctor              Validate settings files, hook script, node/claude versions
```

Exit codes: `0` success, `1` user error, `2` settings/file error, `3` validation failure.

### Quick recipes

```bash
# Safe defaults (reads + git read-only). Recommended for first-time install.
csa enable

# Include node and python helpers, plus git read-only
csa enable --pack node,python

# Let Claude freely edit files and run mutating git (still blocks secrets/system paths)
csa enable --edits

# Minimal: only core safe shell commands, no git
csa enable --no-git
```

---

## How it works

### 1. Target files

| File                               | Scope                       |
| ---------------------------------- | --------------------------- |
| `~/.claude/settings.json`          | All projects, all sessions  |
| `./.claude/settings.local.json`    | Current project, git-ignored|

CSA **never** writes to `./.claude/settings.json` (the shared, committed file)
unless the user passes `--shared` — those changes belong in code review.

### 2. Backup

Before any mutation, CSA writes a timestamped backup under:

```
~/.claude/csa/backups/<timestamp>/
  ├── settings.json              # pre-CSA copy of global
  ├── settings.local.json        # pre-CSA copy of project-local
  └── manifest.json              # {version, timestamp, targets, checksums}
```

`csa disable` reads the latest manifest and restores both files atomically
(write to `*.tmp`, `fs.rename`). If the backup is missing or checksum-mismatched,
disable aborts with exit code 2 and prints the path.

### 3. Merge strategy

CSA merges, never overwrites, using these rules on the `permissions` object:

- `allow[]`: union of existing + CSA allow-list, de-duplicated
- `deny[]`: CSA deny-list **prepended** (deny always wins in Claude Code)
- `ask[]`: left untouched
- `defaultMode`: never touched
- Other keys (`env`, `model`, `hooks`, etc.): preserved; only `hooks.PreToolUse`
  gets a CSA entry appended with a `__csa: "csa-managed"` marker for clean removal

### 4. Allow-list (excerpt)

**Core** is strictly read-only / informational:

```jsonc
"allow": [
  "Bash(ls:*)", "Bash(pwd)", "Bash(cat:*)", "Bash(head:*)", "Bash(tail:*)",
  "Bash(wc:*)", "Bash(file:*)", "Bash(stat:*)", "Bash(du:*)", "Bash(df:*)",
  "Bash(which:*)", "Bash(echo:*)", "Bash(jq:*)", "Bash(tree:*)",
  "Bash(find . -name:*)", "Bash(diff:*)", "Bash(grep:*)",
  "Read(**)", "Grep(**)", "Glob(**)", "TodoWrite", "Task"
]
```

**`git` pack** (default on): `git status/diff/log/show/branch/remote/fetch/...` — strictly read-only.

**`node` / `python` / `docker` packs** (opt-in): version checks, test/lint runs, `npm ls`, `pip list`, `docker ps`, etc.

**`edits` pack** (opt-in via `--edits`): `Write(**)`, `Edit(**)`, `NotebookEdit(**)` — the `PreToolUse` hook still blocks writes to secret paths (`.env`, `.ssh/`) and system paths (`/etc/`, `~/.bashrc`, `C:\Windows\...`).

**`git-write` pack** (opt-in, auto-included by `--edits`): `git add/commit/pull/checkout/switch`.

Full list: `csa list allow` (or `csa list packs` for pack names).

### 5. Deny-list (excerpt)

Patterns that are **never** auto-approved:

```jsonc
"deny": [
  "Bash(rm -rf:*)", "Bash(rm -fr:*)", "Bash(rm -rf /)",
  "Bash(sudo:*)", "Bash(chmod 777:*)", "Bash(chown:*)",
  "Bash(git push --force:*)", "Bash(git push -f:*)",
  "Bash(git reset --hard:*)", "Bash(git clean -fd:*)",
  "Bash(git commit --no-verify:*)", "Bash(git push --no-verify:*)",
  "Bash(npm publish:*)", "Bash(npm login:*)",
  "Bash(aws:*)", "Bash(gcloud:*)", "Bash(kubectl delete:*)",
  "Bash(dd:*)", "Bash(mkfs:*)", "Bash(shutdown:*)", "Bash(reboot)",
  "Read(**/.env)", "Read(**/.aws/credentials)", "Read(**/id_rsa)",
  "Write(**/.env)", "Edit(**/.env)"
]
```

> **Heads-up on pattern matching.** Claude Code's `permissions` list is literal
> pattern-matched, so the shell has already expanded `$HOME`, `~`, `..`, glob
> `*`, command-substitution `$(...)`, and pipe chains by the time this layer
> runs. That means a deny entry like `Bash(rm -rf $HOME*)` would *not* actually
> fire on `rm -rf $HOME/foo`. This is exactly why CSA ships the `PreToolUse`
> hook (§6) — it re-reads the full raw command string and blocks dangerous
> variants the pattern layer misses (`rm -rf ~`, `rm -rf /home/me`,
> `$(echo rm) -rf /`, base64-piped-to-shell, etc.).

### 6. PreToolUse hook — defense in depth

Claude Code's `permissions` list is pattern-based and can be fooled by shell
tricks (quoting, `$()`, chained `;`, aliases). CSA installs a `PreToolUse` hook
that re-parses the full command string and blocks dangerous combinations even
if they pass the allow regex.

**Configured in settings.json:**

```jsonc
"hooks": {
  "PreToolUse": [
    {
      "matcher": "Bash",
      "hooks": [
        {
          "type": "command",
          "command": "node ~/.claude/csa/hooks/pretool-guard.js",
          "timeout": 5000
        }
      ]
    }
  ]
}
```

**`pretool-guard.js` responsibilities:**

1. Read the tool input from stdin (`{tool_name, tool_input}`).
2. For `Bash`, tokenize with `shell-quote` and walk each command segment.
3. Reject if any segment matches a compiled deny-regex (`rm -rf /`, pipe-to-sh,
   secret paths, fork-bombs, base64-encoded payloads over threshold, etc.).
4. Reject if the command contains `$()`/backticks wrapping a denied binary.
5. Reject writes/reads targeting secrets (`.env`, `id_rsa`, `.aws/credentials`,
   `.ssh/*`, `**/*.pem`).
6. On reject, exit `2` with a JSON reason on stderr — Claude surfaces this.
7. Increment a counter in `~/.claude/csa/stats.json` (atomic write).

Hook contract reference: https://docs.claude.com/en/docs/claude-code/hooks

### 7. Stats

`csa stats` reports everything the `PreToolUse` hook actually sees, which today
is **hook blocks** (denied tool uses that the hook caught). Allow/deny counts
from Claude Code's built-in permissions layer are *not* collected — that would
require a `PostToolUse` hook and is on the roadmap, not in 0.x.

```
$ csa stats
Claude Safeguard Accelerator — stats
  enabledAt    2026-04-17T15:30:14Z

Allow hits  (total: 0)
  (none)

Deny hits  (total: 0)
  (none)

Hook blocks  (total: 14)
       6  Bash:rm-rf-root
       4  Bash:force-push
       2  Read:secret-path
       1  Bash:pipe-to-shell
       1  Write:system-path
```

`stats.json` schema:

```jsonc
{
  "version": 1,
  "enabledAt": "2026-04-17T15:30:14Z",
  "counts": {
    "allow":     {},                            // reserved for future PostToolUse hook
    "deny":      {},                            // reserved for future PostToolUse hook
    "hookBlock": { "Bash:rm-rf-root": 6, ... }
  },
  "recent": [ { "ts": "...", "verdict": "hookBlock", "key": "..." } ]  // ring buffer, 500 entries
}
```

---

## Rule packs

Rules live in versioned JSON files so they can be updated independently of the CLI:

```
src/rules/
  core-allow.json              # always-on, safe read-only commands
  core-deny.json               # always-on, non-negotiable dangerous patterns
  packs/git.json               # read-only git (default on; disable with --no-git)
  packs/git-write.json         # mutating git (opt-in; auto-included by --edits)
  packs/node.json              # npm/pnpm/yarn helpers (opt-in)
  packs/python.json            # pip/uv/poetry helpers (opt-in)
  packs/docker.json            # docker read-only (opt-in)
  packs/edits.json             # Write/Edit/NotebookEdit (opt-in; use --edits)
```

`csa enable --pack node,python` composes packs (replaces the default git pack).
`csa enable --edits` adds `edits` + `git-write` on top of whatever else is selected.

Users extend with:

```
~/.claude/csa/rules.user.json
```

User rules merge **after** core rules but **cannot** override deny-list entries
(enforced by the hook).

---

## Project layout (proposed)

```
claude-safeguard-accelerator/
├── bin/
│   └── csa.js                     # CLI entry
├── src/
│   ├── commands/
│   │   ├── enable.js
│   │   ├── disable.js
│   │   ├── status.js
│   │   ├── stats.js
│   │   ├── list.js
│   │   ├── diff.js
│   │   ├── update.js
│   │   └── doctor.js
│   ├── settings/
│   │   ├── paths.js               # resolve global/local paths cross-platform
│   │   ├── read.js                # JSONC-tolerant reader
│   │   ├── write.js               # atomic write + checksum
│   │   ├── merge.js               # pure merge function (unit tested)
│   │   └── backup.js              # backup/restore + manifest
│   ├── hooks/
│   │   ├── install.js             # copies pretool-guard.js into ~/.claude/csa/hooks
│   │   └── pretool-guard.js       # runs at every Bash tool use
│   ├── rules/
│   │   ├── core-allow.json
│   │   ├── core-deny.json
│   │   └── packs/*.json
│   ├── stats/
│   │   └── recorder.js
│   └── util/
│       ├── shell-parse.js         # wraps shell-quote + custom walker
│       └── logger.js
├── test/
│   ├── merge.test.js
│   ├── pretool-guard.test.js      # fixture-driven; >= 40 payloads
│   ├── backup-restore.test.js
│   └── fixtures/
├── package.json
└── README.md
```

Dependencies (keep minimal):

- `shell-quote` — safe tokenization
- `commander` — CLI
- `picocolors` — tty output (no chalk bloat)
- `jsonc-parser` — Claude settings files allow comments

No runtime deps on Claude Code itself — CSA only reads/writes its settings files.

---

## Implementation plan

1. **`settings/paths.js`** — resolve `os.homedir()/.claude/settings.json` and
   `cwd/.claude/settings.local.json`; create `.claude/` if missing for local.
2. **`settings/merge.js`** — pure function `(existing, rules) => next`. Unit test first.
3. **`settings/backup.js`** — timestamped dir + manifest + checksum verify on restore.
4. **`commands/enable.js`** — orchestrates: backup → merge → atomic write → install hook.
5. **`hooks/pretool-guard.js`** — self-contained script (no imports from CSA src
   so it runs even if CSA is uninstalled without `csa disable`). Ship it as a
   single file, copied verbatim on install.
6. **`commands/disable.js`** — read latest manifest, restore both files, remove
   `hooks/pretool-guard.js`, keep `csa/` dir for stats history.
7. **`commands/stats.js`** — read `stats.json`, render table. `--json` flag.
8. **`commands/doctor.js`** — validates JSON, checks hook script exists and is
   executable, confirms Claude Code version supports `PreToolUse`.

---

## Safety invariants

- **Atomic writes**: always `write(tmp) && rename(tmp, final)` so a crash never
  leaves a half-written settings file.
- **Deny wins**: merge logic asserts no entry in `allow` matches any entry in
  `deny` after merge; if so, the `allow` entry is dropped with a warning.
- **Hook cannot be disabled silently**: `csa doctor` verifies the hook is
  present whenever CSA reports "active"; mismatch → exit 3.
- **Backups are append-only**: `disable` never deletes backups, just rewinds.
- **No network calls** during `enable`/`disable`. `update` is the only command
  that fetches rule packs, and it's opt-in.

---

## Testing

- Unit: merge, parser, hook verdicts (snapshot-driven).
- Integration: tmpdir-based fake `$HOME`, run `csa enable`, read back files,
  run `csa disable`, assert byte-for-byte restore.
- Adversarial fixtures for the hook: obfuscated `rm`, `$(echo rm) -rf`,
  base64-piped-to-bash, `git push` with newline-embedded flags, etc.

### End-to-end test project

A dedicated sandbox repo is used for manual and automated end-to-end runs of CSA
against a realistic project layout:

- **csa-test-project**: https://github.com/Makaadam11/csa-test-project

It contains curated payloads (safe + dangerous command samples) used to verify
that `csa enable` produces the expected allow/deny/hook-block behavior in a
fresh Claude Code session.

---

## Non-goals

- Replacing Claude Code's own permission prompts for genuinely ambiguous actions.
- Scanning file contents for secrets (that's a different tool).
- Managing MCP server permissions (future: `csa enable --mcp`).

---

## Manual uninstall (if you skipped `csa disable`)

If you removed the package without running `csa disable` first, CLI is gone but
the hook entry still sits in your settings. Clean it up manually:

1. Delete the CSA state directory:
   - macOS / Linux: `rm -rf ~/.claude/csa`
   - Windows (PowerShell): `Remove-Item -Recurse -Force $HOME\.claude\csa`
2. In `~/.claude/settings.json` (and `./.claude/settings.local.json` if present),
   remove the entry under `hooks.PreToolUse` whose marker is
   `"__csa": "csa-managed"`. Leave any other `PreToolUse` entries untouched.
3. Optional: delete the `allow` / `deny` rules you recognize from `csa list allow`
   and `csa list deny`. You can also just restore from
   `~/.claude/csa/backups/<timestamp>/` if you kept that dir.

---

## License

MIT.
