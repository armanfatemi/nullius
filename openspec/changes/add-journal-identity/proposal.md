# Add journal identity — a journal that knows where it came from, and outlives it

> **Depends on:** None

## Why

Two gaps, one root cause: **a journal records what happened and not where.**

A `verification` pins the artifact's hash and nothing else:

**Evidence:** `packages/claims/src/witness.ts:665@6a3c1bc`

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

**Evidence:** `packages/claims/src/cli.ts:381@6a3c1bc` — `    console.error("usage: nullius witness validate <journal.jsonl> [--expect-rules <rule-id...>]");`

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
- **Schema version bump to `0.4`.** An earlier draft of this proposal claimed
  the change was purely additive and kept `0.3`. That was false, and pre-review
  caught it. No record path rejects unknown keys today — `mutation` reads only
  its `target` and ignores every other key:

  **Evidence:** `packages/claims/src/witness.ts:719@6a3c1bc`

  ```ts
        mutations += 1;
        const target = asTarget(record.raw.target);
  ```

  So a `verification` carrying `rev: "main"` and a `mutation` carrying `rev`
  both validate **clean at HEAD today**. Making either `MALFORMED` shrinks the
  set of valid records, which is exactly the trigger the rule in Decision 3
  names. Kinds are a closed list per version and that list is unchanged:

  **Evidence:** `packages/claims/src/witness.ts:143@541ae94` — `const KINDS_V03 = [...KINDS_V02, "stage", "finding", "resolution", "check", "decision"] as const;`

  but "the set of valid records" is wider than the set of kinds, and this
  change moves it. See Decision 3.
- **The bump is not a one-line change, and that is the interesting part.** The
  ledger verdicts are gated on the journal declaring `0.3` by exact string
  equality:

  **Evidence:** `packages/claims/src/witness.ts:1077@6a3c1bc` — `  if (scan.version === "0.3") {`

  Adding `0.4` to the supported list without revisiting that gate would leave
  every `0.4` journal silently ungated for `SILENT-REVIEWER`,
  `SUPPRESSED-FINDING` and the rest — a checker that went quiet while CI stayed
  green, which is the one failure this repository exists to prevent. The gate
  becomes a floor comparison, and a test pins it. See Decision 3.
- **`witness survey <glob>`** (kernel): validates each journal independently and
  aggregates the *reports*. Prints the summed three-way outcome counts,
  per-journal pass/fail, and journals that reached no terminal record at all.
  It never merges records into one timeline, and the spec says so as a
  requirement rather than as a note.

## Impact

- Affected specs: `witness` (modified — header, new requirements).
- Affected code: kernel (`witness.ts` header scan and `verification` parser,
  `cli.ts` survey command); kit (`journalFile.ts` header draft).
- **The exported type surface moves.** `JournalHeader` and `JournalReport` are
  both public API, so adding fields to either crosses the package boundary:

  **Evidence:** `packages/claims/src/index.ts:61@6a3c1bc` — `  type JournalHeader,`

  The addition is optional-only, so no consumer breaks — but it is a public
  surface change and belongs in the CHANGELOG rather than passing as an
  internal detail.
- **No union grows.** Nothing in the codebase switches over `JournalVerdict`;
  the only place it is consumed as a set is a membership test that treats an
  unknown member as a failure:

  **Evidence:** `packages/claims/src/witness.ts:120@a717cc4` — `const PASSING: ReadonlySet<JournalVerdict> = new Set<JournalVerdict>(["ok"]);`

  So the "adds no verdict" claim is structurally safe rather than merely
  intended: a verdict added later fails safe by default.
- **New dependency direction in the kit.** Nothing in the kit's shipping code
  spawns a process today:

  **Evidence:** `grep -rn --exclude='*.test.ts' 'child_process' packages/kit/src/` → 0 results

  Reading `branch`/`head` needs git. This is a real widening of the kit's
  surface and it is governed by two rules, not one. The first is **git failure
  is never a recording failure**: no repository, no git binary, a detached HEAD
  — the fields are absent, recording proceeds. The second was added after
  pre-review pointed out that the first does not cover the actual hazard, which
  is git *succeeding slowly*: **no git call runs while the append lock is
  held**, and every git call is bounded well under the lock's wait deadline.
  A hook that waits past that deadline does not defer, it is refused:

  **Evidence:** `packages/kit/src/journalFile.ts:49@6a3c1bc` — `const DEFAULT_WAIT_MS = 2_000;`

  Hooks fail open; that constraint does not bend for provenance, and it does
  not bend for a git call that merely takes its time. See Decision 5.
