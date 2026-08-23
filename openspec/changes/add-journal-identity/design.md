# Design — add-journal-identity

## Context

The journal was designed to answer one question well: does a run's account of
itself hold together? It does. Every failure it catches is internal — a
dispatch with no terminal, a reliance on a verification whose artifact moved,
an append that says nothing.

What it cannot do is leave the file. Ask "was this verification still true a
week later", "did these two worktrees agree about `src/parser.rs`", or "where
is the journal for the run that produced this commit", and the schema has no
answer, because it records time and never place.

This change adds place. It adds no verdict, which is deliberate: a verdict that
depends on a field no producer emits yet is a verdict that fires on nobody.

## Goals / Non-Goals

**Goals:**

- A journal names the repository state it began in.
- A `verification` can be re-checked after the fact.
- A journal survives the worktree that produced it.
- Sixty-four journals produce one number without becoming one journal.

**Non-Goals:**

- `witness replay`, cross-journal invariant 2, per-append ref writes, a
  producer for `verification`. All four are named in the proposal with reasons.

## Decision 1 — `survey` aggregates reports; it must never merge records

The obvious implementation is to concatenate journals and validate the result.
It is wrong, and not marginally.

A `verification` and a `mutation` are correlated by `target.path`. Four
worktrees each contain `src/parser.rs`, and they are four different files. Merge
those timelines and worktree 3's mutation invalidates worktree 1's verification:
a `STALE-VERIFICATION` for an event that did not happen. The repo has already
paid for this exact class of bug once, from the other direction — path
normalisation exists in the recorder precisely so a mutation recorded absolute
cannot fail to invalidate a verification recorded relative.

**Evidence:** `packages/kit/src/record.ts:54@541ae94` — `   * what it compares it *under* — so a mutation recorded absolute would never`

A validator that invents failures is worse than one that misses them, because
the invented ones teach people to pass `continue-on-error`.

The id collisions are the smaller argument, but real: where the harness omits
`tool_use_id` the recorder falls back to a content hash of the dispatch input.

**Evidence:** `packages/kit/src/record.ts:28@541ae94`

```
 *    `tool_use_id`, the join falls back to a content hash of the dispatch
```
Across sixty-four concurrent journals, "fix the compiler errors in bun_runtime"
dispatched twice collides far more often than it does inside one session.

And there is a property worth protecting for its own sake: `check` returns the
same verdict for a document no matter what else was checked in the same run.
`validate` has that property today. Aggregating reports keeps it; merging
records destroys it.

So `survey` runs `validate` per journal and sums the outputs. The summed number
that matters is the three-way outcome count, kept three numbers for the same
reason one journal keeps them three.

**Rejected:** teaching `validate` to accept globs. It is a CI gate people have
already wired, and a verb that sometimes-aggregates invites exactly the merge
semantics ruled out above.

## Decision 2 — `head` means where the run began, and the spec says so

HEAD moves during a session. In the runs this is built for it moves hundreds of
times an hour, so a header field called `head` is true at exactly one instant
and misleading afterwards.

Three options were considered:

1. **Header only, defined narrowly.** One `git rev-parse` per session, at first
   append. Cheap, honest, and useless for any record but the first.
2. **A `checkpoint` record when HEAD changes.** Accurate, and requires the
   recorder to detect commits — which means a git call on tool events it
   currently ignores, on a path that must stay fast and fail open.
3. **`rev` on every record.** One git call per hook event. Rejected on cost
   alone.

Option 1, plus `rev` on `verification` only. The narrow definition is the whole
of it: a field whose meaning is "the tree this session started in" is useful and
safe; the same field silently read as "the tree this record was written
against" is the staleness the `@rev` design exists to escape. It goes in the
spec text as a definition, not a note, because a caveat that lives only in a
comment gets read as absent.

`verification` gets `rev` because it is the only kind that makes a claim
intended to be checked again. `mutation` does not need one — its hash is the
identity of what changed, and a mutation asserts nothing to re-verify.

