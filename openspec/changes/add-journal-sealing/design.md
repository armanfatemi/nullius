# Design — add-journal-sealing

## Context

`add-journal-identity` gives a journal a header naming the repository state it
began in. This change makes the journal itself durable.

Worktrees share a git common directory, so a ref is visible from every worktree
at once and survives deletion of any one of them. That makes the durability
problem and the cross-worktree-visibility problem the same problem, with one
mechanism.

The kit has never spawned a process. Every constraint below follows from that:
the append path is fast, holds an advisory lock, runs on every hook event, and
must never break a session.

## Decisions

### 1. The seal is compare-and-swap, not read-modify-write

**Chosen:** `update-ref refs/nullius/runs <new> <old>` — git's own compare-and-swap
— inside a bounded retry loop. On exhaustion the journal is left unsealed and
reported by `doctor`, never partially written.

**Alternatives considered:**

- **Plain `update-ref <ref> <new>`** (the originally specified sequence:
  `hash-object` → `mktree` → `commit-tree` → `update-ref`, reusing the existing
  tree) — rejected. It is a read-modify-write of shared state with no guard. Two
  sessions sealing concurrently both read tree `T`, both add their file, both
  write; the last writer wins and the other journal never enters the ref.
- **Extend the append path's advisory lock to cover sealing** — rejected. That
  lock is per-journal and per-worktree; the ref is shared across all of them, so
  it guards the wrong resource. It also drags a slow git call inside a lock the
  fast path depends on.
- **One ref per session** (`refs/nullius/runs/<session>`) — not rejected on
  correctness; it sidesteps contention entirely because no two sessions write
  the same ref. It loses ordering and makes a sweep enumerate refs. Kept as the
  fallback if retry proves unstable in practice.

**Rationale:** this is the failure mode the project exists to make loud, occurring
inside the mechanism whose entire purpose is not losing the record. It is also
not hypothetical here — concurrent sessions in one repository are the normal case
for this tool, and the proposal that specified the unguarded sequence argued for
sixty-four concurrent journals four decisions earlier in the same document.

The loss is recoverable — the working file stays on disk, so `witness seal`
re-sweeps it and `doctor` counts it unsealed. That is what makes this a design
defect rather than a data-loss bug, and it is also why it would have gone
unnoticed: the symptom is a journal that is merely late.

### 2. A commit chain on one ref, not a blob per session

Carried forward from `add-journal-identity`, where this was Decision 4.

| Shape | Durable | Cross-worktree | Cost |
| --- | --- | --- | --- |
| Blob at `refs/nullius/runs/<session>` | yes | yes | one `hash-object` + `update-ref` |
| Commit chain on `refs/nullius/runs` | yes | yes | `hash-object` + `mktree` + `commit-tree` + `update-ref` |
| `git notes` on the session's HEAD | yes | yes | awkward: many sessions per commit, and notes merge badly |

**Chosen: the commit chain on a single ref `refs/nullius/runs`**, whose tree
accumulates `<session>.jsonl`.

The blob-per-session form is less code and was the first choice, but it makes a
sweep enumerate refs to find its inputs and gives no ordering. The commit chain
makes the whole set one tree read, survives `git gc` as a normal root, gives
`git log refs/nullius/runs` for free, and is the shape the prior art already
noted in this repo uses:

**Evidence:** `IDEAS.md:135@a717cc4`

```
  (`refs/entire/checkpoints/...` with `metadata.json`, `full.jsonl`,
```

**Rationale:** the one cost of the chain over the blob — contention on a single
ref — is exactly what Decision 1 addresses. With CAS in place the chain's
advantages are free.

Refs outside `refs/heads` are not pushed by default, which is correct: a journal
is local evidence until someone chooses otherwise.

**When:** at `SessionEnd`, once. Not per append — the append path already holds
an advisory lock and runs on every hook event, and adding git invocations inside
that lock trades a fast local write for a slow one under contention.

### 3. Git failure is never a recording failure

**Chosen:** every git call is best-effort, bounded by a timeout, and never throws
into the append path. A failed seal leaves the working file and ends the session
normally; `doctor` counts it unsealed.

**Rationale:** hooks fail open. That constraint does not bend for durability, and
a durability mechanism that can break a session is worse than no durability.
`doctor` is where the silence gets a voice, which is what it is for.

### 4. `doctor` reports unsealed journals as a fact

**Chosen:** a count, in the register already used for absence, with `??` when git
cannot answer.

**Rationale:** an unsealed journal is not a defect — the session may still be
running, or may have crashed before its terminal hook. Reporting zero unsealed
journals when git is unavailable would be a checker claiming knowledge it does
not have, which is the failure this repo refuses everywhere else.

## Compatibility risks

**Risk:** a journal sealed by one version of the kit is read by a later version
whose tree layout or entry naming has changed.
**Binds at:** `data-at-rest`
**Skew path:** kit @vN seals → `refs/nullius/runs` → kit @vN+1 sweeps or reads
**Symptom:** a sweep re-seals journals already present under a different name,
duplicating them in the tree; or an older journal becomes invisible to `witness
seal` and is reported permanently unsealed.
**Mitigation closes it because:** the tree entry name is fixed as
`<session>.jsonl` in the spec rather than left to the implementation, so the
sweep's "does the ref carry this journal" test is a name lookup with one
definition across versions.
**Evidence:** `packages/kit/src/journalFile.ts:44@a717cc4` — `export const RUNS_DIR = join(".nullius", "runs");`

## Open questions

- The retry bound for Decision 1's CAS loop, and the behaviour on exhaustion
  beyond "leave it unsealed".
- Whether the kit reuses the kernel's bounded-git reader or builds its own.
  Inherited from `add-journal-identity`.
- No threshold is defined at which ref growth should concern a project.
