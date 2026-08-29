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
value it read, and SHALL decide whether to retry by re-reading the ref rather
than by interpreting git's error message. After a failed update: an unreadable
tip SHALL stop the seal; a tip that moved from the value passed as `<old>` SHALL
be retried against the new tip; a tip that is unchanged SHALL be retried a small bounded
number of times and then abandoned. A tip that has moved to the commit this seal
itself built SHALL be treated as a success, not as contention.

Git's error text SHALL NOT be parsed to make this decision. It is not an
interface, several distinct failures share a message prefix, and the set is not
enumerable — a stale lock left by a crashed process is permanent and reads
identically to a live one held by a running peer. Ref state separates them: in
both cases the tip has not moved, so both take the bounded path and neither
consumes the seal's budget.

Retries SHALL be bounded by a total wall-clock budget rather than by an attempt
count.

An unguarded update SHALL NOT be used. Two sessions sealing concurrently both
read the same tree, and a last-writer-wins update drops one journal from the ref
while leaving no error and no finding — a silent write loss in the mechanism
whose purpose is not losing the record.

When the retry bound is exhausted the journal SHALL be left unsealed with its
working file intact, SHALL NOT be partially written, and the kit SHALL write one
line to stderr naming how many journals were not sealed and why. Exiting
without an error is not the same as exiting without a word: a silently skipped
seal is discoverable only by someone who independently runs `doctor`.

The tree entry SHALL be named `<session>.jsonl`, so that the sweep's
"does the ref already carry this journal" test has one definition across
versions.

#### Scenario: two sessions sealing at once both land

- **WHEN** two sessions seal to `refs/nullius/runs` concurrently
- **THEN** the ref carries both journals, and neither is dropped

#### Scenario: a held ref lock is retried once, not abandoned outright

- **WHEN** `update-ref` fails because another process holds the ref's lock, and
  that process then releases it
- **THEN** the seal retries and the journal lands

#### Scenario: a stale lock does not consume the budget

- **WHEN** `update-ref` fails against a lockfile left by a crashed process, so
  the tip never moves
- **THEN** the seal stops after a single retry, names the reason on stderr, and
  leaves its remaining budget unspent

#### Scenario: exhausted retries leave the journal recoverable

- **WHEN** the seal exhausts its budget without landing
- **THEN** every journal in the attempt is left unsealed, its working file is
  intact, the reason and the count are written to stderr, the exit code is 0,
  and `doctor` counts them unsealed

#### Scenario: a corrupt ref stops the seal without consuming its budget

- **WHEN** the ref is corrupt, which reads identically to an absent ref
- **THEN** the seal stops within its bounded retry count, names the reason on
  stderr, and leaves its remaining budget unspent

#### Scenario: a write that landed before being killed is not committed twice

- **WHEN** `update-ref` is killed on timeout after the write has already landed
- **THEN** the seal recognises the new tip as its own commit and does not retry
