# Progress — proposal-to-pr: add-canary-status-redaction

_Started 2026-08-30; last updated 2026-08-30_

## Phases completed

- [x] Stage 1: Load — clean.
- [x] Stage 2 iterations 1-5, Stage 3 refinements 1-5. Five review rounds,
      fifteen agent dispatches.

## Current phase

**PAUSED at the refinement cap (5 of 5), stage=refine.** All iteration-5
blockers are FIXED and committed; no blockers are outstanding. The pause is the
cap, not an unresolved finding. No code has been written — still proposal-only.

## Where the change landed

Eight render sites of a `CanaryEntry` are now known. Seven route through one
redacting accessor; `canary plant` is a named exception and the deferred
`CANARY-PRESENT` guard row is a second named exception in the spec. The guard
row is deferred because it leaks through `source.line`, a structured field on
the published JSON schema, needing an additive field rather than a message edit.

Iteration 5 searched exhaustively for a ninth site and found none. That is the
first round in five that did not grow the scope, and the first evidence the set
is closed.

## Next 3 actions

1. Decide: one more verification round, or proceed to Stage 4 (implement).
2. If implementing: do task 2b.1 (the accessor) FIRST — the section numbering is
   historical, and enumeration-first order invites treating the accessor as
   cleanup.
3. Stage 5 must build before the suite: six of the ten section-3 tests spawn
   `dist/cli.js`.

## Integration points the next session needs to read on resume

- `packages/claims/src/canary.ts` — the accessor's home; sites at :175, :276,
  :344; `clearCanary` :334-350 (atomic splice + rmSync); `canaryGuardResult`
  :363-369 (DO NOT TOUCH — deferred).
- `packages/claims/src/cli.ts` — sites at :1107, :1111, :1322, :1326, :1348, and
  the status handler (now ~:1331).
- `packages/claims/src/canary.test.ts` — :141-144 and :327-344 are the existing
  tests to extend for 3.9/3.10; :296-306 pins the guard row and must stay green.
- `packages/claims/src/checkReport.ts:270` — why the guard row is a schema
  change and not a message edit.

## Known traps

- Four `STALE` anchors at `@2792fa1` and three `ci.yml` anchors at `@3f64b6e`
  are drift — leave them or re-stamp BOTH halves. Never repoint under the old
  stamp. The ci.yml drift comes from uncommitted work outside this change.
- The working tree carries unrelated uncommitted edits (README.md, ci.yml,
  CLAUDE.md, docs/icon.svg). Stage specific paths only; never `git add -A`.
- The probe cannot score this change. 1 CAUGHT, 4 TAINTED, structurally.

## Pending user decisions

- Final verification round, or straight to implementation.
