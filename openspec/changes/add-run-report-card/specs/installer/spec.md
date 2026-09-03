# installer spec delta

## ADDED Requirements

### Requirement: The run report comment leads with the card and collapses the document

The Action SHALL post the run report comment with the card visible and the
tiered document collapsed beneath it in a details block, keeping the comment a
single self-contained artefact rather than a pointer to the job summary.

#### Scenario: the comment opens on the card

- **WHEN** the run report comment is upserted
- **THEN** the card is visible without expanding anything, and the tiered document is present inside a collapsed block

#### Scenario: the existing marker still finds the comment

- **WHEN** a run report comment already exists on the pull request
- **THEN** the upsert matches it on the unchanged run report marker and edits it in place

### Requirement: The Action accepts every document version it can render

The Action SHALL accept the raised run-report document version, because its
current gate compares the version for equality against `1` and would otherwise
post no comment at all once the version rises — deleting the artefact this
capability exists to produce.

#### Scenario: the raised version still posts

- **WHEN** the checker emits a run report at the raised document version
- **THEN** the Action renders and posts the comment

#### Scenario: a genuinely unknown version still refuses

- **WHEN** the checker emits a document whose version the Action does not recognise
- **THEN** no comment is posted and the reason names the version it saw
