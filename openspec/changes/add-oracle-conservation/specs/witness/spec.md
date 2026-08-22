# Witness — decisions may justify an oracle change

## ADDED Requirements

### Requirement: A decision may justify an oracle change

A `decision` record MAY carry `justifies`, which SHALL be an object with
`path` (a non-empty string) and `change` (exactly one of `deleted`, `skipped`,
`weakened`).

`justifies` SHALL NOT change any journal verdict. `witness validate` SHALL
report the same findings for a journal with the field as for one without it,
and the schema version SHALL remain `0.3`: the field is additive optional
metadata that no journal verdict reads.

A `justifies` present but malformed — a blank `path`, or a `change` outside the
three — SHALL be `MALFORMED`, on the same principle as the existing optional
fields that may not be present-but-blank.

#### Scenario: a justifying decision validates unchanged

- **WHEN** a `0.3` journal carries a `decision` with a well-formed `justifies`
- **THEN** validation reports no finding, and the declared version stays `0.3`

#### Scenario: an invented change class is loud

- **WHEN** a `decision` carries `justifies: {path: "a.test.ts", change: "tweaked"}`
- **THEN** the record is `MALFORMED`, and the message names the three valid
  classes

#### Scenario: an older validator is unaffected

- **WHEN** a validator built before this field reads a journal carrying it
- **THEN** it produces identical findings, because no record parser rejects
  unknown fields
