#!/usr/bin/env bash
# Stop: validate this session's journal and print whatever does not hold up.
#
# Advisory, and staying that way for now. A Stop hook that exits 2 re-prompts
# the agent, which turns a validation failure into a loop risk; `witness check`
# guards on stop_hook_active regardless, so the day this does block, the guard
# is already in place.
#
# Stop also fires per assistant turn, not per run — so a dispatch with no
# report here may simply still be in flight. "Never came back" is knowable at
# session end and at no earlier moment, which is where the no-report terminals
# are synthesized instead.
#
# Same opt-in and the same fail-open posture as witness-record.sh.

set -u

root="${CLAUDE_PROJECT_DIR:-$PWD}"

case "${NULLIUS_WITNESS:-}" in
  1 | true) ;;
  *)
    if [ ! -d "$root/.nullius" ]; then
      cat > /dev/null || true
      exit 0
    fi
    ;;
esac

runner="${NULLIUS_KIT_BIN:-npx -y @nullius-inverba/kit}"

# shellcheck disable=SC2086
# The runner's failure is NOT swallowed. `|| true` here would mean that a
# missing package, a broken install, or an npx resolution failure all look
# identical to a session in which nothing happened — an empty .nullius/runs is
# indistinguishable from "no subagents were dispatched", which is the exact
# confusion this tool exists to prevent. So: still exit 0, but say so.
if ! $runner witness check --root "$root"; then
  echo "nullius witness: the recorder could not run (\"$runner\"), so nothing was recorded for this event. If @nullius-inverba/kit is not installed, set NULLIUS_KIT_BIN to a local build — e.g. NULLIUS_KIT_BIN=\"node /path/to/packages/kit/dist/cli.js\"." >&2
fi
exit 0
