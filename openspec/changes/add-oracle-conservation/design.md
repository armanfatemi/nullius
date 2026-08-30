# Design — add-oracle-conservation

## Context

Every other check here asks about a document or a run. This one asks about the
*measuring instrument*: the artifact that decides whether work is done. The
instrument is writable by the thing it measures, which is the whole problem, and
no amount of reviewing the implementation diff catches it — the erosion is in
the other half of the diff, the half that looks like housekeeping.

The check has to survive one hard constraint: **a change to the oracle is
frequently correct.** A design that treats every test edit as suspicious is a
design nobody keeps.

## Goals / Non-Goals

**Goals:**

- Every hard change to a declared oracle, over a reviewable range, reaches a
  recorded reason or a verdict.
- Complete coverage of *how* the change was made — including deletions made by
  tools no hook watches.
- A set small enough that a human reads all of it.

**Non-Goals:**

- Judging the reason. Deciding whether a loosened assertion was justified is a
  claim about intent, and this repo does not put a model in a verdict path.
- Detecting weakening by parsing. See Decision 4.

## Decision 1 — the join key is derived, not assigned

The justification lives on `decision`, which raises the question this design
turns on: **what does a `decision` point at?**

It cannot point at a `mutation` id. The whole reason git is the source is that
the highest-risk changes have no mutation record. A reference to a record that
does not exist is not a link, it is a dangling pointer with better manners.

So the referent is not a record id at all. It is a pair both sides can compute
independently from facts they both see:

```json
{"kind":"decision","id":"dec1",
 "choice":"loosened the retry timing assertion",
 "rationale":"the helper now backs off exponentially, so a fixed 100ms bound asserts the old contract",
 "justifies":{"path":"test/retry.test.ts","change":"weakened"}}
```

The checker computes `(path, change)` from the diff. The producer writes
`(path, change)` from the same diff. They meet without either having to know
the other's ids, and — the part that matters — **the journal does not need to
have witnessed the edit.** A test deleted by `rm` is invisible to the recorder
and still perfectly justifiable, because the obligation is raised by git and
discharged by a record that names the same two facts.

`change` is a closed vocabulary of exactly the hard classes: `deleted`,
`skipped`, `weakened`. A closed list is what stops "justified" from becoming a
free-text field that matches anything.

**Rejected: a new `justification` kind.** It would grow the vocabulary for a
concept `decision` already models — `choice` plus `rationale` is exactly "what
we did and why". A kind would also force a schema bump, and Decision 3 explains
why that costs something real.

**Rejected: `justifies` as a bare path string.** Two hard changes to one file —
a skip *and* a weakening — would then be indistinguishable, and one decision
would silently discharge both.

## Decision 2 — a justification is a claim, so it takes an anchor

`rationale` is prose, and prose written by the agent that made the edit is
exactly the kind of text this project refuses to take at face value. An agent
that will loosen an assertion to get green will also write a fluent sentence
about why that was necessary.

The convention that fixes it is already the house rule: **the rationale for a
hard change carries an Evidence Anchor into the implementation that made it
necessary.**

```markdown
**Evidence:** `src/retry.ts:41@a1b2c3d` — `  const delay = base * 2 ** attempt;`
```

Now the reason is falsifiable. `check` re-verifies it forever, and if the
implementation is later reverted the anchor goes `STALE` — which surfaces a
test edit that has quietly lost its justification, months after anyone would
have thought to look.

This is a **convention, not a verdict**, in v1. Requiring an anchor
mechanically would mean deciding which rationales are load-bearing, and the
repo's own rule is that no anchors go on judgment calls. The advisory path is
anchor density, which already exists and already reports it.

## Decision 3 — the schema bumps to `0.5`, because clause 4 fires

This decision reversed twice under review, and the reversals are kept here
because the reasoning that failed is more instructive than the answer.

The current journal version is `0.4`:

**Evidence:** `packages/claims/src/witness.ts:184@4a82cc6` — `export const VERSIONS = ["0.1", "0.2", "0.3", "0.4"] as const;`

The governing rule lives in `spec/witness-journal.md`, which is where
`add-journal-identity` put it precisely so a citation would not rot when that
change archives:

