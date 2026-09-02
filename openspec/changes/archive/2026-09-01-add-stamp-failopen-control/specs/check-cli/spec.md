# Evidence Anchors — an unresolvable stamp cannot rescue a failing anchor

## ADDED Requirements

### Requirement: An unresolvable commit SHALL soften a failing verdict only on a clone that cannot read history

The checker SHALL treat a rev-stamped anchor whose commit does not resolve as
`unverifiable-rev` only when the repository is a shallow clone, or when the
shallowness of the repository cannot be determined. On a repository with full
history, the checker SHALL report the working-tree verdict unchanged,
including its failing verdicts.

The rev in a citation is supplied by the author of the document under test, so
it SHALL NOT by itself determine whether a failure is softened.

#### Scenario: A fabricated claim cannot be rescued by an invented commit

- **WHEN** a document cites text that does not appear in the file, stamped with a commit not present in a full-history clone
- **THEN** the verdict is `fabricated` and the run fails

#### Scenario: A shallow clone still refuses to accuse

- **WHEN** the same anchor is checked in a shallow clone
- **THEN** the verdict is `unverifiable-rev`, the run passes, and the detail names `fetch-depth: 0` as the remedy

#### Scenario: An honest anchor is unaffected either way

- **WHEN** a stamped anchor's quote is present in the working tree and its commit does not resolve
- **THEN** the verdict is the ordinary working-tree verdict, exactly as today

#### Scenario: No git access falls open

- **WHEN** the checker was built or invoked without a rev reader, or git cannot be run
- **THEN** shallowness cannot be determined, and a failing verdict is softened to `unverifiable-rev`

### Requirement: The run SHALL report how many stamps it could not honour

The checker SHALL report the number of rev-stamped anchors whose commit did
not resolve. The count SHALL be advisory and SHALL NOT change the exit code.

#### Scenario: A shallow CI run says so

- **WHEN** a run checks stamped anchors in a shallow clone
- **THEN** the report states how many stamps went unhonoured