- **The producer moves too, and that is the part with live consequences.** The
  hook pack stamps `0.2` today:

  **Evidence:** `packages/kit/src/cli.ts:41@f1b8211` — `const SCHEMA_VERSION = "0.2";`

  So the ledger verdicts, gated at `0.3` and later, currently fire on no
  journal this repository has ever produced. Task 3.8 bumps the producer to
  `0.4` — without it this change ships a schema nothing emits, next to the
  producer that should emit it.
- **Bumping the producer exposed a latent defect in the ledger gate, and this
  change fixes it.** Measured before assuming: with the producer at `0.4` and
  nothing else changed, the 18 live journals under `.nullius/runs/` go from 0
  `SILENT-REVIEWER` findings to 255 — every `found` report, from a producer
  whose behaviour did not change by one line. The cause is that
  `scan.version === "0.3"` was standing in for *"can this producer file
  findings?"*, and the hook recorder never could. Decision 7 replaces the proxy
  with the discriminator the schema has carried since v0.2: the ledger verdicts
  require `origin: "self-reported"` as well as the schema floor. That is a
  loosening, so it takes no bump of its own — but it is what makes the bump
  shippable, and without it this change would have made a working verdict into
  255 lines of noise.
- **The version-support table and the ledger gate both move.** `VERSIONS`
  gains `0.4`, `VOCABULARY` maps it to the unchanged `KINDS_V03`, and the
  exact-equality ledger gate becomes a floor so `0.4` keeps every verdict `0.3`
  has. That last one is the whole risk of the bump and it carries its own test.
- No existing `0.3` journal changes verdict. Every field added here is
  optional, the header scan already ignores keys it does not know, and a `0.3`
  journal carrying `rev` keeps validating exactly as it does today — the new
  rejections are `0.4` semantics, which is what the bump buys.

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
- **Ref-backed sealing.** Split out to `add-journal-sealing` after review found
  an unresolved concurrency defect in the seal path: the specified
  `hash-object` → `mktree` → `commit-tree` → `update-ref` sequence is a
  read-modify-write of one shared ref with no compare-and-swap, so two sessions
  sealing at once silently drop one journal from the ref. Durability is not
  urgent in the way the schema field is, and holding the field hostage to an
  unsolved concurrency design was the wrong trade. The prose moved rather than
  being discarded.

## Dependencies

### Hard (must be merged before this starts)

None. The producer this change describes already exists — `add-witness-recording`
is archived and the hook pack writes journals today.

### Soft (design assumes these exist; graceful degradation if absent)

`add-authoring-ergonomics` — task 2.4 gives `survey` a per-command `--help`
"matching the funnel convention" that change introduces. If it has not landed,
`survey` defines its own help text and nothing degrades except consistency.

### Enables (future changes that will depend on this)

- `add-journal-sealing` — the split-out durability half; it seals the journals
  whose headers this change defines.
- `add-oracle-conservation` — already cites this change's design as the
  governing rule for when a schema version bump is required:

  **Evidence:** `openspec/changes/add-oracle-conservation/design.md:101@a717cc4`

  ```
  `add-journal-identity` wrote the governing rule: bump when the set of valid
  ```

- `witness replay` — unscoped, and the reason `verification.rev` is landed now
  rather than when a producer exists.

## Size estimate

|                                |                                                     |
| ------------------------------ | --------------------------------------------------- |
| Estimated tasks                | 44                                                  |
| Packages or surfaces touched   | 3 (packages/claims, packages/kit, spec/)            |
| Risk                           | MEDIUM                                              |
| Expected sessions to implement | 1                                                   |

MEDIUM rather than LOW, revised after pre-review. The first estimate assumed a
purely additive change and was wrong on its own terms: this change tightens
record validity and therefore bumps the schema, and the bump drags in a gate
that is written as exact string equality against `"0.3"`. Getting that gate
wrong does not fail loudly — it silently ungates the ledger verdicts for every
`0.4` journal, which is a checker going quiet behind a green build. No exported
union grows and no public type breaks; the risk is concentrated entirely in the
version gate and is bought down by task 1.11's test.

