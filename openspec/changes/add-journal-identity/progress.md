# Progress — proposal-to-pr: add-journal-identity

_Started 2026-08-28; last updated 2026-08-29_

## Phases completed

- [x] Stage 1: Load — done 2026-08-28
- [x] Stage 2: Pre-review iteration 1 — 3 blockers, 3 false premises
- [x] Stage 3: Refine iteration 1 — all addressed; schema bumped to 0.4
- [x] Stage 2: Pre-review iteration 2 — 6 blockers, 2 false premises. More
      blockers than iteration 1: the bump introduced its own surface, and two
      blockers were defects in the repair rather than in the original design.
- [x] Stage 3: Refine iteration 2 — all 6 blockers and both false premises
      addressed; producer bump added by user decision

## Current phase

**Stage 2 (Pre-review)**, iteration 3 — final re-review before implementation

## Next 3 actions

1. Re-dispatch the reviewer set against the iteration-2 repairs
2. Synthesize; if zero blockers and zero false premises, advance to Stage 4
3. If blockers remain, the default --max-refine cap of 3 is reached and the
   run pauses for the user rather than looping again

## What changed in Stage 3 iteration 2

- **Version-gating added (1.2a).** The record loop had no version predicate, so
  the new rejections would have fired on 0.3 journals — making the change's
  whole backward-compatibility claim false. One shared "declares 0.4+"
  predicate now gates all three.
- **Task 1.11 rewritten.** It must assert BOTH verdicts the gate guards
  (SUPPRESSED-FINDING and SILENT-REVIEWER), plus the lower boundary, and
  compare by index into VERSIONS rather than by string.
- **Task 1.5 corrected** to use nonEmptyString, not optionalString — the latter
  would have made the new verdict unreachable while the fixture still exited 1.
- **Salt tasks split out (3.5a/3.5b):** gitignore entry in the same commit, and
  a deliberate decision on per-worktree vs git-common-dir placement.
- **Tasks 3.3/3.4 reconciled (3.3a)** via an unsynchronised pre-check outside
  the lock, with the reasoning written down so it is not "fixed" later.
- **The dropped fourth clause restored** to the spec's version-bump rule; the
  rule now states that restatements must carry all four.
- **Producer bump added (3.8-3.10)** by user decision: kit SCHEMA_VERSION
  0.2 -> 0.4, with 3.9 measuring what that switches on across the existing
  runs corpus before it lands.
- `KINDS_BY_VERSION` corrected to `VOCABULARY` in 5 files — coordinator error.
- Task count 31 -> 40.

## Integration points the next session needs to read on resume

- packages/claims/src/witness.ts:147,154,445,1077 — VERSIONS, VOCABULARY, the
  kinds-only version gate, and the ledger gate that becomes a floor
- packages/claims/src/witness.ts:275,309 — nonEmptyString vs optionalString;
  task 1.5 must use the former
- packages/kit/src/cli.ts:41 — SCHEMA_VERSION, bumped 0.2 -> 0.4 by task 3.8
- packages/kit/src/journalFile.ts:49,196-204 — DEFAULT_WAIT_MS and the lock
  scope identity resolution must stay outside of
- .gitignore — covers .nullius/runs/ and .nullius/probes/ only; task 3.5a adds
  the salt

## Pending user decisions

- None open. Three answered: bump to 0.4 keeping the rejections; git outside
  the lock with a sub-second bound; bump the producer to 0.4 in this change.
- Recorded but not blocking: whether the header key should be `head` or a
  self-describing `head_at_start`.

## Process note for whoever resumes this

Do not write probe or canary planning into this file. It is committed and
travels in the PR diff, so reviewers read it — writing a plant location here
disclosed iteration 2's probe before any reviewer was dispatched and made that
round's score meaningless. Keep instrumentation plans in the state file.
