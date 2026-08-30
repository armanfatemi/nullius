# rules Specification

## Purpose
TBD - created by archiving change add-rules-compliance. Update Purpose after archive.
## Requirements
### Requirement: Rule headers are strict and grounded

A rule file SHALL carry a flat frontmatter with closed keys (`id`,
`applies_to`, `severity`, plus an Evidence Anchor to the motivating incident
in the body). Unknown keys SHALL be rejected loudly. A rule with no incident
anchor SHALL verify as advisory `UNGROUNDED-RULE`; a rule whose incident
anchor fails against the working tree SHALL verify as advisory `RULE-ROT`.
Rules verdicts SHALL live in their own union, not the kernel's exported
`Verdict` union.

#### Scenario: folklore is visible

- **WHEN** a rule file carries no incident anchor
- **THEN** checking the rules directory reports `UNGROUNDED-RULE` for it and
  exits 0 (advisory)

#### Scenario: a rotted rule is visible

- **WHEN** a rule's incident anchor names text no longer present at its cited
  location
- **THEN** the rule is reported `RULE-ROT` with the failing citation

### Requirement: Deterministic rule selection

`rules select --paths <globs>` SHALL emit exactly the rules whose
`applies_to` matches at least one given path, with no model involved, in a
stable order, and SHALL print the count of rules excluded — a selection that
silently narrows is the failure the verb exists to prevent.

#### Scenario: a plan gets only the rules that bind

- **WHEN** `rules select --paths "src/graphql/**"` runs against a rules
  directory containing GraphQL and infra rules
- **THEN** only the GraphQL-applicable rules are emitted, and the excluded
  count is printed

### Requirement: Starved compliance briefs

The kit SHALL emit one compliance brief per selected rule, carrying the rule
text and the plan's touch-list and nothing else — no sibling rules, no plan
rationale. The brief SHALL be the only content on stdout. The responding
agent's verdict (`COMPLIANT` / `VIOLATION` / `NOT-APPLICABLE`) SHALL quote
the rule id. `COMPLIANT` and `VIOLATION` SHALL each cite the plan as an
Evidence Anchor that `check` re-verifies — the specific touch-list text that
satisfies the rule, or the specific text that violates it. Only
`NOT-APPLICABLE` needs no anchor, since it asserts nothing is present in the
plan for the rule to bind to. A `COMPLIANT` decided on the agent's word
alone, uncited, is a model in the verification path in exactly the shape
this repo's own `model-proposes-code-verifies` invariant exists to close.

#### Scenario: a violation is machine-re-checkable

- **WHEN** a compliance agent reports `VIOLATION` with an anchor into the plan
- **THEN** `check` on the plan verifies the cited text exists at the cited
  line before the violation is reported to the user

#### Scenario: compliance is machine-re-checkable too

- **WHEN** a compliance agent reports `COMPLIANT` with an anchor into the plan
- **THEN** `check` on the plan verifies the cited text exists at the cited
  line before the compliance is reported to the user — the same gate a
  `VIOLATION` passes through, not a lighter one

### Requirement: Silent rules fail the run

Every rule id emitted by `select` for a run SHALL reach a delivered verdict
in the run's journal, or validation reports `SILENT-RULE` for it. Three
states are preserved: violation found, explicit compliance, and
never-audited are never collapsed.

#### Scenario: a dead rule audit is not a pass

- **WHEN** `select` emitted four rules and the journal holds verdicts for
  three
- **THEN** the fourth is reported `SILENT-RULE` and the run fails

