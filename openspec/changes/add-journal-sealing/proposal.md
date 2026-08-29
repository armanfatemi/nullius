# Proposal — add-journal-sealing

> **Depends on:** `add-journal-identity`

## Problem

The one artifact that must outlive a run is stored in the most deletable place
available. Journals are written to a working-tree directory:

**Evidence:** `packages/kit/src/journalFile.ts:44@a717cc4` — `export const RUNS_DIR = join(".nullius", "runs");`

which is gitignored:

**Evidence:** `.gitignore:7@a717cc4` — `.nullius/runs/`

Under the run shape this project is built for — many worktrees, ephemeral
containers, agents committing continuously — deleting the worktree deletes the
account of what happened in it, silently. That is the failure this project is
named after, committed by the tool itself.

Nothing seals a journal today. `SessionEnd` exists as a hook, and what it does
is append records to the same file:

**Evidence:** `packages/kit/src/record.ts:145@a717cc4` — `    case "SessionEnd":`

**Evidence:** `packages/kit/src/cli.ts:456@a717cc4` — `  if (event === "SessionEnd" || event === "SubagentStop") {`

That append is durable in the ordinary sense — it is a locked write through the
same path every other event uses:

**Evidence:** `packages/kit/src/journalFile.ts:171@a717cc4` — `export function appendRecords(`

What it is not is durable against losing the worktree, which is the only sense
that matters here. Closing open dispatches as `no-report` writes more lines into
a file that is still gitignored and still deleted with its directory. Nothing
copies, commits, or otherwise moves the journal anywhere that outlives the tree:

**Evidence:** `grep -rn 'refs/nullius' packages/` → 0 results

## Why now

`add-journal-identity` gives a journal a header that names the repository state
it began in. A journal that knows where it came from and still evaporates with
its worktree is half a fix. This is the other half, separated because it carries
a design question that one does not.

## What changes

- **Ref-backed sealing** (kit): at session end the kit writes the journal into
  the git ref `refs/nullius/runs` and leaves the working file in place. Worktrees
  share a git common directory, so a ref is durable, visible from every worktree
  at once, and needs no `.gitignore` negotiation.
- **A concurrency-safe seal.** The seal is a read-modify-write of a shared ref
  and MUST be compare-and-swap with bounded retry. This is the change's central
  design problem and the reason it is its own proposal — see `design.md`
  Decision 1.
- **`witness seal`** (kit): sweeps `.nullius/runs/` for journals the ref does not
  carry, so a session that crashed before its terminal hook is recoverable.
- **`doctor` reports unsealed journals** as a fact rather than a fault, in the
  register it already uses for absence:

  **Evidence:** `packages/kit/src/doctor.ts:330@a717cc4`

  ```
        detail: "no runs/ directory yet — nothing has been recorded, which is not evidence of a fault",
  ```

## Non-goals

- **Per-append ref writes.** One `git hash-object` per hook event, on a path that
  already holds an advisory lock. Sealing at session end is one write.
- **Pushing the ref.** Refs outside `refs/heads` are not pushed by default, which
  is correct — a journal is local evidence until someone chooses otherwise.
- **Cross-journal invariant 2.** Correlating verifications and mutations across
  sealed journals needs targets namespaced by tree. On the record in
  `project.md`, not scoped here.
- **`witness replay`.** Re-running a journal's verifications against the revs
  they name. Needs `verification.rev` from `add-journal-identity` and a producer
  that does not exist.

## Dependencies

### Hard (must be merged before this starts)

`add-journal-identity` — this change seals journals whose headers that change
defines, and reuses the kit git helper it introduces.

### Soft (design assumes these exist; graceful degradation if absent)

None.

### Enables (future changes that will depend on this)

- `witness replay` — a rev-stamped verification is only re-checkable if the
  journal carrying it still exists.
- Cross-run analysis generally: `learn`, rate-based projections, and anything
  that reads across sessions needs journals that outlived their worktrees.

## Size estimate

|                                |                                              |
| ------------------------------ | -------------------------------------------- |
| Estimated tasks                | 14                                           |
| Packages or surfaces touched   | 2 (packages/kit, `.nullius/` docs)           |
| Risk                           | MEDIUM                                       |
| Expected sessions to implement | 1                                            |

MEDIUM, not LOW: the kit gains *write-capable* git — it already spawns git to
read, but never to change anything — and the seal is a concurrent write to
shared state. Neither is exotic, and both are places where a wrong answer is
silent.

## Resolved during pre-review

Two questions this proposal opened were settled before implementation began.
Both are argued in `design.md`; recorded here so the proposal does not read as
though they are still live.

- **Compare-and-swap or a lock?** CAS, bounded at five attempts and by a total
  git budget, announcing exhaustion on stderr and leaving the journal for the
  sweep — `design.md` Decisions 1 and 3. The advisory lock was rejected because
  it is per-journal and per-worktree and so guards the wrong resource.
- **Where does the kit's write-capable git live?** With the kit's existing
  bounded-git discipline, under its own budget constants — `design.md` Decision
  6. This was never a choice between two helpers that fit: the kernel's reader
  cannot express `hash-object`, `mktree`, `commit-tree` or `update-ref`, and
  `add-journal-identity` recorded that rejection in the code rather than only in
  its proposal.

  **Evidence:** `packages/kit/src/identity.ts:30@5b7f9f2` — `* `revFileReader` in the kernel is not the reuse candidate for any of this: it`

  What remains true, and is the constraint the seal must respect, is that the
  locked append path itself spawns nothing:

  **Evidence:** `grep -rn --exclude='*.test.ts' 'child_process' packages/kit/src/journalFile.ts packages/kit/src/record.ts` → 0 results

## Open questions

- **How large does the ref get, and when does that matter?** Measured on this
  repo: seven journals totalling 256K, the largest 228K. One commit per sealed
  session is cheap and the ref is prunable by deletion, but no threshold is
  defined at which a project should care.
- **Does the sealing race also deserve a real-process CI gate?** `design.md`
  Decision 5 makes the deterministic unit test genuinely load-bearing, which is
  what this change needs to ship. A real-process gate modelled on the existing
  parallel-append step would additionally cover the spawn boundary the seam test
  steps around. Carried as an open concern, not scoped here.
