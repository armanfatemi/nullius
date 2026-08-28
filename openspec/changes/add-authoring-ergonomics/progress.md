# Progress — proposal-to-pr: add-authoring-ergonomics

_Started 2026-08-28T02:41:50Z; last updated 2026-08-28T19:42:23Z_

## Phases completed

- [x] Stage 1: Load — done 2026-08-28T02:41:50Z (design.md drafted in-run; no deps/pause/human commands)
- [x] Stage 2 iteration 0 — 4 blockers, 3 false premises; probe MISSED (synthesis-format cause)
- [x] Stage 3 iteration 0 — e522166 (design/proposal/tasks; spec missed)
- [x] Stage 2 iteration 1 — 2 blockers (spec unrewritten), 1 false premise (#6); probe CAUGHT
- [x] Stage 3 iteration 1 — a4ff20d (spec rewritten; concerns folded)
- [x] Stage 2 iteration 2 — 0 blockers, 1 false premise (proposal --stamp bullet); anchors stamped off-branch; probe CAUGHT
- [x] Stage 3 iteration 2 — 87f73dc 2026-08-28T03:03:23Z (bullet rewritten; 29 anchors re-stamped @5d5b2e0 = main; spec version clause)

## Current phase

**Stage 9 (Retro)** — PR open: https://github.com/armanfatemi/nullius/pull/42 (base main, head feat/add-authoring-ergonomics, 13 commits). Stage 6 second pass clean; concerns folded or carried in the PR body. retro-writer dispatched.

## Next 3 actions

1. Synthesize (cite the planted location by FULL repo-relative path); score; clear
2. Clean → Stage 4 on feat/add-authoring-ergonomics at task 1.1 (rewriteMarker in parseClaims.ts + planRewrites in rewrite.ts)
3. Not clean → pause with pause_reason=refinement_cap and the remaining list

## Integration points the next session needs to read on resume

- packages/claims/src/checkClaims.ts — ClaimResult (:77), evaluateAgainst (:296-345), fail-open (:400), stamped path (:427), locate (:269), checkUnstamped (:484-490)
- packages/claims/src/parseClaims.ts — PRESENCE_* regexes (:119-126), try order (:321); rewriteMarker goes here
- packages/claims/src/cli.ts — runCheck (:604), report (:185) to be split collect/render
- packages/claims/src/cliArgs.ts — parseCheck (:201), global --help (:148)
- packages/claims/src/revAnchors.test.ts — temp-git-repo helper and injected readFileAtRev seam (:38-50)

## Pending user decisions

- Funnel target: `audit <doc> --propose` (proposal) vs plain `audit <doc>` (two reviewers recommend) — implemented as proposal states; carried to PR body
- --fix scope (drift+wrong-line vs drift-only); --stamp includes weak-anchor — one-token filters
