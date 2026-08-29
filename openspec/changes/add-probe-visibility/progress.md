# Progress — proposal-to-pr: add-probe-visibility

_Started 2026-08-28; last updated 2026-08-28_

## Phases completed

- [x] Stage 1: Load — done 2026-08-28 (build green, `openspec validate` clean,
      no dependencies, no pause gates, no human-only commands)

## Current phase

**Stage 2 (Pre-review)**, iteration 1 — canary planted at `proposal.md:8`,
three reviewers dispatched in parallel: architecture-reviewer, rule-auditor,
test-engineer. checker-engineer dropped (no `packages/claims` kernel file is
touched; no verdict or config key is added).

## Next 3 actions

1. Synthesize the three reviewer returns; score and clear the canary
2. Resolve task 0.1 with the user — does `init` *offer* to enable capture, or
   only name it? Tasks.md marks it decided-before-code
3. Zero blockers and zero false premises → Stage 4; otherwise Stage 3

## Integration points the next session needs to read on resume

_At most five files whose shape the resuming session must understand before
touching anything._

- packages/kit/src/doctor.ts — the `Check`/`Status` union; `fact` already exists
  and is used at lines 241, 271, 295, 329, 360. `probeChecks` at 395 reads the
  committed corpus and is explicitly out of scope
- packages/kit/src/cli.ts — `runInit`; the doctor invocation that supplies
  `probeDir`; the live probe writer for `.nullius/probes/`
- packages/kit/src/doctor.test.ts — where the new three-branch assertions land
- packages/kit/src/init.test.ts and init.cli.test.ts — where "init writes no
  probe key" is asserted
- .nullius/README.md — the documentation surface for tasks 3.1/3.2

## Pending user decisions

- Task 0.1 / design Decision 2 open question: does `init` offer to enable
  capture, or only mention it? Not yet asked.

## Coordinator observations not yet in review-evidence.md

- `.nullius/probes/` on this machine currently holds five payloads (Aug 26-27),
  so the proposal's "Why now" claim that it was found *empty* describes a past
  moment that current repo state contradicts. Carry into the Stage 2 synthesis.