## Open questions

- **Should the header key be `head`, or something that carries its own
  definition?** Decision 2 narrows `head` to *the commit the session started
  from*, and puts that narrowing in the spec text. Pre-review observed that the
  design's own argument — "a caveat that lives only in a comment gets read as
  absent" — applies to the key name too: a JSON key called `head` travels to
  every consumer without its spec, and the obvious misreading is the stale one.
  A self-describing key (`head_at_start`) would close it at the cost of a
  longer name and a divergence from `branch`/`worktree`, which need no such
  qualifier. Left open rather than decided silently, because renaming after a
  producer exists is a migration and renaming now is free.
- **The pre-existing fixture-coverage gap survives this change.** No TypeScript
  file opens `spec/fixtures/v0.3-broken-run.jsonl`; its "26 findings" are
  asserted only by a negated exit code in CI, which stays 1 while any single
  verdict still fires. Task 1.6 closes this for the records this change adds
  and for nothing else. That is a deliberate scope line, not an oversight, and
  it is recorded here so the next reader does not mistake the new assertions
  for coverage of the old ones.
- **Does an unreachable `rev` deserve a verdict?** A `verification` can pin a
  commit that a later rebase or squash makes unreachable. The convention already
  documents this failure for anchors — a stamp whose commit is gone fails open
  as advisory `UNVERIFIABLE-REV`, so the gate silently stops existing:

  **Evidence:** `CLAUDE.md:50@a717cc4`

  ```
  advisory `UNVERIFIABLE-REV`: CI stays green while the hard gate silently stops
  ```

  The spec delta says absence of `rev` is not a finding, and is silent on an
  unreachable one. Resolving this needs a producer to exist first, so it is
  named here rather than answered.
- **Where does the kit's bounded-git helper live?** The kernel already has one
  under a timeout:

  **Evidence:** `packages/claims/src/runners.ts:149@a717cc4` — `export function revFileReader(root?: string, timeoutMs = DEFAULT_GIT_TIMEOUT_MS) {`

  Building a second in the kit would be two implementations of one discipline.
  Since the dependency direction is already kit → kernel, reusing the kernel's
  is available. Deferred to `add-journal-sealing`, which needs far more git than
  this change does.
- **Do the new fixtures get unit-test assertions?** The v0.3 precedent is a gap,
  not a model: `spec/fixtures/v0.3-broken-run.jsonl` is referenced in no
  TypeScript file at all, so the "26 findings" its documentation claims are
  asserted only by CI's exit code, which stays 1 if twenty of them stop firing.
  Task 1.6 already requires the unit test; this note records why that task is
  not optional.
- **How does a human find the journal they want?** Journals are named for the
  harness session id and nothing else, in one flat directory:

  **Evidence:** `packages/kit/src/journalFile.ts:94@a717cc4` — `export function journalPathFor(root: string, session: string | null): string {`

  A UUID says nothing about what a session did, and the directory only grows.
  The constraint that shapes every answer is that **the filename is chosen at
  `SessionStart`, before anything about the session's purpose exists** — so a
  descriptive filename would need either a mid-session rename, which breaks the
  advisory lock and any open handle, or deferred file creation, which loses the
  early records. Naming a journal after a change is also not one-to-one: a
  session may touch several changes or none.

  This change already carries most of a query-layer answer rather than a
  filename-layer one. `branch` in the header is the human-readable label most of
  the time, and `survey` is the verb that makes the id something nobody reads by
  hand — if it prints branch and date per journal, `ls` stops being the
  interface. What neither supplies is a label for a session that ran on no
  feature branch. An explicit `title` header field, or a `witness label` verb
  called once mid-session, would close that; neither is specced here.

  **Any change to the on-disk layout is sequenced before `add-journal-sealing`,
  not after.** That change fixes the sealed tree entry as `<session>.jsonl` so
  the sweep's "does the ref already carry this journal" test has one definition,
  and records the mismatch as a `data-at-rest` compatibility risk. Re-foldering
  `runs/` by date once sealing has shipped breaks that test silently — journals
  re-sealed under new names, or reported unsealed forever. Deciding the layout
  while sealing is still unimplemented costs nothing; deciding it afterwards is
  a migration.
