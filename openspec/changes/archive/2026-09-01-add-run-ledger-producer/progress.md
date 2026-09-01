# Progress — proposal-to-pr: add-run-ledger-producer

_Started 2026-08-31; completed 2026-08-31_

## Phases completed

- [x] Stage 1 Load — clean; no dependencies, no pause box.
- [x] Stage 2/3 iterations 1–4 — 15 blockers, 8 false premises. Cap raised
      3 → 4 by the operator. Probe CAUGHT in all four rounds.
- [x] Stage 4 Implement — 55 of 57 tasks, in seven parallel chunks.
- [x] Stage 5 Verify — green (6 ugrep baseline failures only).
- [x] Stage 6 Post-review — four reviewers routed on the real 42-path diff;
      4 blockers, 8 concerns.
- [x] Stage 7 Address must-fixes — all four fixed; Stage 5 re-run in full.
- [x] Stage 8 PR — https://github.com/armanfatemi/nullius/pull/74
- [ ] Stage 9 Retro — pending.

## Two dispatch rounds returned nothing

Iteration 2's first dispatch and iteration 4's (3 of 4 agents) were killed by
the API session limit before any agent read a file. Both are recorded in
`review-evidence.md` rather than absorbed into the following round.

## Commits

- `19f7bd4` — the change.
- `40e259e` — the anchor stamps, separate on purpose: amending would change
  `19f7bd4`'s hash and twelve stamps name it.

## Correction to the earlier record

Iterations 3 and 4 of this file and of `review-evidence.md` state that
`c8305b1` is not on `main`. **That is false** — it is an ancestor of `main`,
and `main` has moved 31 commits past it. rule-auditor said so at iteration 4
and the coordinator recorded it as a reviewer error. The earlier text is left
as written, being the record of what was believed; the correction is in
`review-evidence.md` under Stage 8 and in the PR body.

## What the reviewer of PR #74 needs to know

1. **The branch is 31 commits behind `main`**, with 10 overlapping files and
   3 conflicts (`.claude/agents/architecture-reviewer.md`,
   `.claude/agents/rule-auditor.md`, `.github/workflows/ci.yml`), measured with
   `git merge-tree`. Update it with a **merge, never a rebase** — a rebase
   rewrites `19f7bd4` and every stamp naming it degrades to
   `UNVERIFIABLE-REV`.
2. **`tasks.md` §0's two probe captures are unticked and blocked on a human
   step**: the repo's `plugin/` is the marketplace source, not the live plugin,
   so `UserPromptSubmit` cannot fire until the plugin is reinstalled and a new
   session starts. The prompt parser runs on a documented assumption until then.
3. `README.md` is deliberately **not** in the PR — its producer update is
   entangled with an unrelated in-flight front-page rewrite in the working tree.

## Still uncommitted in the working tree, by design

The in-flight change (`README.md`, `CLAUDE.md`, `.github/workflows/ci.yml`,
`packages/claims/src/cli.characterization.test.ts`, `docs/icon.svg`) and the
agent-memory edits. The two mixed files were staged hunk-by-hunk so this PR
carries only this change's lines.
