# installer spec delta

## ADDED Requirements

### Requirement: The PR template is a pointer host

`init` SHALL treat `.github/PULL_REQUEST_TEMPLATE.md` as a user-owned pointer
host: when the file exists and does not already carry the pointer sentence,
`init` appends one sentence directing the author to cite Evidence Anchors in
the pull request description. `init` SHALL NOT create the file when it is
absent, and SHALL NOT rewrite or reformat any other part of it.

#### Scenario: pointer appended to an existing template

- **WHEN** `init` runs in a repository containing `.github/PULL_REQUEST_TEMPLATE.md` without the pointer sentence
- **THEN** the file gains exactly one appended line and no other byte changes

#### Scenario: absent template is not created

- **WHEN** `init` runs in a repository with no `.github/PULL_REQUEST_TEMPLATE.md`
- **THEN** no such file is created, and the write-log records that the host was not found

#### Scenario: re-running init is idempotent

- **WHEN** `init` runs twice in a repository whose PR template already carries the pointer
- **THEN** the second run reports the file unchanged and writes no bytes
