# Witness — journal durability

## ADDED Requirements

### Requirement: Journals are sealed to a git ref

The kit SHALL write each session's journal to the git ref
`refs/nullius/runs` at session end, as a commit whose tree holds
`<session>.jsonl`, and SHALL leave the working file in
`.nullius/runs/` in place.

Sealing SHALL happen once per session at `SessionEnd`, never per append: the
append path holds an advisory lock and runs on every hook event.

The kit SHALL provide `witness seal`, which seals journals present in
`.nullius/runs/` that the ref does not yet carry, so a session that crashed
before its terminal hook is recoverable.

#### Scenario: a sealed journal survives its worktree

- **WHEN** a session records a journal, seals it, and the worktree is deleted
- **THEN** the journal is readable from any other worktree of the same
  repository

#### Scenario: a crashed session leaves an unsealed journal, not a lost one

- **WHEN** a session ends without reaching `SessionEnd`
- **THEN** the working file remains, and `witness seal` adds it to the ref

### Requirement: Sealing is atomic against concurrent sessions

The kit SHALL update `refs/nullius/runs` with a compare-and-swap against the ref
value it read, and SHALL retry a bounded number of times when the compare fails.

An unguarded update SHALL NOT be used. Two sessions sealing concurrently both
read the same tree, and a last-writer-wins update drops one journal from the ref
while leaving no error and no finding — a silent write loss in the mechanism
whose purpose is not losing the record.

When the retry bound is exhausted the journal SHALL be left unsealed with its
working file intact, and SHALL NOT be partially written.

The tree entry SHALL be named `<session>.jsonl`, so that the sweep's
"does the ref already carry this journal" test has one definition across
versions.

#### Scenario: two sessions sealing at once both land

- **WHEN** two sessions seal to `refs/nullius/runs` concurrently
- **THEN** the ref carries both journals, and neither is dropped

#### Scenario: exhausted retries leave the journal recoverable

- **WHEN** the compare-and-swap fails more times than the retry bound allows
- **THEN** the journal is left unsealed, its working file is intact, and
  `doctor` counts it unsealed
