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

## `init` and `doctor` — and what the kit claims ownership of

```sh
nullius-kit init [--profile plans|prs|specs] [--dry-run] [--yes] [--root <dir>]
nullius-kit doctor [--fix] [--root <dir>]
```

`init` is non-interactive by design. Its most common operator is an agent
driving a terminal, then CI, then a human pasting from a README — all three
need flags and a printed record, not a wizard. `--yes` is accepted and inert
for that reason: there is nothing to confirm.

### The plan is the unit

`init` builds a complete plan, prints it, and only then applies it. `--dry-run`
is the same code path minus the final step, so it cannot drift from the real
one — a dry run that runs different code is a dry run that lies.

Every line of the write-log says what happened and why:

```
  create    nullius.config.json
            which documents to check, and how strictly
  unchanged nullius.kit.json
            kit settings — kept out of nullius.config.json
```

A write that fails is reported per file and exits non-zero. A partial apply
reported as success is the shape of lie this tool exists to refuse.

### Ownership — four rules

**1. One delivery mechanism per artifact.** On Claude Code the plugin delivers
hooks, skills and commands. `init` writes none of them, and says so rather than
staying quiet:

```
  note: No hook entries written: the plugin delivers the hooks; a second
  copy is a path doctor cannot disambiguate.
```

**2. Pointers, not rendered content, in files you own.** Managed content lives
in kit-owned files under `.nullius/`. Your CLAUDE.md or AGENTS.md gets one
line pointing at it — appended once by `init`, with the rest of the file copied
through untouched. `init` never creates such a file; inventing someone's
agent-instructions file is not this tool's decision.

The presence check compares with whitespace collapsed, so a markdown formatter
that re-wraps the line does not cause a second copy to be appended. And
`doctor --fix` does not place the pointer at all: user-owned files come out of
a repair byte-identical, so removing the line stays removed.

A block would collect four wounds a pointer does not: users edit inside the
markers, version strings conflict on every release, marker conventions collide
with other tools, and blocks outlive uninstallation as cargo-culted
instructions. Removing a pointer is deleting one line.

**3. Hook identity is the command path.** `.claude/settings.json` hook entries
are anonymous objects — JSON has no comments and the schema no id field — so
the command string is the only durable identity. `doctor --fix` modifies only
entries whose command resolves to this kit. The plugin's
`${CLAUDE_PLUGIN_ROOT}` hooks are deliberately not matched: claiming them would
mean editing another mechanism's entries.

**4. Kit settings live in `nullius.kit.json`.** Never as new keys in
`nullius.config.json`, whose unknown keys are a hard error — the right
behaviour for a checker, and fatal for cohabitation, since one kit key there
would break every older kernel pinned in CI.

**5. `init` never creates `.nullius/`.** That directory is the witness
recording opt-in: the hooks check for its existence and record nothing without
it. Kit 0.1.0 put its config there, so running `init` created it as a side
effect and silently switched on run recording for anyone with the plugin
installed — a consent boundary set by a command whose job is configuring a
document checker. Kit config now sits at the root beside the kernel's, and
`.nullius/` means one thing again: a person asked for journals.

Upgrading from 0.1.0: re-run `init`, then delete `.nullius/kit.json`. Until you
do, `doctor` reports the stale file as failing and `--fix` refuses rather than
guessing which config is live.

### What `doctor` will and will not say

Four statuses, counted separately so they cannot be summed into a reassuring
total:

| | |
| --- | --- |
| `ok` | checked, and it holds |
| `FAIL` | checked, and it does not — exits non-zero |
| `??` | **not checkable from here.** Never guessed either way |
| `--` | an observation with no verdict attached |

The `--` row is the one that matters most. An empty journal directory reports
*"no journals recorded — a fact about this directory, not a verdict on the
hooks"*, and does not fail the run. An idle repo must not look broken.

`doctor` is local-only. "Is the journal receiving records" as a remote check is
either an mtime heuristic or network calls in a tool whose README carries a
live anchor asserting it makes none.

It ends with a **live proof**: a synthetic dispatch through the installed
recorder, validated by the installed validator, verdict printed. A list of
green configuration checks is a claim about configuration; this is the only
check that exercises the pipeline end to end.

`--fix` re-renders managed artifacts using the profile recorded in
`nullius.kit.json` — what was installed, not what the repo looks like today.
If that file is unreadable it **refuses**, rather than falling back to
detection: guessing there would rewrite which documents are checked and whether
CI can fail, on the strength of a directory listing.

It also replaces only the keys it owns in `nullius.config.json` (`docs`).
That file is the kernel's, with eight valid keys and the ones users actually
tune — `exclude`, `driftWindow`, `minAnchorChars` — and they are carried
through untouched.

There is no `update` verb; diagnose-then-repair is one mental model.

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
- **A subagent that reports after session end corrects the ledger rather than
  re-terminating.** Session end seals open dispatches `no-report`; if one then
  comes back, a second terminal would be `DUPLICATE-TERMINAL` — the journal
  failing validation over two facts it recorded correctly. Instead an `append`
  records what it corrected, which is what invariant 3 is for. The outcome
  counts still read as they stood at session end, and the append says why.
- **A refused append is announced, and so is a recorder that cannot run.** If
  the hook's runner is missing or unresolvable, the shim says so on stderr
  rather than exiting quietly — an empty `.nullius/runs` would otherwise be
  indistinguishable from a session that dispatched nobody.
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

## Building this package

`pnpm build` before `pnpm type-check` or `pnpm test`, from the repo root. The
kit imports the kernel by package name like any other consumer, so both its
types and `validateJournal` at runtime resolve out of `packages/claims/dist` —
which a fresh checkout does not have. The alternative, pointing this package at
the kernel's source, would check it against internals it does not ship against.

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
