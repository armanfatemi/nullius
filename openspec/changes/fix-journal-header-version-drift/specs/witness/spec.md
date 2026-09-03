# witness spec delta

## ADDED Requirements

### Requirement: A journal's declared version keeps pace with the producer appending to it

The recorder SHALL ensure a journal's declared schema version is not below the
version of the records being appended, so that a session spanning a kit upgrade
does not produce a journal its own validator rejects.

#### Scenario: a session outlives the kit version that started it

- **WHEN** records of a kind introduced after the journal's declared version are appended
- **THEN** the journal's declared version is brought up to the producer's version before those records are read as malformed

#### Scenario: the correction is appended, never rewritten

- **WHEN** a declared version is corrected
- **THEN** the existing header bytes are unchanged and the correction is a new record

### Requirement: The version check does not read the whole journal

The recorder SHALL determine a journal's declared version without reading the
journal end to end, because that read happens while the append lock is held and
grows with the session.

#### Scenario: the hot path stays bounded

- **WHEN** a record is appended to a journal of any length
- **THEN** at most the journal's first line is read to establish its declared version
