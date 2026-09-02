# Progress — proposal-to-pr: add-pr-process-report

_Started 2026-08-31; last updated 2026-09-01_

## Phases completed

- [x] Stage 1: Load
- [x] Stage 2: Pre-review iterations 1–5 — probe CAUGHT all five rounds
- [x] Stage 3: Refine iterations 1–5; Decisions 2–4 rewritten clean after round 5
- [x] Stage 4: Implement — all 54 tasks, three chunks, Stage 5 green after each
- [x] Stage 6: Post-review on the diff — 2 blockers, 6 concerns
- [x] Stage 7: Address must-fixes — both blockers fixed, 4 concerns fixed, 2 carried
- [x] Stage 8: **PR open — https://github.com/armanfatemi/nullius/pull/75**

## Current phase

**Stage 9 (Retro).** The pipeline's terminal state is *PR open and retro
written*, never *merged*.

## What shipped

- `nullius witness report <range|sha>` — four provenance tiers, md + JSON
- `nullius-kit witness bundle <base>..<head>` — committed envelope, line-level redaction
- Action `run-report` input, second comment marker, `init --run-report`, `doctor` pairing
- `spec/run-report.md`, `docs/reading-a-run-report.md`

## Carried, deliberately not fixed here

- The routing table keys `checker-engineer` on five filenames, so a NEW kernel
  module earns no kernel reviewer. Both post-review blockers were found only
  because the coordinator overrode the router.
- A search anchor has nowhere to put a commit stamp, so an "absence of X" claim
  in a proposal that adds X rots straight to a hard COUNT-MISMATCH. Two
  unrelated proposals were turned red by this change. Written up in IDEAS.md.
- This repo's own ledger records are MALFORMED in its own journals: the header
  is written by the published kit at schema 0.2, the ledger verbs write 0.3+
  kinds. SUPPRESSED-FINDING can never fire here. Written up in IDEAS.md.
- `./action` in this repo's CI waits on a release carrying `witness report`.
- Commit `2255fc8` (archiving four landed changes) belongs on main.

## Pending user decisions

- None. Merge is the human's, and the PR asks for a merge commit rather than a
  squash — a squash orphans every anchor stamp this change introduced.
