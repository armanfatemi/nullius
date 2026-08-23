# Tasks — add-journal-sealing

Kit-only. Lands after `add-journal-identity`, whose git helper it reuses and
whose journals it seals.

## 0. Prerequisites / setup

- [ ] 0.1 Confirm `add-journal-identity` is merged: the kit git helper exists and
      headers carry `branch` / `head` / `worktree`
- [ ] 0.2 Resolve the helper-placement question that change deferred here —
      reuse the kernel's bounded-git reader, or build the kit's own. Decide
      before writing the seal, not during

## 1. Sealing

- [ ] 1.1 Seal one journal: `hash-object` the file, `mktree` the updated tree,
      `commit-tree` onto the current ref tip
- [ ] 1.2 **Compare-and-swap the ref**: `update-ref refs/nullius/runs <new> <old>`,
      retrying on mismatch with a bounded count. Never a bare two-argument
      `update-ref` — that is the read-modify-write this change exists to avoid
- [ ] 1.3 On retry exhaustion: leave the journal unsealed and the working file
      intact. No partial write, no thrown error, no non-zero exit
- [ ] 1.4 Tree entry name is exactly `<session>.jsonl`, fixed by the spec so the
      sweep's membership test has one definition across versions

## 2. Hook wiring

- [ ] 2.1 Seal on `SessionEnd`, after the existing dispatch-sealing step, once
      per session — never on the append path
- [ ] 2.2 `witness seal` sweeps `.nullius/runs/` for journals the ref does not
      carry, so a crashed session is recoverable

## 3. Fail-open behaviour

- [ ] 3.1 No repository, no git binary, a timeout → sealing is skipped, the
      session ends normally, exit 0
- [ ] 3.2 `doctor` reports the unsealed count as a fact, in the register already
      used for an empty runs directory
- [ ] 3.3 `doctor` reports `??` when git cannot answer — never zero unsealed,
      which would claim knowledge it does not have

## 4. Tests

- [ ] 4.1 **The concurrency test is the load-bearing one**: two seals racing the
      same ref both land. Write it so it fails against a bare `update-ref` — a
      test that passes either way tests nothing
- [ ] 4.2 Retry exhaustion leaves the journal unsealed and the file intact
- [ ] 4.3 Sealing in a non-repository directory exits 0 and records normally
- [ ] 4.4 A sealed journal is readable from a second worktree of the same
      repository, and survives deletion of the one that produced it
- [ ] 4.5 `doctor`'s `??` path, asserted on the message and not only the exit code

## 5. Documentation

- [ ] 5.1 Document the ref in `.nullius/README.md`, including that refs outside
      `refs/heads` are not pushed by default, which is deliberate
- [ ] 5.2 CHANGELOG: new kit verb, the ref, and the fail-open guarantee
