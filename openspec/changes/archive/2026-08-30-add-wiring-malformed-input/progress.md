# Progress — proposal-to-pr: add-wiring-malformed-input

_Started 2026-08-25; last updated 2026-08-26_

## Phases completed

- [x] Stage 1: Load — dependency gate clean, grounding gate 12/12
- [x] Stage 2: Pre-review — 3 iterations; probe MISSED, CAUGHT, CAUGHT
- [x] Stage 3: Refine — 3 iterations, 4 blockers answered, hit the cap converged
- [x] Stage 4: Implement — 21/21 tasks, 4 chunks
- [x] Stage 5: Verify — after every chunk, all gates both polarities
- [x] Stage 6: Post-review — 4 reviewers on the real diff, zero blockers
- [x] Stage 7: Address — 2 of 4 concerns fixed, 2 deferred to the PR body
- [x] Stage 8: PR — https://github.com/armanfatemi/nullius/pull/39

## Current phase

**Stage 9 (Retro)** — dispatching retro-writer.

## Next 3 actions

1. retro-writer reads the artefacts and writes one file
2. Commit the retro on this branch so it travels with the PR
3. Human review and merge — with a merge commit, never a squash

## Integration points the next session needs to read on resume

- packages/claims/src/wiring.ts — the union, PASSING at :111, the parseError branch
- packages/claims/src/wiringScan.ts — the hoist comment guarding the ordering trap
- openspec/changes/add-wiring-malformed-input/review-evidence.md — 588 lines, the full record

## Pending user decisions

- None. The two open concerns are recorded in the PR body for the human reviewer,
  not held as questions.
