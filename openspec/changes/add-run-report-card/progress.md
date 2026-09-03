# Progress — proposal-to-pr: add-run-report-card

_Started 2026-09-02; last updated 2026-09-02_

## Phases completed

- [x] Stage 1: Load — dependency `fix-run-report-duplication` confirmed landed
      (PR #81, content 80f862d, merge 7e68f39) via compare API, since it shipped
      as a plain PR with no archive directory.
- [x] Stage 2/3: three pre-review + refine iterations. 13 blockers found, 6
      fixed, 7 open at the cap.

## Current phase

**PAUSED at the refinement cap** (3 iterations, default `--max-refine`), with
seven blockers open. Nothing has been implemented and nothing is committed.

## Why it paused rather than continuing

The open blockers are not polish. Three rounds of review established that the
derived metrics in tasks.md section 2 are not a rendering change:

- `loop-depth` still derives its tier from a record kind. Every existing
  self-reported section takes its number from `sumLedger` — a validator-computed
  count — and `SELF_REPORTED_KINDS` is unexported, so any renderer-side
  placement is a hand-kept copy of it.
- Active time cannot be attributed to a tier: tiers mix inside one journal and
  `RecordView` carries no `origin`.
- `ReportSection` has exactly one numeric field, `count?`. `session-span` needs
  four figures and `prompts` two, leaving `table` as the only home — the
  rendered cell the new spec scenario forbids.

Each is a change to the kernel or to a kernel type. The card's seven question
rows are a genuine projection of sections that already exist and are unaffected.

## Recommended resolution — awaiting the user

Split. Keep `add-run-report-card` as the seven question rows plus the Action
change, and move the derived metrics to a new change that can argue the kernel
work on its own terms.

## Next 3 actions

1. User decides: split, or raise the cap and continue refining in place.
2. If split: strip section 2 from tasks.md, remove the metric rows from the
   design and specs, re-run one pre-review round on the reduced change.
3. If continue: the seven open blockers are in review-evidence.md under
   "Stage 2 — Pre-review iteration 3".

## Integration points the next session needs to read on resume

- `packages/claims/src/witnessReport.ts` — module header 10-17 (the prohibited
  map); `ReportSection` 391-409, `count?` at 406; `dataSection` at 507; tiers
  built at 722-753; `sumLedger` at 1361.
- `packages/claims/src/witness.ts:368` — `SELF_REPORTED_KINDS`, unexported.
- `action/action.yml:231` — the version equality gate that a bump would break.
- `spec/fixtures/report/pr58-bundle.json` — the fixture row tests build from.

## Notes for the next session

This file is committed and reviewers read it. Do not write review-instrumentation
state into it; doing so in this run contaminated one reviewer's independence.

## Pending user decisions

- Split the change, or raise `--max-refine` and continue in place.
