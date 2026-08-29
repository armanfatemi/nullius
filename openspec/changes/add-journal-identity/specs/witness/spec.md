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

- **WHEN** a `0.4` header carries `origin` and `version` and none of `branch`,
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

None of the three SHALL produce a verdict when absent, and none of the three
SHALL be read by any verdict as evidence about the run.

On a journal declaring `0.4` or later, a present identity field SHALL be a
non-empty string, and an empty string SHALL be `MALFORMED`: it is a producer
asserting it knows the branch and naming none, which is a different and worse
fact than omitting the key. Omission is the supported way to say "git could not
answer".

This rejection SHALL NOT apply to journals declaring an earlier schema, for the
same reason the `rev` rejections do not: a record that validated clean under
`0.3` SHALL NOT become invalid because the validator learned a newer schema.

`session` and `source` SHALL continue to accept an empty string and record it
as absent, and the asymmetry with the three identity fields SHALL be stated in
the schema documentation rather than left to be discovered. The rule follows
the use, not the type: `session` and `source` label one journal, and nothing
correlates journals by them, so a blank one is merely uninformative. The
identity fields are claims about a tree that exist to be compared across
journals, so a blank one compares equal to every other blank one and would
group unrelated runs together. Tightening `session` or `source` would be a
further tightening and SHALL take its own version bump.

#### Scenario: session and source keep accepting an empty string

- **WHEN** a `0.4` header carries `session: ""` and `source: ""`
- **THEN** validation reports no finding, and both are recorded as absent

#### Scenario: an empty identity field is malformed at 0.4

- **WHEN** a `0.4` header carries `branch: ""`
- **THEN** the header record is `MALFORMED`, and the finding names `branch`

#### Scenario: an empty identity field is ignored at 0.3

- **WHEN** a `0.3` header carries `branch: ""`
- **THEN** validation reports no finding for it, because the rejection is `0.4`
  semantics

#### Scenario: a detached HEAD omits the branch

- **WHEN** a session records a header while HEAD is detached
- **THEN** `head` is present, `branch` is absent, and validation reports no
  finding

#### Scenario: identity fields never fail a journal

- **WHEN** a header carries `branch`, `head`, and `worktree`
- **THEN** validation produces the same findings it would without them

### Requirement: Verification records may pin a revision

A `verification` record MAY carry `rev`, which SHALL be lower-case hexadecimal
of 7 to 40 characters when present.

This is the *stamp* shape an Evidence Anchor is rewritten into, not the shape
an anchor is parsed with. Anchor markers accept mixed case and fold it to
lower on the way in, so "the grammar anchors accept" is deliberately not the
rule here: a journal is written by a machine and has no author to be lenient
toward, and one canonical spelling keeps `rev` values comparable by string
equality.

A `mutation` SHALL NOT carry `rev`, and a `mutation` carrying it SHALL be
`MALFORMED` rather than ignored.

This is the only place the schema hard-fails a well-formed extra key, and it is
deliberately asymmetric with the header's rule that unrecognised keys are
ignored. The asymmetry is argued rather than assumed, and the argument is
deliberately narrow.

The criterion is **not** "a known key on a record that cannot carry it". That
would prove far too much — `target` on a `dispatch`, `severity` on a `check`,
`merges_into` on a non-merge `resolution` are all ignored today, and nothing
here proposes to change them. A future author must not derive further
rejections from this clause.

The criterion is the specific false belief the key encodes. `rev` means *this
claim can be checked again*. A `mutation` asserts that something changed, which
is the opposite of a claim to re-check, so a producer emitting `mutation.rev`
is not merely using a key in the wrong place — it holds a wrong model of what a
mutation is, and every record it writes is suspect for the same reason.
Ignoring the key would let that model persist silently. No other misplacement
in this schema carries a comparable implication about its producer, which is
why no other misplacement is rejected.

Absence of `rev` SHALL NOT be a finding under this schema. A verdict that reads
the field is a new verdict and takes a version bump with it.

#### Scenario: a rev-stamped verification validates

- **WHEN** a `verification` carries `target: {path, hash}` and
  `rev: "541ae94"`
- **THEN** validation reports no finding, and invariant 2 behaves exactly as it
  does without the field

