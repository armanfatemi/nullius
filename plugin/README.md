# fiducial — Claude Code plugin

The convention attaches to **anything a human approves**: a plan-mode plan, a
PR description, a design doc or ADR. This plugin ships the pieces that make an
agent author Evidence Anchors and a session enforce them:

| Piece                                                | What it does                                                                                                                                            |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`skills/evidence-anchors`](skills/evidence-anchors/SKILL.md) | The authoring rule: load-bearing claims about existing code carry citations; applies to design docs, proposals, **plans**, and **PR descriptions** |
| [`hooks/`](hooks/check-plan.sh)                      | A `PreToolUse` hook on `ExitPlanMode`: the plan's anchors are verified **before the plan is presented for approval**. Fail-open — it never breaks plan mode; it blocks only on a definite failing verdict, feeding the citations back to the agent to fix |
| [`commands/ground.md`](commands/ground.md)           | `/ground [file…]` — check any document on demand; with no argument, checks the newest plan file                                                          |
| [`commands/audit.md`](commands/audit.md)             | `/audit [file]` — premise audit: one claim per subagent, starved of context and told to refute; refutations come back as anchors the checker re-verifies. `--propose` retrofits a document with no anchors yet |
| [`reviewers/false-premise.md`](reviewers/false-premise.md) | Paste-ready `[false-premise]` severity + the verbatim descriptive question for your reviewer agents                                                |

## Why gate the plan?

An ephemeral plan is still a document making load-bearing claims ("nothing
else consumes this event", "the helper for X doesn't exist"), and the human
skimming it before hitting approve is the most exposed reviewer there is —
solo, time-pressured, no second reviewer coming. The value of an anchor was
never durability; it's that it gates an **approval moment**. The plan being
discarded afterward is irrelevant — the damage is done at approval.

## Hook configuration

The hook looks for the newest recently-modified `.md` under
`$FIDUCIAL_PLAN_DIR`, `.claude/plans`, then `~/.claude/plans`. Set
`FIDUCIAL_PLAN_DIR` if your plans live elsewhere, and `FIDUCIAL_BIN` (e.g.
`pnpm exec fiducial`) to pin a locally installed checker instead of `npx`.

## Not on Claude Code?

The skill text is plain markdown — paste it into any harness's instruction
file (AGENTS.md, Cursor rules). The reviewer kit is likewise a paste. Only the
hook and slash command are Claude Code-specific.
