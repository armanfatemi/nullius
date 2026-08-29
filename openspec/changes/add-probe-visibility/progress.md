# Progress — proposal-to-pr: add-probe-visibility

_Started 2026-08-28; last updated 2026-08-28_

## Phases completed

- [x] Stage 1: Load — build green, `openspec validate` clean, no dependencies
- [x] Stage 2 iteration 1 — probe CAUGHT; 2 false premises, 2 blockers
- [x] Stage 3 refinement 1 — commit 39d215d
- [x] Stage 2 iteration 2 — probe CAUGHT; 1 blocker (the refinement itself)
- [x] Stage 3 refinement 2 — commit f95772e
- [x] Stage 2 iteration 3 — probe CAUGHT; 4 blockers, 2 false premises

## Current phase

**PAUSED at the refinement cap.** 3 refinement iterations completed; 4 blockers
remain. No code has been written — the run never reached Stage 4.

## Blockers outstanding, with the fix each needs

1. **B4 precedence is ungroundable.** The spec's `SHALL name which file supplied
   the value` rests on harness precedence this repo cannot cite. Fix: name every
   file that sets the variable and its value; let the reader apply precedence.
2. **B5 residue enumerated closed.** The spec names exactly one invisible source.
   Fix: "including the launching environment", non-exhaustive.
3. **B6 self-contradiction inside the spec.** The "stale recordings ... not being
   refreshed" scenario claims capture is off from unread sources, which task
   1.2b forbids. Same wording in design.md's open question and tasks.md 4.1.
   Fix: report what is held and when, never why it stopped.
4. **B7 task 4.1a is unwritable.** No injectable seam for `~/.claude/settings.json`.
   Fix: `userSettingsPath` on `DoctorOptions`, named in tasks 1.0/1.1.

Plus FP6: task 1.0's stated reason is false — `readManagedHooks` already
distinguishes absent from unparseable. Keep the task, fix the rationale.

## Next 3 actions on resume

1. Apply the four blocker fixes above; they are all edits to
   `specs/installer/spec.md`, `design.md` and `tasks.md`
2. Re-dispatch architecture-reviewer and test-engineer for iteration 4
3. Zero blockers → Stage 4 (implement); no code exists yet

## Integration points the next session needs to read on resume

- packages/kit/src/doctor.ts — `DoctorOptions` at :518-521 (needs the new seam);
  `readManagedHooks` :74-93 (absent vs unparseable, already distinguished);
  `runChecks` :551-552 (insert before `liveProof`); `probeChecks` :395 with the
  detail line at :407 that task 1.7 corrects
- packages/kit/src/doctor.test.ts — :263 asserts live proof is last; :210-213 is
  the existing direct `probeChecks` coverage
- packages/kit/src/cli.ts — `runInit` :193, `probeDir` call site :363, recorder
  predicate :436, live writer :591
- packages/kit/src/init.test.ts — :189-204, the seam for the no-probe-key test
- specs/installer/spec.md — carries B4, B5 and B6 between them

## Pending user decisions

- Whether to raise the refinement cap and continue, or stop here with the
  proposal in its current state. Both prior design questions are resolved.

## Branch and merge facts

- `feat/add-probe-visibility` branched from `12cde11`, not `main`, so three
  anchors stamped `@12cde11` stay resolvable. It carries one pre-existing
  unrelated commit (`retro`) forward.
- Merge with a merge commit. A squash orphans `12cde11` and those anchors fail
  open with the advisory UNVERIFIABLE-REV.

## Instrumentation note for the retro

- Probe scored CAUGHT in all three iterations, but 3 of 4 catches came through
  the registry side channel rather than by reading. test-engineer missed it
  three times across three different host documents while reporting "no false
  premises" on the strength of an anchor pass.
