# Witness — schema v0.3, the run ledger

## ADDED Requirements

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
