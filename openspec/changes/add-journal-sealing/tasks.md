# Tasks — add-journal-sealing

Kit-only. Lands after `add-journal-identity`, whose bounded-git discipline it
extends and whose journals it seals.

## 0. Prerequisites / setup

- [ ] 0.1 Confirm `add-journal-identity` is merged: the kit's bounded-git helper
      exists in `packages/kit/src/identity.ts` and journal headers carry
      `branch` / `head` / `worktree`
- [ ] 0.2 Read `design.md` Decision 6 before writing any git call. The
      helper-placement question is **settled**: a new `packages/kit/src/seal.ts`
      with its own runner, copying `identity.ts`'s discipline and none of its
      code. Do **not** reuse `runGit` — it hardcodes `input: ""` and `mktree`
      needs stdin, and it returns `null` for empty stdout, which is what a
      *successful* `update-ref` produces. Do not reach for the kernel's
      `revFileReader` either; it reads a file at a rev and cannot express any of
      these subcommands

## 1. Sealing

- [ ] 1.1 Seal one journal: `hash-object` the file, `mktree` the updated tree,
      `commit-tree` onto the current ref tip
- [ ] 1.2 **Expose the seam Decision 5 requires**: `readRefTip()` and
      `attemptCas(newCommit, oldTip)` are separately callable, and the retry
      loop is composed from them. Not an internal detail — task 4.1's test
      cannot be written against one opaque function, and a retry loop written
      opaquely first will have to be taken apart later
- [ ] 1.3 **Compare-and-swap the ref**: `update-ref refs/nullius/runs <new> <old>`.
      Never a bare two-argument `update-ref` — that is the read-modify-write
      this change exists to avoid
- [ ] 1.3a **`attemptCas` reports three outcomes, not two**: `landed`,
      `contended`, `unavailable`. Retry on `contended` only
- [ ] 1.3a-i **`contended` is a positive match on two known-transient shapes;
      everything else is `unavailable`.** Match `is at <a> but expected <b>`
      (compare mismatch) and `Unable to create '...lock': File exists` (another
      process holds the lock). Do **not** key on `cannot lock ref` — four
      measured failures share that prefix and only two are transient; a
      read-only refs directory gives `Unable to create '...lock': Permission
      denied` and a corrupt ref gives `unable to resolve reference '...':
      reference broken`, both permanent. The default direction is the whole
      point: an unrecognised failure treated as retryable makes a permanent
      fault burn the full budget at every session end forever, while treating a
      transient one as permanent costs a single deferred seal the next sweep
      reclaims
- [ ] 1.3b **The total git budget is the bound**, not an attempt count. Keep an
      attempt ceiling only as a guard against git failing instantly in a loop,
      and set it well above the contending population so ordinary contention
      never reaches it. **No backoff** (Decision 5)
- [ ] 1.4 **Two budgets, not one** (Decision 3): a per-call timeout *and* a total
      for the seal as a whole, as constants in `seal.ts` mirroring
      `IDENTITY_TIMEOUT_MS` / `IDENTITY_BUDGET_MS`. The seal's total may exceed
      `IDENTITY_BUDGET_MS` — it runs after the lock is released and answers to
      how long a session may spend exiting, not to the lock deadline — but it
      may not be absent, and it must sit under the harness's own `SessionEnd`
      timeout. `SEAL_TIMEOUT_MS` 500, `SEAL_BUDGET_MS` 3 000 (Decision 3). Budget for **six** calls per attempt (`readRefTip`,
      `hash-object`, the tip's tree read, `mktree`, `commit-tree`,
      `update-ref`), four of which repeat on every retry
- [ ] 1.5 On exhaustion or any git failure: leave the journal unsealed and the
      working file intact. No partial write, no thrown error, no non-zero exit —
      **and one line on stderr saying the journal was not sealed and why.**
      Failing open is not failing quietly; see `plugin/hooks/witness-record.sh`,
      which refuses to let a broken install and an empty session look alike
- [ ] 1.6 Tree entry name is exactly `<session>.jsonl`, fixed by the spec so the
      sweep's membership test has one definition across versions

## 2. Hook wiring

- [ ] 2.1 Seal on `SessionEnd`, **after `appendRecords` returns and the advisory
      lock is released** — once per session, never on the append path. Note the
      existing dispatch-sealing step is a different thing that runs *inside*
      `appendRecords`' callback and therefore under the lock; journal sealing
      must not join it there
- [ ] 2.2 `witness seal` sweeps `.nullius/runs/` for journals the ref does not
      carry, so a crashed session is recoverable. **One commit for all N**, not
      N commits: sealing each in turn makes the recovery mechanism the largest
      producer of ref contention in the system, contending with itself N times
      from a single process
- [ ] 2.3 State in the spec that the ref write inherits the `.nullius` opt-in:
      `witness seal` creates a `refs/nullius/` namespace in the user's
      repository, and nothing should do that on a project that never opted in

## 3. Fail-open behaviour

- [ ] 3.1 No repository, no git binary, a timeout → sealing is skipped, the
      session ends normally, exit 0, and the skip is announced on stderr
- [ ] 3.2 `doctor` reports the unsealed count as a fact, in the register already
      used for an empty runs directory
