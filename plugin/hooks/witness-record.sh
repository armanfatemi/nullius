#!/usr/bin/env bash
# PreToolUse / PostToolUse / SessionStart / SessionEnd: append the record this
# event implies to the run journal.
#
# This file is deliberately logic-free. Every correlation decision — which
# events are dispatches, how a report joins the dispatch it terminates, what to
# do when the payload carries no tool_use_id — lives in `witness record`, where
# it is typed and unit-tested. Harness-coupled shell rots quietly: the payload
# shape moves, the extraction starts returning empty, and the journal keeps
# being written with nothing in it, which reads exactly like a clean run.
#
# OPT-IN. Recording writes .nullius/runs/<session_id>.jsonl into the project,
# so it happens only where a project asked for it: a `.nullius` directory, or
# NULLIUS_WITNESS=1. The agent still cannot decline to be recorded — that is
# the point — but a human decides which repos keep journals.
#
# ALWAYS EXITS 0. A PreToolUse hook that exits 2 blocks the tool call, and a
# recorder that can block the run it observes gets uninstalled the first time
# it misfires — after which it observes nothing at all.

set -u

root="${CLAUDE_PROJECT_DIR:-$PWD}"

case "${NULLIUS_WITNESS:-}" in
  1 | true) ;;
  *)
    if [ ! -d "$root/.nullius" ]; then
      cat > /dev/null || true   # consume the payload; never SIGPIPE the harness
      exit 0
    fi
    ;;
esac

# NULLIUS_KIT_BIN lets a repo pin its own installed copy (e.g. "pnpm exec
# nullius-kit"); the default fetches the published CLI.
runner="${NULLIUS_KIT_BIN:-npx -y @nullius-inverba/kit}"

# shellcheck disable=SC2086
# The runner's failure is NOT swallowed. `|| true` here would mean that a
# missing package, a broken install, or an npx resolution failure all look
# identical to a session in which nothing happened — an empty .nullius/runs is
# indistinguishable from "no subagents were dispatched", which is the exact
# confusion this tool exists to prevent. So: still exit 0, but say so.
if ! $runner witness record --root "$root"; then
  echo "nullius witness: the recorder could not run (\"$runner\"), so nothing was recorded for this event. If @nullius-inverba/kit is not installed, set NULLIUS_KIT_BIN to a local build — e.g. NULLIUS_KIT_BIN=\"node /path/to/packages/kit/dist/cli.js\"." >&2
fi
exit 0
