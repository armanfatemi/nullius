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

### Requirement: canary clear does not print the plant's location

`canary clear` SHALL NOT name the planted claim's document or line in its
confirmation message, and the refusal raised when the registered line no longer
carries the planted claim SHALL NOT name them either. Both SHALL keep saying
what happened and what the operator should do next.

#### Scenario: A successful clear does not name the location

- **WHEN** a canary is planted and `canary clear` is run
- **THEN** the confirmation reports that the canary was cleared, and does not name the document or line

#### Scenario: A refused clear does not name the location

- **WHEN** the registered line no longer carries the planted claim and `canary clear` is run
- **THEN** the refusal states that the registered line no longer carries the claim and gives the operator a remedy, and does not name the document or line

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

### Requirement: one accessor renders a registered canary, with plant as the sole exception

Every rendering of a registered canary for human output SHALL go through a
single accessor that omits the document and line by default. `canary plant`
SHALL be the only caller that requests the unredacted form, and SHALL do so
through an explicit, named option rather than by formatting the entry itself.

This SHALL hold for messages raised as errors as well as messages printed to a
console.

#### Scenario: A new rendering site is redacted without being enumerated

- **WHEN** a new command or message renders a registered canary through the accessor's default
- **THEN** the document and line are omitted, without that site having to be listed anywhere

#### Scenario: plant still reports the location

- **WHEN** `canary plant` succeeds
- **THEN** it prints the planted document and line, because the coordinator records them at that moment
