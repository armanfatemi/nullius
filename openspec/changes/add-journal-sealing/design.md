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
— inside a retry loop **bounded by the total git budget of Decision 3**, with an
attempt ceiling as a secondary guard only. On exhaustion the journal is left
unsealed, the exhaustion is announced on stderr, and `doctor` counts it; nothing
is partially written.

**The budget is the bound; the attempt ceiling is not.** An attempt count is the
wrong primary bound because the number of attempts a seal needs is a function of
how many other sealers are active, which the seal cannot know. A wall-clock
budget is a function of what the session can afford to spend exiting, which it
can. The ceiling exists for one case the budget does not cover: git failing
*instantly* and repeatedly, where a budget alone would spin. Set it well above
the contending population — the loop should reach it only when something is
wrong, never in the course of ordinary contention.

**Retry on contention, which is not the same as retry on compare failure.** The
ref can refuse a write for two reasons, and only one of them is a compare
mismatch: another process may hold `refs/nullius/runs.lock` in the shared common
directory. Git reports both the same way — exit 128, with a message opening
`cannot lock ref 'refs/nullius/runs'`, differing only in the trailing clause
(`is at <a> but expected <b>` versus `Unable to create '...lock': File exists`).
A predicate written as "the compare failed" is therefore not implementable from
an exit code, and a seal that abandons on a held lock loses journals through the
guard rather than around it.

So `attemptCas` reports three outcomes, not two: `landed`, `contended` (another
sealer is touching this ref — retryable), and `unavailable` (anything else — not
retryable, and the seal stops and says so).

**`contended` is a positive match; everything unmatched is `unavailable`.** This
is the load-bearing half of the decision, and the opposite of the natural
implementation. `cannot lock ref` is not a sufficient discriminator: measured
against real git, four distinct failures share it, and only two are transient.

| trailing clause | cause | outcome |
| --- | --- | --- |
| `is at <a> but expected <b>` | compare mismatch | `contended` |
| `Unable to create '...lock': File exists` | another process holds the lock | `contended` |
| `Unable to create '...lock': Permission denied` | read-only refs directory | `unavailable` |
| `unable to resolve reference '...': reference broken` | corrupt ref | `unavailable` |

Note that the two `Unable to create '...lock'` rows disagree, so the clause
cannot be split at its opening either — the discrimination has to reach the
final phrase.

Matching on failure text is brittle in one specific direction, and the direction
is what matters. If the predicate is written as "retry unless it looks
permanent", then every failure git learns to word differently becomes
retryable, and a permanent fault — a broken ref, a read-only `.git` — burns the
entire budget at **every session end, forever**, while `doctor` reports the
journal unsealed and never says why. That is this repository's own failure mode
manufactured by the guard meant to prevent it.

Written the other way round, an unrecognised failure is `unavailable`: the seal
stops, announces itself on stderr, and leaves the journal for the sweep. The
cost of misclassifying a transient failure as permanent is one deferred seal
that the next sweep reclaims. The cost of the inverse is unbounded. So the
predicate matches the two known-transient shapes and treats everything else,
including anything git may word differently in future, as permanent.

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
for this tool, and the change that deferred sealing to this one is scaled for
sixty-four of them:

**Evidence:** `openspec/changes/add-journal-identity/design.md:58@a1a6a54` — `Across sixty-four concurrent journals, "fix the compiler errors in bun_runtime"`

**Evidence:** `openspec/changes/add-journal-identity/design.md:178@a1a6a54` — `## Decision 4 — sealing moved to `add-journal-sealing``

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

**A sweep is one commit, not N.** `witness seal` finding N unsealed journals
builds a single tree carrying all N and issues one `update-ref`. The obvious
implementation — seal each journal in turn — makes the recovery mechanism
contend with itself: N ref updates from one process, each of which can lose to
the next, so the tool that exists to reclaim unsealed journals becomes the
largest producer of ref contention in the system. Batching removes that
entirely, and it is also the cheaper shape: one `commit-tree`, one ref write,
one commit in the log per sweep rather than N.

### 3. Git failure is never a recording failure — but it is never silent either

**Chosen:** every git call is best-effort, bounded by a per-call timeout *and* a
total budget for the seal as a whole, and never throws into the append path. A
failed or abandoned seal leaves the working file or files, **writes one line to
stderr saying so**, and ends the session normally; `doctor` counts them unsealed.

Note the plural. Since Decision 2 makes a sweep one atomic commit for N
journals, an exhausted sweep abandons all N rather than one. That is acceptable
and is not a loss — every working file survives untouched, so the next sweep
reclaims the whole set — but it is latency proportional to N, and the stderr
line must name the count rather than a journal.

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

**Two budgets, not one.** The per-call timeout bounds one `update-ref`; a seal
attempt is **six** calls, not four — `readRefTip`, `hash-object`, a tree read of
the current tip, `mktree`, `commit-tree`, `update-ref` — and a retry repeats the
last four because the tree must be rebuilt onto the tip that displaced it. Times
N retries, with contention as the expected case rather than the exceptional one.
The precedent states the reason a per-call bound alone is insufficient:

**Evidence:** `packages/kit/src/identity.ts:53@5b7f9f2` — `* The per-call timeout bounds one `rev-parse`; without a total, resolution`

Identity resolution runs before the lock and so its total must clear the lock
deadline. The seal runs after the lock is released, so its budget answers to a
different question — how long a session may spend exiting — and is therefore
allowed to be larger than `IDENTITY_BUDGET_MS`. It is not allowed to be absent.

