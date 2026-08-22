# Add journal identity — a journal that knows where it came from, and outlives it

## Why

Two gaps, one root cause: **a journal records what happened and not where.**

A `verification` pins the artifact's hash and nothing else:

**Evidence:** `packages/claims/src/witness.ts:650@541ae94`

```
        verified.set(record.id, target);
        hashes.set(target.path, { hash: target.hash, line: record.line });
```

That hash is enough to invalidate the verification *within* the journal, which
is invariant 2 and works. It is not enough to re-check the verification
afterwards: there is no commit to `git show`, so the one record kind whose
entire purpose is re-verifiability is the one record nobody can reproduce. This
is the unpinned-anchor problem one level up — the journal has `at` on every
record, so it can say *when* but not *against what*. The Evidence Anchors spec
already rejects that shape for documents; the journal is a document.

The second gap is where journals live:

**Evidence:** `packages/kit/src/journalFile.ts:44@541ae94` — `export const RUNS_DIR = join(".nullius", "runs");`

**Evidence:** `.gitignore:7@541ae94` — `.nullius/runs/`

A working-tree path, gitignored. Under the run shape this is built for — many
worktrees, ephemeral containers, agents committing continuously — the one
artifact that must outlive the run is stored in the most deletable place
available. Delete the worktree and the account of what happened there goes with
it, silently, which is the failure this project is named after.

Those two gaps share a fix, and the fix has a third benefit. Worktrees share a
git common directory, so a journal stored in a **ref** is durable, is visible
from every worktree at once, and needs no `.gitignore` negotiation. The
roll-up problem and the durability problem are the same problem.

Which leaves the roll-up itself. `witness validate` reads exactly one file:

**Evidence:** `packages/claims/src/cli.ts:236@541ae94` — `    console.error("usage: nullius witness validate <journal.jsonl>");`

That is the right contract for one run and the wrong one for sixty-four. The
question at that scale is not "is journal 37 internally consistent" but "across
today's 400 dispatches, how many never came back" — and the answer must come
from aggregating verdicts, never from merging records. See Decision 1.

## What Changes

- **Header identity fields** (kernel): the `journal` header MAY carry `branch`,
  `head`, and `worktree`. All three are optional, all three are descriptive,
  and none of them produces a verdict. `head` is defined as *where this run
  began* and explicitly not as the tree any later record was written against —
  in the runs this is built for HEAD moves hundreds of times an hour, and a
  field that silently means something else is a lie by staleness.
- **`verification.rev`** (kernel): an optional lower-case hex commit on
  `verification` records only. `mutation` does not get one — its hash *is* the
  identity of what changed. This field is what a later `witness replay` needs
  and is landed now because a field forgotten now costs a version bump later.
- **No schema version bump.** Kinds are a closed list per version:

  **Evidence:** `packages/claims/src/witness.ts:143@541ae94` — `const KINDS_V03 = [...KINDS_V02, "stage", "finding", "resolution", "check", "decision"] as const;`

  Nothing here changes the set of valid records, so `0.3` still describes them
  exactly. See Decision 3.
- **`witness survey <glob>`** (kernel): validates each journal independently and
  aggregates the *reports*. Prints the summed three-way outcome counts,
  per-journal pass/fail, and journals that reached no terminal record at all.
  It never merges records into one timeline, and the spec says so as a
  requirement rather than as a note.
- **Ref-backed sealing** (kit): at session end the kit writes the journal to
  `refs/nullius/runs` and leaves the working file in place. `witness seal`
  sweeps journals a crashed session never sealed; `doctor` reports unsealed
  journals as a fact rather than a fault.

## Impact

- Affected specs: `witness` (modified — header, new requirements), `installer`
  (modified — doctor surfaces unsealed journals).
- Affected code: kernel (`witness.ts` header scan and `verification` parser,
  `cli.ts` survey command); kit (`journalFile.ts` header draft and sealing,
  `doctor.ts`).
- **New dependency direction in the kit.** Nothing in the kit's shipping code
  spawns a process today:

  **Evidence:** `grep -rn --exclude='*.test.ts' 'child_process' packages/kit/src/` → 0 results

  Reading `branch`/`head` and writing a ref both need git. This is a real
  widening of the kit's surface and it is governed by one rule: **git failure is
  never a recording failure.** No repository, no git binary, a detached HEAD —
  the fields are absent, the seal is skipped, recording proceeds. Hooks fail
  open; that constraint does not bend for provenance.
- No existing journal changes verdict. Every field added here is optional, and
  the header scan already ignores keys it does not know.

## Non-Goals

- **`witness replay`.** Re-running a journal's verifications against the revs
  they name is the payoff, and it is a separate change. This one makes it
  reachable by landing the field.
- **Cross-journal invariant 2.** Two worktrees both contain `src/parser.rs`
  and they are different files. Correlating verifications and mutations across
  journals needs targets namespaced by tree, and getting it wrong emits
  `STALE-VERIFICATION` for events that never happened. On the record in
  `project.md`, not scoped here.
- **Per-append ref writes.** One `git hash-object` per hook event, on a path
  that already holds an advisory lock. Sealing at session end is one write.
- **A producer for `verification`.** It still has none. `rev` is a field on a
  record nothing emits, which is the same bet v0.2 made on `mutation` and v0.3
  made on the ledger kinds — and the reason the field has to be right now.
