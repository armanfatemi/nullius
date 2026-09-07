# Progress — proposal-to-pr: add-pr-template-pointer

_Started 2026-09-06; last updated 2026-09-06_

## Phases completed

- [x] Stage 1: Load — no dependencies, no pause gates, no human-only commands
- [x] Stage 2: Pre-review — **four** iterations, all probed CAUGHT (see the validity caveat below)
- [x] Stage 3: Refine — four rounds; 19 findings resolved, 7 decisions recorded
- [x] Stage 4: Implement — 32 of 34 tasks; 2 remaining are §6 follow-ups, deliberately out of scope
- [x] Stage 5: Verify — build, type-check, test (6-failure ugrep baseline), all dogfood gates both polarities

## Current phase

**Stage 6 (Post-review)** — four reviewers dispatched, routed on `git diff origin/main...HEAD`
via `route-paths`, not re-used from Stage 2. checker-engineer is newly in scope: at
pre-review no code existed, so its justification would have been generic.

## Commits on this branch

- `52cb65e` docs: the refined proposal (four review rounds)
- `88c7ad7` feat(kit): pointer hosts become groups; PR template added as one
- `6d1d60a` docs(kit): dogfood the pointer, CHANGELOG, action/README cross-reference

## What shipped

`POINTER_HOSTS` is a list of groups. Every group is visited; within a group the
first host present wins. `planPointer` returns `{ files, notes }`. The flat list
it replaced returned on the first host found anywhere — so adding the PR template
to it would have been unreachable in any repo with `CLAUDE.md`, including this one.

## Next 3 actions

1. Synthesize Stage 6; any `[blocker]` → Stage 7, else Stage 8
2. Stage 8: `witness bundle`, grep the envelope for leaks BEFORE committing it, then `gh pr create --base main`
3. Stage 9: dispatch retro-writer with pointers only, no summary of the run

## Integration points the next session needs to read on resume

- packages/kit/src/render.ts:252-330 — `PointerGroup`, `POINTER_HOSTS`, `planGroup`, `planPointer`
- packages/kit/src/render.ts:~400 — `buildPlan`'s call site, now spreading files and notes
- packages/kit/src/init.test.ts — `describe("pointer host groups")` and the case-sensitivity block
- openspec/changes/add-pr-template-pointer/review-evidence.md — four syntheses, four probe records
- CHANGELOG.md `## kit 0.8.0` — the two known limitations, which belong in the PR body

## Pending user decisions

- None open. Two were asked and answered: `doctor` dropped from scope; Decision 5
  narrowed from six template spellings to the two `.github/` ones.

## Known caveats to carry into the PR body

- **The probe is measuring less than four CAUGHT verdicts suggest.** architecture-reviewer
  carries a memory teaching it the plant's shape; one iteration-2 catch came via the
  checker's own output; the claim text was byte-identical across all four rounds.
  Recorded under `## Probe — stage 2` in review-evidence.md.
- **Two CLI tests were written after the implementation**, not before. Disclosed in
  the commit message and to be disclosed in the PR body.
- **The skill's Stage 5 gate list is stricter than CI**: it adds `README.md` to the
  `--require-markers` glob, which fails on a pristine `origin/main`. CI's real
  invocation omits it and exits 0.

## Environment notes

- Git worktree: `.git` is a file, so `pipeline state-*` dies with `ENOTDIR`
  (`statePath` hardcodes `join(root, ".git", ...)`). Every state call in this run
  passes `--root /Users/arman/Documents/GitHub/nullius`. **The state file is not
  where the skill documents it to be.** Worth a follow-up against the kit.
- This machine's filesystem is case-INSENSITIVE, so the two spelling tests skip
  locally and only run on CI.