**Evidence:** `spec/witness-journal.md:351@172cb41` — `The version bumps when **the set of valid records changes**:`

It has **four** triggers: a new kind, a new member of a closed vocabulary, a
tightening that makes invalid a record a previous version accepted, and a new
verdict that can fail a record. It exempts additive optional metadata that no
verdict reads.

### Why `justifies` alone would not have bumped it

The field is optional, and the `decision` parser ignores unknown keys:

**Evidence:** `packages/claims/src/witness.ts:1146@4a82cc6` — `      case "decision": {`

A record carrying `justifies` validates identically before and after. Had the
change stopped there — a field the journal stores and nothing interprets — the
exemption would have applied exactly as written, and `0.4` would have stood.

### Why it bumps anyway

The change does not stop there. `MALFORMED-JUSTIFICATION` is a verdict, and it
reads `justifies` and fails a `decision` record on it. That defeats the exemption
on its face, because the exemption's condition is *no verdict reads it* without
qualification, and it satisfies clause 4 positively: a new verdict that can fail
a record.

So the schema goes to `0.5`. Not because the field is a tightening — it is not,
and `witness validate` still accepts every record it accepted before — but
because a verdict that can fail a record now exists, which is the trigger clause 4
was written to be.

### Three arguments that failed, and why they are recorded

Each of these was written to preserve a `0.4` that had already been decided on.
They are kept because the rule's own text says it has decayed twice through
restatement, and this is what the decay looks like from the inside.

1. **"It tightens nothing."** Asserted while the change made `witness validate`
   reject a malformed `justifies` — which is precisely a tightening, since such a
   record validates clean today. The claim and its refutation were in the same
   document.

2. **"Clause 4 is about a verdict `witness validate` never emits."** This reads a
   validator scope into a rule whose criterion is *the set of valid records*, not
   one command's accept-set. It is a qualifier inserted to make the conclusion
   follow.

3. **"Nothing previously valid becomes invalid, which is what every clause
   measures."** False on the rule's own face: clause 1 fires on a new kind and
   clause 2 on a new vocabulary member, and neither invalidates anything. Worse,
   under this reading clause 4 collapses into clause 3 — a verdict failing a
   previously-valid record simply *is* a tightening — leaving clause 4 no
   independent work. `spec/witness-journal.md` names that exact outcome as one of
   the two decays it has already suffered, "once by dropping the new-verdict
   clause." An argument that erases a clause is not an application of the rule.

The through-line is that "no bump" kept being treated as the thing to defend
rather than the thing to determine. The rule decided this case cleanly on the
first reading; three drafts were spent disagreeing with it.

### What the bump costs, and what it does not

`0.5` adds no kind, no vocabulary member to any existing closed list, and no
tightening. Every `0.4` journal is a valid `0.5` journal, and every record that
validated before validates now. The version moves because a verdict can now fail
a record, and a reader of the journal needs to know that before trusting a clean
`witness validate` to mean what it used to mean.

Validation of the field stays in `nullius oracle`, which is its only consumer.
The bump is not a claim that the journal validator should police `justifies`; it
is a claim about what a version number is *for*. An older validator reading a
`0.5` journal stops at the version and says so, which is the correct outcome once
a record in that journal can be failed by something the older validator has never
heard of.

## Decision 4 — `weakened` is a counted pattern, never a parser

The tempting implementation is to parse the test file and compare assertion
counts semantically. It is wrong here for two reasons: it needs a parser per
language, and `project.md` forbids a verdict that requires classifying free
text.

The admissible form is arithmetic on a declared pattern. A project declares
what an assertion looks like to it:

```json
{"oracles": [{"glob": "test/**/*.test.ts", "weakening": "\\bexpect\\("}]}
```

The checker counts matches at the base revision and at the head revision. A
decrease is `weakened`. This is byte-level counting against a human-declared
regex — the same arithmetic the absence lane already performs, aimed at two
revisions instead of the working tree.

