# nullius — Claude Code plugin

The convention attaches to **anything a human approves**: a plan-mode plan, a
PR description, a design doc or ADR. This plugin ships the pieces that make an
agent author Evidence Anchors and a session enforce them:

| Piece                                                | What it does                                                                                                                                            |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`skills/evidence-anchors`](skills/evidence-anchors/SKILL.md) | The authoring rule: load-bearing claims about existing code carry citations; applies to design docs, proposals, **plans**, and **PR descriptions** |
| [`hooks/check-plan.sh`](hooks/check-plan.sh)         | A `PreToolUse` hook on `ExitPlanMode`: the plan's anchors are verified **before the plan is presented for approval**. Fail-open — it never breaks plan mode; it blocks only on a definite failing verdict, feeding the citations back to the agent to fix |
| [`hooks/witness-record.sh`](hooks/witness-record.sh) | Records the run journal from harness events: `Task` dispatches and their reports, file mutations, and a `no-report` terminal for every subagent that never came back. Opt-in, and never blocks |
| [`hooks/witness-check.sh`](hooks/witness-check.sh)   | A `Stop` hook that validates the session's journal and prints what does not hold up. Advisory: always exits 0 |
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

## Why record the run?

Twelve agents are dispatched, nine report findings, one reports "nothing", and
two never come back. With two states — findings or not — that run summarises as
"nine found something, three found nothing", and the two that died are
laundered into evidence of absence. The absence claim is the load-bearing one.

The journal keeps those three states apart, and the recording hooks make it a
record the agent did not write about itself. `nullius witness validate` then
enforces the three invariants on it: every dispatch reaches one of three
terminal states, no verification is relied on after the artifact it verified
changed, and no append omits what it corrected. Schema:
[spec/witness-journal.md](../spec/witness-journal.md).

### Turning recording on

Recording writes `.nullius/runs/<session_id>.jsonl` into the project, so it
only happens where a project asked for it — either a `.nullius` directory
exists, or `NULLIUS_WITNESS=1` is set. The agent still cannot decline to be
recorded; a human decides which repos keep journals.

```sh
mkdir -p .nullius        # opt this repo in
nullius witness validate .nullius/runs/<session>.jsonl
```

### What the recording tier can and cannot attest

A recorder's limits, left undocumented, get read as guarantees. In short:
`origin: "hooks"` journals are emitted by the harness, so the dispatch counts
and the three terminal states are the harness's account, not the agent's — but
`found` means "the subagent returned content", not "the subagent found
something real", because nothing here reads meaning. A journal written by an
agent instead of by hooks carries `origin: "self-reported"`, and
`witness validate` says so in its summary: internally consistent is not
evidence of process. The full list of limits — ambiguous correlation, unhashable
edits, missing session ids — is in the
[kit README](../packages/kit/README.md#what-this-tier-cannot-tell-you).

## Hook configuration

The plan hook looks for the newest recently-modified `.md` under
`$NULLIUS_PLAN_DIR`, `.claude/plans`, then `~/.claude/plans`. Set
`NULLIUS_PLAN_DIR` if your plans live elsewhere, and `NULLIUS_BIN` (e.g.
`pnpm exec nullius`) to pin a locally installed checker instead of `npx`.

The witness hooks take `NULLIUS_KIT_BIN` (e.g. `pnpm exec nullius-kit`) the
same way, plus `NULLIUS_WITNESS=1` to record without a `.nullius` directory and
`NULLIUS_WITNESS_PROBE=1` to save each raw hook payload to `.nullius/probes/`
— ground truth about the harness version you actually have, as against the
version its documentation describes.

## Not on Claude Code?

The skill text is plain markdown — paste it into any harness's instruction
file (AGENTS.md, Cursor rules). The reviewer kit is likewise a paste. Only the
hooks and slash commands are Claude Code-specific.

Without hooks, an agent can still be instructed to write journal records
itself. Those journals must carry `origin: "self-reported"`, and
`witness validate` will label them: that tier certifies that a run's account of
itself holds together, which is worth having and is not the same claim.
