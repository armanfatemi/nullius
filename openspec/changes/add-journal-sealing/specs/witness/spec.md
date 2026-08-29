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
before its terminal hook is recoverable. A sweep of N journals SHALL produce one
commit and one ref update, not N: sealing each in turn would make the recovery
mechanism contend with itself from a single process.

Sealing SHALL inherit the `.nullius` opt-in. Writing to `refs/nullius/runs`
creates a namespace in the user's repository, and a project that has not opted
in to recording has not opted in to that either.

#### Scenario: a sealed journal survives its worktree

- **WHEN** a session records a journal, seals it, and the worktree is deleted
- **THEN** the journal is readable from any other worktree of the same
  repository

#### Scenario: a crashed session leaves an unsealed journal, not a lost one

- **WHEN** a session ends without reaching `SessionEnd`
- **THEN** the working file remains, and `witness seal` adds it to the ref

### Requirement: Sealing is atomic against concurrent sessions

The kit SHALL update `refs/nullius/runs` with a compare-and-swap against the ref
value it read, and SHALL retry when the update fails because the ref was
contended — whether the compare mismatched or the ref's lock was held by another
process. Git reports both as exit 128 with a message opening `cannot lock ref`,
so a retry predicate that distinguishes them is not implementable and would
abandon journals on ordinary lock contention. Retries SHALL be bounded by a total
wall-clock budget rather than by an attempt count alone.

An unguarded update SHALL NOT be used. Two sessions sealing concurrently both
read the same tree, and a last-writer-wins update drops one journal from the ref
while leaving no error and no finding — a silent write loss in the mechanism
whose purpose is not losing the record.

When the retry bound is exhausted the journal SHALL be left unsealed with its
working file intact, SHALL NOT be partially written, and the kit SHALL write one
line to stderr naming the journal and the reason it was not sealed. Exiting
without an error is not the same as exiting without a word: a silently skipped
seal is discoverable only by someone who independently runs `doctor`.

The tree entry SHALL be named `<session>.jsonl`, so that the sweep's
"does the ref already carry this journal" test has one definition across
versions.

#### Scenario: two sessions sealing at once both land

- **WHEN** two sessions seal to `refs/nullius/runs` concurrently
- **THEN** the ref carries both journals, and neither is dropped

#### Scenario: a held ref lock is retried, not abandoned

- **WHEN** `update-ref` fails because another process holds the ref's lock
- **THEN** the seal retries, and does not treat the failure as unrecoverable

#### Scenario: exhausted retries leave the journal recoverable

- **WHEN** the seal exhausts its budget without landing
- **THEN** the journal is left unsealed, its working file is intact, the reason
  is written to stderr, the exit code is 0, and `doctor` counts it unsealed