**The numbers.** `SEAL_TIMEOUT_MS` is 500 per call and `SEAL_BUDGET_MS` is 3 000
for the seal as a whole. Both are larger than identity's 250/600 because the
seal writes and runs off the lock; both are chosen to be a fraction of any
plausible hook timeout rather than to consume one.

3 000 ms does not buy sixty-four serialized attempts, and is not meant to. At
six calls an attempt that is roughly five to ten attempts on a warm repository —
enough that ordinary contention lands, and deliberately not enough that a losing
seal holds a session open while it keeps trying. Past that the sweep is the
right mechanism and the budget's job is to hand over to it. Sizing the budget to
win at sixty-four contenders would be sizing the *session exit* to the worst
case of a background durability mechanism, which inverts what matters.

That "different question" has a limit this design does not get to set. Nothing
*local* waits on the seal: `cli.ts` returns as soon as `appendRecords` has
returned, so no other hook in this process is blocked. But the seal runs inside a
blocking `SessionEnd` hook, and the harness running that hook has a timeout of
its own that no document here names. The budget is therefore chosen to sit
comfortably under any plausible one rather than to consume what is available,
and the seal must remain correct when killed mid-loop — which it is, because
every attempt is a single atomic `update-ref` and a killed seal simply leaves the
journal for the sweep.

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

**No backoff, and the reason is not testability.** Testability was the reason
first offered, and it is the wrong one: choosing runtime behaviour to suit a test
is exactly the coupling that makes a seam objectionable, and a backoff would in
any case only need an injectable clock, which this codebase can afford.

A second attempt at a rationale argued that Decision 2's batching removes the
herd. That is also wrong, and wrong against this document's own neighbour:
batching removes the *sweep's* self-contention and does nothing to the session-end
population, which Decision 1 explicitly scales to sixty-four concurrent journals.
A herd is exactly what this tool's normal case is.

**The honest position is that no backoff is the starting point, not the answer.**
What is actually known: git's `update-ref` failure is cheap and immediate, so a
tight loop is not the CPU hazard it would be against a network service; the loop
is bounded by wall clock rather than attempts (Decision 1), so an unlucky seal
gives up on time rather than spinning; and the working file survives every
outcome, so the worst case of losing every race is a deferred seal, not a lost
journal. What is not known is the actual collision rate at sixty-four
contenders, and nothing in this change measures it.

So: ship without backoff, and treat the retry-attempt counts the seal already
has to observe as the measurement. If seals are routinely reaching their budget,
the first change is backoff with an injectable clock; the seam from this decision
makes that a local edit. Recording it this way, rather than as a decided
question, is the point — a rationale that has now failed twice should not get a
third confident restatement.

### 6. The seal gets its own runner, in its own module

**Chosen:** a new `packages/kit/src/seal.ts` with its own bounded-git runner.
It copies the *discipline* of `identity.ts`'s runner — `shell: false`, an
argument vector, a per-call timeout, `SIGKILL`, a capped buffer, no throw — and
shares none of its code.

**Rationale.** An earlier draft of this decision put the seal's git calls into
`packages/kit/src/identity.ts`, arguing that reusing the discipline meant
reusing the helper and that two implementations of one discipline is the thing
worth avoiding. That argument does not survive reading the helper. `runGit` is
private, and three properties make it unusable here rather than merely
inconvenient:

- It hardcodes `input: ""`, and deliberately so — a git subcommand that decides
  to prompt would otherwise hold the hook open for its whole timeout. But
  `mktree` reads its tree entries from stdin, so the seal cannot use a runner
  that guarantees stdin is empty.
- It collapses every failure into `null`, which is right for identity — the
  caller's response to a missing binary and a non-zero exit is the same, omit
  the field — and wrong for the seal, which must distinguish `contended` from
  `unavailable` to know whether to retry at all (Decision 1).
- It returns `null` for empty stdout as well as for failure. A *successful*
  `update-ref` prints nothing and exits 0, so `runGit` maps the seal's success
  onto the same value it uses for a missing git binary. This one is fatal on its
  own: the seal could not tell whether it had sealed.

**Evidence:** `packages/kit/src/identity.ts:271@a1a6a54` — `  if (result.error !== undefined || result.status !== 0) return null;`

**Evidence:** `packages/kit/src/identity.ts:273@a1a6a54` — `  return out.length > 0 ? out : null;`

A second runner is needed whichever file it lives in, so "one implementation of
the discipline" was never available to buy. What placement decides is only
whether `identity.ts` keeps its stated contract, and it should:

**Evidence:** `packages/kit/src/identity.ts:15@a1a6a54` — `**2. No git call may run while the append lock is held.** The expensive case`

That module documents itself as resolution that happens *before* the lock, and
`journalFile.ts` spawning nothing is part of the same argument. The seal is a
write that happens *after* the lock is released, on a different budget, with a
different failure taxonomy. Putting it there would falsify a header contract
that is load-bearing for a different invariant.

The kernel's `revFileReader` was never the alternative — it reads a file at a
rev and cannot express `hash-object`, `mktree`, `commit-tree` or `update-ref`,
and `add-journal-identity` recorded that rejection in the code rather than only
in its proposal:

**Evidence:** `packages/kit/src/identity.ts:30@a1a6a54` — `* `revFileReader` in the kernel is not the reuse candidate for any of this: it`

**The duplication this leaves is real and is accepted.** Two runners in one
package will share roughly a dozen lines of spawn options. The alternative was
one runner with a union return type and an optional stdin parameter, serving two
callers whose contracts agree on nothing except that git should not be trusted
to be fast — and a shared helper whose behaviour is conditional on which caller
invoked it is not one implementation of a discipline, it is two wearing one name.
If a third caller appears, that is the moment to extract the spawn options; two
is not.

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