Each `MALFORMED` finding this requirement introduces SHALL carry a detail that
names which rule was broken, so that the three conditions are distinguishable
from one another in a report rather than surfacing as one indistinct verdict.

#### Scenario: a malformed rev is loud

- **WHEN** a `verification` carries `rev: "main"`
- **THEN** the record is `MALFORMED`, because a ref name is mutable and names a
  different tree next week, and the finding's detail names `rev`

#### Scenario: a mutation carrying a rev is malformed

- **WHEN** a `mutation` carries `rev: "541ae94"`
- **THEN** the record is `MALFORMED`, and the finding's detail says a mutation
  cannot carry `rev` — distinguishable from the malformed-rev finding above

#### Scenario: 0.3 journals keep their old semantics

- **WHEN** a `0.3` journal carries a `verification` with `rev: "main"` and a
  `mutation` carrying `rev`
- **THEN** validation reports neither as `MALFORMED`, because both rejections
  are `0.4` semantics and a previously-valid journal does not become invalid
  under a validator that learned a newer schema

### Requirement: Schema version bumps track the set of valid records

The schema version SHALL be bumped when the set of valid records changes: a new
kind, a new member of a closed vocabulary, a tightening that makes a record
invalid which a previous version accepted, or a new verdict that can fail a
record. It SHALL NOT be bumped for additive optional metadata that no verdict
reads.

These four triggers are the canonical statement of the rule. Any restatement
elsewhere SHALL carry all four; the rule has already been misapplied once by
omission, and a restatement that drops a clause is how that recurs.

A field being optional SHALL NOT by itself exempt a change from the bump.
Optionality is a property of a field; validity is a property of a record, and
rejecting a key that was previously ignored changes the latter.

An older validator reading a newer journal stops at `UNSUPPORTED-VERSION` and
reports nothing, so a bump that buys no diagnostic power costs real coverage.
That cost is the reason the criterion is the set of valid records rather than
the presence of new fields.

Where a verdict is gated on the declared schema version, the gate SHALL be a
floor rather than an equality, so that a later version inherits every verdict
its predecessor earned. A verdict silently ungated by a version bump is
indistinguishable from a verdict that was never reached.

#### Scenario: rejecting a previously-ignored key bumps the schema

- **WHEN** a change makes a `mutation` carrying `rev` `MALFORMED`, where that
  record validated clean under `0.3`
- **THEN** the schema is bumped to `0.4`, because a record that was valid has
  become invalid

#### Scenario: a bumped schema keeps the verdicts of its predecessor

- **WHEN** a `0.4` journal contains a blocker finding that no resolution
  discharges
- **THEN** validation reports the same ledger verdict it would report for an
  otherwise identical `0.4` journal, and the gate does not test the version for
  equality with `0.3`

#### Scenario: identity fields alone would not have bumped the schema

- **WHEN** a producer emits `branch`, `head`, and `worktree` and nothing is
  newly rejected
- **THEN** no bump is required on their account, and a validator built before
  those fields existed validates the journal with identical findings

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

### Requirement: Git failure is never a recording failure

Recording SHALL succeed when git is unavailable, when the project is not a git
repository, or when a git invocation times out.

In those cases the header identity fields SHALL be absent. No git failure SHALL
produce a journal finding, block an append, or return a non-zero exit from a
hook.

Recording SHALL also survive git *succeeding slowly*, which is the costlier
case: no git invocation SHALL run while the journal's append lock is held, and
every git invocation SHALL be bounded by a timeout strictly below the lock's
wait deadline. Identity SHALL be resolved before the lock is acquired and passed
to the header as data.

A git call that exceeds its timeout SHALL be treated exactly as a git failure —
the field is absent and the append proceeds.

#### Scenario: recording outside a repository

- **WHEN** `witness record` runs in a directory that is not a git repository
- **THEN** the journal is written with a header carrying no `branch`, `head`,
  or `worktree`, and the hook exits 0

#### Scenario: a slow git call cannot cost another hook its records

- **WHEN** one hook is resolving identity and a second hook appends
  concurrently
- **THEN** the second hook's append is not refused on account of the first,
  because no git call is made while the lock is held

#### Scenario: a git call that exceeds its budget is absent, not fatal

- **WHEN** resolving `branch` exceeds the identity timeout
- **THEN** `branch` is absent from the header, the append succeeds, and the
  hook exits 0
