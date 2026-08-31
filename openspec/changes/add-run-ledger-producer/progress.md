# Progress — proposal-to-pr: add-run-ledger-producer

_Started 2026-08-31; last updated 2026-08-31_

## Phases completed

- [x] Stage 1: Load — clean. No dependencies, no pause box. `blocked-commands`
      flagged the tasks §3b hooks.json task (its text names `.claude/settings.json`);
      Stage 4 pauses there.

## Current phase

**Stage 2 (Pre-review), iteration 1** — four reviewers dispatched in parallel:
architecture-reviewer, checker-engineer (earned by `packages/claims/src/witness.ts`
via `route-paths`; `touched-areas` misses anchor-form citations), rule-auditor,
test-engineer. Grounding gate: 38/38 anchors verified before dispatch.

## Next 3 actions

1. Synthesize returns to /tmp/stage2-synthesis.md; `canary verify`; `canary clear`.
2. Append synthesis and probe section; mirror `probe_iter_1` into state.
3. Zero blockers and zero false premises → Stage 4 on `feat/add-run-ledger-producer`
   (branched from `openspec/process-visibility`, which carries the proposal);
   otherwise Stage 3.

## Integration points the next session needs to read on resume

- packages/kit/src/record.ts — `planRecords` event switch; `reportFor`; `launchAcknowledgement`
- packages/kit/src/cli.ts — `runRecord`, `SCHEMA_VERSION`, `parseOptions`
- packages/kit/src/journalFile.ts — `appendRecords` lock; `RecordSource`
- packages/claims/src/witness.ts — `VERSIONS`, `VOCABULARY`, the 0.3 floor, SILENT-REVIEWER loop
- spec/witness-journal.md — the bump rule and the fixture table

## Pending user decisions

- Open question 5: prompt text on by default under the `.nullius/` opt-in (consent call).
- The feature branch will carry the sibling `add-pr-process-report` proposal folder,
  because both proposals were committed together on `openspec/process-visibility`.
