# Rule coverage — journal-checked completeness of a `/comply` run

## ADDED Requirements

### Requirement: Every selected rule must reach a delivered verdict

`checkRuleCoverage` SHALL report `silent-rule` for any rule id present in a
run's expected-rules list that has no dispatch record reaching a terminal
record in that run's journal. A rule id with a matching, terminated dispatch
SHALL NOT produce a finding. This check is liveness-only: it verifies a
verdict was delivered, not that the verdict is correct.

#### Scenario: a rule with no matching dispatch is silent

- **WHEN** `rules select` names a rule id and that run's journal contains no
  `dispatch` record whose `task` matches it
- **THEN** `checkRuleCoverage` reports `silent-rule` for that rule id

#### Scenario: a rule dispatched but never terminated is silent

- **WHEN** a journal contains a `dispatch` record matching an expected rule
  id, but no corresponding terminal (`report`) record
- **THEN** `checkRuleCoverage` reports `silent-rule` for that rule id

#### Scenario: full coverage produces no findings

- **WHEN** every rule id `rules select` names has a matching dispatch that
  reached a terminal record
- **THEN** `checkRuleCoverage` reports no findings

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