- [ ] 3.3 `doctor` reports `??` when git cannot answer — never zero unsealed,
      which would claim knowledge it does not have

## 4. Tests

- [ ] 4.1 **The concurrency test is the load-bearing one**: two seals racing the
      same ref both land — and "both land" means **the final ref tree contains
      both `<session>.jsonl` entries**, not merely that both `attemptCas` calls
      returned `landed`. Assert the tree, not the return values. Drive it through the 1.2 seam in a single test
      process — A calls `readRefTip()`, B seals completely, A's now-stale
      `oldTip` goes to a *real* `update-ref`, git rejects it, A retries and
      lands. Nothing mocked; the CAS under test is git's. A naive
      two-subprocess race is **not** acceptable here: two processes rarely
      collide in the read-tip→write window on a local filesystem, so it would
      pass against a bare `update-ref` too
- [ ] 4.1a **Pin the non-vacuity the way this repo already does it.** Do not
      keep a deliberately-unguarded `update-ref` path in the tree to run the
      test against — there is no dual-run harness in either package and adding
      one means shipping dead code for a one-time check. Follow
      `packages/kit/src/identity.lock.test.ts:93-97`: a comment reasoning
      through why this interleaving cannot pass unguarded (a bare
      two-argument `update-ref` overwrites unconditionally, so A's write built
      on the pre-B tree clobbers B's commit and the final tree has no path to
      B's entry), **backed by assertions that fail if the setup did not
      actually happen** — that the tip moved between A's read and A's first
      attempt, and that A's first attempt returned `contended`. A comment alone
      is a claim; the assertions are what make it checkable
- [ ] 4.1b **Assert the retry rebuilds its tree from the *new* tip.** 4.1a's two
      assertions pin that contention was real, not that the outcome is correct:
      an implementation that re-reads the new tip for the CAS compare but
      rebuilds the tree from its stale cached copy satisfies both, lands a
      legitimate CAS, and silently drops B's journal from the tree. The
      tree-contents assertion in 4.1 is what closes this; keep it explicit here
      so it is not dropped as redundant
- [ ] 4.2 Retry exhaustion leaves the journal unsealed and the file intact, and
      says so on stderr. Force it **through the seam with real git** — hold a
      stale `oldTip` across the bound, advancing the ref out from under each
      attempt. Do **not** reach for `identity.lock.test.ts`'s `spawnSync`
      interception: that technique only observes and passes every call through
      to real `spawnSync`, never faking an outcome, so it cannot force a CAS
      failure. The seam makes it unnecessary
- [ ] 4.3 Sealing in a non-repository directory exits 0, records normally, and
      announces the skip
- [ ] 4.4 A sealed journal is readable from a second worktree of the same
      repository, and survives deletion of the one that produced it.
      `packages/kit/src/identity.test.ts` already creates a real second worktree
      via `git worktree add` inside a fast unit test; reuse that technique
- [ ] 4.5 **The sweep**: write journals into `.nullius/runs/` without ever
      reaching `SessionEnd`, run `witness seal`, assert the ref now carries them.
      This is `specs/witness/spec.md`'s "a crashed session leaves an unsealed
      journal, not a lost one" scenario, which 4.3 and 4.4 do not cover
- [ ] 4.5a **Seed at least two journals and assert exactly one new commit.** At
      N=1 a batched sweep and an N-commits sweep are indistinguishable, so a
      single-journal test cannot detect the violation 2.2 exists to prevent.
      Count commits on `refs/nullius/runs` before and after, assert the
      difference is 1, and assert that commit's tree carries both entries
- [ ] 4.5b **The held-lock branch**: write `<gitdir>/refs/nullius/runs.lock`
      directly, call `attemptCas`, assert it returns `contended` and **not**
      `unavailable`; remove the lock and assert the next attempt lands. This is
      `specs/witness/spec.md`'s "a held ref lock is retried, not abandoned"
      scenario. Writing the lockfile is git's own documented mechanism, not a
      mock
- [ ] 4.5c **A permanent fault is not retried**: corrupt the ref (write a
      non-OID into it), assert `attemptCas` returns `unavailable` on the first
      call and that the seal does not consume its budget retrying
- [ ] 4.6 **`doctor`'s positive count**: three journals in `.nullius/runs/`, the
      ref carrying one → `doctor` reports two unsealed and does not fail. This
      is `specs/installer/spec.md`'s "unsealed journals are counted, not failed"
      scenario, which had no task behind it
- [ ] 4.7 `doctor`'s `??` path, asserted on the message and not only the exit
      code. `doctor.cli.test.ts`'s `detailFor` helper is the prior art for 4.6
      and 4.7, which read `doctor`'s structured stdout. It is **not** the prior
      art for the stderr assertions in 1.5, 3.1, 4.2 and 4.3 — those are the
      sealing path's raw stderr, for which `packages/kit/src/witness.cli.test.ts`
      is the precedent

## 5. Documentation

- [ ] 5.1 Document the ref in `.nullius/README.md`, including that refs outside
      `refs/heads` are not pushed by default, which is deliberate
- [ ] 5.2 CHANGELOG: new kit verb, the ref, the fail-open-but-loud guarantee,
      and the retry bound
