# Witness — journal identity, durability, and the roll-up

## MODIFIED Requirements

### Requirement: Journal version header

A journal SHALL begin with a header record
`{"kind": "journal", "version": "<semver>", "origin": "hooks" | "self-reported"}`,
optionally carrying session metadata (`session`, `source`) and repository
identity (`branch`, `head`, `worktree`). A journal without a header SHALL be
validated as v0.1. A header naming a version the validator does not support
SHALL produce a single `UNSUPPORTED-VERSION` finding and terminate validation.

Header keys the validator does not recognise SHALL be ignored rather than
reported, so that a journal from a newer producer stays readable.

#### Scenario: headerless journal is v0.1

- **WHEN** a journal's first record is a `dispatch`
- **THEN** the validator applies v0.1 semantics and reports no header finding

#### Scenario: future version fails with one finding

- **WHEN** the header says `"version": "9.0"`
- **THEN** validation reports `UNSUPPORTED-VERSION` once and does not report
  per-record `MALFORMED` findings for records it did not attempt to read

#### Scenario: identity fields are optional

- **WHEN** a `0.3` header carries `origin` and `version` and none of `branch`,
  `head`, or `worktree`
- **THEN** validation reports no finding for their absence

## ADDED Requirements

### Requirement: Header identity fields name where a run began

A journal header MAY carry `branch`, `head`, and `worktree`, and each SHALL be
a non-empty string when present.

`head` SHALL be defined as the commit the session started from — not the tree
any later record was written against. A session commits while it runs, so any
other reading is stale by construction, and the definition SHALL appear in the
schema documentation rather than only in implementation comments.

`branch` SHALL be omitted rather than given a sentinel value when HEAD is
detached. `worktree` SHALL be a stable identifier derived from the worktree,
not an absolute filesystem path, so that a journal carries no machine detail.

None of the three SHALL produce a verdict.

#### Scenario: a detached HEAD omits the branch

- **WHEN** a session records a header while HEAD is detached
- **THEN** `head` is present, `branch` is absent, and validation reports no
  finding

#### Scenario: identity fields never fail a journal

- **WHEN** a header carries `branch`, `head`, and `worktree`
- **THEN** validation produces the same findings it would without them

### Requirement: Verification records may pin a revision

A `verification` record MAY carry `rev`, which SHALL be lower-case hexadecimal
of 7 to 40 characters when present, matching the revision grammar Evidence
Anchors already accept.

A `mutation` SHALL NOT carry `rev`: its hash is the identity of what changed,
and a mutation asserts nothing intended to be checked again.

Absence of `rev` SHALL NOT be a finding under this schema. A verdict that reads
the field is a new verdict and takes a version bump with it.

#### Scenario: a rev-stamped verification validates

- **WHEN** a `verification` carries `target: {path, hash}` and
  `rev: "541ae94"`
- **THEN** validation reports no finding, and invariant 2 behaves exactly as it
  does without the field

#### Scenario: a malformed rev is loud

- **WHEN** a `verification` carries `rev: "main"`
- **THEN** the record is `MALFORMED`, because a ref name is mutable and names a
  different tree next week

### Requirement: Schema version bumps track the set of valid records

The schema version SHALL be bumped when the set of valid records changes — a
new kind, a new member of a closed vocabulary, or a new verdict — and SHALL NOT
be bumped for additive optional metadata that no verdict reads.

An older validator reading a newer journal stops at `UNSUPPORTED-VERSION` and
reports nothing, so a bump that buys no diagnostic power costs real coverage.

#### Scenario: identity fields do not bump the schema

- **WHEN** a producer emits `branch`, `head`, `worktree`, and
  `verification.rev`
- **THEN** the header still declares `0.3`, and a validator built before those
  fields existed validates the journal with identical findings

### Requirement: Survey aggregates verdicts and never merges journals

The kernel SHALL provide `witness survey <glob>`, which validates each matched
journal independently and aggregates the resulting reports.

Records from different journals SHALL NOT be combined into one timeline. A
`verification` in one journal SHALL NOT be invalidated by a `mutation` in
another, because two worktrees hold two different files under one path and a
merged timeline reports failures that never occurred.

The output SHALL keep the three terminal outcomes as three numbers, SHALL name
the number of journals aggregated in the same block as the totals so a summed
count cannot be read as one validated run, and SHALL list journals that
reached no terminal record at all.

`witness validate` SHALL continue to accept exactly one journal path.

#### Scenario: a mutation in one journal cannot stale another

- **WHEN** journal A verifies `src/parser.rs` at hash `h1` and relies on it,
  and journal B records a mutation of `src/parser.rs` to hash `h2`
- **THEN** surveying both reports no `STALE-VERIFICATION`

#### Scenario: totals are reported with their denominator

- **WHEN** a survey aggregates 64 journals
- **THEN** the summed `found` / `empty` / `no-report` counts are printed
  alongside the journal count

#### Scenario: a journal with no terminal records is named

- **WHEN** one surveyed journal contains dispatches and no reports
- **THEN** that journal is listed by name, not only counted

### Requirement: Journals are sealed to a git ref

The kit SHALL write each session's journal to the git ref
`refs/nullius/runs` at session end, as a commit whose tree holds
`<session>.jsonl`, and SHALL leave the working file in
`.nullius/runs/` in place.

Sealing SHALL happen once per session at `SessionEnd`, never per append: the
append path holds an advisory lock and runs on every hook event.

The kit SHALL provide `witness seal`, which seals journals present in
`.nullius/runs/` that the ref does not yet carry, so a session that crashed
before its terminal hook is recoverable.

#### Scenario: a sealed journal survives its worktree

- **WHEN** a session records a journal, seals it, and the worktree is deleted
- **THEN** the journal is readable from any other worktree of the same
  repository

#### Scenario: a crashed session leaves an unsealed journal, not a lost one

- **WHEN** a session ends without reaching `SessionEnd`
- **THEN** the working file remains, and `witness seal` adds it to the ref

### Requirement: Git failure is never a recording failure

Recording SHALL succeed when git is unavailable, when the project is not a git
repository, or when a git invocation times out.

In those cases the header identity fields SHALL be absent and sealing SHALL be
skipped. No git failure SHALL produce a journal finding, block an append, or
return a non-zero exit from a hook.

#### Scenario: recording outside a repository

- **WHEN** `witness record` runs in a directory that is not a git repository
- **THEN** the journal is written with a header carrying no `branch`, `head`,
  or `worktree`, and the hook exits 0