It is deliberately crude, and the crudeness is documented rather than hidden: a
refactor that merges two assertions into one is a false positive, and an
assertion gutted from `expect(x).toEqual(full)` to `expect(x).toBeDefined()` is
a false negative the count cannot see. It catches deletion-shaped weakening,
which is the common case, and it never pretends to catch the rest.

**A project that declares no `weakening` pattern gets `deleted` and `skipped`
only, and is told so.** A silent downgrade to two-thirds of a check is the
failure mode this whole repo exists to prevent.

## Decision 5 — hard versus advisory, and why the split is the design

Flagging every oracle touch would produce a list nobody reads, and a list
nobody reads is worse than no list because it launders as review.

- **Hard** — `deleted`, `skipped`, `weakened`: an obligation is raised, and an
  unmet obligation is a verdict.
- **Advisory** — every other change to a declared oracle: listed by path, no
  obligation.

The three hard classes share a property that makes the split principled rather
than a matter of taste: **each of them strictly reduces what the oracle can
detect.** A test that was deleted, skipped, or has fewer assertions cannot fail
in a case where it used to. Everything else may or may not.

**That property is sufficient, not exhaustive, and the difference is load-bearing
enough to state.** Reducing detection is why these three are hard; it is not a
claim that they are the only reductions. At least two others exist and are
deliberately unclassified in v1:

- A **rename out of a declared glob**. The file survives, so it is not `deleted`,
  but it has left the oracle set and stopped grading anything.
- **Removing a glob from `oracles`** in the config. This is the oracle of the
  oracle, and no verb here watches it. `nullius.config.json` is not itself a
  declared oracle, and making it one recursively is a bigger question than this
  change should answer.

Both are real and neither is caught. Writing the property as an exact
characterisation — "exactly those that reduce detection" — would have been false,
and false in the specific way this repository punishes: a spec sentence asserting
completeness that a reader would reasonably rely on. It is stated as a sufficient
condition instead, with the known gaps named here rather than discovered later.

The converse also fails, which is worth admitting in the same breath: `skipped`
on a *newly added* file reduces nothing, because there was nothing there to
reduce. It is classified hard anyway, because the alternative is a base-revision
special case in the classifier for a situation that is nearly always worth a
glance.

**Pass and fail are decided by set membership, not by the flag.**
`UNJUSTIFIED-ORACLE-CHANGE` sits in `OracleVerdict`'s `PASSING` set with an
argued comment, following `packages/claims/src/rules.ts:60`.

**And the set must have a complement, or it is the same no-op wearing a set.**
An earlier draft of this decision said only the sentence above, and it was
caught: with `ok` passing trivially and `UNJUSTIFIED-ORACLE-CHANGE` passing by
requirement, every member of the union would have been inside `PASSING`,
`isOracleFailure` would have been constant-false, and `--strict` would still have
been the only thing capable of failing — the decision moved one level down and
laundered through a set rather than actually relocated. `rules.ts` escapes this
only because it deliberately excludes one member:

**Evidence:** `packages/claims/src/rules.ts:57@4a82cc6` — ` * excluded member — an author who mistyped a key should see it fail, the`

So `OracleVerdict` carries a second verdict, and that verdict is the exclusion:
`MALFORMED-JUSTIFICATION`, for a `justifies` whose `path` is blank or whose
`change` is not one of the three classes. It fails with no flag set, for exactly
the reason `malformed-rule-header` does — a mistyped key is an authoring error,
not a finding about the codebase, and an author who mistyped one should see it
fail rather than watch it be silently inert.

That also settles what was otherwise an awkward corner. A mistyped `change`
cannot match any hard change, so without its own verdict it would discharge
nothing and say nothing; the obligation it was written to satisfy would simply
go on being reported as unjustified, and the author would have no way to tell a
typo from a genuine unmet obligation.

`--strict` widens what fails from there; it is not the only thing that can fail.
The distinction matters because putting the decision solely in a CLI flag would
give this kernel a third way of answering a question the other four verdict
families all answer the same way.

**`MALFORMED-JUSTIFICATION` is raised by reading the journal, not by matching a
diff.** A justification whose class is misspelt is an authoring error in the
record, and it is one whether or not any file changed. Deciding it this way is
not a convenience: a verdict that could only fire when a matching change existed
would be undetectable in precisely the case where the typo caused the mismatch.

