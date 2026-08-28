# Progress — proposal-to-pr: add-authoring-ergonomics

_Started 2026-08-28T02:41:50Z; last updated 2026-08-28T02:51:23Z_

## Phases completed

- [x] Stage 1: Load — done 2026-08-28T02:41:50Z (design.md drafted in-run; spec SHALL moved to line 1; no deps/pause/human commands)
- [x] Stage 2: Pre-review iteration 0 — done (4 reviewers; 4 blockers, 3 false premises; probe MISSED — synthesis-format cause, see review-evidence.md)
- [x] Stage 3: Refine iteration 0 — done 2026-08-28T02:51:23Z, commit e522166 on feat/add-authoring-ergonomics (design Decisions 1-7 rewritten; tasks.md renumbered 1.1-1.4, 2.1-2.3, 3.1-3.3; proposal re-stamped + Impact corrected)

## Current phase

**Stage 2 (Pre-review) iteration 1**, sub-step: canary planted, dispatching all four reviewers against the corrected artefacts

## Next 3 actions

1. Synthesize iteration-1 returns (cite the planted location as the FULL repo-relative path); score probe; clear canary
2. Zero blockers/false-premises → Stage 4 on feat/add-authoring-ergonomics, task 1.1
3. Else Stage 3 iteration 1 (cap 3)

## Integration points the next session needs to read on resume

- packages/claims/src/checkClaims.ts — ClaimResult (:77), evaluateAgainst drift/wrong-line (:326-345), fail-open (:400), stamped path (:427), locate (:269)
- packages/claims/src/parseClaims.ts — PRESENCE_* regexes (:119-126); rewriteMarker goes here
- packages/claims/src/cli.ts — runCheck (:604), report (:185) to be split collect/render
- packages/claims/src/cliArgs.ts — parseCheck (:201), global --help (:148)
- packages/claims/src/revAnchors.test.ts — temp-git-repo test seam for --stamp/--fix tests

## Pending user decisions

- Funnel target: `audit <doc> --propose` (proposal) vs plain `audit <doc>` (spec/evidence-anchors.md:393 caution) — carried as open concern, not blocking
- --fix scope (drift+wrong-line vs drift-only); --stamp includes weak-anchor — one-token filters
