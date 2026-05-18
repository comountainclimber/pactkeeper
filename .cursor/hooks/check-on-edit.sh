#!/usr/bin/env bash
#
# afterFileEdit hook: runs the doc-check after any agent file edit.
#
# Behavior:
# - Always returns exit 0 (fail-open). The hard backstop is `prebuild`
#   inside `npm run build` and the git pre-commit hook.
# - Prints any doc-check errors to stderr so they appear in Cursor's
#   Hooks output channel and the agent can see + fix them next turn.
# - Skips the run if dependencies aren't installed yet (fresh clone).

set -u

# Drain stdin so Cursor doesn't see a broken pipe — content unused.
cat >/dev/null

# Skip when node_modules isn't ready (e.g. immediately after `git clone`).
if [ ! -d node_modules ] || [ ! -x node_modules/.bin/tsx ]; then
  printf '{}'
  exit 0
fi

# Run the check; suppress its own stdout, capture stderr.
if ! err=$(node_modules/.bin/tsx scripts/doc-check.ts 2>&1 >/dev/null); then
  printf '%s\n' "$err" >&2
fi

printf '{}'
exit 0
