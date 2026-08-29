# Progress — proposal-to-pr: add-journal-sealing

_Started 2026-08-29; last updated 2026-08-29_

## Phases completed

- [x] Stage 1: Load — dependency `add-journal-identity` on `main` (PR #53)
- [x] Stage 2 ×5 / Stage 3 ×4 — see `review-evidence.md` for each round
- [x] Stage 3 iteration 4 — commit pending; round-5 blockers addressed

Probe history: CAUGHT, CAUGHT, CAUGHT, **MISSED**, CAUGHT.

## Current phase

**Stage 3 complete, awaiting the decision to enter Stage 4.** Nothing implemented.

## Where the design actually stands

Round 5 was the first round in four where **no reviewer said the mechanism was wrong**. Rounds 2–4 each returned "this predicate is wrong in a new way". Round 5 returned fixable defects inside a predicate both reviewers accepted, and two of its three blockers were contradictions the coordinator left behind rather than design faults.

## What round 5 changed

- `blocked` cap 1 → **3**. A lockfile collision takes the `blocked` arm, not `contended` (which needs a peer to have landed *and released*), so a cap of one abandons seals at high contention
- **Self-commit guard**: a moved tip is compared against the commit this seal built. `update-ref` can be SIGKILLed after landing; without the comparison the seal commits its own journal twice
- Arithmetic corrected again: a failed attempt is **seven** calls (the predicate's own re-read was omitted). `SEAL_TIMEOUT_MS` 250 → **200** so an all-timeouts attempt plus a retry fits inside 3 000 ms
- Removed the attempt-ceiling contradiction (`tasks.md` 1.3b, `proposal.md`) left by the Decision 1 rewrite
- Fixed the singular "the journal" in `specs/witness/spec.md:62` — both reviewers flagged it, in consecutive rounds
- Added 4.5d/4.5e: the **first uncontended seal**, the most common real path, had no test
- 4.2/4.2a now name their mechanism: side-effect the seam and inject a reduced budget rather than burning 3 000 ms of wall clock

## The one question review cannot settle

At sixty-four contenders, is a collision more often a CAS mismatch (`contended`, drains) or a lockfile collision (`blocked`, capped)? That is a rate, and no amount of document review produces it. The `blocked` cap of three is chosen to make the answer not matter much either way. **Settling it needs the implementation and a real test**, which is the argument for entering Stage 4 rather than running a sixth round.

## Integration points

- packages/kit/src/identity.ts:250-273 — `runGit`. NOT reusable: `input: ""` blocks `mktree` stdin; `null` for empty stdout means a successful `update-ref` looks like a missing binary
- packages/kit/src/seal.ts — does not exist; Decision 6 puts the seal's own runner here
- packages/kit/src/cli.ts — `SessionEnd` branch; seal after `appendRecords` returns
- packages/kit/src/identity.lock.test.ts:20-38 — `spawnSync` observation for call counts; :93-97 the "Not vacuous" pattern
- packages/kit/src/doctor.ts:536 — the absence register the unsealed count joins

## Measured facts the implementation depends on

- `rev-parse --verify --quiet` exits 1 with empty stdout for **both** an absent and a corrupt ref; only stderr differs. The design does not need the distinction: `update-ref <new> 0000…` succeeds on absent and fails on corrupt, so the corrupt case converges on the bounded `blocked` path
- A successful `update-ref` prints nothing and exits 0
- `spawnSync` git costs 8.6–10.2 ms across two independent measurements

## Pending user decisions

- Enter Stage 4, or run a sixth review round
- PR #54 (rules carve-out) is open and independent of this change
