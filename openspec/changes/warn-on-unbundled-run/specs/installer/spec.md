# installer spec delta

## ADDED Requirements

### Requirement: A recorded run that was never bundled is reported

The tooling SHALL notice when journals exist for a range and no envelope does,
because that combination produces a report stating a run cannot be confirmed
about a run that recorded everything needed to confirm it.

#### Scenario: journals exist and no envelope does

- **WHEN** a branch has recorded sessions covering its range and no committed envelope
- **THEN** the condition is reported, naming the command that writes one

#### Scenario: a project that does not record is not nagged

- **WHEN** no journals exist for the range at all
- **THEN** nothing is reported, because there is no omission to name
