# @nullius-inverba/kit — the producer half

The second half of [nullius](https://github.com/armanfatemi/nullius): the part
that *installs and produces*, as against the kernel
([`@nullius-inverba/claims`](../claims/), bin `nullius`), which renders
verdicts. This package writes the run journal that `nullius witness validate`
judges.

It exists because of one problem with the journal as originally shipped:

> **The agent that just did the work is a bad witness.** It is deep in a long
> context where its early mistakes have been compacted away, it is mildly
> motivated to look competent, and it cannot see its own wrong assumptions —
> that is what an assumption is.

A journal the agent writes about itself has exactly that problem. A journal the
**harness runtime** writes does not: hooks fire whether or not the agent finds
them convenient, and an agent cannot decline to be recorded.

## `witness record`

One hook payload on stdin, one journal record appended under an advisory lock:

```sh
nullius-kit witness record [--origin hooks|self-reported] [--root <dir>]
nullius-kit witness check  [--root <dir>]
```

| Hook event | Record |
| --- | --- |
| `SessionStart` | The journal header — `version`, `origin`, `session`, `source` |
| `PreToolUse` on `Task`/`Agent` | `dispatch` |
| `PostToolUse` on `Task`/`Agent` | A **launch link** when the subagent went async, or the `report` when it did not |
| `SubagentStop` | `report` — the subagent's real terminal, joined by `agent_id` |
| `PostToolUse` on `Edit`/`Write`/`MultiEdit`/`NotebookEdit` | `mutation`, carrying the file's post-edit hash |
| `SessionEnd` | A synthesized `no-report` for every dispatch that never came back |
| `Stop` (`witness check`) | Nothing — validates and prints, advisory, always exits 0 |

Journals land in `.nullius/runs/<session_id>.jsonl`. One file per session; a
resumed session gets a new id and therefore a new file, which the header's
`source` records so the fork is visible rather than mysterious.

### Correlation: three events, and a key at every step

The rule is that correlation uses only keys the harness supplies. Never order,
never timing — any pairing invented from those works in every test and breaks
in the parallel case, which is the case the journal exists for.

On Claude Code that takes three events, because the one that looks like the
terminal is not:

```
PreToolUse:Agent    tool_use_id ──────────────►  dispatch
PostToolUse:Agent   tool_use_id ↔ agentId ────►  launch link
SubagentStop        agent_id ─────────────────►  terminal report
```

`PostToolUse` on a subagent fires when it is *launched*, answering
`{"isAsync": true, "status": "async_launched", "agentId": …}`. The subagent's
actual answer arrives later on `SubagentStop`, which carries the same id as
`agent_id` and the final message as `last_assistant_message`.

This is not what the design originally said, and the correction came from a
recording rather than an argument — see
[the probes](../../spec/fixtures/probes/claude-code/README.md), which is also
where the evidence lives. A launch acknowledgement read as a terminal marks
every dispatch `found` with the acknowledgement as its finding, and makes
`no-report` unreachable: the producer committing, mechanically, the exact
failure the journal exists to catch. `witness record` refuses to read one as a
report under any topology.

The link lives in `.nullius/runs/<session>.links.json` — producer bookkeeping,
never a journal record. Where a harness runs subagents synchronously,
`PostToolUse` carries a real response and is the terminal, as before.

## Two tiers, and the summary says which

| `origin` | Means | What a passing journal proves |
| --- | --- | --- |
| `hooks` | The harness runtime emitted the records | The run went this way |
| `self-reported` | An agent wrote them about its own work | The account is internally consistent |

`nullius witness validate` prints the origin on every run. Internally
consistent is not evidence of process, and output that lets the two blur is
output that will be read as the flattering one.

## What this tier cannot tell you

Documented because a recorder's limits, left undocumented, get read as
guarantees:

- **`found` means "came back with content", not "found something real".**
  Nothing here reads meaning — that would put a model in the loop. The mapping
  is mechanical: content → `found`, blank → `empty`, an error or no response at
  all → `no-report`. A subagent that returns "I looked and found nothing" is
  recorded as `found`, with its text as the finding. The distinction the three
  states protect — *came back* versus *never came back* — is exact; the one
  inside "came back" is coarse.
- **A file that cannot be read after an edit produces no `mutation`.** A
  mutation needs a real hash, and a placeholder would be a lie the validator
  would believe. The skip goes to stderr, and any verification of that path
  stays quotable in that journal.
- **Without `tool_use_id`, the join is a content hash of the dispatch input,
  and the report says `ambiguous: true`.** Two identical parallel dispatches
  then collide onto one id, which the validator reports as `DUPLICATE-ID`. That
  is the intended failure: a journal that admits what it could not correlate
  beats one that correlates confidently and wrongly.
- **A payload with no `session_id` lands in `unknown-session.jsonl`**, possibly
  mixed with another session's records. It is announced on stderr, not fixed by
  inventing an id.
- **A `SubagentStop` that resolves to no launch link records nothing.** That
  state means the terminal already exists (a synchronous subagent) or the
  dispatch predates the recorder; a report naming an invented dispatch would
  manufacture a `DANGLING-REFERENCE` out of the ordinary case. If the dispatch
  really was open, session end seals it as `no-report`.
- **A subagent that stops with no final message is recorded `empty`**, not
  `no-report`. The stop event is proof it came back; what it did not do is say
  anything, and the statement says exactly that.
- **`reliance` across journals is out of scope in v0.2** and stays
  `DANGLING-REFERENCE`.
- **A refused append is a missing record, not a mangled one.** If another
  writer holds the lock past the deadline, nothing is written and the reason is
  printed. The gap then shows up at validation, which is the honest end state.

## Probing the harness rather than trusting its docs

Every field read out of a payload is an assumption about a harness this repo
does not own. `NULLIUS_WITNESS_PROBE=1` saves each raw payload verbatim to
`.nullius/probes/<event>.json` — ground truth about the version that is
actually installed, for `doctor` to diagnose against.

## Still unreleased

Reserved for the conventions that have not settled:

- **`witness harvest --pr <n>`** — a bounded, deterministic run manifest
  (commits, trimmed review comments, CI check states, reversal candidates) for
  a retro-writing agent to read *instead of foraging*. Every fetch carries an
  explicit projection and a cap; caps are detectable (fetch N+1, report "more
  than N") rather than silent.
- **The retro schema** — machine-readable frontmatter (`defects_caught_by`,
  `reversals`, `agent_errors`, `human_interventions`, `rules_proposed`) so
  retros aggregate into per-agent defect *rates*, not anecdotes.
- **The witness agent definition** — a fresh agent that did NOT do the work,
  reads mechanical evidence before any narrative, and treats a
  narrative/git-history disagreement as a finding in itself. It writes exactly
  one file and may never edit the rules it reports on: keeping sensing and
  actuation apart is what stops an agent laundering its own conclusions into
  its own guardrails.

Until then the design is documented in the
[main README](../../README.md#roadmap). The schema is
[spec/witness-journal.md](../../spec/witness-journal.md).
