# attestation-ledger

## Purpose

Declared review dispatches and their delivered outcomes become checkable facts
inside any checked document, so reviewer silence fails loudly instead of
reading as success. Writing `None` is a valid answer; writing nothing is not.

## ADDED Requirements

### Requirement: Ledger checking activates only on an explicit opener

Ledger verification SHALL activate solely on a line beginning `**Ledger:**`
(naming the review cycle). `**Expected:**` and `**Delivered:**` lines outside
an activated ledger block SHALL be inert — no heuristics, no verdicts. Ledger
blocks inside fenced code blocks SHALL be ignored, consistent with how
Evidence Anchors are parsed.

#### Scenario: Opener activates the block

- WHEN a checked document contains a `**Ledger:**` line followed by
  `**Expected:**` and `**Delivered:**` sections
- THEN the checker evaluates the block and reports one verdict per expected
  dispatch

#### Scenario: Orphan markers stay inert

- WHEN a document contains an `**Expected:**` or `**Delivered:**` line with no
  preceding `**Ledger:**` opener
- THEN the checker reports no ledger verdicts for it

#### Scenario: Quoted example is ignored

- WHEN a ledger block appears inside a fenced code block
- THEN the checker reports no ledger verdicts for it

### Requirement: Pinned grammar with counted multiplicity

Within an activated block: `**Expected:**` SHALL list reviewer names as
inline code, comma-separated. Each `**Delivered:**` entry SHALL be a list
item of the form `- ` + inline-code reviewer name + ` — ` + outcome, where
the outcome is the literal `None` (a trailing period is accepted) or findings
text, optionally carrying an inline-code findings path. Names SHALL match
exactly between the two sections, with counted multiplicity: a name expected
twice requires two delivery entries. Structurally invalid content inside an
activated block SHALL produce the existing `MALFORMED` verdict rather than
being skipped.

#### Scenario: Well-formed ledger parses

- WHEN an activated block declares two expected reviewers and carries two
  well-formed delivery entries
- THEN the checker reports a passing verdict for each

#### Scenario: Malformed content inside an activated block fails loudly

- WHEN an activated block contains a delivery line that matches no entry shape
- THEN the checker reports `MALFORMED` for that line and exits non-zero

#### Scenario: Repeated names are counted

- WHEN `**Expected:**` lists the same reviewer name twice and only one
  delivery entry for that name exists
- THEN the checker reports `UNDELIVERED` for the second occurrence

### Requirement: Silence is the failing verdict UNDELIVERED

Every occurrence of a name in `**Expected:**` SHALL have a matching delivery
entry. A declared dispatch with no delivery entry SHALL produce an
`UNDELIVERED` verdict, which fails the check. WHEN an undelivered expected
name is a near match (small edit distance) of a delivered name, the verdict
detail SHALL name that candidate, so a typo'd declaration explains itself.

#### Scenario: Declared but not delivered

- WHEN a ledger declares `security-review` among the expected reviewers and no
  delivery entry for `security-review` exists
- THEN the checker reports `UNDELIVERED` for `security-review` and exits
  non-zero

#### Scenario: Typo'd name suggests the near match

- WHEN `**Expected:**` lists `secruity-review` and a delivery entry exists for
  `security-review`
- THEN the `UNDELIVERED` detail for `secruity-review` names `security-review`
  as a likely match

### Requirement: Explicit None is a valid outcome; an empty entry is not

A delivery entry SHALL state findings or the literal `None`. An entry with an
empty outcome SHALL produce the failing `EMPTY-DELIVERY` verdict, whose detail
SHALL quote the accepted literal.

#### Scenario: Explicit None passes

- WHEN a delivery entry for a declared reviewer has the outcome `None`
- THEN the entry passes

#### Scenario: Trailing period accepted

- WHEN a delivery entry has the outcome `None.`
- THEN the entry passes

#### Scenario: Entry without an outcome fails

- WHEN a delivery entry names a declared reviewer but its outcome is empty
- THEN the checker reports `EMPTY-DELIVERY` and exits non-zero

### Requirement: Findings paths are validated

WHEN a delivery entry carries a findings path, the path SHALL pass the
existing path-safety rules and the file SHALL exist; a missing file produces
the existing `MISSING-FILE` verdict, and an unsafe path the existing
`UNSAFE-PATH` verdict, before any read.

#### Scenario: Findings path missing

- WHEN a delivery entry carries a findings path that does not exist in the
  working tree
- THEN the checker reports `MISSING-FILE` for that entry

### Requirement: Undeclared reports pass as UNDECLARED

A delivery entry whose reviewer is not named in `**Expected:**` SHALL produce
an `UNDECLARED` verdict that passes, so extra coverage is visible without
failing the check — the report exists, but nobody was waiting on it.

#### Scenario: Extra report is surfaced, not punished

- WHEN a delivery entry names a reviewer absent from `**Expected:**`
- THEN the checker reports `UNDECLARED` and the check still passes, absent
  other failures

### Requirement: Closed reviewer vocabulary when configured

WHEN the project config defines a `reviewers` list, every name in
`**Expected:**` SHALL come from that list; a name outside it SHALL produce a
failing `UNKNOWN-REVIEWER` verdict whose detail lists the vocabulary,
mirroring how invented binding moments fail. WHEN no list is configured,
reviewer names are free-form.

#### Scenario: Invented reviewer fails loudly

- WHEN the config lists `rule-audit` and `schema-review` as the reviewer
  vocabulary and a ledger declares `vibes-review`
- THEN the checker reports `UNKNOWN-REVIEWER` and exits non-zero

### Requirement: Ledger blocks are grounding markers

An activated ledger block SHALL count as a grounding marker for
`--require-markers` and for the anchor-density report — a document whose only
checkable content is a ledger is a grounded document.

#### Scenario: Ledger-only document satisfies the marker floor

- WHEN `check --require-markers` runs on a document containing an activated
  ledger block and no Evidence Anchors
- THEN the document is not reported as unanchored
