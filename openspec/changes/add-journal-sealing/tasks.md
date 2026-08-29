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
- [ ] 1.1a **State `readRefTip()`'s failure contract.** It must distinguish "the
      ref does not exist yet" (a legitimate first seal, `<old>` is the zero OID)
      from "the tip cannot be read" (`unavailable`). The predicate in 1.3a keys
      on this, so an undefined contract here makes the predicate undefined
- [ ] 1.2 **Expose the seam Decision 5 requires**: `readRefTip()` and
      `attemptCas(newCommit, oldTip)` are separately callable, and the retry
      loop is composed from them. Not an internal detail — task 4.1's test
      cannot be written against one opaque function, and a retry loop written
      opaquely first will have to be taken apart later
- [ ] 1.3 **Compare-and-swap the ref**: `update-ref refs/nullius/runs <new> <old>`.
      Never a bare two-argument `update-ref` — that is the read-modify-write
      this change exists to avoid
- [ ] 1.3a **Decide retryability from ref state, never from git's error text.**
      After a failed `update-ref`, re-read the tip:
      unreadable → `unavailable`, stop;
      moved from the `<old>` passed → `contended`, retry against the new tip;
      unchanged → `blocked`, one retry then stop.
      **Do not parse the error message.** Three drafts tried and each failed
      differently; git's error text is not an interface and enumeration never
      closed (review found a fifth and sixth shape after the table claimed
      four). A stale lockfile — which is permanent and reads identically to a
      live one — falls out correctly here because the tip has not moved
- [ ] 1.3a-i **`blocked` is capped at three attempts.** A live held lock is
      transient and presents as `blocked`; a stale one is permanent and presents
      identically. Three covers the live case generously (~120 ms) and costs the
      stale case ~4% of the budget. Not one — a lockfile collision takes this arm
      rather than `contended`, because `contended` requires a peer to have landed
      *and released*, so at high contention a cap of one abandons seals
- [ ] 1.3a-ii **On a moved tip, compare it against the commit this seal built.**
      If they match, the outcome is `landed`, not `contended`: `update-ref` can be
      SIGKILLed on timeout *after* the write landed, and without this comparison
      the seal retries and commits its own journal twice
- [ ] 1.3b **The total git budget is the bound. There is no global attempt
      ceiling** — a `contended` retry requires a peer to have landed, so the loop
      cannot spin without the system making progress, and the `blocked` arm has
      its own cap of three from 1.3a-i. **No backoff** (Decision 5)
- [ ] 1.4 **Two budgets, not one** (Decision 3): a per-call timeout *and* a total
      for the seal as a whole, as constants in `seal.ts` mirroring
      `IDENTITY_TIMEOUT_MS` / `IDENTITY_BUDGET_MS`. The seal's total may exceed
      `IDENTITY_BUDGET_MS` — it runs after the lock is released and answers to
      how long a session may spend exiting, not to the lock deadline — but it
      may not be absent, and it must sit under the harness's own `SessionEnd`
      timeout. `SEAL_TIMEOUT_MS` 200, `SEAL_BUDGET_MS` 3 000 (Decision 3). Budget for
      **seven** calls on a failed attempt — the six that build and write, plus the
      predicate's own re-read — and six on a retry. At 200 ms that is 1 400 + 1 200,
      inside 3 000 even when every call times out; at 250 ms it is 3 250 and the
      retry gets cut off. Budget for **six** calls per attempt (`readRefTip`,
      `hash-object`, the tip's tree read, `mktree`, `commit-tree`,
      `update-ref`), four of which repeat on every retry
- [ ] 1.5 On exhaustion or any git failure: leave the journal unsealed and the
      working file intact. No partial write, no thrown error, no non-zero exit —
      **and one line on stderr naming how many journals were not sealed and
      why** — the count, not "the journal", because a batched sweep abandons all
      N together.
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
- [ ] 4.2 Budget exhaustion leaves the journal unsealed and the file intact, and
      says so on stderr. **Drive it by side-effecting the 1.2 seam**: wrap
      `readRefTip` so each call lands a real competing commit before returning,
      making every attempt return `contended` against real git. Inject a reduced
      `SEAL_BUDGET_MS` for this test rather than burning the real 3 000 ms —
      the property under test is "budget exhausted → unsealed, intact, announced",
      and it is the same property at 300 ms. Do **not** reach for
      `identity.lock.test.ts`'s `spawnSync` interception: it only observes and
      never fakes, so it cannot force a failure
- [ ] 4.2a **Batched exhaustion**: seed N≥2 journals, exhaust the sweep's budget
      by the same reduced-budget technique as 4.2,
      and assert **all N** stay unsealed with their working files intact and the
      **count** named on stderr. 4.2 alone cannot catch this — it is 4.5a's
      argument applied to the failure side, and the spec now makes the plural
      normative
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
- [ ] 4.5b **The held-lock branch, at the `attemptCas` layer**: write
      `<gitdir>/refs/nullius/runs.lock` directly, call `attemptCas`, assert it
      returns `blocked` (tip unchanged) — **not** `contended` and not
      `unavailable`. Remove the lock, call again, assert it lands. This drives
      `attemptCas` directly with the test toggling the lock between two calls;
      it does **not** exercise the composed retry loop, which 4.5b-i covers.
      Writing the lockfile is git's own documented mechanism, not a mock
- [ ] 4.5b-i **The stale-lock branch is the same setup with the opposite
      outcome**: leave the lock in place, assert the seal stops after exactly one
      retry, says so on stderr, and does **not** consume its budget. Assert the
      attempt count via the `spawnSync`-interception *observation* pattern in
      `packages/kit/src/identity.lock.test.ts`, which counts calls without faking
      them — a wall-clock assertion would work too but is flakier
- [ ] 4.5c **A corrupt ref stops the seal without consuming the budget**: write
      a non-OID into the ref and assert the seal stops within the `blocked` cap
      and announces itself. Note what this does **not** assert: `readRefTip`
      cannot tell a corrupt ref from an absent one (`rev-parse --verify --quiet`
      exits 1 with empty stdout for both), so the corrupt case is *expected* to
      present as `blocked` rather than `unavailable`. Assert the call count, not
      just the verdict, so "does not consume its budget" is checked rather than
      assumed
- [ ] 4.5d **The first seal, uncontended** — the most common real path, and
      currently untested. A brand-new repository with no `refs/nullius/runs`:
      assert `readRefTip` reports the no-ref sentinel, the seal passes the zero
      OID, `update-ref` succeeds on the first attempt, and the ref's tree carries
      the journal. 4.1 exercises first-seal only *through* a race and the sweep
      tests do not isolate it
- [ ] 4.5e **`readRefTip`'s no-ref sentinel is distinct from its failure value**
      (task 1.1a): assert the fresh-repo case returns the sentinel and that it is
      not the same value the unreadable case returns
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
