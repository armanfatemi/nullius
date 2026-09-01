# installer spec delta

## ADDED Requirements

### Requirement: `witness bundle` selects journals by overlap and writes a committed envelope

The kit SHALL provide `witness bundle <base>..<head>` that classifies session
journals three ways — included, inconclusive, excluded — by record-time
overlap with the range's commits and by mutation paths intersecting the
range's changed files, never by the header's `branch`, and SHALL write a
redacted envelope outside `.nullius/` recording the rule and every candidate's
classification with its reason. The bundle SHALL carry every source line of an
included journal, in its original order — including lines the validator
rejects — and SHALL NOT remove lines for being outside the range.

#### Scenario: the producing session started on main

- **WHEN** a journal's header says `branch: main` and its mutations touch three files in the range
- **THEN** it is selected, and the envelope's `selection` names the mutation-path reason

#### Scenario: a review-only session

- **WHEN** a journal overlaps the range in time and mutates no file in it
- **THEN** it is classified inconclusive rather than excluded, carried in the envelope by session id, and surfaced by the report as not recorded with the `--include` remedy

#### Scenario: a session outside the range's time window

- **WHEN** a journal's records all fall outside the range's commit window
- **THEN** it is classified excluded, and the envelope records the reason

#### Scenario: an included journal holding out-of-range mutations

- **WHEN** an included journal carries mutations to paths the range never touched
- **THEN** those records are present in the envelope, and the report rather than the bundle excludes them from its counts

#### Scenario: an override

- **WHEN** `--exclude <session>` names a selected journal
- **THEN** it is omitted and the envelope records the exclusion as an override

### Requirement: Redaction rewrites fields on a line and never drops a line

The bundle SHALL redact by rewriting fields only, and only on lines carrying a
valid `id`: it SHALL preserve each `report.findings` array's length while
capping its entries, SHALL cap `finding.text`, `prompt.text` and
`report.statement`, SHALL record the statement cap under a flag of its own
rather than reusing `truncated` or `response_chars`, and SHALL carry those two
exactly as recorded. Under `--no-prompts` the
bundle SHALL convert each `prompt` record to its hashed form rather than
emptying its text. The bundle SHALL NOT drop any source line for any reason, so
that the reconstructed journal yields the same verdicts as the source.

#### Scenario: default bundle

- **WHEN** a journal with two `found` reports and one prompt is bundled
- **THEN** the envelope carries both reports with their findings arrays intact in length and each entry capped, with `response_chars` as recorded, and the prompt record present with capped text

#### Scenario: a journal carrying a line the validator rejects

- **WHEN** a journal contains an unparseable line and a duplicate id
- **THEN** both lines are present in the envelope verbatim, and the reconstruction still reports `malformed` and `duplicate-id`

#### Scenario: the bundle round-trips through the validator

- **WHEN** each bundled journal is reconstructed as JSONL and passed to `validateJournal`
- **THEN** its verdict set, compared on verdict and subject, is identical to the source journal's, neither gaining `collapsed-state`, `dangling-reference` or `malformed` nor losing `stale-verification`

#### Scenario: a capped statement

- **WHEN** a report's `statement` exceeds the bundle's budget
- **THEN** it is capped, the bundle's own cap flag is set, and `truncated` and `response_chars` are byte-identical to the source

#### Scenario: a line with no valid id

- **WHEN** a line carries a redactable `text` field but no valid `id`
- **THEN** it is copied byte-for-byte, and its `malformed` finding has the same subject in the source and the reconstruction

#### Scenario: prompts withheld

- **WHEN** `--no-prompts` is given and every line parses
- **THEN** every `prompt` record is present in its hashed form — `hash` and `chars`, no `text` — validates clean, and `selection` records the flag

#### Scenario: prompts withheld from a journal with an unparseable line

- **WHEN** `--no-prompts` is given and any line in a selected journal fails to parse
- **THEN** the bundle exits non-zero naming the session and line numbers, writes nothing, and points at `--exclude`, because an unparseable prompt line cannot be converted and must not ship its text

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
