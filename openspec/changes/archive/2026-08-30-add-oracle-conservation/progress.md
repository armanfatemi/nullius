# Progress — proposal-to-pr: add-oracle-conservation

_Started 2026-08-29; last updated 2026-08-29_

## Phases completed

- [x] Stage 1: Load
- [x] Stage 2: Pre-review iteration 1 — 4 blockers, 3 false premises; probe TAINTED
- [x] Stage 3: Refine iteration 1 — 2 user decisions taken
- [x] Stage 2: Pre-review iteration 2 — 3 blockers (2 coordinator-introduced); probe TAINTED
- [x] Stage 3: Refine iteration 2 — added MALFORMED-JUSTIFICATION verdict
- [x] Stage 2: Pre-review iteration 3 — 3 blockers (all coordinator-introduced); probe TAINTED
- [x] Stage 3: Refine iteration 3 — clause-4 argued properly; rule restatement removed

## Current phase

**PAUSED at the refinement cap.** `pause_reason=refinement_cap`.
Three refinement iterations completed, which is the default `--max-refine`.
Zero blockers are known to remain, but iteration 3's fixes have NOT been
re-reviewed — and every prior round found that the previous round's fixes
introduced new blockers.

## Next 3 actions

1. User decides: run a 4th review round (re-invoke with `--max-refine 4`), or
   accept the current artefacts and proceed to Stage 4 (implement)
2. If proceeding: create `feat/add-oracle-conservation` from main, walk tasks.md
3. Nothing has been implemented — no code exists yet

## Integration points the next session needs to read on resume

- packages/claims/src/config.ts:48,51-61,84+ and cli.ts:895-914 — the FOUR config
  hops; `configVersion` is the cautionary case (in KNOWN_KEYS, no assignment)
- packages/claims/src/witness.ts:1146 — the `decision` parser that must NOT learn
  about `justifies`
- packages/claims/src/rules.ts:42-64 — the RuleVerdict/PASSING pattern, including
  why `malformed-rule-header` is excluded
- packages/claims/src/runners.ts:143,149,236 — hex-only REV_PATTERN, no
  name-status diff; new plumbing required
- .github/workflows/ci.yml:220 — the `rules check` both-polarities model

## Pending user decisions

- Whether to spend a 4th review round verifying iteration 3's fixes, or proceed
  to implementation. See the cap note above for why this is a real choice rather
  than a formality.
