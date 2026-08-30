# Progress — proposal-to-pr: add-canary-status-redaction

_Started 2026-08-30; last updated 2026-08-30_

## Phases completed

- [x] Stage 1: Load — done 2026-08-30. `openspec validate` clean; no unchecked
      Human Approval box; `blocked-commands` exit 0 (no human-only commands);
      `depends-on` empty (proposal declares `None`), so no dependency gate to run.

## Current phase

**Stage 2 (Pre-review), iteration 1.** Grounding gate green (exit 0, 7 anchors,
4 advisory `STALE`). Canary planted. Three reviewers dispatched in parallel:
architecture-reviewer, rule-auditor, test-engineer. Awaiting returns.

## Next 3 actions

1. Synthesize the three reviewer returns, carrying full repo-relative paths and
   verbatim quotes so `canary verify`'s literal substring match can score it.
2. Score the probe, `canary clear`, and append both the synthesis and the
   `## Probe — stage 2` section to `review-evidence.md`.
3. Zero blockers and zero false-premises → Stage 4 (implement). Otherwise Stage 3.

## Integration points the next session needs to read on resume

_At most five files whose shape the resuming session must understand before
touching anything._

- `packages/claims/src/cli.ts` — the `canary status` handler; the presence branch
  is the only thing this change edits. NOTE: this file grew ~305 lines when the
  oracle change landed, which is why this folder's anchors read `STALE`.
- `.github/workflows/ci.yml` — the `nullius canary (self)` dogfood step, which
  `tasks.md` 3.1 asserts needs no change.
- `.claude/skills/proposal-to-pr/SKILL.md` — Stage 8 Step 1 matches the literal
  phrase `no active canary` (the branch this change does NOT touch); Resume
  semantics reads only the exit code.
- `spec/canary.md` — may document `status`'s output format (task 4.1).

## Known traps for the implementer

- **Four `STALE` anchors in this folder cite `packages/claims/src/cli.ts@2792fa1`**
  (`design.md:7`, `proposal.md:12`, `tasks.md:8`, `tasks.md:10`). These are DRIFT,
  not never-true. `.claude/rules/never-repoint-under-old-stamp.md` forbids moving
  the line number while keeping `@2792fa1`. Either re-read and re-stamp BOTH
  halves, or leave them exactly as written and let them report `STALE`, which
  passes. Do not "tidy" them.

## Pending user decisions

- None yet.
