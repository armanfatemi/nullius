# witness Specification

## Purpose

The record a multi-agent run leaves behind, and what makes it worth trusting.

A journal is text about work agents did, so it gets the treatment a design
document gets here: invariants a machine can refuse, and no model anywhere in
the path. Three failures it exists to make visible — silence read as a clean
result, a verification quoted after its subject changed, and omission read as
"nothing to report".

What the schema adds beyond those invariants is provenance. `origin: "hooks"`
means the harness runtime emitted the records and the agent had no opportunity
to decline; `origin: "self-reported"` means an agent wrote them about its own
work, which certifies internal consistency and nothing else. Output that lets
those blur will be read as the flattering one, so the summary always says
which.

This is the capture layer for a run ledger; see `openspec/project.md` for where
that goes.

## Requirements
### Requirement: Journal version header

A journal SHALL begin with a header record
`{"kind": "journal", "version": "<semver>", "origin": "hooks" | "self-reported"}`,
optionally carrying session metadata (`session`, `source`). A journal without a
header SHALL be validated as v0.1. A header naming a version the validator does
not support SHALL produce a single `UNSUPPORTED-VERSION` finding and terminate
validation.

#### Scenario: headerless journal is v0.1

- **WHEN** a journal's first record is a `dispatch`
- **THEN** the validator applies v0.1 semantics and reports no header finding

#### Scenario: future version fails with one finding

- **WHEN** the header says `"version": "9.0"`
- **THEN** validation reports `UNSUPPORTED-VERSION` once and does not report
  per-record `MALFORMED` findings for records it did not attempt to read

### Requirement: Mutation records

The schema SHALL include a `mutation` kind carrying `target: {path, hash}`. A
mutation SHALL advance the latest-known hash for its path for the purposes of
invariant 2 (stale verification), and SHALL NOT satisfy a `reliance` — relying
on a mutation is a `dangling-reference`-class failure, since a mutation attests
that something changed, never that anything was checked.

#### Scenario: edit invalidates an earlier verification

- **WHEN** a `verification` records `{path: "src/a.ts", hash: "h1"}`, then a
  `mutation` records `{path: "src/a.ts", hash: "h2"}`, then a `reliance` names
  the verification
- **THEN** the reliance is reported `STALE-VERIFICATION`

### Requirement: Recording subcommand

The kit SHALL provide `witness record`, reading one harness hook payload from
stdin and appending the corresponding record to
`.nullius/runs/<session_id>.jsonl` under an advisory file lock. Hook shim files
SHALL contain no correlation logic — they invoke the CLI and nothing else.

#### Scenario: concurrent appends do not interleave

- **WHEN** two hook invocations append to the same journal concurrently
- **THEN** the journal contains two complete records and zero malformed lines

### Requirement: Claude Code correlation topology

Correlation SHALL use only keys the harness supplies. Order, timing, and
adjacency SHALL NOT be used to pair records, since any such pairing breaks
precisely in the parallel case the journal exists for.

Dispatch records SHALL be written from `PreToolUse` on the subagent tool, which
the harness may name `Task` or `Agent`. Where the payload carries a
`tool_use_id`, it SHALL be the dispatch key; where it does not, the key SHALL be
a content hash of the dispatch input and the resulting report SHALL carry
`ambiguous: true` — recorded ambiguity, never a silent guess.

A `PostToolUse` payload on the subagent tool whose response acknowledges an
asynchronous launch rather than reporting a result SHALL NOT be recorded as a
terminal. It SHALL instead establish a link from the harness's agent id to the
dispatch key. The link is producer state and SHALL NOT be a journal record.
Where such a payload carries a real response instead, it SHALL be the terminal.

`SubagentStop` SHALL write the terminal report for a linked dispatch, joined by
its `agent_id`, carrying the subagent's final message. Where an `agent_id`
resolves to no link, nothing SHALL be recorded and the reason SHALL be reported
— an unlinked stop means the terminal already exists or the dispatch was never
recorded, and a report naming an invented dispatch would be worse than silence.

#### Scenario: parallel subagents stay distinguishable

- **WHEN** three dispatches run in parallel and all complete
- **THEN** the journal holds three dispatch records and three report records,
  each report referencing the dispatch it terminates

#### Scenario: a launch acknowledgement is not a result

- **WHEN** a `PostToolUse` payload on the subagent tool reports
  `status: "async_launched"`
- **THEN** no terminal is recorded, the dispatch remains open, and the agent id
  is linked to it

### Requirement: Session-end terminals

At session end, every dispatch without a terminal report SHALL receive a
synthesized report with `outcome: "no-report"` and a statement identifying the
dispatch. Validation performed by a Stop hook SHALL be advisory (exit 0).

#### Scenario: a crashed subagent is not laundered

- **WHEN** a session ends while one dispatch has produced no report
- **THEN** the journal's outcome counts show that dispatch under `no-report`,
  not under `empty`

### Requirement: Self-reported journals are labeled

`witness validate` SHALL surface the header `origin` in its summary. A journal
whose records were not emitted by harness hooks SHALL carry
`origin: "self-reported"`, and the summary SHALL state that such a journal
certifies internal consistency only.

#### Scenario: cooperative-tier journal

- **WHEN** a valid journal carries `origin: "self-reported"`
- **THEN** the summary includes the self-reported label alongside
  "Journal valid."

