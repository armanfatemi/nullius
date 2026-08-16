#!/usr/bin/env bash
# PreToolUse hook on ExitPlanMode: verify the plan's Evidence Anchors BEFORE
# the plan is presented for approval.
#
# The reasoning: an ephemeral plan is still a document making load-bearing
# claims, and the human skimming it before hitting approve is the most exposed
# reviewer there is — solo, time-pressured, no second reviewer coming. The
# approval moment is the gate; durability of the plan file is irrelevant.
#
# Fail-open by design: if no plan file can be located, or the checker itself
# cannot run, exit 0 and let planning proceed — this hook must never break
# plan mode. It blocks (exit 2) ONLY on a definite verdict failure, feeding
# the failing citations back to the agent to fix before re-presenting.

set -u

# Consume the hook's stdin (tool_input JSON — ExitPlanMode carries no plan
# content; the plan lives in a file).
cat > /dev/null || true

# Locate the most recent plan file. Checked in order:
#   1. NULLIUS_PLAN_DIR (explicit override for non-standard layouts)
#   2. the project's .claude/plans
#   3. the user-level ~/.claude/plans
# Only files touched in the last 2 hours count — an old plan from another
# session must not gate this one.
candidates=()
for dir in "${NULLIUS_PLAN_DIR:-}" ".claude/plans" "$HOME/.claude/plans"; do
  [ -n "$dir" ] && [ -d "$dir" ] || continue
  while IFS= read -r file; do
    candidates+=("$file")
  done < <(find "$dir" -name '*.md' -mmin -120 2>/dev/null)
done

[ "${#candidates[@]}" -eq 0 ] && exit 0

plan=$(ls -t "${candidates[@]}" 2>/dev/null | head -1)
[ -n "$plan" ] && [ -f "$plan" ] || exit 0

# NULLIUS_BIN lets a repo pin its own installed copy (e.g. "pnpm exec nullius");
# the default fetches the published CLI.
runner="${NULLIUS_BIN:-npx -y @nullius-inverba/claims}"

# By default a plan with ZERO anchors passes silently — fail-open extends to
# adoption itself. Set NULLIUS_REQUIRE_MARKERS=1 to close that hatch: a plan
# making no checkable claims at all is then blocked like a failing one.
extra_args=()
case "${NULLIUS_REQUIRE_MARKERS:-}" in
  1 | true) extra_args+=(--require-markers) ;;
esac

# shellcheck disable=SC2086
output=$($runner check "$plan" ${extra_args[@]+"${extra_args[@]}"} 2>&1)
status=$?

if [ "$status" -eq 1 ]; then
  {
    echo "Plan grounding check failed — the plan carries unverified claims about the codebase (or, under NULLIUS_REQUIRE_MARKERS, no checkable claims at all)."
    echo "Fix these citations (or move the claims to an 'Open questions' section) before presenting the plan for approval:"
    echo ""
    echo "$output"
  } >&2
  exit 2
fi

# status 0 = verified; status 2 = checker usage/config problem — fail open.
exit 0
