# Progress — proposal-to-pr: add-rules-compliance

_Started 2026-08-27; last updated 2026-08-27_

## Phases completed

- [x] Re-scope, Stage 1 (Load), Stage 2/3 (3 review rounds) — see earlier
  entries in review-evidence.md.
- [x] Stage 4/5 — Section 1 (Kernel, tasks 1.1-1.6): `rules.ts`/`rulesScan.ts`,
  committed at fed60b1.
- [x] Stage 4/5 — Section 2 (Kit/plugin, tasks 2.1-2.5): `buildComplianceBrief`,
  `/comply`, `routeAgents` pre-filter, committed at 5ae40c0.

## Scope decision — Section 3 deferred

Section 3 (tasks 3.1-3.3, `SILENT-RULE` journal integration) requires real,
unresolved design work in `witness.ts` — a well-tested, foundational module —
that the reviewed proposal never actually settled (all 3 pre-review rounds
noted it as "unstarted, no coverage plan to review yet"). Specifically open:
how a `/comply` dispatch's journaled `task` text should carry a rule id for
cross-referencing, whether `SILENT-RULE` extends `JournalVerdict` or needs a
new function signature (it needs an extra input — expected rule ids — that
`validateJournal(content: string)` has no way to receive), and whether
`validateJournal`'s internal record-parsing needs to be exported for reuse
rather than duplicated.

**Decision (user-confirmed): stop here.** Sections 1+2 are a complete,
coherent, independently mergeable deliverable — a working kernel rules
module, `/comply`, and the `routeAgents` pre-filter. Section 3 is left as
explicit follow-up work, `tasks.md` 3.1-3.3 left unchecked, called out in
the PR body rather than silently dropped.

## Current phase

**Stage 6 (Post-review)** — about to route reviewers from the actual diff
(`git diff --name-only main...HEAD`) and dispatch.

## Next 3 actions

1. Stage 6: `route-paths` on the diff, selective-dispatch pre-flight,
   dispatch survivors in parallel.
2. Stage 7 if any `[blocker]` surfaces; else straight to Stage 8.
3. Stage 8: open PR, base `main`, body noting Section 3 is deferred.

## Integration points the next session needs to read on resume

- `openspec/changes/add-rules-compliance/design.md` — still the reference
  for Sections 1+2's shape if Section 3 work resumes later and needs to fit
  the same conventions.
- `packages/claims/src/witness.ts` — read in full before attempting
  Section 3; `validateJournal`'s internal `JournalRecord` parsing (~line 410
  onward) is not currently exported, and `JournalVerdict`'s 14 members are
  all determinable from journal content alone — `silent-rule` would be the
  first that needs external input (expected rule ids from `rules select`).
- `packages/kit/src/pipeline.ts` `routeAgents`/`routePathsFrom` — now take
  `root` as a required second parameter; any future caller needs updating
  for this if it's not already.

## Pending user decisions

None currently open — Section 3 deferral was an explicit user decision,
recorded above.

## Notes

- Working branch remains `add-rules-compliance`, not `feat/add-rules-compliance`.
