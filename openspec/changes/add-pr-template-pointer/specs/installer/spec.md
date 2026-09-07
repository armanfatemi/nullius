# installer spec delta

## ADDED Requirements

### Requirement: The PR template is a pointer host

`init` SHALL treat the repository's pull request template as a user-owned
pointer host: when the file exists and does not already carry the pointer
sentence, `init` appends one sentence directing the author to cite Evidence
Anchors in the pull request description. `init` SHALL NOT create the file when it
is absent, and SHALL NOT rewrite or reformat any other part of it.

The template is looked for at `.github/PULL_REQUEST_TEMPLATE.md` and then
`.github/pull_request_template.md`, and the first one present receives the
pointer. That order is this kit's choice, not a published GitHub ordering.

Root-level and `docs/` templates, and the directory form
`.github/PULL_REQUEST_TEMPLATE/`, are out of scope. A repository using one of
those is treated as having no template and receives the not-found note. This is
an accepted limitation: GitHub does not publish a precedence across those
locations, and choosing among several named templates in the directory form is
not a decision the kit has standing to make.

#### Scenario: pointer appended to an existing template

- **WHEN** `init` runs in a repository containing `.github/PULL_REQUEST_TEMPLATE.md` without the pointer sentence
- **THEN** the pointer sentence is appended at the end of that file, everything already in it is unchanged byte for byte, and nothing is inserted anywhere but the end

The append reuses the existing mechanism, which emits a blank separator line
before the sentence. A scenario demanding "exactly one appended line" would be
falsified by correct code, so the requirement is stated as *what must not
change* — the file's existing bytes — rather than as a line count.

#### Scenario: absent template is not created

- **WHEN** `init` runs in a repository with no `.github/PULL_REQUEST_TEMPLATE.md`
- **THEN** no such file is created, and the write-log records that the host was not found

#### Scenario: re-running init is idempotent

- **WHEN** `init` runs twice in a repository whose PR template already carries the pointer
- **THEN** the second run reports the file unchanged and writes no bytes

#### Scenario: unreadable template is left alone

- **WHEN** `init` runs in a repository where `.github/PULL_REQUEST_TEMPLATE.md` exists but cannot be read
- **THEN** the file is reported as skipped and no bytes are written to it

#### Scenario: an alternate spelling is found

- **WHEN** `init` runs on a case-sensitive filesystem in a repository whose only template is `.github/pull_request_template.md`
- **THEN** that file receives the pointer and no not-found note is emitted for the template group

#### Scenario: the first spelling present wins

- **WHEN** `init` runs on a case-sensitive filesystem in a repository containing both `.github/PULL_REQUEST_TEMPLATE.md` and `.github/pull_request_template.md`
- **THEN** only `.github/PULL_REQUEST_TEMPLATE.md` receives the pointer

#### Scenario: a template in an unsupported location is treated as absent

- **WHEN** `init` runs in a repository whose only template is at the repository root, under `docs/`, or in the directory form `.github/PULL_REQUEST_TEMPLATE/`
- **THEN** no pointer is placed and the not-found note is emitted, naming the `.github/` paths

### Requirement: Every pointer host group is visited

`init` SHALL organise pointer hosts into groups and visit every group, taking at
most one host from each. Within a group the first host present wins, as before.
Each group SHALL have its own pointer sentence, and the idempotence check SHALL
be made against that group's sentence.

Agent-instructions files (`CLAUDE.md`, `AGENTS.md`) are one group because they
are two spellings of one thing. The pull request template is a second group
because it is read by a different audience at a different moment. The previous
flat first-match-wins list could express only the first relationship, which made
any host after the first unreachable in a repository that had the first — that
is, in every repository with a `CLAUDE.md`.

#### Scenario: a repository with two groups gets two pointers

- **WHEN** `init` runs in a repository containing both `CLAUDE.md` and `.github/PULL_REQUEST_TEMPLATE.md`
- **THEN** each file gains its own pointer sentence, and neither suppresses the other

#### Scenario: two hosts in one group still yield one pointer

- **WHEN** `init` runs in a repository containing both `CLAUDE.md` and `AGENTS.md`
- **THEN** only `CLAUDE.md` gains the pointer, exactly as before this change

#### Scenario: a missing group is still reported when another group matched

- **WHEN** `init` runs in a repository containing `CLAUDE.md` but no `.github/PULL_REQUEST_TEMPLATE.md`
- **THEN** `CLAUDE.md` gains its pointer, and the write-log separately records that the PR-template host was not found and carries the sentence to add by hand