It also solves a problem that looked like it needed new machinery. CI gates every
other verb here with a passing *and* a failing invocation, and the failing
invocation for `oracle` seemed to require a fixture carrying real commit history
— which Decision 8 has just finished ruling out. But a malformed justification
needs no history at all. The negated CI arm runs against a static `.jsonl`
journal fixture over an empty range, exactly like every witness fixture already
in `spec/fixtures/`, and fails on the verdict rather than on a flag.

The honest limit, stated because the alternative is implying a coverage that does
not exist: **CI's negated arm gates `MALFORMED-JUSTIFICATION`, not
`UNJUSTIFIED-ORACLE-CHANGE`.** The advisory verdict is asserted by name in unit
tests through the injected seam, and appears in CI only in the passing,
advisory-mode run over this repository's own range. That is a real gap — a
regression that silenced `UNJUSTIFIED-ORACLE-CHANGE` alone would be caught by the
unit suite and not by a negated exit code — and it is the gap
`.claude/rules/verdict-needs-fixture-and-test.md` was written about. It is
accepted here rather than papered over, because the alternative is a
history-bearing fixture whose maintenance cost the design has already argued
against, and because the rule's own remedy is the named unit test, which this
change has.

## Decision 6 — the range, and where it runs

The unit is a commit range, not an edit. An agent iterating on a test file
touches it ten times, and per-edit obligations would bury the signal in its own
noise.

A range is also what a human reviews, and the Action already has one on a pull
request, so the gate lands where people already look with no new plumbing.
Locally, `nullius oracle main...HEAD` is the same question before pushing.

## Decision 7 — the name

`oracle`, not `tests`.

The artifact that grades the work is often not a test file: golden files,
snapshots, fixtures, approved output, a conformance corpus. All carry the same
risk and none are called tests. Naming the verb `tests` would fight that
generality from the first day, and the config key would have to lie.

The cost is a word some users will have to learn — consistent with a project
that already asks them to learn binding moments and evidence anchors.

## Decision 8 — the diff arrives through an injected seam

The oracle core takes its diff from an injected dependency object rather than
spawning git itself. The core is pure: given a list of changed paths with
statuses, the file contents at each revision, and the declared `oracles` config,
it returns classifications. A binding file constructs the live reader, the same
way the anchor path already does:

**Evidence:** `packages/claims/src/runners.ts:149@4a82cc6` — `export function revFileReader(root?: string, timeoutMs = DEFAULT_GIT_TIMEOUT_MS) {`

Two things force this, and they arrive from opposite directions.

**The fixtures cannot work otherwise.** Every fixture in `spec/fixtures/` is a
static tree — `wiring-valid`, `rules-valid` — and none carries a `.git`
directory. A verb that diffs a commit range needs history, so a fixture for it
needs either a committed git directory, a script that synthesizes a repo at test
time, or an injected diff source. The first is unlike every other fixture here
and awkward to maintain; the second makes the unit suite depend on a git binary
and on commits made during the run. The seam makes the interesting cases —
justified deletion, unjustified weakening, a skip on an added file — into plain
data, and leaves one thin integration test to cover the live reader.

**The existing git machinery does not reach.** Task 2.6 called this "reuse", which
understated it. `runners.ts` has a `git show` wrapper and a head-revision reader,
and no name-status diff at all; its revision guard is hex-only, so a `base..head`
range string cannot pass through it as written. New plumbing is required whatever
the test strategy, and building it behind a seam costs nothing extra at the point
where it has to be built anyway.

## Risks

- **`weakened` false positives erode trust fastest.** Advisory-first is the
  mitigation, plus a message that names the pattern and both counts so the
  reader can dismiss it in seconds.
- **A justification is one sentence away from a rubber stamp.** Decision 2 is
  the answer and it is a convention, so it holds only where teams adopt it. The
  honest claim for v1 is narrow: the shortcut stops being *private*.
- **An unconfigured project gets nothing and might not notice.** `??` in
  `doctor` and a named "no oracles declared" line in the command's own output,
  never a clean zero.
