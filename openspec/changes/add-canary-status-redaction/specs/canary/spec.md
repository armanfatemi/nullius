# Canary — no command reveals the plant's location

## ADDED Requirements

### Requirement: canary status does not print the plant's document or line

`canary status` SHALL report only whether a canary is active and when it was
planted. It SHALL NOT print the planted claim's document path or line
number.

This SHALL NOT change `canary status`'s exit code (`0` when no canary is
active, `1` when one is) or the message printed when no canary is active.

#### Scenario: An active canary's location is not printed

- **WHEN** a canary is planted and `canary status` is run
- **THEN** the printed line names when the canary was planted, and does not name the document or line it was planted at

#### Scenario: No active canary is reported exactly as before

- **WHEN** no canary is planted and `canary status` is run
- **THEN** the output is `no active canary` and the exit code is `0`

### Requirement: check's canary warnings do not print the plant's document

`check` SHALL NOT name the registered canary's document in either of the
warnings it emits about canary state. It SHALL continue to emit both warnings
under their existing conditions, and SHALL NOT direct the reader to
`canary status` for a location that command no longer reports.

#### Scenario: The out-of-scope warning does not name the document

- **WHEN** a canary is registered against a document outside the set `check` matched, and `check` is run
- **THEN** the warning states that a registered canary points outside the matched set, and does not name the document or refer the reader to `canary status`

#### Scenario: The stale-registry warning does not name the document

- **WHEN** a canary is registered against a matched document but the planted claim is no longer present, and `check` is run without `--probing`
- **THEN** the warning states that the registry is stale and gives the remedy of deleting `.git/nullius/canaries.json`, and does not name the document

### Requirement: the CANARY-PRESENT guard row does not carry the plant's line

The `canary-present` result SHALL carry a source line that does not identify
where the claim was planted. The guard remains document-level: it SHALL still
name the document it fired on, which the reader already knows because they
asked `check` to read it, and SHALL still give `canary clear` as the remedy —
a remedy that needs no line number.

This SHALL hold in every output format, including `--format json`, because the
redaction is applied where the result is constructed rather than where it is
rendered.

#### Scenario: The guard row does not point at the planted line

- **WHEN** a canary is planted in a document and `check` is run over a glob that matches that document
- **THEN** the `CANARY-PRESENT` result fires and its source line is not the line the claim was planted at

#### Scenario: The guard still identifies itself and its remedy

- **WHEN** the `CANARY-PRESENT` result is rendered
- **THEN** it names the document, reports when the canary was planted, and gives `canary clear` as the remedy

### Requirement: canary verify does not print the plant's location

`canary verify` SHALL NOT print the planted claim's document or line in its
`CANARY-CAUGHT` or `CANARY-MISSED` messages. Exit codes SHALL be unchanged
(`0` caught, `1` missed, `3` tainted, `2` unusable).

#### Scenario: A caught result does not name the location

- **WHEN** `canary verify` scores a report as caught
- **THEN** the message reports that the review flagged the planted claim, and does not name the document or line

#### Scenario: A missed result does not name the location

- **WHEN** `canary verify` scores a report as missed
- **THEN** the message reports that nothing in the review referenced the planted claim, and does not name the document or line
