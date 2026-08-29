# Design — add-journal-sealing

## Context

`add-journal-identity` gives a journal a header naming the repository state it
began in. This change makes the journal itself durable.

Worktrees share a git common directory, so a ref is visible from every worktree
at once and survives deletion of any one of them. That makes the durability
problem and the cross-worktree-visibility problem the same problem, with one
mechanism.

The kit already spawns git. `add-journal-identity` gave it a bounded-git
helper, and the constraints below are inherited from that precedent rather than
invented here. The helper carries two budgets, not one:

**Evidence:** `packages/kit/src/identity.ts:48@5b7f9f2` — `export const IDENTITY_TIMEOUT_MS = 250;`

**Evidence:** `packages/kit/src/identity.ts:58@5b7f9f2` — `export const IDENTITY_BUDGET_MS = 600;`

What the kit has never done is spawn a process that *writes*. The constraints
that bind therefore come from the append path, not from the package: it is
fast, holds an advisory lock, runs on every hook event, and must never break a
session.

## Decisions

### 1. The seal is compare-and-swap, not read-modify-write

**Chosen:** `update-ref refs/nullius/runs <new> <old>` — git's own compare-and-swap
— inside a retry loop bounded at **five attempts** and by the total budget of
Decision 3, whichever is reached first. On exhaustion the journal is left
unsealed, the exhaustion is announced on stderr, and `doctor` counts it; nothing
is partially written.

Five is chosen against the shape of the contention, not as a round number. Each
loss costs one lost race against another *session ending* — an event that occurs
once per session, not once per hook — so five consecutive losses means five
other sessions ended inside this one's seal window. At that point the retry is
no longer the mechanism that will fix it, and the sweep is: the working file is
still on disk and `witness seal` reclaims it later at no cost. The bound exists
to hand the problem to the recovery path, not to eventually win.

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

### 3. Git failure is never a recording failure — but it is never silent either

**Chosen:** every git call is best-effort, bounded by a per-call timeout *and* a
total budget for the seal as a whole, and never throws into the append path. A
failed or abandoned seal leaves the working file, **writes one line to stderr
saying so**, and ends the session normally; `doctor` counts it unsealed.

**Rationale:** hooks fail open. That constraint does not bend for durability, and
a durability mechanism that can break a session is worse than no durability.

Failing open is not the same as failing quietly, and the distinction is already
settled in this codebase. The recorder hook swallows nothing:

**Evidence:** `plugin/hooks/witness-record.sh:44@5b7f9f2` — `# confusion this tool exists to prevent. So: still exit 0, but say so.`

The reason given there transfers exactly: a swallowed failure makes a broken
install and a session in which nothing happened look identical. An unsealed
journal that announced itself is a fact someone can act on; one that did not is
discoverable only by whoever independently thinks to run `doctor`, which is the
shape of absence this project is named after.

**Two budgets, not one.** The per-call timeout bounds one `update-ref`; the seal
is four calls per attempt times N retries, and contention is the expected case
rather than the exceptional one. The precedent states the reason a per-call
bound alone is insufficient:

**Evidence:** `packages/kit/src/identity.ts:53@5b7f9f2` — `* The per-call timeout bounds one `rev-parse`; without a total, resolution`

Identity resolution runs before the lock and so its total must clear the lock
deadline. The seal runs after the lock is released, so its budget answers to a
different question — how long a session may spend exiting — and is therefore
allowed to be larger than `IDENTITY_BUDGET_MS`. It is not allowed to be absent.

### 5. The seal is two separable steps, because the concurrency test needs a seam

**Chosen:** the seal exposes `readRefTip()` and `attemptCas(newCommit, oldTip)`
as separately callable units, with the retry loop composed from them. Retries do
not back off.

**Rationale:** this is a testability constraint that determines implementation
shape, so it is recorded as a decision rather than left to the implementer.

The load-bearing test for this whole change is "two seals racing the same ref
both land," and it is only load-bearing if it *fails* against a bare unguarded
`update-ref`. Two real processes racing on a local filesystem rarely collide in
the read-tip→write window, so the obvious two-subprocess test passes whether or
not the compare-and-swap is there — a test that certifies the defect it was
written to catch. With the seam, one test process interleaves two logical
sealers deterministically: A reads the tip, B seals completely, A's now-stale
`oldTip` goes to a *real* `update-ref`, git rejects it, A retries and lands.
Nothing is mocked; the CAS under test is git's.

Written as one opaque function, that test cannot be written at all, which is why
the shape is fixed here and not discovered in Stage 4.

**No backoff** keeps retry-exhaustion testable without an injectable clock or a
sleep. Contention here is a handful of concurrent sessions, not a thundering
herd, and the total budget from Decision 3 is the backstop that a backoff would
otherwise provide.

### 6. Write-capable git extends the kit's own helper

**Chosen:** the seal's git calls live with the kit's existing bounded-git
discipline in `packages/kit/src/identity.ts`, under their own timeout and
budget constants — not the kernel's reader, and not a third spawn path.

**Rationale:** the alternative was never live. The kernel's `revFileReader`
reads *a file at a rev* and cannot express `hash-object`, `mktree`,
`commit-tree` or `update-ref`; `add-journal-identity` recorded that rejection in
the code itself rather than only in its proposal:

**Evidence:** `packages/kit/src/identity.ts:30@5b7f9f2` — `* `revFileReader` in the kernel is not the reuse candidate for any of this: it`

So the real question is whether a module named for identity resolution should
own a write path. It should: what is being reused is the discipline — `shell:
false`, an argument vector, a timeout, a `SIGKILL`, every error folded into one
"no answer" — and two implementations of that discipline is the thing worth
avoiding. The seal gets its own budget constants because it answers to a
different deadline (Decision 3), not its own spawn helper.

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

- No threshold is defined at which ref growth should concern a project. Measured
  on this repository: seven journals totalling 256K, the largest 228K. One commit
  per sealed session is cheap and the ref is prunable by deletion, so this is a
  question for a later change rather than a gap in this one.
- Whether the sealing race deserves a real-process CI gate alongside the
  deterministic seam test, modelled on the parallel-append step already in
  `ci.yml`. Decision 5 makes the unit test genuinely load-bearing, which is what
  the change needs to ship; a real-process gate would additionally cover the
  spawn boundary the seam test steps around. Carried as an open concern on the
  PR, not scoped here.

Resolved during pre-review, and recorded above rather than here: the retry bound
and exhaustion behaviour (Decisions 1, 3 and 5), and where the kit's
write-capable git lives (Decision 6).
