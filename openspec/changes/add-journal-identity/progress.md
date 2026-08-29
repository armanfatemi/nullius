# Progress — proposal-to-pr: add-journal-identity

_Started 2026-08-28; last updated 2026-08-29_

## Status: PAUSED at the refinement cap

Three pre-review iterations completed (the default `--max-refine`). One blocker
remains open, and it needs a scope decision rather than another edit.

## Phases completed

- [x] Stage 1: Load
- [x] Stage 2/3: iteration 1 — 3 blockers, 3 false premises; schema bumped to 0.4
- [x] Stage 2/3: iteration 2 — 6 blockers, 2 false premises; version-gating added,
      producer bump added by user decision
- [x] Stage 2: iteration 3 — 5 blockers. Four fixed; one is a scope decision.

## The open blocker

**The producer bump (tasks 3.8–3.10) cannot land as specified.** This is
measured, not argued:

- The kit emits `dispatch` / `report` / `append` / `mutation` and never
  `finding`.
- 18 live journals under `.nullius/runs/`: 254 reports with `outcome: "found"`,
  0 `finding` records.
- Headers left at the real `0.2`: **0** SILENT-REVIEWER findings.
- Headers rewritten to `0.3`: **255** SILENT-REVIEWER findings.

So SUPPRESSED-FINDING is unreachable (the ledger is always empty) and
SILENT-REVIEWER fires on 100% of `found` reports. The version gate is acting as
a producer-capability claim: it reads "declares 0.3" as "can emit findings",
which has never been true of the hook pack.

This is task 3.9's third outcome, whose written instruction is to pause.

## Options for the user

1. Split 3.8–3.10 into a separate change, on the same "not about identity" test
   Decision 4 used to split sealing out. Sections 1–2 and 3.1–3.7 ship as a
   coherent identity change.
2. Keep the bump and separate schema version from producer capability — a
   larger kernel change, and arguably the right long-term fix.
3. Keep the bump and accept 255 findings on the live corpus. Not recommended:
   it trains people to ignore the verdict.

## Fixed in iteration 3 (committed)

- Identity-field rejections version-qualified to 0.4 in the spec, with a 0.3
  scenario — they were tightening 0.3 as written
- `v0.3-compat-run.jsonl` fixture added (1.12): the only test in the change that
  can fail if the version predicate is written backwards. Neither existing 0.3
  fixture contains a verification or mutation at all
- VERSIONS ascending-order assertion (1.13) — 1.11's index floor makes ordering
  load-bearing and nothing pinned it
- Task 3.9 now requires a published artifact, not a ticked box
- doctor.ts:711's second hardcoded 0.2 header added to 3.8
- The asymmetry argument narrowed so it no longer implies four more rejections
- Decision 6's per-clone/per-worktree self-contradiction resolved
- Two coordinator false premises corrected (a fabricated worktree-collision
  cost; a miscounted "exactly three places")

## Integration points on resume

- packages/kit/src/record.ts — the four kinds the kit can emit; `finding` is
  not one, which is the whole producer-bump problem
- packages/claims/src/witness.ts:147,154,356,445,1077 — VERSIONS, VOCABULARY,
  the supported-version check, the kinds gate, the ledger gate
- packages/kit/src/cli.ts:41 and packages/kit/src/doctor.ts:711 — both producers
- packages/claims/src/witness.ts:275,309 — nonEmptyString vs optionalString

## Probe history

iter 1 TAINTED (registry leak) · iter 2 TAINTED (coordinator disclosed the
plant in this committed file) · iter 3 CAUGHT.

Do not write probe or canary planning into this file. It is committed and
travels in the PR diff.
