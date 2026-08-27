# Progress — proposal-to-pr: add-rules-compliance

_Started 2026-08-27; last updated 2026-08-27_

## Phases completed

- [x] Stage 1: Load — done. Missing `design.md` drafted from scratch.
- [x] Re-scope (user-requested, before Stage 1) — proposal/tasks corrected to
  reflect what was already built (rule frontmatter convention, incident
  anchors, `add-witness-recording` landed) vs. genuinely missing.
- [x] Stage 2/3 (3 refinement iterations) — done. Converged to zero
  blockers, zero false-premises. Full detail in `review-evidence.md`:
  - Iteration 1: 6 blockers, 2 false-premises (1 canary, 1 real — a
    nonexistent `verifyClaim` export). All fixed.
  - Iteration 2: 1 blocker (`isRuleFailure`/`isFailure` union mix-up in
    `tasks.md`), 2 false-premises (canary + my own overstated "all 7 rules"
    claim while fixing iteration 1). All fixed.
  - Iteration 3 (narrow spot-check, 2 of 4 reviewers per selective-dispatch):
    zero findings. Canary not scored this round (out of both dispatched
    briefs' declared scope) — review layer already measured alive at
    iteration 2 (CAUGHT, independently, twice, unprompted).

## Current phase

**Stage 2/3 complete. Sitting at the Stage 4 threshold, not yet started.**
State says `stage: implement`, but no implementation work has begun —
pausing here deliberately to report back before starting code, since the
user's original ask for this session was specifically to re-scope, and
Stage 4 (writing `rules.ts`/`rulesScan.ts`/etc.) is a large, separate
commitment.

## Next 3 actions (if/when Stage 4 starts)

1. Branch pre-flight: currently on `add-rules-compliance` (not
   `feat/add-rules-compliance`) — decide whether to keep as-is or rename;
   flagged since Stage 1, not yet resolved.
2. Cross-reference `human_commands` (none recorded this run) against
   `tasks.md`, then start task 1.1 (`rules.ts` + `rulesScan.ts`).
3. TDD per `superpowers:test-driven-development` — task 1.6 requires a unit
   test per `RuleVerdict` member; write those before the verdict logic.

## Integration points the next session needs to read on resume

- `openspec/changes/add-rules-compliance/design.md` — 6 Decisions, all
  reviewer-verified as of iteration 3. Decision 3 (verdict shape, `rule-rot`
  trigger) is the highest-value one to re-read before touching
  `packages/claims/src/rules.ts`.
- `packages/claims/src/checkClaims.ts:169-179` — `PASSING`/`isFailure`, the
  exact pattern `RuleVerdict`'s own `PASSING`/`isRuleFailure` must mirror.
- `packages/kit/src/pipeline.test.ts:83` (and ~9 more `"rule-auditor"`
  assertions in that suite) — task 2.5 must update these, not break them.
- `openspec/changes/add-rules-compliance/review-evidence.md` — full record
  of what 3 rounds of review found and fixed; read before re-litigating
  anything already settled there.

## Pending user decisions

- **Whether to proceed into Stage 4 (Implement) now**, or stop here with the
  proposal fully refined and reviewed. Asked at the end of this session.

## Notes

- Working branch remains `add-rules-compliance`, not `feat/add-rules-compliance`.
