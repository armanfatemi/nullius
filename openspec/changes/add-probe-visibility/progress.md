# Progress — proposal-to-pr: add-probe-visibility

_Started 2026-08-28; last updated 2026-08-28_

## Phases completed

- [x] Stage 1: Load — build green, `openspec validate` clean, no dependencies,
      no pause gates, no human-only commands
- [x] Stage 2: Pre-review iteration 1 — probe CAUGHT. 2 false premises,
      2 blockers, 5 concerns
- [x] Stage 3: Refine iteration 1 — commit 39d215d. All 4 hard findings fixed;
      spec rewritten, design gained Decisions 1a and 1b, tasks regrouped

## Current phase

**Stage 2 (Pre-review)**, iteration 2 — canary planted at `design.md:6`.
architecture-reviewer, rule-auditor and test-engineer re-dispatched against the
revised artefacts, each briefed on whether its own previous finding was fixed
correctly rather than merely acknowledged.

## Next 3 actions

1. Synthesize iteration 2; score and clear the canary
2. Zero blockers → Stage 4; otherwise one more refine (cap is 3)
3. Stage 4 pre-flight: already on `feat/add-probe-visibility`

## Integration points the next session needs to read on resume

- packages/kit/src/doctor.ts — `Status` union (`fact` at :37, `failed` keys on
  `"fail"` only at :554); `probeChecks` at :395 with the detail line at :407
  that task 1.7 corrects
- packages/kit/src/cli.ts — `runInit` (:193), the `probeDir` call site (:363)
  that task 4.3 must pin, the recorder predicate (:436), the live writer (:591)
- packages/kit/src/doctor.test.ts — existing direct `probeChecks` coverage at
  :210-213; the new branch matrix lands here
- packages/kit/src/init.test.ts — :189-204, in-memory render assertions; the
  right seam for "no probe key in nullius.kit.json"
- packages/kit/src/init.cli.test.ts — its `run(...)` helper is the candidate
  seam for the CLI-level test in task 4.3

## Pending user decisions

- None outstanding. Task 0.1 resolved 2026-08-28: `init` names capture, does not
  offer to enable it.

## Branch and merge facts the PR must carry

- `feat/add-probe-visibility` was branched from `12cde11`, not from `main`, so
  it carries one pre-existing unrelated commit (`retro`) forward. Branching from
  `main` instead would have orphaned the `@12cde11` stamps on three new anchors.
- `12cde11` is NOT on `main` and IS an ancestor of this branch. A merge commit
  makes the new anchors resolvable; a squash orphans them and the checker fails
  open with the advisory UNVERIFIABLE-REV. The merge instruction in the PR body
  is load-bearing for this change specifically.

## Instrumentation note for the retro

- Both iteration-1 catches came through the registry, not through reading.
  architecture-reviewer has now written into durable memory that
  `canary status` + `check` is "3-for-3 as the fastest opener" (commit 045c48a).
  The probe's side channels are entrenched, so CAUGHT verdicts from this agent
  measure registry access rather than review attention.
