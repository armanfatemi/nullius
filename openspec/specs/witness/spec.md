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

### Requirement: Schema v0.3 declares five ledger kinds

The validator SHALL accept `0.3` in the header `version` field, and under
`0.3` SHALL recognise the v0.2 kinds plus `stage`, `finding`, `resolution`,
`check`, and `decision`.

Kinds SHALL remain a closed list per version. A ledger kind in a journal
declaring `0.2` or in a headerless journal SHALL be `MALFORMED`, reported with
the later schema that defines it, exactly as `mutation` is under `0.1`.

#### Scenario: a v0.3 journal carries ledger records

- **WHEN** a journal declares `version: "0.3"` and contains a `stage`, a
  `finding` referencing it, and a `resolution` answering that finding
- **THEN** validation exits 0 with no findings

#### Scenario: a ledger kind in a v0.2 journal is loud

- **WHEN** a journal declares `version: "0.2"` and contains a `finding` record
- **THEN** that record is `MALFORMED`, and the message names `0.3` as the
  schema that defines `finding`

### Requirement: `stage` groups a run by phase and iteration

A `stage` record SHALL carry a non-empty `phase` string. It MAY carry
`iteration` (a positive integer), `pr` (a string or number), and `change` (a
non-empty string naming the change the stage belongs to).

`phase` SHALL NOT be a closed vocabulary. `pre-review`, `verify`,
`post-review`, `address`, and `refine` are the conventional set, and a phase
outside it SHALL be accepted.

`change` binds to `stage` rather than to the header, because one session
touches several changes and one change spans several sessions.

#### Scenario: an unconventional phase is accepted

- **WHEN** a `stage` declares `phase: "docker-smoke"`
- **THEN** the record validates

#### Scenario: a blank phase is not

- **WHEN** a `stage` omits `phase` or gives it an empty string
- **THEN** the record is `MALFORMED`

### Requirement: `finding` carries severity, author, and corroboration

A `finding` record SHALL carry:

- `severity`, exactly one of `blocker`, `concern`, `looks-good`
- `author`, a non-empty free string — SHALL NOT be a closed vocabulary of
  agent names
- `text`, non-empty free prose

and MAY carry `stage` (a reference to a `stage` record), `dispatch` (a
reference to a `dispatch` record), `subject`, `ref` (the human label such as
`B1`, unique only within its stage), and `convergence` (an array of non-empty
strings naming who independently corroborated it).

A `stage` or `dispatch` reference naming a record not in the journal SHALL be
`DANGLING-REFERENCE`.

#### Scenario: a corroborated blocker

- **WHEN** a `finding` declares `severity: "blocker"`, `author:
  "rule-auditor"`, and `convergence: ["architecture-reviewer"]`
- **THEN** the record validates

#### Scenario: severity outside the three values

- **WHEN** a `finding` declares `severity: "critical"`
- **THEN** the record is `MALFORMED`

### Requirement: `resolution` names a finding's fate from a closed vocabulary

A `resolution` record SHALL carry `finding` (a reference to a `finding`
record), `outcome`, and non-empty `text`.

`outcome` SHALL be exactly one of: `resolved`, `fixed`, `dropped`,
`duplicate`, `deferred`, `folded-in`, `accepted`, `rejected`, `out-of-scope`,
`deviation-accepted`.

When `outcome` is `duplicate` or `folded-in`, the record SHALL carry
`merges_into` referencing the surviving `finding`, and that finding SHALL NOT
be the one being resolved. These two outcomes redirect a finding rather than
closing it on its merits; without the target they are indistinguishable from
`dropped`, and pointed at themselves they discharge a finding while answering
nothing.

A `resolution` SHALL appear after the `finding` it answers. Records are read in
journal order, so a resolution earlier in the file would answer something not
yet raised.

#### Scenario: a merge names its survivor

- **WHEN** a `resolution` declares `outcome: "folded-in"` with `merges_into`
  naming another `finding` in the journal
