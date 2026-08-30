# Witness — decisions may justify an oracle change

## ADDED Requirements

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
