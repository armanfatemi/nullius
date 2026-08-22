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

## Decision 3 — no schema bump, by the rule landed one commit ago

`justifies` is optional, is read by no journal verdict, and no record parser
rejects unknown fields — the `decision` parser validates `choice`, `rationale`,
and two optional strings, and ignores everything else.

`add-journal-identity` wrote the governing rule: bump when the set of valid
records changes — a new kind, a new closed-vocabulary member, a new verdict —
never for additive optional metadata. `justifies` is the second case, so the
schema stays `0.3` and every existing journal validates identically.

`UNJUSTIFIED-ORACLE-CHANGE` *is* a new verdict, which looks like it should force
the bump. It does not, because `witness validate` never emits it. It belongs to
`OracleVerdict`, a separate union rendered by a separate command, following the
precedent already set for `RuleVerdict`: the kernel's exported `Verdict` is
public API whose growth is breaking, and a new verdict family gets its own.

That the rule decides this case cleanly, one commit after being written, is
mild evidence it was the right rule.

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
