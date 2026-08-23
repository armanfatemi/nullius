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

MEDIUM, not LOW: the kit gains process spawning it does not have today, and the
seal is a concurrent write to shared state. Neither is exotic, and both are
places where a wrong answer is silent.

## Open questions

- **Compare-and-swap or a lock?** `update-ref <ref> <new> <old>` gives CAS
  directly and retry-on-mismatch is a loop. The alternative is extending the
  advisory lock the append path already uses. CAS is preferred because it is
  git's own mechanism and needs no new lock discipline, but the retry bound and
  what happens when it is exhausted are unresolved. A seal that gives up must
  leave the journal unsealed and visible to `doctor`, never partially written.
- **Where does the kit's bounded-git helper live?** The kernel already has one:

  **Evidence:** `packages/claims/src/runners.ts:149@a717cc4` — `export function revFileReader(root?: string, timeoutMs = DEFAULT_GIT_TIMEOUT_MS) {`

  and the kit currently spawns nothing at all:

  **Evidence:** `grep -rn --exclude='*.test.ts' 'child_process' packages/kit/src/` → 0 results

  The dependency direction is already kit → kernel, so reusing the kernel's
  bounded reader is available and avoids two implementations of one discipline.
  Inherited from `add-journal-identity`, which defers it here.
- **How large does the ref get, and when does that matter?** Measured on this
  repo: seven journals totalling 256K, the largest 228K. One commit per sealed
  session is cheap and the ref is prunable by deletion, but no threshold is
  defined at which a project should care.
