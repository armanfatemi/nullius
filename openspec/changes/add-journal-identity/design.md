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

## Decision 3 — the rule stands; this change is on the bumping side of it

**This decision was reversed during pre-review.** The original text asserted
that nothing here changes the set of valid records and kept `0.3`. Two
reviewers independently showed that is false, and the correction is instructive
enough to keep in the document rather than quietly overwrite.

The rule itself was never in dispute:

> A version bump is required when the set of valid records changes — a new
> kind, a new member of a closed vocabulary, a **tightening of an existing
> record's validity**, or a new verdict that can fail a record. It is not
> required for additive optional metadata that no verdict reads.

Those four triggers travel together. The iteration-2 review caught this
document's own spec delta restating the rule with the fourth clause dropped —
the same failure mode as iteration 1, one clause further along, in the text
tasks 1.8/1.9 were about to make canonical. The rule now says so about itself:
a restatement that loses a clause is how a rule decays, and this one has now
done it twice in two iterations.

The third clause is the one this change taught us to write down. The original
rule listed only additions, so a change that *removes* validity read as
out-of-scope by omission, which is exactly how it was misapplied here.

What the reviewers found: no record path rejects unknown keys today. The
`verification` case reads only `record.raw.target`, and the `mutation` case
does the same:

**Evidence:** `packages/claims/src/witness.ts:719@6a3c1bc`

```ts
      mutations += 1;
      const target = asTarget(record.raw.target);
```

So a `verification` carrying `rev: "main"` and a `mutation` carrying `rev` both
validate clean at HEAD **today**. Tasks 1.2 and 1.3 make both `MALFORMED`. That
is a tightening: a record that was valid becomes invalid, and any producer
already emitting it starts failing. Under the rule above that takes a bump, and
the fields being individually optional does not rescue it — optionality is a
property of the field, and validity is a property of the record.

The half of the original argument that survives is the cost. Bumping is not
free: an older kernel reading a `0.4` journal stops at `UNSUPPORTED-VERSION` and
reports nothing at all. That cost is now paid deliberately in exchange for a
real diagnostic (`rev: "main"` is caught rather than ignored), instead of being
avoided by mislabelling the change.

### What the bump actually costs in code

The dangerous part is not `VERSIONS`. It is that the ledger verdicts are gated
on the journal declaring `0.3` by **exact string equality**:

**Evidence:** `packages/claims/src/witness.ts:1077@6a3c1bc` — `  if (scan.version === "0.3") {`

The gate is correct as written — it exists so v0.2 journals do not all acquire
`SILENT-REVIEWER` on their next validation — but it is written as equality
against a literal, so adding `0.4` to the supported list and stopping there
would leave every `0.4` journal ungated for `SILENT-REVIEWER`,
`SUPPRESSED-FINDING` and the rest. Nothing would fail. CI would stay green, the
fixtures would still exit as the table says, and a family of verdicts would
have gone quiet for the newest schema only.

That is this repository's cardinal failure mode reproduced by a version bump,
so the bump carries three obligations, not one:

1. `VERSIONS` gains `"0.4"`; `VOCABULARY` maps it to the **unchanged**
   `KINDS_V03` — no kind is added, which is why the kinds table needs no new
   constant.
2. The ledger gate becomes a floor (`0.3` or later) rather than an equality.
3. A unit test asserts a `0.4` journal still earns a ledger verdict, by name.
   Without it, obligation 2 is a line nobody would notice regressing.

The moment `witness replay` makes *absence* of `rev` meaningful, that is a new
verdict, and it takes its own bump with it.

## Decision 7 — the ledger gate tests producer capability, not schema version

This decision was added after the producer bump was measured rather than
assumed, and it is the reason the bump can land at all.

`SILENT-REVIEWER` fires on a dispatch whose terminal reports `outcome: "found"`
and which filed no `finding`. `finding` is a self-reported kind: an agent
volunteers it. The hook recorder cannot emit one — it writes only what the
harness hands it, and the kit's source contains no `finding` at all:

**Evidence:** `grep -rn '"finding"' packages/kit/src/ --include='*.ts' --exclude='*.test.ts'` → 0 results

