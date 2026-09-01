# Progress — proposal-to-pr: add-pr-process-report

_Started 2026-08-31; last updated 2026-08-31_

## Phases completed

- [x] Stage 1: Load
- [x] Stage 2: Pre-review iterations 1–5 — probe CAUGHT all five rounds
- [x] Stage 3: Refine iterations 1–5; Decisions 2–4 rewritten clean after round 5
- [x] Design committed: `674a225` on `feat/add-pr-process-report`

## Current phase

**Stage 4 (Implement)**, chunk 1 of 3: **Stage A — the bundle** (`packages/kit`),
tasks §0–§3. Dispatched to an implementer with the integration points pinned.

## Next 3 actions

1. Receive Stage A, run Stage 5 verification myself (build, type-check, test, both dogfood polarities), commit the chunk
2. Chunk 2: Stage B — the kernel report (`packages/claims`), tasks §4–§6
3. Chunk 3: Stage C — Action, init, doctor, dogfood, tasks §7–§9

## Integration points the next session needs to read on resume

- packages/kit/src/cli.ts:205,211 — where `witness bundle` dispatches beside `ledger`
- packages/kit/src/record.ts:894-900,1055 — the producer's two prompt shapes and the private `hashText`
- packages/kit/src/identity.ts:286 — `runGit`, the bounded-git discipline to model
- packages/claims/src/witness.ts:726 — `validateJournal(content: string): JournalReport`
- packages/claims/src/witness.ts:1615-1639 — `atLedgerFloor` and `provenance`, which Stage B reads and must not recompute

## The three rules Stage A is judged on

1. `redactLines` returns the same line count in the same order, always; a line
   is rewritten only if it parses AND has a valid `id`.
2. Redaction rewrites fields, never drops a line. No keep-list, no closure, no
   range filter in the bundler.
3. `--no-prompts` refuses on an unparseable line rather than half-redacting.

## Decisions taken (all recorded in the run journal)

- Ship whole, not cut — the human's call against a reviewer recommendation.
- Prompts travel by default; `--no-prompts` withholds — the human's call.
- Below journal v0.6 the tier breakdown renders *not recorded* — the human's call.
- `report.statement` capped under a bundle-set flag of its own — the human's call.
- Decisions 2–4 rewritten clean before implementation — the human's call.
- Redaction is line-level, never record-level — the coordinator's redesign,
  reached after three reviewer blockers proved record removal unsafe.

## Numbering note

Decision 3 is now **redaction**; Decision 4 is **selection**. They swapped in the
rewrite. Every "Decision 3"/"Decision 4" in the iteration 1–5 review-evidence
appends uses the old numbering and was deliberately not rewritten.

## Pending user decisions

- None open.