## Decision 3 — additive optional fields do not bump the schema

The house rule is that kinds are a closed list per version, and it exists so
schema drift is diagnosable. It is a rule about **which records are valid**.

Nothing here changes that set. `branch`, `head`, `worktree`, and
`verification.rev` are optional, descriptive, and produce no verdict; a `0.3`
journal without them is exactly as valid as one with them. Bumping to `0.4`
would buy nothing and cost something real: an older kernel reading a newer
journal stops at `UNSUPPORTED-VERSION` and reports nothing at all, which is a
hard failure traded for a cosmetic gain.

So the rule this change writes down explicitly:

> A version bump is required when the set of valid records changes — a new
> kind, a new member of a closed vocabulary, or a new verdict. It is not
> required for additive optional metadata that no verdict reads.

The moment `witness replay` makes absence of `rev` meaningful, that is a new
verdict, and it takes the bump with it.

## Decision 4 — sealing moved to `add-journal-sealing`

Ref-backed durability was scoped here originally. Review found the seal path as
specified — `hash-object` → `mktree` → `commit-tree` → `update-ref` against one
shared ref, reusing the existing tree — is a read-modify-write with no
compare-and-swap, so two sessions sealing concurrently drop one journal from the
ref. That is recoverable (the working file survives and a sweep re-seals it) but
it is a silent write loss in the mechanism whose entire purpose is not losing
the record.

Resolving it is a design question about ref concurrency, not about identity, and
this change's schema half is the time-sensitive part. The full text of the
original decision — the three ref shapes considered and why the commit chain won
— moves with it to `add-journal-sealing/design.md`.

## Decision 5 — git failure is never a recording failure

The kit ships no process spawning at all today.

**Evidence:** `grep -rn --exclude='*.test.ts' 'child_process' packages/kit/src/` → 0 results
 Adding git touches the one
constraint that has no exceptions: a hook that cannot run must never break the
session.

So every git read in this change is best-effort and every failure is silent in
the journal and loud in `doctor`:

- Not a repository, no git binary, a timeout → `branch`/`head`/`worktree` are
  absent from the header. Absent is a valid header.
- Detached HEAD → `head` is written, `branch` is absent. Not "HEAD", not
  "(detached)" — a closed-vocabulary sentinel invented here would be a fact
  nobody can check.

`doctor` is where the silence gets a voice, which is what it is for.

## Decision 6 — `worktree` is an identity, not a path

The obvious value is the absolute worktree path. It is also a home directory,
and the probe corpus already had to redact absolute paths out of captured hook
payloads before committing them:

**Evidence:** `spec/fixtures/probes/claude-code/README.md:12@541ae94` — `per event). Absolute paths under the capturing machine's home directory were`

`worktree` is therefore a short hash of the absolute path — stable across a
session, distinct between worktrees, and carrying nothing about the machine. It
answers "were these two journals written in the same tree?", which is the only
question the schema needs it for. `branch` already carries the human-readable
half.

## Risks

- **A field with no producer.** `verification.rev` joins `verification` itself
  in the unemitted tier. The mitigation is the same bet v0.2 and v0.3 made, and
  the same justification: the shape has to be right before a producer exists,
  because a field forgotten now costs a version bump later.
- **`survey`'s summed counts invite a merged reading.** A user who sees one
  total may believe one timeline was validated. The output must name the
  journal count in the same block as the totals, and the requirement says so.
- **The exported type surface moves.** `JournalHeader` and `JournalReport` are
  both public API. The addition is optional-only so no consumer breaks, but it
  is a CHANGELOG-visible surface change rather than an internal detail.
- **New fixtures could be asserted by exit code alone.** The v0.3 pair set that
  precedent — neither file is opened by any TypeScript test, so the findings
  their documentation claims are checked only by CI's exit status, which cannot
  tell twenty-six findings from six. Task 1.6 requires the unit test for exactly
  this reason.
