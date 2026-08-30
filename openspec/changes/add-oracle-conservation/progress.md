# Progress — proposal-to-pr: add-oracle-conservation

_Started 2026-08-29; last updated 2026-08-30_

## Phases completed

- [x] Stage 1: Load
- [x] Stage 2/3: Pre-review + refine, 4 iterations
- [x] Stage 4: Implement — 57/58 tasks
- [x] Stage 5: Verify — build, type-check, tests, dogfood gates both polarities
- [x] Stage 6/7: Post-review + address must-fixes
- [x] Stage 8: PR opened — #55
- [x] Stage 9: Retro written, committed, push verified against origin

## Current phase

**Done.** PR #55 open, awaiting human review and a merge commit.

## Next 3 actions

1. Human review and merge #55 — with a merge commit, never a squash
2. Consider the retro's six proposed rule changes (a field in the retro, not applied)
3. Task 4.5 (`--format json`) stays deferred until `add-authoring-ergonomics` lands

## Integration points the next session needs to read on resume

- packages/claims/src/oracle.ts — the classifier and OracleVerdict/PASSING
- packages/claims/src/oracleGit.ts — the git/journal binding layer
- packages/claims/src/config.ts — the four config hops for `oracles`
- packages/claims/src/witness.ts — VERSIONS, now through 0.5
- spec/witness-journal.md — the clause-4 case and the 0.5 entry

## Pending user decisions

- The retro graded this run `blocking`; its six proposed rule changes are
  unapplied and are the user's to accept or reject
