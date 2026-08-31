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
| `SessionStart` | The journal header — `version`, `origin`, `session`, `source`, and the tree's identity including `user.name` |
| `UserPromptSubmit` | `prompt` — what the operator asked, or its length and hash under `NULLIUS_WITNESS_PROMPTS=0` |
| `PreToolUse` on `Task`/`Agent` | `dispatch` |
| `PostToolUse` on `Task`/`Agent` | A **launch link** when the subagent went async, or the `report` **plus a `finding` per tagged line** when it did not |
| `SubagentStop` | `report` — the subagent's real terminal, joined by `agent_id` — and its `finding` records |
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

### Findings are extracted, not reported

At a subagent's terminal the recorder scans the **untruncated** return text for
lines in the reviewer tag grammar, and writes one `finding` record per match:

**Evidence:** `packages/kit/src/record.ts:234` — `const TAG_LINE = /^\s*-\s*\[(blocker|concern|looks-good|false-premise)\]\s+(.+)$/;`

`severity` is the tag, `author` is the dispatched agent's name, `text` is the
rest of the line, and `dispatch` joins the finding to the terminal it came out
of. `[false-premise]` maps to `severity: "blocker"` with `tag:
"false-premise"` — metadata no verdict reads, kept because the reviewers
themselves define that tag as always a blocker.

This is a line grammar, not a classifier, and the distinction is the whole
reason it is allowed to exist here. Nothing reads the return **for meaning** —
that would put a model in the verification path. A return with no tag lines
produces no findings, which is the honest reading of a return that used no
contract.

It is also what makes the ledger verdicts worth anything. The `finding` records
come from the harness tier: the agent wrote the text, the hook read it, and the
coordinator was not consulted. A `resolution` answering one is written by the
coordinator. `SUPPRESSED-FINDING` compares them, which is a comparison neither
party could have made about itself.

**Whether the dispatch expected findings at all** is decided the same way — from
a file, not from an opinion. At `PreToolUse` the recorder reads
`.claude/agents/<subagent_type>.md` and sets `expects: "findings"` when its
`## Output format` section mentions `[blocker]`. `SILENT-REVIEWER` fires only on
dispatches carrying that key, so a non-reviewer returning untagged prose is no
longer a finding. `subagent_type` comes from the payload, so it is validated
against a conservative name shape before any path is built, and the dispatch
records how the read went — `read`, `missing`, `unreadable`, `unsafe-name` — so
a dispatch missing `expects` because nothing could be read is distinguishable in
the file from one whose agent is not a reviewer.

**The known limit, in both directions:** the denominator is editable in-session.
Deleting `[blocker]` from an agent's output section disarms the verdict for
every later dispatch; renaming another agent's output heading to
`## Output format` arms it against a non-reviewer. Either edit appears in the
journal only as an ordinary `mutation` of the agent file. The mitigation belongs
to `nullius wiring` — every agent a skill dispatches should declare the tag
contract, and no other agent should — and it is not built yet.

## `witness ledger` — the coordinator's own records

```sh
nullius-kit witness ledger stage      --phase <name> [--iteration <n>] [--change <name>] [--pr <ref>]
nullius-kit witness ledger resolution --finding <id> --outcome <...> --text <why> [--merges-into <id>]
nullius-kit witness ledger decision   --choice <what> --rationale <why> [--resolves <ref>] [--departed-from <what>]
nullius-kit witness ledger check      --command <what ran> --outcome pass|fail --text <what it showed> [--counts name=N,...]
nullius-kit witness ledger findings   [--open]
```

The first input path in this package that is not a hook payload. It exists so
that a coordinator's account of its own run lands in the same file as the
harness's account of it, where the two can be compared — and it prints the new
record's id on stdout, because a `resolution` has to name the `finding` it
answers.

**Every record it writes carries its own origin:**

**Evidence:** `packages/kit/src/cli.ts:127` — `const RECORD_ORIGIN = "self-reported";`

Never the header's `hooks`. The header's origin is the origin of records that
carry none of their own, so a coordinator's record under a `hooks` header would
be attested as harness-emitted — the one claim it is least entitled to make.