So a hooks-written journal has `found` reports and structurally cannot have
findings to discharge them. Every one of them earns `SILENT-REVIEWER`, forever,
for a defect that is not theirs.

The existing gate already knows this. It says so in its own comment:

**Evidence:** `packages/claims/src/witness.ts:1075@c931d34` — ` // gate every v0.2 journal in existence would acquire SILENT-REVIEWER on its`

That is the tell. The condition reads `scan.version === "0.3"`, but the
sentence explaining it is about what a *producer can emit*. The version number
was standing in for producer capability, and it worked only because the one
producer that cannot file findings happened to be pinned below the gate. Bump
that producer and the proxy stops tracking the thing it was proxying — measured
on this repository's own corpus, 0 findings at `0.2` and 255 at `0.3`, from a
producer whose behaviour did not change by one line.

The schema already carries the real discriminator, and has since v0.2:

**Evidence:** `packages/claims/src/witness.ts:81@c931d34` — `export type JournalOrigin = "hooks" | "self-reported";`

`hooks` means records the agent had no opportunity to decline. A journal of
those is a transcript, not a testimony — nothing in it was volunteered, so
"you reported found and filed nothing" is not a claim about the agent at all.
`self-reported` is the origin where the ledger verdicts have someone to
address.

**So the ledger verdicts require both conditions: the schema floor AND
`origin: "self-reported"`.** The floor stays because the ledger *kinds* are
only valid from `0.3`, and dropping it would newly fire `SILENT-REVIEWER` on
any `0.2` self-reported journal — a tightening, and the thing this change has
now twice had to be stopped from doing by accident.

An unrecognised `origin` does **not** satisfy the second condition. That is
deliberate and it is the conservative direction here: the cost of not firing is
a missed finding on a malformed journal that already earns a header
`MALFORMED`; the cost of firing is the 255-finding failure mode above. A
verdict people learn to scroll past is worse than one that occasionally stays
quiet.

**Rejected:** exempting only `SILENT-REVIEWER` and leaving `SUPPRESSED-FINDING`
on the version gate alone. `SUPPRESSED-FINDING` is vacuous on a hooks journal
anyway — no findings, nothing to suppress — so the exemption costs it nothing,
and two gating rules for two verdicts sharing one block is how the next reader
concludes the difference is meaningful.

**Note this is a loosening, not a tightening.** It makes a verdict fire less
often, so by the rule in Decision 3 it takes no version bump of its own. It
travels with `0.4` because it is what makes `0.4` shippable.

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

### Failing open is not enough — the hazard is git *succeeding slowly*

Pre-review found that the constraint as originally written covers only the case
where git returns an error, and the expensive case is the one where it returns
a correct answer late.

`headerRecord` is called from inside `writeRecords`, which runs while the
advisory lock is held:

**Evidence:** `packages/kit/src/journalFile.ts:204@6a3c1bc` — `      ...(needsHeader ? [headerRecord(header)] : []),`

A hook that cannot take the lock does not queue. It waits, and then it is
**refused** — the records it was carrying are lost, not deferred:

**Evidence:** `packages/kit/src/journalFile.ts:49@6a3c1bc` — `const DEFAULT_WAIT_MS = 2_000;`

And the kernel helper the original text nominated for reuse is bounded five
times higher than that deadline:

**Evidence:** `packages/claims/src/runners.ts:15@6a3c1bc` — `export const DEFAULT_GIT_TIMEOUT_MS = 10_000;`

Compose those three and a single cold `git rev-parse` on a large repository
silently costs every concurrently-appending hook its records — under the
constraint "git failure is never a recording failure", fully satisfied, because
git did not fail.

So the constraint gains two clauses, and both are requirements rather than
guidance:

1. **No git call runs while the append lock is held.** Identity is resolved
   *before* the lock is acquired and passed in as data. `headerRecord` stays a
   pure function of its draft; it does not learn to spawn a process.
2. **Every git call is bounded well under the lock's wait deadline** — a
   budget in the hundreds of milliseconds against a 2 000 ms deadline, not the
   kernel's 10 000 ms file-reading default. A `rev-parse` that has not answered
   in that window is treated exactly like a git failure: the field is absent
   and recording proceeds.

