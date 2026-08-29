# Tasks — add-journal-sealing

Kit-only. Lands after `add-journal-identity`, whose bounded-git discipline it
extends and whose journals it seals.

## 0. Prerequisites / setup

- [ ] 0.1 Confirm `add-journal-identity` is merged: the kit's bounded-git helper
      exists in `packages/kit/src/identity.ts` and journal headers carry
      `branch` / `head` / `worktree`
- [ ] 0.2 Read `design.md` Decision 6 before writing any git call. The
      helper-placement question is **settled**, not open: write-capable git
      extends the kit's own bounded-git discipline in `identity.ts` under its
      own timeout and budget constants. Do not reach for the kernel's
      `revFileReader` — it reads a file at a rev and cannot express
      `hash-object`, `mktree`, `commit-tree` or `update-ref`, and
      `add-journal-identity` already recorded that rejection in the code

## 1. Sealing

- [ ] 1.1 Seal one journal: `hash-object` the file, `mktree` the updated tree,
      `commit-tree` onto the current ref tip
- [ ] 1.2 **Expose the seam Decision 5 requires**: `readRefTip()` and
      `attemptCas(newCommit, oldTip)` are separately callable, and the retry
      loop is composed from them. Not an internal detail — task 4.1's test
      cannot be written against one opaque function, and a retry loop written
      opaquely first will have to be taken apart later
- [ ] 1.3 **Compare-and-swap the ref**: `update-ref refs/nullius/runs <new> <old>`,
      retrying on mismatch, bounded at **five attempts** and by the seal's total
      git budget, whichever is reached first. Never a bare two-argument
      `update-ref` — that is the read-modify-write this change exists to avoid.
      **No backoff between retries** (Decision 5): backoff would make 4.2 need
      an injectable clock, and the total budget is the backstop
- [ ] 1.4 **Two budgets, not one** (Decision 3): a per-call timeout *and* a total
      for the seal as a whole, as separate exported constants alongside
      `IDENTITY_TIMEOUT_MS` / `IDENTITY_BUDGET_MS`. The seal's total may exceed
      `IDENTITY_BUDGET_MS` — it runs after the lock is released and answers to
      how long a session may spend exiting, not to the lock deadline — but it
      may not be absent
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
      carry, so a crashed session is recoverable
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
      same ref both land. Drive it through the 1.2 seam in a single test
      process — A calls `readRefTip()`, B seals completely, A's now-stale
      `oldTip` goes to a *real* `update-ref`, git rejects it, A retries and
      lands. Nothing mocked; the CAS under test is git's.
      **Assert the test fails against a bare two-argument `update-ref`** — a
      naive two-subprocess race passes either way, because two processes rarely
      collide in the read-tip→write window on a local filesystem, and a test
      that passes either way tests nothing
- [ ] 4.2 Retry exhaustion leaves the journal unsealed and the file intact, and
      says so on stderr. Force it with the `spawnSync`-interception technique in
      `packages/kit/src/identity.lock.test.ts`, which transfers directly given
      1.3's no-backoff rule
- [ ] 4.3 Sealing in a non-repository directory exits 0, records normally, and
      announces the skip
- [ ] 4.4 A sealed journal is readable from a second worktree of the same
      repository, and survives deletion of the one that produced it.
      `packages/kit/src/identity.test.ts` already creates a real second worktree
      via `git worktree add` inside a fast unit test; reuse that technique
- [ ] 4.5 **The sweep**: write a journal into `.nullius/runs/` without ever
      reaching `SessionEnd`, run `witness seal`, assert the ref now carries it.
      This is `specs/witness/spec.md`'s "a crashed session leaves an unsealed
      journal, not a lost one" scenario, which 4.3 and 4.4 do not cover
- [ ] 4.6 **`doctor`'s positive count**: three journals in `.nullius/runs/`, the
      ref carrying one → `doctor` reports two unsealed and does not fail. This
      is `specs/installer/spec.md`'s "unsealed journals are counted, not failed"
      scenario, which had no task behind it
- [ ] 4.7 `doctor`'s `??` path, asserted on the message and not only the exit
      code. `doctor.cli.test.ts`'s `detailFor` helper is the prior art

## 5. Documentation

- [ ] 5.1 Document the ref in `.nullius/README.md`, including that refs outside
      `refs/heads` are not pushed by default, which is deliberate
- [ ] 5.2 CHANGELOG: new kit verb, the ref, the fail-open-but-loud guarantee,
      and the retry bound
