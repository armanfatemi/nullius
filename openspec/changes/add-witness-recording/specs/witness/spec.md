# Witness — journal schema v0.2 and recording

## ADDED Requirements

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

Dispatch records SHALL be written from `PreToolUse` on `Task`; report records
SHALL be written from `PostToolUse` on `Task`, joined by `tool_use_id` when the
payload carries it. When it does not, the join SHALL fall back to a content
hash of the dispatch input and the report record SHALL carry `ambiguous: true`
— recorded ambiguity, never a silent guess. `SubagentStop` SHALL NOT be used
for correlation.

#### Scenario: parallel subagents stay distinguishable

- **WHEN** three Task dispatches run in parallel and all complete
- **THEN** the journal holds three dispatch records and three report records,
  each report referencing the dispatch it terminates

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
