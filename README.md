# Claude Safeguard Accelerator (CSA)

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
csa enable           Apply safeguards to global + project settings (backs up existing)
csa enable --global  Apply only to ~/.claude/settings.json
csa enable --local   Apply only to ./.claude/settings.local.json
csa disable          Revert to the most recent backup; remove CSA hook
csa status           Show whether CSA is active, version, backup path
csa stats            Show per-rule counts: allowed, denied, hook-blocked
csa list allow       Print the full allow-list
csa list deny        Print the full deny-list
csa list hooks       Print installed hooks
csa diff             Show diff between current settings and pre-CSA backup
csa update           Pull the latest rule-pack without losing your custom rules
csa doctor           Validate settings files, hook script, node/claude versions
```

Exit codes: `0` success, `1` user error, `2` settings/file error, `3` validation failure.

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
- `defaultMode`: left untouched unless absent, then set to `"default"`
- Other keys (`env`, `model`, `hooks`, etc.): preserved; only `hooks.PreToolUse`
  gets a CSA entry appended with a `// csa` marker for clean removal

### 4. Allow-list (excerpt)

Read-only & informational commands that are genuinely safe:

```jsonc
"allow": [
  "Bash(ls:*)", "Bash(pwd)", "Bash(cd:*)",
  "Bash(cat:*)", "Bash(head:*)", "Bash(tail:*)", "Bash(wc:*)",
  "Bash(git status)", "Bash(git diff:*)", "Bash(git log:*)",
  "Bash(git branch:*)", "Bash(git show:*)", "Bash(git remote -v)",
  "Bash(npm run test:*)", "Bash(npm run lint:*)", "Bash(npm run build)",
  "Bash(npm ls:*)", "Bash(npm outdated)", "Bash(npm view:*)",
  "Bash(node --version)", "Bash(which:*)", "Bash(echo:*)",
  "Bash(jq:*)", "Bash(tree:*)", "Bash(find . -name:*)",
  "Read(**)", "Grep(**)", "Glob(**)"
]
```

Full list: `csa list allow` (ships ~150 rules, grouped by category).

### 5. Deny-list (excerpt)

Patterns that are **never** auto-approved and are blocked by the hook even if
a user later adds them to `allow`:

```jsonc
"deny": [
  "Bash(rm -rf:*)", "Bash(rm -fr:*)", "Bash(rm -r /:*)",
  "Bash(sudo:*)", "Bash(chmod 777:*)", "Bash(chown:*)",
  "Bash(git push --force:*)", "Bash(git push -f:*)",
  "Bash(git reset --hard:*)", "Bash(git clean -fd:*)",
  "Bash(git commit --no-verify:*)", "Bash(git push --no-verify:*)",
  "Bash(curl * | sh)", "Bash(wget * | sh)", "Bash(curl * | bash)",
  "Bash(npm publish:*)", "Bash(npm login:*)",
  "Bash(aws:*)", "Bash(gcloud:*)", "Bash(kubectl delete:*)",
  "Bash(dd:*)", "Bash(mkfs:*)", "Bash(shutdown:*)", "Bash(reboot)",
  "Read(**/.env)", "Read(**/.aws/credentials)", "Read(**/id_rsa*)",
  "Write(**/.env)", "Edit(**/.env)"
]
```

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

```
$ csa stats
CSA v1.0.3 — active since 2026-04-17

Scope          Allow hits  Deny hits  Hook blocks
global         1,284       0           12
project        402         0           3

Top allowed (last 7d)
  Bash(git status)     214
  Bash(ls:*)           188
  Read(**)             156

Top hook blocks (last 7d)
  Bash(rm -rf:*)        6   — "rm -rf node_modules/../.."
  Bash(git push -f:*)   4
  Read(**/.env)         2

Settings files
  ~/.claude/settings.json              (CSA-managed, last patched 2h ago)
  ./.claude/settings.local.json        (CSA-managed, last patched 2h ago)
  backup: ~/.claude/csa/backups/20260417-153014/
```

`stats.json` schema:

```jsonc
{
  "version": 1,
  "enabledAt": "2026-04-17T15:30:14Z",
  "counts": {
    "allow":     { "Bash(git status)": 214, ... },
    "deny":      { ... },
    "hookBlock": { "Bash(rm -rf:*)": 6, ... }
  },
  "recent": [ { "ts": "...", "tool": "Bash", "cmd": "...", "verdict": "block" } ]  // ring buffer, 500 entries
}
```

---

## Rule packs

Rules live in versioned JSON files so they can be updated independently of the CLI:

```
src/rules/
  core-allow.json         # always-on, curated safe commands
  core-deny.json          # always-on, non-negotiable dangerous patterns
  node.json               # npm/pnpm/yarn helpers
  python.json             # pip/uv/poetry helpers
  git.json                # read-only git commands
  docker.json             # opt-in (--pack docker)
```

`csa enable --pack node,python` composes packs. Users extend with:

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

## License

MIT.
