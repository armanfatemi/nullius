# Progress — proposal-to-pr: add-journal-identity

_Started 2026-08-28; last updated 2026-08-29_

## Phases completed

- [x] Stage 1: Load
- [x] Stage 2/3 iteration 1 — 3 blockers, 3 false premises; schema bumped to 0.4
- [x] Stage 2/3 iteration 2 — 6 blockers, 2 false premises; version-gating added
- [x] Stage 2/3 iteration 3 — 5 blockers; hit the refinement cap on the producer bump
- [x] Stage 2/3 iteration 4 — focused round on Decision 7; Decision 7 withdrawn,
      producer bump split out on user decision

## Current phase

**Stage 4 (Implement)** — 40 tasks, zero open blockers

## Scope as it now stands

IN: the 0.4 schema and its three record tightenings, all version-gated;
the ledger gate converted from string equality to a floor; `witness survey`;
the kit writing branch/head/worktree identity into headers.

OUT, with reasons recorded in the proposal's Non-Goals: bumping the producer
to 0.4, and with it the ledger-gate/`found`-semantics question. Measured, not
assumed: 18 live journals, 254 `found` reports, 0 findings, 0 SILENT-REVIEWER
at the real 0.2 header and 255 at 0.3. Three gate designs were tried and all
three fail, because `outcome: "found"` from a hook journal only means the
subagent's final message was non-empty. That is an outcome-vocabulary design
question, not an identity question.

## Next 3 actions

1. Section 1 (schema): tasks 1.1-1.13, commit per task-section
2. Section 2 (survey): tasks 2.1-2.6
3. Section 3 (kit identity): tasks 3.1-3.8

## Integration points the next session needs to read on resume

- packages/claims/src/witness.ts:147,154,356,445,1077 — VERSIONS, VOCABULARY,
  the supported-version check, the kinds gate, the ledger gate to convert
- packages/claims/src/witness.ts:275,309 — nonEmptyString vs optionalString;
  task 1.5 must use the former
- packages/claims/src/parseClaims.ts:286 — STAMP_SHAPE; export from the module
  but NOT from index.ts
- packages/kit/src/journalFile.ts:49,196-204 — DEFAULT_WAIT_MS and the lock
  scope identity resolution must stay outside of
- packages/kit/src/cli.ts:41 — SCHEMA_VERSION stays "0.2"; task 3.8 says so
  explicitly so it is not tidied

## Probe history

iter 1 TAINTED (registry leak) · iter 2 TAINTED (coordinator disclosed the
plant in this committed file) · iter 3 CAUGHT · iter 4 not planted (focused
two-agent round on a single decision).

Do not write probe or canary planning into this file. It is committed and
travels in the PR diff.
