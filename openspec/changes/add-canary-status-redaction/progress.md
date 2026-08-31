# Progress — proposal-to-pr: add-canary-status-redaction

_Started 2026-08-30; last updated 2026-08-30_

## Phases completed

- [x] Stage 1: Load — clean. No deps, no pause box, no human-only commands.
- [x] Stage 2 iteration 1 — 3 blockers, 3 false premises. Probe CAUGHT.
- [x] Stage 3 iteration 1 — scope grew to `check`'s two warnings. Commit 43651d6.
- [x] Stage 2 iteration 2 — 1 blocker, 2 false premises. Probe TAINTED.
- [x] Stage 3 iteration 2 — scope grew to guard row + `verify`; boundary
      restated as reachability. Commit 50f6c14.
- [x] Stage 2 iteration 3 — 3 blockers, 2 false premises. Probe TAINTED.

## Current phase

**PAUSED at Stage 3, pause_reason=refinement_cap.** Three refinement iterations
completed (the `--max-refine` default, kept at the user's explicit request).
Three blockers remain and are NOT addressed. No code has been written; the
change is proposal-only. Nothing is broken — the pause is the cap doing its job.

## The three open blockers

1. **The boundary is not closed.** Decision 3's test is "a reviewer can reach
   the location through it." Six surfaces qualify; the plan covers four.
   Missing: `packages/claims/src/cli.ts:1348` (`canary clear`, which takes no
   operand and is the shortest path of all) and `packages/claims/src/canary.ts:344`.
   Worse, Decision 4 keeps `canary clear` as the redacted guard row's advertised
   remedy, so the fix points its reader at the leak. architecture-reviewer's
   remedy: one redacting accessor for every render of a `CanaryEntry`, with
   `canary plant` the single explicit exception.
2. **`packages/claims/src/canary.test.ts:296-306`** asserts
   `source: { line: 3 }` on `canaryGuardResult`, which task 2b.1 changes to `0`.
   No task updates it.
3. **Section 6 runs the new tests against a stale binary.** `cli.ts` is not
   importable (no exports; ends in `process.exit(main())`), so tasks 3.1-3.6
   spawn `dist/cli.js`. 6.1 runs the suite before 6.2's `pnpm build`.

## Also open, promoted from concern

- The `line: 0` sentinel goes on the wire via `checkReport.ts:270` into
  `--format json`. `CheckReport`'s v1 policy covers field add/remove, not a
  change to an existing field's value semantics; a consumer doing
  `lines[line - 1]` gets `-1`. Prefer an additive field over overloading `line`.
- `proposal.md:14-20`'s motivating "two real runs" claim carries no anchor.

## Next 3 actions (require a user decision first)

1. Decide: adopt the single-accessor redesign, or ship narrower, or withdraw.
2. If continuing, raise `--max-refine` — the cap is spent.
3. Then fix blockers 2 and 3, which are mechanical and need no judgement.

## Integration points the next session needs to read on resume

- `packages/claims/src/canary.ts` — `canaryGuardResult` (:361-371), the refusal
  message (:344), `clearCanary` (:334-350, atomic splice + rmSync).
- `packages/claims/src/cli.ts` — six render sites: status (:1331-1337),
  check's two warnings (:1107, :1111), verify (:1322, :1326), clear (:1348).
- `packages/claims/src/checkReport.ts:270` — where `source.line` reaches json.
- `packages/claims/src/cli.characterization.test.ts` — the spawn-dist pattern
  every CLI-level test must follow, and why the build must precede the suite.

## Pending user decisions

- Whether to adopt the single redacting accessor (larger, closes the pattern)
  or continue enumerating call sites (smaller, has failed three times).

## Known traps

- Four `STALE` anchors at `@2792fa1` are drift — leave them or re-stamp BOTH
  halves. Never repoint under the old stamp.
- The probe cannot score this change. Three rounds, one CAUGHT and two TAINTED,
  and the taints are structural: a review of the canary names the canary.
