# check-cli spec delta

## MODIFIED Requirements

### Requirement: The run SHALL report how many stamps it could not honour

The checker SHALL count every rev-stamped anchor whose commit could not be
read, and SHALL surface that total on the plain, card and JSON reports. The
count SHALL include anchors whose working-tree fallback passed, because those
are the ones whose hard gate went unrun without any other trace. The count
SHALL be advisory and SHALL NOT change the exit code.

When the total is non-zero, the run SHALL NOT state that all grounding markers
were verified, and SHALL name the remedy that fits the clone it inspected:
`fetch-depth: 0` where the repository is shallow, re-pinning where it is not.

#### Scenario: An unreadable stamp whose quote still matches is counted

- **WHEN** a document's stamped anchor names a commit absent from a full-history clone and the quote is present in the working tree at the cited line
- **THEN** the verdict stays `ok`, the run still exits 0, and the report states that one stamp could not be honoured

#### Scenario: The closing line stops claiming full verification

- **WHEN** any stamp in a run could not be honoured
- **THEN** the plain report's closing line does not assert that all grounding markers were verified

#### Scenario: A shallow CI run says so

- **WHEN** a run checks stamped anchors in a shallow clone
- **THEN** the report states how many stamps went unhonoured and names `fetch-depth: 0`

#### Scenario: A full clone names the other remedy

- **WHEN** stamps go unhonoured on a repository with full history
- **THEN** the report names re-pinning rather than checkout depth, because depth is not the cause

#### Scenario: A run with no stamps says nothing new

- **WHEN** no anchor in the run carries a rev stamp
- **THEN** no unhonoured-stamp total is reported, because there is no omission to name

#### Scenario: The count never moves the exit code

- **WHEN** every claim verifies and some stamps could not be honoured
- **THEN** the run exits 0
