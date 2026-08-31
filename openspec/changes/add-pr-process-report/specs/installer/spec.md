# installer spec delta

## ADDED Requirements

### Requirement: `witness bundle` selects journals by overlap and writes a committed envelope

The kit SHALL provide `witness bundle <base>..<head>` that selects session
journals by record-time overlap with the range's commits and by mutation
paths intersecting the range's changed files — never by the header's
`branch` — and SHALL write a redacted envelope outside `.nullius/` that
records the selection rule and each candidate's inclusion reason.

#### Scenario: the producing session started on main

- **WHEN** a journal's header says `branch: main` and its mutations touch three files in the range
- **THEN** it is selected, and the envelope's `selection` names the mutation-path reason

#### Scenario: a concurrent unrelated session

- **WHEN** a journal overlaps the range in time and touches no file in it
- **THEN** it is not selected, and the envelope records it as a candidate excluded for that reason

#### Scenario: an override

- **WHEN** `--exclude <session>` names a selected journal
- **THEN** it is omitted and the envelope records the exclusion as an override

### Requirement: The envelope strips reviewer return bodies and the operator's email

The bundle SHALL omit `report.findings` bodies and the header's `user.email`,
SHALL cap `finding.text` and `prompt.text`, and SHALL omit every `prompt`
record under `--no-prompts`.

#### Scenario: default bundle

- **WHEN** a journal with two `found` reports and one prompt is bundled
- **THEN** the envelope carries both reports without `findings`, with `response_chars`, and the prompt with capped text

#### Scenario: prompts withheld

- **WHEN** `--no-prompts` is given
- **THEN** no `prompt` record appears in the envelope and `selection` records the flag

### Requirement: `init --run-report` enables the Action's report and `doctor` checks the pairing

`init` SHALL accept `--run-report`, record `runReport: true` in
`nullius.kit.json`, and render `run-report: true` into the generated workflow;
`doctor` SHALL report `fail` when the config asks for the report and the
workflow lacks the input, `pass` when both agree, and a `fact` when the config
does not ask.

#### Scenario: enabling on a `prs` profile

- **WHEN** `init --profile prs --run-report` runs
- **THEN** the plan shows the workflow with `run-report: true` and the kit config with `runReport: true`

#### Scenario: a hand-edited workflow drops the input

- **WHEN** `nullius.kit.json` says `runReport: true` and `.github/workflows/claims.yml` has no `run-report` input
- **THEN** `doctor` reports the `run report` check as `fail` and `doctor --fix` re-renders the workflow

### Requirement: The Action posts the report as a second comment

When `run-report` is `true` the Action SHALL post the markdown report under
its own marker `<!-- nullius-run-report -->`, distinct from and not a prefix
of the grounding comment's marker, SHALL upsert it in place, and SHALL state a
version it cannot render rather than posting a partial report.

#### Scenario: repeated runs

- **WHEN** the workflow runs twice on one pull request
- **THEN** exactly one comment carries the run-report marker and exactly one carries the grounding marker

#### Scenario: unrecognised report version

- **WHEN** the JSON report's `version` is not one the Action knows
- **THEN** no report comment is posted and the step summary names the version