The second clause is why the kernel's `revFileReader` is the wrong thing to
reuse even setting its timeout aside — see the reuse note in Decision 5's
task, `revFileReader` reads *a file at a rev* and cannot answer branch, head or
worktree at all.

## Decision 6 — `worktree` is an identity, not a path

The obvious value is the absolute worktree path. It is also a home directory,
and the probe corpus already had to redact absolute paths out of captured hook
payloads before committing them:

**Evidence:** `spec/fixtures/probes/claude-code/README.md:12@541ae94` — `per event). Absolute paths under the capturing machine's home directory were`

`worktree` is therefore a hash of the absolute path — stable across a session,
distinct between worktrees, and carrying nothing about the machine. It answers
"were these two journals written in the same tree?", which is the only question
the schema needs it for. `branch` already carries the human-readable half.

Pre-review pushed back that "a short hash" is not yet a redaction claim: an
absolute worktree path is low-entropy and highly guessable — `/Users/<name>/
<a few likely roots>/<repo>` — so an unsalted digest is confirmable by preimage
guess, and confirming a guess is exactly the disclosure the probe corpus
redacted. A hash that only stops casual reading is a hash that reads as
anonymised and is not.

So the construction is specified rather than left to the implementer:

- **Algorithm and length:** SHA-256, hex, truncated to 16 characters. Long
  enough that collisions between the worktrees of one machine are not a
  practical concern; short enough to read in a header.
- **Salt:** a random salt generated once, never committed. It makes the digest
  stable wherever the salt is stable — which is all `worktree` promises — while
  removing the preimage-guess path entirely, because the guesser does not have
  the salt. **The salt is per-worktree, not per-clone**, because `.nullius/`
  lives in the working tree; task 3.5b decides deliberately whether it should
  move to the git common directory instead, and records the reason. Those two
  placements are the whole decision, and this document names one unit
  throughout: per-worktree, unless 3.5b changes it and changes this sentence
  with it.
- **Consequence, stated so nobody discovers it later:** `worktree` values are
  *not* comparable across clones or across machines, and under the per-worktree
  placement they are not comparable across sibling worktrees either — which is
  harmless, since sibling worktrees are exactly the case the field is meant to
  distinguish. That is the correct trade for this schema, whose only question is
  "same tree?" within a corpus produced together.

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
  this reason. Note the scope line: the new assertions cover the records this
  change adds, and the twenty-six pre-existing findings stay proven by exit code
  alone. That gap survives this change and is recorded in the proposal's open
  questions rather than quietly implied to be closed.
- **The version bump can silence the ledger verdicts.** This is the largest
  risk in the change and it is invisible if you only read `VERSIONS`. The gate
  at `witness.ts:1077` is exact string equality against `"0.3"`, so a `0.4`
  journal that is otherwise perfectly supported would earn no `SILENT-REVIEWER`
  and no `SUPPRESSED-FINDING`, with every fixture still exiting as its table
  says. Bought down by making the gate a floor and pinning it with a named unit
  test (tasks 1.10 and 1.11), not by care.
- **`worktree` identifiers do not compare across clones.** The salt that makes
  the digest a real redaction also makes it local to wherever the salt lives.
  Anything later trying to correlate worktrees across machines will find the
  field useless for that, by construction. Stated in Decision 6 so it is a
  known boundary rather than a bug report. Note the unit is per-*worktree*
  rather than per-clone as first written, because `.nullius/` is in the working
  tree — task 3.5b decides deliberately whether the salt should move to the git
  common directory instead, and records the reason either way.
- **The salt is only a redaction if it is not committed.** `.gitignore` covers
  `.nullius/runs/` and `.nullius/probes/` and nothing else, so a salt written
  beside them lands in the repository by default and the preimage argument
  evaporates. Task 3.5a adds the ignore rule in the same commit that creates
  the file; the two must not be separable.
- **The rule this change writes down is prose, and prose is what failed.** It
  was misapplied by its own author in iteration 1 and restated with a missing
  clause in iteration 2. Nothing mechanically checks that a schema change and a
  version bump travel together. That is not in scope here, but it is the
  obvious next ratchet and is recorded as such.
