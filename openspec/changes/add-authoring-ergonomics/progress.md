# Progress — proposal-to-pr: add-authoring-ergonomics

_Started 2026-08-28T02:41:50Z; last updated 2026-08-28T02:58:23Z_

## Phases completed

- [x] Stage 1: Load — done 2026-08-28T02:41:50Z (design.md drafted in-run; spec SHALL moved to line 1; no deps/pause/human commands)
- [x] Stage 2: Pre-review iteration 0 — 4 blockers, 3 false premises; probe MISSED (synthesis-format cause)
- [x] Stage 3: Refine iteration 0 — commit e522166 (design/proposal/tasks; spec NOT edited — the iteration-1 blocker)
- [x] Stage 2: Pre-review iteration 1 — 2 blockers (spec unrewritten), 1 false premise (#6); probe CAUGHT
- [x] Stage 3: Refine iteration 1 — commit a4ff20d 2026-08-28T02:58:23Z (spec rewritten; #6 dropped; concerns folded)

## Current phase

**Stage 2 (Pre-review) iteration 2 of cap 3**, sub-step: canary planted, dispatching architecture-reviewer + rule-auditor (checker-engineer/test-engineer dropped: nothing new in their domain)

## Next 3 actions

1. Synthesize iteration-2 returns (cite planted location by FULL repo-relative path); score; clear
2. Zero blockers/false-premises → Stage 4 on feat/add-authoring-ergonomics at task 1.1 (rewriteMarker + planRewrites)
3. Else Stage 3 iteration 2 — the last before the cap pauses the run

## Integration points the next session needs to read on resume

- packages/claims/src/checkClaims.ts — ClaimResult (:77), evaluateAgainst (:296-345), fail-open (:400), stamped path (:427), locate (:269), checkUnstamped (:484-490)
- packages/claims/src/parseClaims.ts — PRESENCE_* regexes (:119-126), try order (:321); rewriteMarker goes here
- packages/claims/src/cli.ts — runCheck (:604), report (:185) to be split collect/render
- packages/claims/src/cliArgs.ts — parseCheck (:201), global --help (:148)
- packages/claims/src/revAnchors.test.ts — temp-git-repo helper and injected readFileAtRev seam (:38-45)

## Pending user decisions

- Funnel target: `audit <doc> --propose` (proposal) vs plain `audit <doc>` (two reviewers recommend) — implemented as proposal states; carried to PR body
- --fix scope (drift+wrong-line vs drift-only); --stamp includes weak-anchor — one-token filters
