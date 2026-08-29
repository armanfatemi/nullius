# Progress — proposal-to-pr: add-journal-sealing

_Started 2026-08-29; last updated 2026-08-29_

## Phases completed

- [x] Stage 1: Load — done 2026-08-29. Build green; `openspec validate` clean; dependency `add-journal-identity` landed on `main` via PR #53 (compare status `identical`).

## Current phase

**Stage 2 (Pre-review), iteration 1** — grounding gate green (12/12 markers verified, 4 advisory `STALE`); canary planted at `openspec/changes/add-journal-sealing/proposal.md:8`; architecture-reviewer, rule-auditor and test-engineer dispatched in parallel. checker-engineer dropped: no kernel file is touched.

## Next 3 actions

1. Collect the three reviewer returns and synthesize
2. `canary verify` the synthesis, then the mandatory `canary clear`
3. Append the synthesis and the probe section; decide Stage 3 vs Stage 4

## Integration points the next session needs to read on resume

- packages/kit/src/journalFile.ts — `RUNS_DIR`, `appendRecords`, the advisory lock the seal must stay off
- packages/kit/src/identity.ts — the kit's bounded-git helper (`spawnSync` at :253). There is **no** `packages/kit/src/git.ts`
- packages/kit/src/record.ts — `SessionEnd` handling, where sealing hooks in
- packages/kit/src/doctor.ts — the absence register the unsealed count joins
- packages/kit/src/cli.ts — the `witness` verb table `witness seal` joins

## Pending user decisions

- None yet

## Notes for the retro

- `pipeline route` returned only architecture-reviewer + rule-auditor: `touched-areas` finds backticked mentions, and every kit path in this proposal is backticked *with* an `:NN@hash` anchor suffix, so none of them reached the router. The cited paths were extracted and re-routed through `route-paths`, which added test-engineer. This is the gap the open change `add-touched-areas-from-anchors` addresses.
