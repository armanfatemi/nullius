# Progress — proposal-to-pr: add-pr-process-report

_Started 2026-08-31; last updated 2026-08-31_

## Phases completed

- [x] Stage 1: Load
- [x] Stage 2: Pre-review iterations 1–5 — probe CAUGHT all five rounds
- [x] Stage 3: Refine iterations 1–5; Decisions 2–4 rewritten clean after round 5
- [x] Stage 4 chunk 1: **Stage A — the bundle**, committed `5d43133`, Stage 5 green

## Commits on this branch

- `674a225` docs — five pre-review rounds of design refinement
- `5d43133` feat(kit) — `witness bundle`, Stage A
- `2255fc8` chore(openspec) — archive four landed changes, apply their spec deltas
- `742bf64` docs(agent-memory) — reviewer learnings from this run

## Current phase

**Stage 4 (Implement)**, chunk 2 of 3: **Stage B — the kernel report**
(`packages/claims`), tasks §4–§6 plus §0's deferred capture bullet.

## Next 3 actions

1. Receive Stage B, run Stage 5 myself (build, type-check, test, both dogfood polarities incl. the canary round trip), commit
2. Chunk 3: Stage C — Action, init, doctor, dogfood, tasks §7–§9
3. Stage 6 post-review routed on `git diff main...HEAD`, then Stage 8 PR

## Integration points the next session needs to read on resume

- packages/kit/src/bundle.ts:624 — `BundleEnvelope` `{ session, lines }`; the kernel must NOT import from kit
- packages/claims/src/witness.ts:176,222 — `ProvenanceCounts` (`hooks`/`selfReported`/`unattributed`) and `provenance: ProvenanceCounts | null`
- packages/claims/src/witness.ts:1599,1615,1637 — `atLedgerFloor`; provenance is null below journal v0.6
- packages/claims/src/oracle.ts:231,248 — `checkOracles` returns `unconfigured: true` early and does no git work
- packages/claims/src/canary.ts:68 — `describeCanary`; call with `reveal` unset

## The five rules Stage B is judged on

1. Tier counts come off `JournalReport.provenance`; the renderer computes no tier.
2. `provenance === null` → three tiers render *not recorded*, naming the version; no `count` key.
3. Range scoping touches only path-bearing kinds and only the mutation-derived tables and flowchart — never the tier counts.
4. Exit 0 whenever a report was produced; 2 only for usage or unreadable input.
5. No wall-clock in the pure core or either renderer; double render is byte-equal.

## Gate-list discrepancies found in Stage 5 chunk 1 (carry forward)

- The skill documents `check 'README.md' 'spec/**/*.md' --require-markers`; that
  FAILS because README.md carries no markers. **CI runs `spec/**/*.md` alone**
  and passes. Verify against CI's commands, not the skill's list.
- `check '.canary-probe.md'` only fails when a canary is planted first — CI
  creates the file and plants before those two lines. Running it bare and
  reading exit 0 as a quiet verdict is a coordinator error, not a defect.

## Pending user decisions

- None open. The user confirmed the concurrent working-tree changes were
  intentional and asked for them to be committed; done as `2255fc8` and
  `742bf64`, kept separate from the feature work.
