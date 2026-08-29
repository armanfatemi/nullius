# Progress — proposal-to-pr: add-journal-sealing

_Started 2026-08-29; last updated 2026-08-29_

## Phases completed

- [x] Stage 1: Load — dependency `add-journal-identity` landed on `main` (PR #53, compare `identical`)
- [x] Stage 2: Pre-review iteration 1 — probe CAUGHT; 3 false premises, 4 blockers
- [x] Stage 3: Refine iteration 1 — commit `a1a6a54`; added Decisions 5 and 6
- [x] Stage 2: Pre-review iteration 2 — probe CAUGHT; 2 false premises, 5 blockers. Three of the blockers overturned decisions written in refine 1
- [x] Stage 3: Refine iteration 2 — Decisions 1, 5 and 6 rewritten (argument wrong, not just conclusion); Decision 2 gained batched sweeps; Decision 3's call count corrected 4→6

## Current phase

**Stage 2 (Pre-review), iteration 3** — final round under the default `--max-refine 3` cap.

## Next 3 actions

1. Grounding gate, plant the canary on `tasks.md` (rotated from design.md)
2. Re-dispatch architecture-reviewer + test-engineer; rule-auditor for the new `@a1a6a54` anchors
3. Zero blockers → Stage 4. Blockers remaining → refinement cap reached, pause and surface

## Integration points the next session needs to read on resume

- packages/kit/src/identity.ts — read `runGit` at :250-273 before writing any seal git call. It is NOT reusable: `input: ""` blocks `mktree` stdin, and `null` for empty stdout means a successful `update-ref` looks like a missing binary
- packages/kit/src/seal.ts — does not exist yet. Decision 6 puts the seal's own runner here
- packages/kit/src/cli.ts:489-506 — `SessionEnd` branch; sealing goes after `appendRecords` returns, not inside its callback
- packages/kit/src/identity.lock.test.ts:93-97 — the "Not vacuous" pattern task 4.1a follows; packages/kit/src/witness.cli.test.ts is the stderr-assertion precedent
- packages/kit/src/doctor.ts:536 — the absence register the unsealed count joins

## Measured facts this run established, which the implementation depends on

- `git update-ref` reports a CAS mismatch and a held ref lock **identically**: exit 128, message opening `cannot lock ref 'refs/nullius/runs'`, differing only in the trailing clause. Verified in a scratch repository. This is why the retry predicate is "contended", not "the compare failed"
- A successful `git update-ref` prints nothing and exits 0

## Pending user decisions

- None. The one open question — whether the sealing race also deserves a real-process CI gate — is carried as a PR concern.
