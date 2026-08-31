# Progress — proposal-to-pr: add-canary-status-redaction

_Started 2026-08-30; completed 2026-08-31_

## Phases completed

- [x] Stage 1 Load — clean; no dependencies, no pause box, no human-only commands.
- [x] Stage 2/3 iterations 1-5 — five pre-review rounds, fifteen dispatches.
      Cap raised 3 -> 5 at the user's decision after iteration 3.
- [x] Stage 4 Implement — 44 tasks, three commits.
- [x] Stage 5 Verify — green; 907 passing (+13), 6 ugrep baseline failures.
- [x] Stage 6 Post-review — three dispatches routed on the diff. One blocker.
- [x] Stage 7 Address must-fixes — ledger reconciled, remedy restored, oracle
      disclosed, SKILL.md citation corrected. Stage 5 re-run in full.
- [x] Stage 8 PR — https://github.com/armanfatemi/nullius/pull/58
- [x] Stage 9 Retro — severity `notable`.

## What shipped

**Eleven renderings of a plant's location exist. Nine are redacted, one is
deferred, one is a deliberate reveal.**

- Nine redacted through `describeCanary`: six in `cli.ts` (`status`, `check`'s
  two canary warnings, `verify`'s CAUGHT and MISSED, `clear`) and three in
  `canary.ts` (`plant`'s already-registered refusal, `clearCanary`'s refusal,
  `loadActiveCanary`'s unsafe-path warning).
- One deferred: `canaryGuardResult`'s `CANARY-PRESENT` row — it leaks through a
  structured field on the published JSON schema and needs an additive field.
- One deliberate: `canary plant`'s success output, via a named `reveal` option.

An earlier version of this file said "eight known, seven routed." That was
wrong, was wrong in `CHANGELOG.md` and `proposal.md` too, and was caught at
post-review. Corrected here last, which is itself the finding: a count repeated
across four documents was wrong in all four until something re-read the code.

## Known open, by decision

- The `CANARY-PRESENT` guard row still carries the plant's line. Follow-up.
- The out-of-scope warning is a presence oracle: it fires exactly when the
  matched set does NOT contain the plant, and `--probing` does not suppress it,
  so `check --probing <one-doc>` answers "is the plant here" one bit at a time.
  Verified on a live plant. **It survives the guard-row follow-up** and needs its
  own change, because closing it means changing when the warning fires.
- `.git/nullius/canaries.json` stays readable. Incidental exposure is what this
  closes, not a determined reader.
- The `existsSync(CLI)` test guard covers an absent `dist/`, not a stale one.
  Pre-existing, shared with `cli.characterization.test.ts`.

## Instrument defects this run measured

1. The canary cannot score a review of the canary — 1 CAUGHT, 4 TAINTED.
2. Rotating the plant's document does not rotate its sentence.
3. Per the retro: the CAUGHT/TAINTED boundary tracks `TAINT_TOKENS` vocabulary
   rather than contamination, so it over-reported once and would under-report a
   paraphrase. Graded `blocking-grade` for the instrument in the retro.

## Pending user decisions

- Review and merge PR #58. **Merge commit, never squash** — the branch carries
  anchors stamped against its own commits.
