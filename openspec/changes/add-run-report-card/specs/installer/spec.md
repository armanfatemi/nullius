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
