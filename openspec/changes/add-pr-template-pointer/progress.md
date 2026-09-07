# Progress — proposal-to-pr: add-pr-template-pointer

_Started 2026-09-06; last updated 2026-09-06_

## Phases completed

- [x] Stage 1: Load — build green, `openspec validate` passes, no dependencies, no pause gates, no human-only commands
- [x] Stage 2: Pre-review iteration 1 — probe CAUGHT; 4 blockers + 2 false premises
- [x] Stage 3: Refine iteration 1 — 6 findings resolved, 3 decisions recorded, all four artefacts rewritten

## Current phase

**Stage 2 (Pre-review), iteration 2** — re-dispatched all three reviewers against the rewritten artefacts.

## What Stage 3 changed

- `design.md` **Decision 4** (new): `planPointer` returns `PlannedFile[]` and visits every host.
  Without it the feature is unreachable in any repo with `CLAUDE.md` — including this one.
- `design.md` Decision 1 no longer claims `planPointer` is "reused unchanged" (it was false).
- `design.md` Decision 3 now cites `openspec/specs/installer/spec.md:65`, the sentence that
  actually decides whether `init` may place a file under `.github/`.
- `proposal.md` Problem section: the false claim "This repository has never had one either"
  and its unstampable search anchor are replaced by a presence anchor into the template
  that does exist. The change now has 0 search anchors and 10 presence anchors.
- `doctor` dropped from scope by user decision; now a stated non-goal + `tasks.md` §6 follow-up.
- `tasks.md` §1 rewritten so no architectural question is deferred to the keyboard.
- `tasks.md` §4 gained the cross-host coexistence test — the one that fails against pre-change code.
- Spec delta gained a second requirement, "Every pointer host is visited", with two scenarios.
- Five drifted anchors re-stamped at `@78c13a0`, **both halves together**, never line-only.

## Next 3 actions

1. Synthesize iteration 2, score the probe, `canary clear`
2. If zero blockers → Stage 4: branch `feat/add-pr-template-pointer` off `main`, commit the refined artefacts first
3. Implement `tasks.md` §1 as one task-section, watching the cross-host test fail before making it pass

## Integration points the next session needs to read on resume

- packages/kit/src/render.ts:263 — `planPointer`, the early-return loop that must become a list
- packages/kit/src/render.ts:395 — `buildPlan`'s single call site and the not-found note
- packages/kit/src/render.ts:250-254 — `POINTER_LINE` and `POINTER_HOSTS`
- packages/kit/src/init.test.ts — has NO pointer tests today; the cross-host test is new ground
- openspec/specs/installer/spec.md:56,65 — the two sentences Decisions 1 and 3 rest on

## Pending user decisions

- None open. `doctor` scope was asked and answered (dropped). Proposal Open question 2
  was resolved from existing code rather than by asking. Open question 1 (does an agent
  read a template sentence as an instruction?) remains open by design — it is empirical.

## Environment notes

- This run executes in a git worktree, where `.git` is a file. `statePath` computes
  `join(root, ".git", "nullius", "pipeline", ...)` and every `pipeline state-*` call
  fails `ENOTDIR`. All state calls pass `--root /Users/arman/Documents/GitHub/nullius`;
  evidence and progress writes use the worktree root normally. **The state file is not
  where the skill documents it to be.** Worth a follow-up change against the kit.
