#!/usr/bin/env bash
# UserPromptSubmit / PreToolUse / PostToolUse / SessionStart / SessionEnd:
# append the record this event implies to the run journal.
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

# BOUNDED HERE, NOT BY A `timeout` KEY IN hooks.json. UserPromptSubmit runs
# synchronously on a human's prompt, so a runner that hangs — a cold npx cache,
# a wedged install — stalls the interactive path, and that is the shape that
# gets a recorder uninstalled. But the bound has to live in the script: a
# harness-killed process never reaches the `exit 0` on this file's last line,
# and that line is where the ALWAYS EXITS 0 guarantee above actually lives.
# UserPromptSubmit is the one event where a hook that does not exit cleanly can
# erase what the operator typed. A delegated bound is a convention; this is a
# mechanism.
#
# DEGRADES TO UNBOUNDED, NEVER TO FAILING. macOS ships bash 3.2 and no
# `timeout` binary; coreutils installs it as `gtimeout`. Where neither is on
# PATH the runner is invoked exactly as before — slow beats not recording, and
# a missing utility is not a reason to stop observing the run. The plugin
# README states that the bound is dropped rather than delegated on such hosts.
limit="${NULLIUS_WITNESS_TIMEOUT:-15}"
if command -v timeout > /dev/null 2>&1; then
  bound="timeout $limit"
elif command -v gtimeout > /dev/null 2>&1; then
  bound="gtimeout $limit"
else
  bound=""
fi

# shellcheck disable=SC2086
# `>&2` ON EVERY EVENT, not only UserPromptSubmit. That event's hook stdout is
# returned to the model as context, and the default runner is `npx`, which
# prints to stdout on a cold cache — so anything the launcher says would arrive
# as instruction-shaped text nobody wrote. Making the redirect unconditional
# means the guarantee does not depend on which event fired, or on someone
# remembering it the next time hooks.json grows an entry.
#
# The runner's failure is NOT swallowed. `|| true` here would mean that a
# missing package, a broken install, or an npx resolution failure all look
# identical to a session in which nothing happened — an empty .nullius/runs is
# indistinguishable from "no subagents were dispatched", which is the exact
# confusion this tool exists to prevent. So: still exit 0, but say so.
status=0
$bound $runner witness record --root "$root" >&2 || status=$?
if [ "$status" -eq 124 ] || [ "$status" -eq 137 ]; then
  # `timeout` reports 124, or 128+SIGKILL when it had to escalate. Said
  # separately from the failure below because the remedy is different: the
  # recorder is installed and working, it was just too slow to be allowed to
  # hold up the prompt.
  echo "nullius witness: the recorder did not finish within ${limit}s and was stopped, so nothing was recorded for this event. Raise NULLIUS_WITNESS_TIMEOUT, or set NULLIUS_KIT_BIN to a local build so the run does not wait on an npx fetch." >&2
elif [ "$status" -ne 0 ]; then
  echo "nullius witness: the recorder could not run (\"$runner\"), so nothing was recorded for this event. If @nullius-inverba/kit is not installed, set NULLIUS_KIT_BIN to a local build — e.g. NULLIUS_KIT_BIN=\"node /path/to/packages/kit/dist/cli.js\"." >&2
fi
exit 0
