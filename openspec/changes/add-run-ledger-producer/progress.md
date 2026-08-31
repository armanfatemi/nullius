# Progress — proposal-to-pr: add-run-ledger-producer

_Started 2026-08-31; last updated 2026-08-31_

## Phases completed

- [x] Stage 1 Load — clean; no dependencies, no pause box.
- [x] Stage 2/3 iterations 1–4 — 15 blockers and 8 false premises across four
      rounds; cap raised 3 → 4 by the operator. Probe CAUGHT in all four.
      Two whole dispatch rounds were lost to the API session limit and are
      recorded rather than absorbed.
- [x] Stage 4 Implement — 55 of 57 tasks, in seven chunks. The two unticked
      are §0's probe captures, blocked on a human step (see below).
- [x] Stage 5 Verify — build, type-check, 950 + 365 tests passing with exactly
      the 6 ugrep baseline failures; all dogfood gates both polarities.
- [x] Stage 6 Post-review — four reviewers routed on the real 42-path diff;
      4 blockers, 8 concerns.
- [x] Stage 7 Address must-fixes — all four blockers fixed or, for the
      unstampable anchors, documented and bound to commit time. Two concerns
      fixed in code. Stage 5 re-run in full, green.

## Current phase

**Stage 8 (PR) — blocked by the operator's standing instruction that nothing
be committed.** The work is complete and verified, entirely in the working
tree. HEAD is still `7968594` (the iteration-1 refinement).

## What the change does, demonstrated

A real journal produced end-to-end by the built recorder and `witness ledger`
validates clean at 0.6:

    Ledger: 1 stage(s), 2 finding record(s), 1 resolution(s), 1 check(s),
            1 decision(s), 1 prompt(s).
    Provenance: 5 hook-tier, 4 self-reported, 0 unattributed.
    Journal valid.

Before the resolution was appended the same journal exited 1 with
`SUPPRESSED-FINDING`, and `witness ledger findings --open` listed exactly that
blocker. That is the thesis working on real records rather than asserted.

## Must-do at commit time (do not skip)

1. **Stamp the unstamped anchors.** Three in `proposal.md`, one in the
   archived `add-journal-identity/review-evidence.md`, and the new ones in
   `README.md`, `packages/kit/README.md`, `plugin/README.md` and
   `spec/witness-journal.md`. They cite code this change introduces, so they
   cannot be stamped before the commit exists; stamping them against `7968594`
   would be `FABRICATED`. Run `git rev-parse --short HEAD` after committing and
   stamp, then re-run `check`.
2. **Do not `git commit -a`.** The tree carries a foreign in-flight change
   (`README.md` front-page rewrite, `CLAUDE.md`, `.github/workflows/ci.yml`,
   `packages/claims/src/cli.characterization.test.ts`, untracked
   `docs/icon.svg`) and agent-memory edits. Stage this change's paths only.

## Known limits shipping with it

- The `UserPromptSubmit` payload shape is **unverified**: the repo's `plugin/`
  is the marketplace source, not the live plugin, so the new subscription
  cannot fire until the plugin is reinstalled and a new session starts. The
  parser reads a documented key list and records nothing, loudly, if none
  matches.
- `SILENT-REVIEWER`'s `expects` omission is fail-open, and nothing counts the
  exempted denominator (design Decision 4; `wiring` follow-up).
- Exporting `RESOLUTION_OUTCOMES` makes its union public, so a future member is
  breaking growth.
- A clean review answered in prose still earns `SILENT-REVIEWER`; the
  mitigation is a sentence in four agent files, not a mechanism.
- `README.md` gained anchors, but the foreign in-flight change removed README
  from CI's `check` step — so those anchors are currently unchecked. Merge-order
  reconciliation, not adjudicated here.

## Pending user decisions

- Whether to commit (and then stamp), or leave the work uncommitted.
- Stage 8 (open the PR) and Stage 9 (retro) are not startable until then.
