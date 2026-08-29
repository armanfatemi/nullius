# Progress — proposal-to-pr: add-journal-identity

_Started 2026-08-28; last updated 2026-08-29_

## Phases completed

- [x] Stage 1: Load — done 2026-08-28
- [x] Stage 2: Pre-review iteration 1 — done 2026-08-29. 3 blockers, 3 false
      premises. Probe scored TAINTED (registry leak by two reviewers; a third
      caught the plant cleanly).
- [x] Stage 3: Refine iteration 1 — done 2026-08-29. All 3 blockers and all 3
      false premises addressed; 11 of 12 concerns folded into artefacts.

## Current phase

**Stage 2 (Pre-review)**, iteration 2 — re-review of the refined artefacts

## Next 3 actions

1. Plant the iteration-2 canary into design.md (rotate off proposal.md)
2. Re-dispatch the reviewer set; brief them on the 0.4 bump and the lock/git
   constraint specifically, since both are new since iteration 1
3. If zero blockers and zero false premises, advance to Stage 4

## What changed in Stage 3

- **Schema now bumps to 0.4** (user decision). Decision 3 rewritten: the rule
  stands, this change is on the bumping side of it; the rule gained a
  "tightening" clause it was missing.
- **The bump's real cost is now documented and tasked**: the ledger gate at
  `witness.ts:1077` is exact string equality against "0.3", so a naive bump
  silently ungates SILENT-REVIEWER and SUPPRESSED-FINDING for 0.4 journals.
  Tasks 1.10/1.11 convert it to a floor and pin it with a named test. This was
  found by the coordinator during refinement, not by a reviewer.
- **Git constraint gained two clauses** (user decision): no git call while the
  append lock is held, and a sub-second budget strictly under DEFAULT_WAIT_MS.
- Blocker 3 (empty-string identity fields) now has a spec requirement, a
  scenario, a task, and fixture + unit-test coverage.
- `worktree` hash fully specified: SHA-256, hex, 16 chars, per-clone salt.
- Three STALE anchors re-stamped, both halves, to 6a3c1bc.
- Task count 23 → 31; risk LOW → MEDIUM.

## Integration points the next session needs to read on resume

- packages/claims/src/witness.ts:147,157,1077 — VERSIONS, KINDS_BY_VERSION, and
  the exact-equality ledger gate that task 1.11 converts to a floor
- packages/claims/src/parseClaims.ts:286 — STAMP_SHAPE, module-private, must be
  exported before task 1.2 can reuse it
- packages/kit/src/journalFile.ts:49,196-204 — DEFAULT_WAIT_MS and the
  writeRecords lock scope that identity resolution must stay outside of
- packages/claims/src/cli.ts:128,381 — WITNESS_HELP funnel convention and the
  single-path validate gate task 2.6 characterizes
- packages/claims/src/runners.ts:15 — DEFAULT_GIT_TIMEOUT_MS, the 10s default
  that task 3.2 explicitly does NOT reuse

## Pending user decisions

- None open. Two were answered at iteration 1: bump to 0.4 keeping the
  rejections; git outside the lock with a sub-second bound.
- Recorded but not blocking: whether the header key should be `head` or a
  self-describing `head_at_start` (proposal open questions).