Three refusals are the design, and each is an exit 2 **before** any write:

- **No session, no journal.** `--session`, else `CLAUDE_CODE_SESSION_ID`, else
  refuse naming both. Never the newest file by modification time: two worktrees
  or a resumed session make "newest" a different journal from "mine", and a
  record appended to the wrong session is indistinguishable from one the right
  session wrote.
- **A value outside a closed vocabulary is refused, not written.** The validator
  would report it as `MALFORMED` afterwards, which is a journal that fails its
  own check over a typo the command could have caught. `duplicate` and
  `folded-in` are refused without `--merges-into` for the same reason: a merge
  naming no survivor is a finding disappearing with a label on it.
- **`finding` is not offered.** The recorder extracts findings from harness
  payloads; a hand-written one would be byte-identical to an extracted one, and
  the ledger verdicts exist precisely because those are different tiers. **This
  is a command-surface convention, not a property of the file** — the journal is
  local and nothing stops an editor. A file-level mechanism is a separate piece
  of work.

`witness ledger findings --open` lists the blockers no resolution answers,
reading the journal rather than any state the coordinator kept — so a
coordinator that forgot a blocker still sees it. `--open` follows the merge
chain exactly as `SUPPRESSED-FINDING` does: a merge transfers the obligation
rather than discharging it, and a chain that closes on itself answers nothing.

## Two tiers, and the summary says which

| `origin` | Means | What a passing journal proves |
| --- | --- | --- |
| `hooks` | The harness runtime emitted the records | The run went this way |
| `self-reported` | An agent wrote them about its own work | The account is internally consistent |

From schema `0.6` a single journal holds both, so the header's `origin` no
longer speaks for every record in the file — it is the origin of records that
carry none of their own, and `validate` says so in exactly those words. It also
prints a provenance line counting hook-tier, self-reported and **unattributed**
records. That third number is the one worth reading: records with no origin of
their own, under a header whose origin is absent, belong to nobody, and counting
them as hook-tier would be the flattering read the field exists to remove.

**Evidence:** `packages/kit/src/journalFile.ts:77` — `export const SCHEMA_VERSION = "0.6";`

Internally consistent is not evidence of process, and output that lets the two
blur is output that will be read as the flattering one.

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
- **A `finding` is only as good as the line that produced it.** The grammar sees
  tags, not judgement: `- [blocker] looks fine to me` is recorded as a blocker,
  and a real blocker written as a paragraph is recorded as nothing. What the
  record attests is that the agent's return contained that line, which is a
  fact about the return rather than about the code.
- **The `UserPromptSubmit` payload shape is an assumption, not a recording.**
  Every other shape this recorder reads is pinned to a captured probe under
  `spec/fixtures/probes/claude-code/`; that event has none yet. The parser looks
  for the prompt text under several plausible keys and, finding none, records
  **nothing** and says so on stderr — rather than a `prompt` record asserting the
  operator spoke and saying nothing about what they said. Until a probe lands,
  treat an absent `prompt` record as "the shape moved" as readily as "nobody
  typed anything".
- **A prompt with no `prompt_id` is recorded but joins to nothing.** The id falls
  back to a content hash, no later `dispatch` or `mutation` carries a `prompt`
  key, and a note says so. The prompt happened; nothing downstream can claim to
  belong to it.
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

**`UserPromptSubmit` is the one event with no probe in the committed corpus**,
which is why the prompt parser reads several candidate keys and tolerates
finding none. When a probe is captured, that list collapses to the observed key
and the fallbacks go.

## Recording prompts, or only that there was one

`NULLIUS_WITNESS_PROMPTS=0` records a prompt's length and a hash of it instead
of its text. The record still says a prompt happened and when; it says nothing
about what it asked. The default is the text, because the report this feeds
exists to show what the human actually said, and a hash is not something a
reviewer can act on.

Both modes write `chars`, so a hashed journal still shows the shape of a
session. Neither mode is a redaction of what the prompt *caused* — the
dispatches and mutations it led to are recorded either way.

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
