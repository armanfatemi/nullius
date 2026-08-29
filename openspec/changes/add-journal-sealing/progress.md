# Progress — proposal-to-pr: add-journal-sealing

_Started 2026-08-29; last updated 2026-08-29_

## Phases completed

- [x] Stage 1: Load — dependency `add-journal-identity` landed on `main` (PR #53)
- [x] Stage 2 iteration 1 — probe CAUGHT; 3 false premises, 4 blockers
- [x] Stage 3 iteration 1 — commit `a1a6a54`
- [x] Stage 2 iteration 2 — probe CAUGHT; 2 false premises, 5 blockers
- [x] Stage 3 iteration 2 — commit `7ecdf7c`; Decisions 1, 5, 6 rewritten
- [x] Stage 2 iteration 3 — probe CAUGHT (both in-scope reviewers); 1 false premise, 5 blockers
- [x] Stage 3 iteration 3 — commit `aa54d39`; predicate inverted, budget sized
- [x] Stage 2 iteration 4 — probe **MISSED**; 0 false premises, 4 blockers, 5 concerns

## Current phase

**PAUSED — the retry predicate is not settled, and the mechanism is the problem.**

Nothing has been implemented. This is a design hand-back, not a verification failure.

## Why

The predicate has failed in three successive forms: absent (round 2), keyed on the wrong clause (round 3), admitting a permanent fault inside a shape it calls transient (round 4). Each fix was locally correct and wrong in a new way. That is the signature of the mechanism being wrong rather than its parameters, and the mechanism is **classifying git's English error text**.

Three of round 4's four blockers were against decisions written in refine 3, which is the stopping condition set before that round ran.

## The alternative worth considering before any further refinement

Do not classify error strings at all. After a failed `update-ref`, **re-read the tip**:

- tip readable and moved → contention, retry
- tip readable and unchanged → the write failed for a reason retrying will not fix, stop
- tip unreadable → broken, stop

That decides retryability from ref *state* rather than from message text, needs no table, is immune to git rewording anything, and collapses the stale-lock case correctly (the tip has not moved, so the seal stops and says so instead of burning the budget forever). It costs one extra `readRefTip` per failure — roughly 9 ms measured.

This is a proposal, not a decision. It has not been reviewed.

## Open blockers if the string-matching design is kept instead

1. `Unable to create '...lock': File exists` covers stale locks, which are permanent; git never reaps them
2. Decision 3's "3 000 ms buys five to ten attempts" is measured wrong — git spawn is ~9 ms, so it buys ~70
3. Decision 5 defers to retry-count measurement; no apparatus emits retry counts
4. `tasks.md` 1.5 and 4.2 remain singular where the spec now requires a batched count on stderr (both reviewers, independently)
5. A fifth transient shape (`reference already exists`) is unclassified
6. `6 × SEAL_TIMEOUT_MS = SEAL_BUDGET_MS` exactly, so a worst-case attempt leaves no budget to retry at all

## Probe history — read this before trusting rounds 1-3

CAUGHT, CAUGHT, CAUGHT, **MISSED**. All four plants were the identical sentence (`harvestFalseClaim` is deterministic and the repo did not change), rotated across four documents. In round 4 the reviewer volunteered that the round-3 plant "is gone" while the round-4 plant sat unreported in a file it had open and quoted from. That is consistent with recognition rather than reading, so rounds 1-3 should be read down. Varying the sentence needs a `canary.ts` change (a seed or `--symbol` override), not a placement choice.

## Integration points, if implementation ever starts

- packages/kit/src/identity.ts:250-273 — `runGit`. NOT reusable: `input: ""` blocks `mktree` stdin; `null` for empty stdout means a successful `update-ref` looks like a missing binary
- packages/kit/src/seal.ts — does not exist; Decision 6 puts the seal's own runner here
- packages/kit/src/cli.ts — `SessionEnd` branch; seal after `appendRecords` returns, not inside its callback
- packages/kit/src/identity.lock.test.ts:93-97 — the "Not vacuous" pattern; witness.cli.test.ts for stderr assertions
- packages/kit/src/doctor.ts:536 — the absence register the unsealed count joins

## Measured facts established by this run

- `git update-ref` failures sharing the prefix `cannot lock ref`: compare mismatch (transient), `File exists` (live lock transient, **stale lock permanent — indistinguishable**), `Permission denied` (permanent), `reference broken` (permanent), `reference already exists` (transient), D/F conflict (permanent)
- A successful `update-ref` prints nothing and exits 0
- `spawnSync` git averages 8.6–9.2 ms on this machine

## Pending user decisions

1. Switch the predicate to the re-read-the-tip mechanism above, or keep string matching and fix its six open blockers
2. Whether `.claude/rules/never-repoint-under-old-stamp.md` gains a carve-out (separate PR, not this change)
