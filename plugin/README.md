# nullius — Claude Code plugin

The convention attaches to **anything a human approves**: a plan-mode plan, a
PR description, a design doc or ADR. This plugin ships the pieces that make an
agent author Evidence Anchors and a session enforce them:

| Piece                                                | What it does                                                                                                                                            |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`skills/evidence-anchors`](skills/evidence-anchors/SKILL.md) | The authoring rule: load-bearing claims about existing code carry citations; applies to design docs, proposals, **plans**, and **PR descriptions** |
| [`hooks/check-plan.sh`](hooks/check-plan.sh)         | A `PreToolUse` hook on `ExitPlanMode`: the plan's anchors are verified **before the plan is presented for approval**. Fail-open — it never breaks plan mode; it blocks only on a definite failing verdict, feeding the citations back to the agent to fix |
| [`hooks/witness-record.sh`](hooks/witness-record.sh) | Records the run journal from harness events: the operator's prompts, `Task` dispatches and their reports, the `[blocker]`/`[concern]`/`[looks-good]` lines a subagent returned, file mutations, and a `no-report` terminal for every subagent that never came back. Opt-in, and never blocks |
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

### Recording the operator's turn

A `UserPromptSubmit` hook records one `prompt` record per prompt, and stamps the
harness's `prompt_id` onto each `dispatch` and `mutation` that followed from it —
so the journal shows what was asked and what it caused, joined by the harness's
own key rather than by timestamps. The agent's *reply* is deliberately not
recorded: `last_assistant_message` is the agent's self-account, which is the tier
this journal exists to distrust. The steering is evidence; the reply is a claim,
and the work it caused is already in the file as dispatches and mutations.

Set **`NULLIUS_WITNESS_PROMPTS=0`** to record a prompt's length and hash instead
of its text. The record still says a prompt happened and when; it says nothing
about what it asked.

Two limits worth knowing before you rely on this:

- **The payload shape for this event is assumed, not probed.** Every other event
  the recorder reads is pinned to a captured payload under
  `spec/fixtures/probes/claude-code/`; `UserPromptSubmit` has none yet. The
  parser tries several plausible keys for the prompt text and, finding none,
  records nothing and says so on stderr rather than writing a record that
  asserts the operator spoke while saying nothing about what they said. So an
  absent `prompt` record means "not recorded", never "no prompt".
- **The hook's stdout goes to stderr, for every event.** `UserPromptSubmit` is
  the one event whose hook stdout the harness returns to the model as context,
  and the default runner is `npx`, which prints to stdout on a cold cache —
  which would arrive as instruction-shaped text nobody wrote. The redirect is
  on the single invocation the script makes, so the guarantee does not depend on
  which event fired or on anyone remembering it next time `hooks.json` grows an
  entry:

  **Evidence:** `plugin/hooks/witness-record.sh:77` — `$bound $runner witness record --root "$root" >&2 || status=$?`

### The time bound lives in the script, and degrades rather than fails

`UserPromptSubmit` runs synchronously on a human's prompt, so a runner that
hangs stalls the interactive path — the shape that gets a recorder uninstalled.
The runner is therefore wrapped in a `timeout`, and the bound is **in the script
rather than a `timeout` key in `hooks.json`**: a harness-killed process never
reaches the script's own `exit 0`, and that last line is where the never-blocks
guarantee actually lives. A delegated bound is a convention; an in-script one is
a mechanism. Set `NULLIUS_WITNESS_TIMEOUT` (seconds, default 15) to change it.

**On a host with neither `timeout` nor `gtimeout` on PATH, the bound is dropped
rather than delegated, and the runner is invoked exactly as it would be without
it** — the wrapper variable is simply empty:

**Evidence:** `plugin/hooks/witness-record.sh:60` — `  bound=""`

macOS is the case that matters: it ships no `timeout`, and coreutils
installs it as `gtimeout`. This is a deliberate degradation and not a silent
one — recording slowly beats not recording, and a missing utility is not a
reason to stop observing the run — but on such a host a wedged runner is
unbounded. If that matters to you, install coreutils or pin `NULLIUS_KIT_BIN`
to a local build so the run never waits on an `npx` fetch.

### What the recording tier can and cannot attest

A recorder's limits, left undocumented, get read as guarantees. In short:
`origin: "hooks"` journals are emitted by the harness, so the dispatch counts
and the three terminal states are the harness's account, not the agent's — but
`found` means "the subagent returned content", not "the subagent found
something real", because nothing here reads meaning.

**Findings are now extracted too, and by the same rule.** At a subagent's
terminal the recorder scans the return text for lines matching the reviewer tag
grammar (`- [blocker] …`, `[concern]`, `[looks-good]`, `[false-premise]`) and
writes one `finding` record per match. That is a line grammar, not a
classifier — nothing reads the return for meaning — so a return with no tag
lines produces no findings, and a tag on a line that says nothing useful
produces one anyway. What the record attests is that the agent's return
contained that line.

**A journal now holds two tiers at once, and says which is which per record.**
The hook-extracted half above is what the harness saw. The other half is the
coordinator's own account of its run — `stage`, `resolution`, `decision` and
`check` records written with `nullius-kit witness ledger` — and every one of
them carries `origin: "self-reported"` in the record itself, so it can never
inherit the header's `hooks` and be read as harness-attested.
`witness validate` prints the counts per tier, and its cross-tier verdict
`SUPPRESSED-FINDING` names a blocker the harness extracted that the coordinator
never answered — a comparison neither party could have made about itself.

The full list of limits — ambiguous correlation, unhashable edits, missing
session ids — is in the
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
version its documentation describes. `NULLIUS_WITNESS_PROMPTS=0` records
prompts as a length and a hash instead of their text, and
`NULLIUS_WITNESS_TIMEOUT` (seconds, default 15) bounds the runner.

**Reinstall the plugin after upgrading.** `hooks.json` gained a
`UserPromptSubmit` entry, and a plugin installed before that ships the old file:
every other event keeps recording exactly as it did, and prompts are simply
never recorded, with nothing in the output to say why. `/plugin` and reinstall,
then check `nullius-kit doctor` — its managed-hooks check knows the new event.

## Not on Claude Code?

The skill text is plain markdown — paste it into any harness's instruction
file (AGENTS.md, Cursor rules). The reviewer kit is likewise a paste. Only the
hooks and slash commands are Claude Code-specific.

Without hooks, an agent can still be instructed to write journal records
itself. Those journals must carry `origin: "self-reported"`, and
`witness validate` will label them: that tier certifies that a run's account of
itself holds together, which is worth having and is not the same claim.
