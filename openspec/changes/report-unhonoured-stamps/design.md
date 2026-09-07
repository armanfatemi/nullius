# Design — report-unhonoured-stamps

## Context

`checkStamped` already knows everything this change needs. It asks git to read
the cited file at the stamped commit, and when that read fails it computes the
working-tree verdict and returns it:

**Evidence:** `packages/claims/src/checkClaims.ts:416@0c52173` — `const fallback = checkUnstamped(claim, deps, driftWindow, minAnchorChars);`

On the passing path the fact that the rev axis went unevaluated is dropped on
the floor — the returned result is indistinguishable from one whose commit was
read and honoured:

**Evidence:** `packages/claims/src/checkClaims.ts:421@0c52173` — `return { claim, verdict: fallback.verdict, detail: fallback.detail };`

The failing path already carries the fact forward, in prose, inside the detail
string of a verdict the reader is going to look at anyway. That asymmetry is the
whole defect: the case that gets explained is the case that was already visible.

The clone question is likewise already asked and already cached — once per run,
lazily, so a run with no stamps never spawns git for it:

**Evidence:** `packages/claims/src/cli.ts:287@0c52173` — ``* `isShallowRepository`, asked at most once per run and only if something asks.``

So this change threads one boolean out of a function that has it, into a summary
that is already built, and renders it at three sites that already render sibling
totals. There is no new git call, no new configuration, and no new verdict.

## Decisions

### 1. Count the anchor, do not invent a verdict for it

The obvious alternative is a new advisory verdict — `unhonoured-stamp` — so the
condition appears per-anchor in the ordinary verdict column. Rejected.

The anchor's verdict is a statement about the *claim*, and the claim is fine: the
quote is where the author said it was. What went wrong is a property of the
**run** — it could not consult the history it was pointed at. Encoding that as a
verdict would put a fact about the clone into a column readers use to judge
authors, which is the exact confusion `checkClaims.ts`'s clone-based
discriminator was introduced to avoid.

A verdict would also be a breaking change to the exported `Verdict` union and to
every consumer's exhaustive switch, in exchange for information that belongs in
one summary line.

### 2. Correct the closing line rather than appending a caveat to it

`All N grounding marker(s) verified.` is false when any stamp went unhonoured,
and the existing code already treats that line as load-bearing enough to special-
case its zero-marker form:

**Evidence:** `packages/claims/src/cli.ts:1575@0c52173` — `// zero-marker run "All 0 grounding marker(s) verified." reads as a pass on`

The same reasoning applies here and reaches the same conclusion: a sentence that
asserts more than the run established gets corrected, not annotated. Appending
"(1 stamp unhonoured)" after the word *verified* leaves the false claim standing
and relies on the reader to subtract.

### 3. Name the remedy from the clone, not from a guess

Shallow and full clones need opposite advice — fetch more history versus re-pin
the anchors — and offering both every time trains readers to skip the line. The
checker already distinguishes them, so the report says the one that applies.

Where shallowness could not be determined at all, the report says that instead
of choosing: an undeterminable clone is a third state the existing code already
keeps distinct from the other two, and collapsing it here would reintroduce the
ambiguity that state exists to prevent.

### 4. The fixture already exists; what is missing is an assertion about what it prints

No new fixture is needed. The case is already committed, as CI's control for
hash-length invariance:

**Evidence:** `spec/fixtures/.rev-lane/short-sha.md:1@0c52173` — `# Control — the same claim, stamped with a 7-character absent commit`

Its anchor stamps `LICENSE:1@0000000` over the quote `MIT License`, which is
genuinely at that line — so the commit is unreadable, the working-tree fallback
passes, and the run exits 0. CI runs it and asserts exactly that:

**Evidence:** `.github/workflows/ci.yml:495@0c52173` — `node packages/claims/dist/cli.js check spec/fixtures/.rev-lane/short-sha.md`

So this fixture has printed `All 1 grounding marker(s) verified.` about a commit
that exists in no repository, on every CI run since it was added, and nothing
has ever read that line — the gate is the exit code, and the exit code is 0
either way.

That is `.claude/rules/verdict-needs-fixture-and-test.md` in its purest form,
and it is why the gap survived: the fixture was never the weak part. The work
this change owes is a unit test asserting the *reported total* by name, plus
tightening CI's step to grep for the new line rather than only checking `$?`.

The `.stamp-failopen` fixtures stay as they are. They cover the failing path,
which already explains itself.

## Risks

- **A repository that legitimately carries old stamps sees a new line on every
  run.** This is the intended behaviour and the reason the count is advisory:
  the line is accurate, and a project that finds it noisy has stamps it should
  re-pin or a checkout it should deepen. No exit code moves, so nothing blocks.
- **Interaction with `add-rev-ancestry-check`.** That change may widen what
  counts as unreadable, from "does not resolve" to "resolves but is not an
  ancestor". This design deliberately keys the count off the same read that
  produces the verdict, so it inherits whatever that change decides rather than
  needing to agree with it separately.

## Open questions

- Should the JSON summary field be a plain integer, or an object carrying the
  clone state alongside the count? The integer is enough for the requirement as
  written; the object is what a dashboard would want. Deferred to implementation
  — the requirement constrains the human-readable surfaces, and the JSON shape
  is versioned, so it can grow later without a spec change.