- **THEN** the record validates

#### Scenario: a merge with nowhere to go

- **WHEN** a `resolution` declares `outcome: "duplicate"` and omits
  `merges_into`
- **THEN** the record is `MALFORMED`

#### Scenario: a resolution answering nothing

- **WHEN** a `resolution` references a `finding` id not in the journal
- **THEN** the record is `DANGLING-REFERENCE`

#### Scenario: a finding cannot be a duplicate of itself

- **WHEN** a `resolution` declares `merges_into` naming the same `finding` it
  resolves
- **THEN** the record is `MALFORMED`

#### Scenario: a resolution cannot precede its finding

- **WHEN** a `resolution` references a `finding` raised later in the journal
- **THEN** the record is `DANGLING-REFERENCE`

### Requirement: `check` records a command's outcome, distinct from verification

A `check` record SHALL carry `command` (non-empty), `outcome` (exactly `pass`
or `fail`), and non-empty `text`. It MAY carry `counts`, an object of
non-negative integers.

A `check` is not a `verification`: it makes no claim about a file's hash, so it
SHALL NOT participate in `STALE-VERIFICATION`.

#### Scenario: a failing suite is recordable

- **WHEN** a `check` declares `command: "pnpm test"`, `outcome: "fail"`, and
  `counts: { "failed": 3 }`
- **THEN** the record validates

### Requirement: `decision` records a chosen approach and its reason

A `decision` record SHALL carry `choice` and `rationale`, both non-empty. It
MAY carry `departed_from` and `resolves` (a reference to a numbered design
decision, as a free string).

#### Scenario: a decision without a reason

- **WHEN** a `decision` omits `rationale` or leaves it blank
- **THEN** the record is `MALFORMED`

### Requirement: SUPPRESSED-FINDING — a blocker nobody answered

A `finding` of severity `blocker` SHALL be `SUPPRESSED-FINDING` unless some
`resolution` answers it on its merits, under schema `0.3`.

A merge outcome (`duplicate`, `folded-in`) SHALL NOT discharge a finding. It
transfers the obligation to the finding named by `merges_into`, so the verdict
SHALL follow the merge chain and report the blocker unless that chain ends at a
finding answered by a non-merge outcome. A chain that returns to a finding it
has already visited SHALL NOT discharge anything in it.

Without this, folding a blocker into an unpoliced `concern` closes it while
answering nothing — and two blockers merged into each other close each other.

The verdict SHALL be gated to `blocker`. Findings of severity `concern` and
`looks-good` SHALL NOT produce it.

#### Scenario: an unanswered blocker

- **WHEN** a v0.3 journal contains a `blocker` finding and no `resolution`
  referencing it
- **THEN** validation reports `SUPPRESSED-FINDING` for that finding and exits 1

#### Scenario: an unanswered concern is not policed

- **WHEN** a v0.3 journal contains a `concern` finding with no resolution
- **THEN** validation reports nothing for it

#### Scenario: a blocker cannot hide inside an unpoliced concern

- **WHEN** a `blocker` is merged into a `concern` that no resolution answers
- **THEN** the blocker is still `SUPPRESSED-FINDING`

#### Scenario: a merge cycle discharges neither end

- **WHEN** two `blocker` findings are merged into each other
- **THEN** both are `SUPPRESSED-FINDING`

#### Scenario: a merge chain ending somewhere answered does discharge

- **WHEN** a `blocker` is merged into a finding that a non-merge `resolution`
  answers
- **THEN** validation reports nothing for either

### Requirement: SILENT-REVIEWER — a reviewer that returned and filed nothing

A `dispatch` whose terminal `report` declares outcome `found` SHALL be
`SILENT-REVIEWER` when no `finding` record references it through the
`dispatch` field, under schema `0.3`.

Reports declaring `empty` or `no-report` SHALL NOT produce it — invariant 1 and
`SILENT-EMPTY` already govern those. Filing a `looks-good` finding SHALL
discharge the obligation, since an explicit nothing-found is not silence.

