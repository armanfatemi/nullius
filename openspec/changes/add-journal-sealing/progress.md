# Progress — proposal-to-pr: add-journal-sealing

_Started 2026-08-29; last updated 2026-08-29_

## Phases completed

- [x] Stage 1: Load — dependency `add-journal-identity` landed on `main` (PR #53, compare `identical`)
- [x] Stage 2: Pre-review iteration 1 — probe CAUGHT; 3 false premises, 4 blockers
- [x] Stage 3: Refine iteration 1 — commit `a1a6a54`
- [x] Stage 2: Pre-review iteration 2 — probe CAUGHT; 2 false premises, 5 blockers
- [x] Stage 3: Refine iteration 2 — commit `7ecdf7c`; Decisions 1, 5, 6 rewritten
- [x] Stage 2: Pre-review iteration 3 — probe CAUGHT by both in-scope reviewers; 1 false premise, 5 blockers
- [x] Stage 3: Refine iteration 3 — all 5 addressed; budget sized; predicate inverted

## Current phase

**PAUSED at the refinement cap.** Three refinement iterations completed, which is `--max-refine`'s default. The iteration-3 blockers are all addressed, but those fixes have not been reviewed — a fourth review round would need a fourth refinement round if it found anything, and that is past the cap.

## Next 3 actions (on resume)

1. Decide whether to raise the cap (`--max-refine 5`) and run pre-review iteration 4 to verify refine-3, or accept the current artefacts and enter Stage 4
2. If entering Stage 4: branch is already `feat/add-journal-sealing`; start at task 0.1
3. Either way, re-read the "unreviewed since refine 3" list below before implementing

## Unreviewed since refine iteration 3

These are the edits no reviewer has seen. If the run resumes into Stage 4 without another review round, they are the highest-risk part of the change.

- `design.md` Decision 1 — the `contended` predicate inverted to a positive match on two known-transient shapes, with a four-row measured table
- `design.md` Decision 3 — `SEAL_TIMEOUT_MS` 500 / `SEAL_BUDGET_MS` 3 000, and the argument that 3 000 deliberately does not buy 64 attempts
- `design.md` Decision 5 — the no-backoff rationale replaced a second time, now recorded as a starting point to be measured rather than a settled question
- `tasks.md` 1.3a-i, 4.1b, 4.5a, 4.5b, 4.5c — five new tasks
- `specs/witness/spec.md` — the positive-match requirement and a new "permanent fault stops the seal" scenario

## Integration points the next session needs to read on resume

- packages/kit/src/identity.ts:250-273 — `runGit`. NOT reusable: `input: ""` blocks `mktree` stdin; `null` for empty stdout means a successful `update-ref` looks like a missing binary
- packages/kit/src/seal.ts — does not exist yet; Decision 6 puts the seal's own runner here
- packages/kit/src/cli.ts — `SessionEnd` branch; sealing goes after `appendRecords` returns, not inside its callback
- packages/kit/src/identity.lock.test.ts:93-97 — the "Not vacuous" pattern; packages/kit/src/witness.cli.test.ts for stderr assertions
- packages/kit/src/doctor.ts:536 — the absence register the unsealed count joins

## Measured facts this run established, which the implementation depends on

Four `git update-ref` failures share the prefix `cannot lock ref '<ref>'`, exit 128, and only two are transient. Verified in scratch repositories:

| trailing clause | cause | retryable |
| --- | --- | --- |
| `is at <a> but expected <b>` | compare mismatch | yes |
| `Unable to create '...lock': File exists` | lock held | yes |
| `Unable to create '...lock': Permission denied` | read-only refs dir | no |
| `unable to resolve reference '...': reference broken` | corrupt ref | no |

A successful `update-ref` prints nothing and exits 0.

## Pending user decisions

- **Whether to continue.** See the cap discussion above. Three rounds returned 4, 5 and 5 blockers; the subject matter narrowed but the rate did not fall.
- Whether the sealing race also deserves a real-process CI gate (carried as a PR concern, not a blocker).
