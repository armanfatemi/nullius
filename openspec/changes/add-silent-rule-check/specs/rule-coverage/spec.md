# Rule coverage — journal-checked completeness of a `/comply` run

## ADDED Requirements

### Requirement: Every selected rule must reach a delivered verdict

`checkRuleCoverage` SHALL report `silent-rule` for any rule id present in a
run's expected-rules list unless that rule has a matching `dispatch` record
whose terminal `report` has `outcome: "found"` and whose `findings` excerpt
contains `COMPLIANT`, `VIOLATION`, or `NOT-APPLICABLE`. A terminal record's
mere existence is not sufficient — an `outcome` of `"empty"` or `"no-report"`
SHALL still produce `silent-rule`, since a subagent that ran and reported
nothing is one of the silence modes this check exists to catch. This check
is liveness-only: it verifies a verdict was delivered, not that the verdict
is correct.

#### Scenario: a rule with no matching dispatch is silent

- **WHEN** `rules select` names a rule id and that run's journal contains no
  `dispatch` record whose `task` matches it
- **THEN** `checkRuleCoverage` reports `silent-rule` for that rule id

#### Scenario: a rule dispatched but never terminated is silent

- **WHEN** a journal contains a `dispatch` record matching an expected rule
  id, but no corresponding terminal (`report`) record
- **THEN** `checkRuleCoverage` reports `silent-rule` for that rule id

#### Scenario: a rule that reported nothing is silent, not covered

- **WHEN** a journal contains a `dispatch` record matching an expected rule
  id, and its terminal `report` has `outcome: "no-report"` or `"empty"`
- **THEN** `checkRuleCoverage` reports `silent-rule` for that rule id, even
  though a terminal record exists

#### Scenario: full coverage produces no findings

- **WHEN** every rule id `rules select` names has a matching dispatch whose
  terminal report has `outcome: "found"` and a `findings` excerpt containing
  a recognized verdict string
- **THEN** `checkRuleCoverage` reports no findings

### Requirement: A journal `validateJournal` could not read is never scanned for coverage

`checkRuleCoverage` SHALL NOT run when `validateJournal`'s findings for the
same journal include `unsupported-version` — that verdict means nothing
after the header was read, and a version-blind coverage scan over unread
content would misreport what the validator explicitly declined to judge.

#### Scenario: an unreadable schema version suppresses the coverage check

- **WHEN** `witness validate <journal> --expect-rules a b` is run against a
  journal declaring a schema version this build does not know
- **THEN** the command reports `unsupported-version` and exits non-zero, and
  reports no `silent-rule` finding for `a` or `b`

### Requirement: Coverage checking is a separate union from journal validity

`RuleCoverageVerdict` SHALL be a union distinct from `JournalVerdict`, and
`checkRuleCoverage` SHALL NOT modify `validateJournal`'s exported signature.

#### Scenario: journal validation is unaffected

- **WHEN** `witness validate <journal>` is run with no `--expect-rules` flag
- **THEN** its behaviour, findings, and exit code are unchanged from before
  this capability existed

### Requirement: `witness validate --expect-rules` merges both checks into one report

`witness validate <journal> --expect-rules <id...>` SHALL run both journal
validation and rule-coverage checking against the same journal, and SHALL
report a non-zero exit code if either produces a failing finding.

#### Scenario: a silent rule fails the run alongside ordinary journal checks

- **WHEN** `witness validate <journal> --expect-rules a b c` is run and rule
  `b` never reached a terminal record
- **THEN** the command exits non-zero and reports `SILENT-RULE` for `b`,
  regardless of whether the journal is otherwise internally valid
