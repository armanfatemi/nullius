# Progress — proposal-to-pr: add-probe-visibility

_Started 2026-08-28; last updated 2026-08-28_

## Phases completed

- [x] Stage 1: Load — build green, `openspec validate` clean, no dependencies
- [x] Stage 2 iteration 1 — CAUGHT; 2 false premises, 2 blockers
- [x] Stage 3 refinement 1 — 39d215d
- [x] Stage 2 iteration 2 — CAUGHT; 1 blocker (the refinement itself)
- [x] Stage 3 refinement 2 — f95772e
- [x] Stage 2 iteration 3 — CAUGHT; 4 blockers, 2 false premises
- [x] Stage 3 refinement 3 — a8704b1 (operator authorised continuing past cap)
- [x] Stage 2 iteration 4 — CAUGHT; 3 blockers, 8 concerns
- [x] Stage 3 refinement 4 — 73703da
- [ ] Stage 2 iteration 5 — in flight, briefed as an exhaustive sweep

## Current phase

**Stage 2 (Pre-review), iteration 5.** Canary planted at `proposal.md:8`. All
three reviewers dispatched with sweep briefs rather than spot-check briefs,
because the recurring failure across four rounds was a local edit where a
document-wide sweep was needed: every fix was correct and every fix left a
sibling sentence making the same claim untouched.

The briefs ask for exhaustive enumeration with file:line and require the
reviewer to say how an empty result was established, so a skim cannot be
mistaken for a clean sweep.

## Next 3 actions

1. Synthesize iteration 5; score and clear the canary
2. Zero blockers → Stage 4 (implement). No code exists yet
3. If blockers remain, report to the operator rather than refining a fifth time
   — the cap was passed two rounds ago by explicit instruction

## Integration points the next session needs to read on resume

- packages/kit/src/doctor.ts — `DoctorOptions` at **516-520** (not 518-521; that
  wrong citation survived a review round); `readManagedHooks` 74-93;
  `runChecks` 551-552, insert the new check before `liveProof`
- packages/kit/src/doctor.test.ts — `check()` helper at :25 with defaulted
  params, ~20 call sites unaffected by a third; :263 ordering assertion
- packages/kit/src/cli.ts — `runInit` :193, `probeDir` call site :363, recorder
  predicate :436, live writer :591
- packages/kit/src/init.test.ts — :189-204, seam for the no-probe-key test
- openspec/changes/add-probe-visibility/tasks.md — opens with a column-0 anchor
  block (A4-A7). Anchors indented inside a list item are invisible to `check`

## Pending user decisions

- None. Both design questions resolved; the operator authorised iterations 4
  and 5 past the declared refinement cap.

## Branch and merge facts

- `feat/add-probe-visibility` branched from `12cde11`, not `main`, so thirteen
  anchors stamped `@12cde11` stay resolvable. Carries one pre-existing unrelated
  commit (`retro`).
- **Merge with a merge commit.** A squash orphans `12cde11` and every `@12cde11`
  anchor fails open with the advisory UNVERIFIABLE-REV — CI green, hard gate
  gone.

## Instrumentation note for the retro

- Probe CAUGHT 4/4 and the aggregate is nearly uninformative. It decomposes
  into: architecture-reviewer catches it every time (twice via the registry
  side channel, twice by reading); test-engineer has missed it four times
  across four different host documents while reporting "no false premises" from
  an anchor pass; rule-auditor caught it both rounds it was dispatched, by
  `git blame` plus grep. A single per-run verdict cannot express that, and the
  per-run verdict is what the PR body carries.
