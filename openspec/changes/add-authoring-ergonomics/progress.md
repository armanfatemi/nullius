# Progress — proposal-to-pr: add-authoring-ergonomics

_Started 2026-08-28T02:41:50Z; last updated 2026-08-28T02:42:51Z_

## Phases completed

- [x] Stage 1: Load — done 2026-08-28T02:41:50Z (design.md drafted in this run; spec SHALL moved to line 1; openspec validate clean; no deps, no pause, no human commands)

## Current phase

**Stage 2 (Pre-review)**, sub-step: canary planted, dispatching architecture-reviewer, checker-engineer, rule-auditor, test-engineer

## Next 3 actions

1. Synthesize reviewer returns; score probe; clear canary
2. Append synthesis + probe section to review-evidence.md
3. Any [blocker]/[false-premise] → Stage 3 (known: proposal anchor README.md:306@3f40733 is STALE; tasks 2.2/3.3 rescoped per design Decision 7)

## Integration points the next session needs to read on resume

- packages/claims/src/checkClaims.ts — ClaimResult shape (:77), evaluateAgainst drift/wrong-line (:332/:340), stamped path (:427)
- packages/claims/src/parseClaims.ts — PRESENCE_* regexes (:119-125), SourceLocation.line
- packages/claims/src/cli.ts — runCheck (:604), report (:185), USAGE/help
- packages/claims/src/cliArgs.ts — parseCheck (:201), global --help (:148)
- packages/claims/src/runners.ts — revFileReader (:149); demo.ts:171 for rev-parse precedent

## Pending user decisions

- None yet (design Open questions: --fix scope drift-only vs +wrong-line; --stamp includes weak-anchor)
