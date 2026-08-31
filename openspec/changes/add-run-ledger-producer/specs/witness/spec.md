# witness spec delta

## ADDED Requirements

### Requirement: Findings are extracted from tagged return lines by the recorder

The recorder SHALL write one `finding` record per line of a subagent's return
text that matches the declared tag contract (`[blocker]`, `[concern]`,
`[looks-good]`, `[false-premise]`), with `dispatch` set to the terminated
dispatch and `author` set to the dispatched agent's name, and SHALL write no
`finding` for a return that carries no tag.

#### Scenario: a reviewer returns three tagged findings

- **WHEN** a dispatch terminates with a return text containing one `[blocker]`, one `[concern]`, and one `[looks-good]` line
- **THEN** the journal gains three `finding` records after the `report`, each naming the dispatch, with severities `blocker`, `concern`, and `looks-good`

#### Scenario: a false premise is recorded as a blocker with a tag

- **WHEN** a return text contains a `[false-premise]` line
- **THEN** the `finding` carries `severity: "blocker"` and `tag: "false-premise"`

#### Scenario: an untagged return yields no findings

- **WHEN** an agent returns prose with no tag lines
- **THEN** no `finding` record is written and the `report` is unchanged

### Requirement: Coordinator ledger records are appended through a structured command

The kit SHALL provide `witness ledger <stage|resolution|decision|check>` that
validates the record against the schema's required fields and closed
vocabularies before appending it under the journal lock, and SHALL refuse with
exit 2 when no session is named by `--session` or `CLAUDE_CODE_SESSION_ID`.

#### Scenario: a resolution answers an extracted finding

- **WHEN** the coordinator runs `witness ledger resolution --finding f:abc --outcome fixed --text "…"`
- **THEN** a `resolution` record referencing `f:abc` is appended and `witness validate` reports no `SUPPRESSED-FINDING` for that finding

#### Scenario: an outcome outside the closed vocabulary is refused before any write

- **WHEN** `--outcome resolved-ish` is given
- **THEN** the command exits 2, names the accepted outcomes, and the journal is unchanged

#### Scenario: no session is known

- **WHEN** neither `--session` nor `CLAUDE_CODE_SESSION_ID` is set
- **THEN** the command exits 2 naming both, and never selects a journal by modification time

### Requirement: Report records carry the resolved model and token usage when the harness provides them

The recorder SHALL record `model` on a `report` from the harness's
`resolvedModel`, and `usage` with `usage_source` from the synchronous response
or from the harness-written subagent transcript under a byte and time budget,
and SHALL omit the fields rather than estimate them when neither source is
available within budget.

#### Scenario: synchronous return

- **WHEN** a `PostToolUse` Agent response carries `resolvedModel` and `usage`
- **THEN** the `report` carries `model`, `usage`, and `usage_source: "payload"`

#### Scenario: asynchronous return within budget

- **WHEN** the launch acknowledgement carried `resolvedModel` and the `SubagentStop` names a transcript under the byte cap
- **THEN** the `report` carries `model` from the sidecar and `usage` summed from the transcript with `usage_source: "transcript"`

#### Scenario: transcript over budget

- **WHEN** the transcript exceeds the byte cap or the read exceeds its time budget
- **THEN** `usage` is absent, `model` is still recorded, and a note on stderr says why

### Requirement: Coordinator-authored records carry their own origin

At schema `0.6` or later the validator SHALL require `origin: "self-reported"`
on every `stage`, `resolution`, `decision` and `check` record and SHALL report
`MALFORMED` when it is absent or carries any other value, so a journal whose
header says `hooks` never presents a coordinator's account as the harness's.

#### Scenario: a ledger command writes a resolution

- **WHEN** `witness ledger resolution …` appends a record
- **THEN** the record carries `origin: "self-reported"` and validates clean

#### Scenario: a resolution without origin

- **WHEN** a `0.6` journal carries a `resolution` with no `origin`
- **THEN** `MALFORMED` is reported naming that record

### Requirement: The header records the git user name when git can answer

The recorder SHALL record `user: { name }` in the journal header from
`git config user.name`, resolved within the identity budget, SHALL omit the
field when git cannot answer, and the validator SHALL report `MALFORMED` for a
blank `user.name` at schema `0.6` or later.

#### Scenario: a configured repository

- **WHEN** a session starts in a repository with `user.name` configured
- **THEN** the header carries it under `user.name`

#### Scenario: no git identity

- **WHEN** `git config user.name` returns nothing or git is unavailable
- **THEN** the header carries no `user` key, and the append proceeds

#### Scenario: a blank name

- **WHEN** a `0.6` header carries `user: { name: "" }`
- **THEN** `MALFORMED` is reported naming the field

### Requirement: Operator prompts are recorded and joined to the work they caused

The recorder SHALL write one `prompt` record per `UserPromptSubmit` event,
identified by the harness's `prompt_id`, and SHALL stamp the same id onto each
subsequent `dispatch` and `mutation` whose payload carries it.

#### Scenario: a prompt leads to two dispatches

- **WHEN** the operator submits a prompt and the turn dispatches two agents
- **THEN** the journal carries a `prompt` record `p:<id>` followed by two `dispatch` records each carrying `prompt: "p:<id>"`

#### Scenario: hashed mode

- **WHEN** `NULLIUS_WITNESS_PROMPTS=0` is set
- **THEN** the `prompt` record carries `chars` and `hash` and no `text`

#### Scenario: a long prompt

- **WHEN** the prompt exceeds the excerpt cap
- **THEN** `text` is cut, `truncated` is true, and `chars` carries the original length

#### Scenario: a malformed prompt record

- **WHEN** a `0.6` journal carries a `prompt` with neither `text` nor both `chars` and `hash`, or a non-integer `chars`
- **THEN** `MALFORMED` is reported naming the record

### Requirement: SILENT-REVIEWER is scoped to dispatches that expect findings at schema 0.6

At journal version `0.6` or later the validator SHALL report `SILENT-REVIEWER`
only for a dispatch carrying `expects: "findings"`, SHALL report `MALFORMED`
for a dispatch whose `expects` is present with any other value, and SHALL keep
the unscoped behaviour for journals declaring an earlier version.

#### Scenario: an unknown expects value

- **WHEN** a `0.6` journal has a dispatch with `expects: "reviews"`
- **THEN** `MALFORMED` is reported for that dispatch rather than the verdict being skipped

#### Scenario: an exploring agent returns prose at 0.6

- **WHEN** a `0.6` journal has a dispatch without `expects`, a `found` terminal, and no `finding`
- **THEN** no `SILENT-REVIEWER` is reported

#### Scenario: a reviewer returns untagged prose at 0.6

- **WHEN** a `0.6` journal has a dispatch with `expects: "findings"`, a `found` terminal, and no `finding`
- **THEN** `SILENT-REVIEWER` is reported for that dispatch

#### Scenario: the same records at 0.5

- **WHEN** identical records declare version `0.5`
- **THEN** `SILENT-REVIEWER` is reported for both dispatches, as before