#### Scenario: found something, said nothing

- **WHEN** a v0.3 journal has a `dispatch` with a `found` report, and no
  `finding` references that dispatch
- **THEN** validation reports `SILENT-REVIEWER` and exits 1

#### Scenario: looks-good discharges it

- **WHEN** the same dispatch is referenced by a `finding` of severity
  `looks-good`
- **THEN** validation reports nothing for that dispatch

### Requirement: existing journals are unaffected

The two new verdicts SHALL be evaluated only for journals declaring `0.3`, and
every pre-existing fixture SHALL keep its exit code and its verdicts.

Output is *not* required to be byte-identical, and one line necessarily changes:
`UNSUPPORTED-VERSION` enumerates the schemas this build reads, so adding one
must change that sentence. That is the message doing its job. The invariant is
about verdicts, not about bytes.

#### Scenario: the shipped fixtures keep their verdicts

- **WHEN** the v0.1, v0.2, valid, broken, and hooks fixtures are validated
- **THEN** each exits with the same code and reports the same verdicts, in the
  same order, as before v0.3 existed

#### Scenario: the future fixture reports the wider version list

- **WHEN** the future fixture, which declares schema `9.0`, is validated
- **THEN** it still exits 1 with a single `UNSUPPORTED-VERSION`, and the
  message names `0.1, 0.2, 0.3` as the readable schemas

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

An explicit JSON `null` SHALL be treated as `MALFORMED` on the same terms as an
empty string, and for the same reason: both are a producer writing the key and
declining to answer it, where omitting the key is the supported way to say git
could not answer.

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

### Requirement: A decision may carry a justification the journal does not interpret

A `decision` record MAY carry a `justifies` field. `witness validate` SHALL NOT
read, interpret, or reject it, and SHALL report the same findings for a journal
carrying the field as for one without it.

The meaning of `justifies`, and the validation of its shape, SHALL belong to the
`oracle` capability, which is the only consumer that means anything by it. A
malformed `justifies` SHALL NOT be a journal finding.

#### Scenario: a justifying decision validates unchanged

- **WHEN** a journal carries a `decision` with a `justifies` field
- **THEN** validation reports no finding

#### Scenario: a malformed justification is not the journal's business

- **WHEN** a `decision` carries `justifies: {path: "a.test.ts", change: "tweaked"}`
- **THEN** `witness validate` reports no finding, because it does not read the
  field; the invalid class is caught by `nullius oracle`

#### Scenario: an older validator reading an older journal is unaffected

- **WHEN** a validator built before this field reads a `0.4` journal
- **THEN** it produces identical findings, because nothing about `0.4` changed

### Requirement: The schema version advances to 0.5

The declared schema version SHALL advance from `0.4` to `0.5`, and `0.5` SHALL be
added to the accepted version list rather than replacing any member of it.

The trigger SHALL be recorded as the new-verdict clause of the versioning rule in
`spec/witness-journal.md`. This requirement deliberately does not paraphrase that
rule — a restatement carries all of its triggers or points at it, and this points
at it. What is asserted here is the fact the rule is applied to: `nullius oracle`
introduces a verdict that reads a field on a `decision` record and fails that
record, so the exemption for metadata no verdict reads does not apply.

The bump SHALL NOT be described as a tightening. Every record valid under `0.4`
SHALL remain valid under `0.5`, and `witness validate` SHALL gain no finding.

#### Scenario: a 0.5 journal validates

- **WHEN** a journal declares version `0.5` and carries well-formed records
- **THEN** validation accepts it

#### Scenario: every 0.4 journal remains valid

- **WHEN** a journal declaring `0.4` is validated after this change
- **THEN** it is accepted with the same findings as before, because the bump
  tightens nothing

#### Scenario: an unknown future version is still refused

- **WHEN** a journal declares a version above `0.5`
- **THEN** it is refused as unsupported, the same way `0.5` was refused before
  this change

