# Evidence Anchors

**Version 0.1 — draft.** The authoring convention checked by
[`@nullius-inverba/claims`](../packages/claims/). Its companion,
[Binding Moments](./binding-moments.md), covers claims about _when_ a
compatibility risk binds.

## The problem this solves

Most review — human or agent — is **normative**: _does the plan comply with
our rules? will this change violate an invariant?_ Almost no review asks the
**descriptive** question: _is what this document says about the existing
codebase actually true?_

That leaves a specific, provable hole: **a false premise that supports a
correct conclusion is invisible to a normative reviewer.** The reviewer reads
the conclusion, agrees with it, and never has a reason to open the file.

The incident that produced this spec: in a monorepo running an
agent-driven proposal pipeline, a design document justified the cost of adding
a value to a shared GraphQL enum with the claim that _"the enum is
`@shareable`."_ That claim is not merely wrong — it is structurally
impossible: Federation v2 defines `@shareable` on objects and fields only, and
a repo-wide grep found zero enums carrying it. The real constraint was
different (the enum appeared in both input and output positions, forcing an
exact match across subgraphs) — **same conclusion, different reason**. Because
the conclusion was right, the fabricated premise passed one deterministic
validation gate and two independent review agents without a single flag.

Evidence Anchors close the hole behaviorally, not analytically: **to write the
citation you must open the file, and opening the file is what kills the
fabrication.** The checker then keeps the citation honest over time.

## Load-bearing claims MUST carry evidence

A **load-bearing claim** is a statement about what the existing code, config,
or infrastructure does, on which a design decision rests — concretely, a
factual assertion whose **removal would change the decision, the risk
assessment, or the recommended implementation**. That test also answers "must
I anchor every sentence?": no — only the ones the decision would miss.
Typical homes: a rationale, an "alternatives considered … rejected because …"
section, a risk assessment, or a constraint.

| Statement                                                     | Load-bearing?                                              |
| ------------------------------------------------------------- | ---------------------------------------------------------- |
| "The enum is `@shareable`, so adding a value costs a rollout" | **Yes** — a claim about the repo, carrying a cost argument |
| "`PaymentProcessor` already owns a retry queue"               | **Yes** — determines whether new work is needed            |
| "No service currently reads this collection"                  | **Yes** — an absence claim gating an isolation decision    |
| "Option B is simpler to reason about"                         | No — judgment                                              |
| "Users may find the two-step flow confusing"                  | No — product risk                                          |

**If you cannot cite it, you may not assert it.** Move it to an
`## Open questions` section instead. This is the whole mechanism — the
citation forces the file open.

## The presence form — the thing exists

```markdown
**Evidence:** `path/to/file.ext:LINE` — `exact text appearing on that line`
```

Repo-relative path (never a bare basename, never absolute), the line number,
and the **actual text**. The quoted text is what makes the citation checkable:
a path and a line alone can be fabricated plausibly; a quoted line cannot
survive re-reading the file.

**The line field is a single integer — never a range, never a comma-list.**
`file.ts:88` is the only shape accepted; `file.ts:12-13` or `file.ts:12,14` is
`MALFORMED`, even when every line named is real and the quote is accurate. A
claim that legitimately spans several lines belongs in the fenced-block form
below, anchored to its **first** line — the block match, not the line field,
is what carries the range.

```markdown
**Evidence:** `k8s/base/settings/deployment.yaml:12` — `  replicas: 2`
```

**When the cited source itself contains a backtick** — a template literal, an
inline-code span — a single-backtick span cannot hold it (Markdown has no
escape inside a code span). Use a **double-backtick** span for the text; the
checker accepts either form:

```markdown
**Evidence:** `libs/x.ts:4` — ``const q = `query {}`;``
```

**When the quote is long, or spans lines**, put it in a fenced block directly
under the marker instead of in a code span. The checker treats the block as the
quoted text, and a multi-line block must match **consecutively** from the cited
line — which makes it a stronger assertion than the inline form, not merely a
longer one:

````markdown
**Evidence:** `services/orders/handler.ts:88`

```ts
const result = await retry(() => publish(event), {
  attempts: 5,
});
```
````

### Stamp the commit you read: `path:LINE@<rev>`

```markdown
**Evidence:** `services/orders/handler.ts:88@a1b2c3d` — `const result = await retry(...)`
```

The suffix is optional and it changes what the checker is allowed to fail you
for. Without it there is one snapshot — the working tree — and the two things a
citation asserts are tangled together in it. With it they come apart:

- **"This text was in this file at `a1b2c3d`"** is checked with
  `git show a1b2c3d:services/orders/handler.ts`. A commit is immutable, so this
  answer never changes: it is the **hard gate**, and it stays hard forever.
- **"It is still there"** is checked against the working tree, and can change
  through nobody's fault. It is **advisory by construction** — verdict `STALE`,
  which never fails a run no matter how far the code moves.

Get the value with `git rev-parse --short HEAD` when you read the file. Only a
commit hash is accepted (7-40 hex characters): `@main` means something different
next week, which is the mutability the stamp exists to escape, and it is
refused as `MALFORMED` rather than read as part of the filename.

**Squash-merge, rebase and shallow clones destroy the object a stamp names.**
When the commit cannot be resolved, the checker **fails open**: a failing
working-tree verdict is reported as the advisory `UNVERIFIABLE-REV` rather than
as a fabrication, because a commit this clone never had is not evidence about
the author. The cost is that a shallow checkout cannot settle history at all —
so a workflow that gates rev-stamped documents should check out with
`fetch-depth: 0`. There is a forgery surface here too (an author could hunt
history for a commit where a claim happens to be true), but that is strictly
more work than opening the file, so the authoring mechanism survives it.

**Quote something that could be wrong, and that occurs once.** Matching is
substring-based, so a one-character quote is trivially true and establishes
nothing. A quote shorter than `minAnchorChars` (default 8), or one matching
several lines of the file, verifies as `WEAK-ANCHOR`: the point of the anchor is
that re-reading the file could contradict it, and a quote that cannot be
contradicted has not made anyone look. Length alone never fails a claim — but a
quote matching several lines becomes a hard `UNPINNED` failure once its line
number is stale too, because at that point neither half identifies anything.

**Paths must be repo-relative.** Absolute paths, `~`, and `..` traversal are
rejected as `UNSAFE-PATH` and never read — see the security model below.

**Cite source, never generated output.** An anchor into a generated file
(codegen output, lockfiles, build artifacts) churns with every regeneration
and verifies the generator, not the claim. Anchor the source the generator
reads.

The checker normalizes whitespace (leading indentation and internal runs), so
an indentation difference between the doc and the file does not fail a
citation. Citations inside fenced code blocks are ignored: a document that
_quotes_ a citation as an example is not asserting it.

## The absence form — the thing does not exist

An absence cannot be cited to a line, so cite the **search and its result**:

```markdown
**Evidence:** `grep -rn --include='*.graphqls' '@shareable' services/ | grep enum` → 0 results
```

The checker re-runs the command and compares the count, so the command must be
re-runnable and deterministic. **Only `grep` / `rg` pipelines are executed** —
see the security model.

**Absence is search-scoped.** An absence verdict certifies that _this search_
found nothing — never that the thing does not exist. "Nothing else consumes
this event" does not reduce to a grep: dynamic dispatch, string keys built at
runtime, DI containers, generated code, and other repositories are all blind
spots a text search cannot see. What the anchor buys is inspectability: the
search command is visible in the document, so the reviewer's impossible
question ("is this true?") becomes a tractable one ("is this search adequate
to this claim?"). Author accordingly — stack multiple searches per absence
claim (the symbol, the string key, the topic name) and state known blind
spots next to the anchor. A certified-but-inadequate search is worse than an
uncited claim, because it manufactures confidence.

**Absence anchors are second-class, by construction.** The mechanism that makes
this convention work is that a presence anchor forces the author to open a file.
An absence anchor forces them to run one search — which they can do wrong in a
second and still pass. The claim class carrying the most weight in a deletion
proposal ("nothing else consumes this") is the one the authoring pressure
reaches least. Read absence anchors as an invitation to audit the search, not as
a result. `nullius check` counts presence and search anchors separately in its
summary for this reason: a proposal resting entirely on absence claims should be
visible as such at a glance.

**`nullius audit` gives the honest answer a verdict cannot.** "Nothing else
consumes this event" is unanswerable by grep in a DI codebase, and
`SEARCH-CLEAN` says only that a search was clean. The audit brief therefore
offers `UNVERIFIABLE-BY-SEARCH` as a first-class verdict — a real answer that
names what is out of reach, rather than a failure to do the work. See
[Auditing what the checker cannot certify](#auditing-what-the-checker-cannot-certify).

**The checker runs a control search of its own.** A search that finds nothing is
indistinguishable, from the outside, from a search pointed at nothing — the
wrong directory, a stale `--include`, a glob that expanded to no files. So when
an absence claim reports zero matches, the checker re-runs the same command,
with the same scope, replacing only the pattern with one that matches any
non-empty line. If that returns zero too, the search examined no content at all,
the zero it reported says nothing about the codebase, and the verdict drops to
`ADVISORY` with the reason.

The control tests **reachability, not plausibility**. It cannot tell you a
search term was misspelled, and it is no substitute for stacking searches
yourself — but it fires only when the search genuinely looked at nothing, so an
advisory means something specific rather than being noise to skim past.

Two authoring constraints follow from how the command is executed:

- **Use `--include=` / `-g`, never a shell glob.** The command is spawned
  directly, with no shell, so `services/**/*.graphqls` is passed through as
  literal text rather than expanded. Write
  `grep -rn --include='*.graphqls' <pattern> services/` instead.
- **One line of output per match.** The checker counts non-empty stdout lines,
  so `grep -c` (which prints a tally, not the matches) will not produce the
  number you meant.

## What does NOT need evidence

Design judgment, trade-off reasoning, aesthetic preference, product/UX risk,
and anything about code the change will _create_. Evidence is for claims about
what is **already there**. Forcing citations onto judgment calls produces
citation theater, which is worse than no citations — it trains readers to skim
past the anchors.

## Verdicts

`nullius check` re-verifies every anchor and reports one verdict per claim:

| Verdict          | Meaning                                                                              | Passes? |
| ---------------- | ------------------------------------------------------------------------------------ | ------- |
| `OK`             | Verified exactly as written                                                          | ✅      |
| `SEARCH-CLEAN`   | An absence search re-ran and found what was claimed — see the caveat below            | ✅      |
| `ADVISORY`       | Verified, but worth a human glance (see detail)                                      | ✅      |
| `WEAK-ANCHOR`    | True, but the quote is too short or too repeated to identify the cited line          | ✅      |
| `DRIFT`          | The quote's unique match is within the drift window (default ±3 lines) — file moved  | ✅      |
| `WRONG-LINE`     | Distinctive text exists in the file, but not near the cited line — stale, not wrong  | ✅      |
| `STALE`          | Rev-stamped: true at the commit it names, and the working tree has moved since       | ✅      |
| `UNVERIFIABLE-REV` | Rev-stamped, and that commit is not in this clone — fails open, see below           | ✅      |
| `UNPINNED`       | The quote is neither distinctive nor on its cited line — it pins nothing down        | ❌      |
| `FABRICATED`     | Text does not appear in the file at all — or, for a rev-stamped anchor, was not in it at that commit | ❌      |
| `MISSING-FILE-AT-REV` | The cited file did not exist at the stamped commit                             | ❌      |
| `MISSING-FILE`   | The cited file does not exist                                                        | ❌      |
| `COUNT-MISMATCH` | The absence command returned a different count than claimed                          | ❌      |
| `UNSAFE-PATH`    | The cited path escaped the repo — never read                                         | ❌      |
| `UNSAFE`         | The absence command failed the sandbox rules — never executed                        | ❌      |
| `COMMAND-ERROR`  | The absence command failed to run                                                    | ❌      |
| `UNKNOWN-MOMENT` | A `**Binds at:**` value outside the project's closed list                            | ❌      |
| `MALFORMED`      | An `**Evidence:**` line matching none of the citation shapes                         | ❌      |

An `**Evidence:**` line that matches no shape is `MALFORMED` rather than
silently skipped — a sloppy citation is exactly the thing the checker exists
to surface.

**Absence claims never report `OK`.** They report `SEARCH-CLEAN`, because that
is the strongest thing a search can establish: *this search found nothing*,
never *the thing does not exist*. The verdict is the part a reader remembers,
so it says what was actually shown.

**`WEAK-ANCHOR` is the answer to a gameable anchor.** Quote matching is
substring-based, so a one-character quote is trivially true and asserts
nothing about the code. An anchor that is shorter than `minAnchorChars`
(default 8), or that matches more than one line of the cited file, is
verified and reported as weak — it did not make the author look at a line.
It passes, because a weak citation is still better than none, but it is
visible.

**Evidence:** `packages/claims/src/checkClaims.ts:143@7412847` — `const DEFAULT_MIN_ANCHOR_CHARS = 8;`

**A `FABRICATED` or `COUNT-MISMATCH` verdict is not just a citation typo.**
Re-examine the decision that claim was supporting.

### Two axes, and only one of them can rot

A presence citation asserts two different things, and they age differently.

- **"This text is in this file"** is a claim about the **author**. It can be
  fabricated, and once it is true, no one else's edit can make it false. This is
  the axis the convention exists to police, and it is a hard gate forever.
- **"It is on line N"** is a claim about the **repository**. It goes stale every
  time someone inserts a line above it, through no fault of the document.

Hard-failing the second axis makes a correct, honestly written document turn red
on an unrelated refactor. That is the failure that gets `continue-on-error`
added to the workflow, and once it is added nobody reads the output again — so
enforcing the rotting axis costs more grounding than it buys. `DRIFT` and
`WRONG-LINE` therefore **pass**, reporting the delta so the citation can be
corrected, while `FABRICATED` fails permanently.

This holds only while the text half carries real information, which is what
`minAnchorChars` enforces. A quote too short or too repeated to identify a line
has nothing left to stand on once its line number is wrong: that is `UNPINNED`,
and it **fails**. A weak quote that _is_ on its cited line still points
somewhere definite, so it stays the passing `WEAK-ANCHOR`. The two rules are a
pair — relaxing the line number without enforcing distinctiveness would let an
anchor assert nothing at all and still show green.

The practical consequence for a docs archive: a document written a year ago
still fails if it invented a line of code, and no longer fails merely because
the file grew.

**A stamped anchor makes the split exact rather than inferred.** Without a
`@rev`, the checker is separating the two axes by heuristic — it forgives a
moved line because the text is distinctive enough to identify real code, and it
still has to guess between "this was deleted" and "this was never there".
`FABRICATED` is therefore a judgement about the working tree, and a large enough
refactor can produce it against an honest document. With `@rev` the axes are
checked against two different snapshots and the guessing stops: the gate runs on
an immutable commit where fabrication is a settled fact, and everything about
the repository since is `STALE` and advisory. Deleting the cited code cannot
turn a document red; inventing it cannot ever be excused by deleting it later.

**Scope of the guarantee.** Verdicts certify _form_: the text exists at the
cited location, the count matches, the moment is in the vocabulary. They never
certify _entailment_ — a real-but-selectively-quoted line passes. The narrow
problem this spec closes is unsupported factual claims about observable
artifacts; whether the evidence supports the decision drawn from it belongs to
the reviewer layer (see Adoption, the `[false-premise]` severity).

## Why not transclusion?

The obvious objection: tools already exist that pull real source into a
document — `embedme`, Sphinx `literalinclude`, mdBook `{{#include}}`, MDX
imports. They keep the snippet in sync automatically. Why write a citation by
hand instead of generating one?

**Because a transcluded snippet is true by construction, and that is exactly
why it proves nothing.** The build step guarantees the text matches the file.
It guarantees nothing about whether anyone read it, understood it, or is
describing it correctly — the snippet attests that a build ran. An Evidence
Anchor is written by the author, and can therefore be **wrong**. That is the
whole mechanism: a citation capable of being false is one that had to be
checked before it was written, which is what makes the authoring step
load-bearing. Falsifiability is the product.

The two compose rather than compete: **transclude for documentation, anchor for
claims.** Showing readers what the code looks like is a documentation problem
and generation solves it well. Asserting a fact about the codebase that a
decision rests on is an epistemic problem, and generation cannot touch it.

Every adjacent tool fails in a different direction:

| Approach | Drift-proof? | Catches fabrication? | Machine-re-checkable? |
| --- | --- | --- | --- |
| Prose claim ("the enum is `@shareable`") | — | ❌ | ❌ |
| Transclusion (`embedme`, `literalinclude`, `{{#include}}`) | ✅ | ❌ — generated text cannot be wrong | ✅ (regeneration) |
| GitHub permalink (`blob/<sha>/file#L12`) | ✅ (immutable) | ❌ — nobody clicks it | ❌ |
| Link checker | — | ❌ — verifies existence, not content | ✅ |
| Doctest / executable example | ✅ | ❌ — verifies behaviour, not the claim | ✅ |
| **Evidence Anchor** | via `@rev` + `STALE` | ✅ | ✅ |

"A falsifiable, machine-re-checkable assertion about code" is the empty cell
those tools leave. Which makes the modest description accurate, and it is worth
saying plainly: **this is a linter for a citation format.** The epistemics are
why the format is shaped the way it is; the linter is what you install.

## Auditing what the checker cannot certify

Verdicts certify form, never entailment — a real line, quoted accurately, under
a sentence it does not support, passes. Closing that gap needs a model, and a
model in the verification path would undo the reason to trust any of this. So
`nullius audit` puts one on the other side of the line:

```sh
nullius audit design.md                  # the claims, one dispatch each
nullius audit design.md --emit-brief c1  # the starved brief for one claim
```

Four properties keep the guarantee where it was:

1. **Extraction is deterministic** where it can be — anchored claims come from
   the same parser `check` uses. A model is needed only to pull claims that
   carry no anchor, and that job (`--extract`) may not judge what it extracts.
2. **One claim per dispatch, starved.** Each brief carries one statement and
   the evidence offered for it: no title, no surrounding paragraph, no
   conclusion, and no sibling claims. Claims presented together imply a
   narrative, and a model handed a narrative argues for it. The starve is also
   the smallest prompt-injection surface available — one sentence is a much
   smaller target than a PR-controlled document.
3. **Refute-first.** The default hypothesis is that the claim is false. A model
   sent to find support finds support: a real line that exists, verifies, and
   does not entail the claim. That is the failure this whole spec came from.
4. **Refutations come back as anchors**, in the grammar above, so `check`
   re-verifies them deterministically. Nothing a model says is taken on trust —
   the model proposes, the checker disposes.

`audit --propose` is the older confirmation-shaped mode, kept because
retrofitting a document that has no anchors at all needs it. It is a peer verb
and not the default, deliberately: institutionalising the confirmation-shaped
lane as the main road is how the bias gets built in.

## Security model

The checked document is **untrusted input** — in a CI setting it is
PR-controlled content, the checker's verdict may be posted to a public PR
comment, and under the plan-mode hook the document is an agent-written plan
running on a developer's own machine. An anchor is a citation *and* an
instruction to read a file or run a search, so the gate between the document
and the operating system is the whole safety story.

- **Path safety, in three layers.** A citation names the file the checker
  reads. Without a guard, a citation pointing at `/etc/passwd` turns the checker
  into a file-probe oracle: the verdict leaks whether a path exists and whether
  a guessed string is in it, and the Action posts that verdict into a PR
  comment. So:

  1. Paths are checked **before any filesystem access** — no absolute paths, no
     `..` traversal, no home expansion, and nothing inside `.git`. The **same
     guard covers the file operands of an absence search**: absence and presence
     are one door, not two.
  2. **Any token that names a location outside the repository is refused
     wherever it appears** — operand, pattern, or flag value. Which words are
     operands depends on a per-flag arity table, and one wrong entry there
     turns a path into an unchecked "flag value"; this layer does not consult
     the table, so containment does not depend on it being perfect. The cost is
     that a regex which looks like an absolute path is refused, loudly.
  3. **Symlinks are resolved before reading or searching.** A string check
     cannot see that a committed `evil-link -> /etc/passwd` is repo-relative in
     spelling and out-of-repo in fact, nor that `gitdir -> .git` stays inside
     the repo while still reaching the credentials store. Both the reader and
     the search operands are re-checked against the resolved path.
  4. **`.git` is pruned from the recursive walk, not merely from the operand.**
     This is the layer that a text guard cannot provide: `grep -r` never needs
     the directory named to descend into it, and with no operand at all it
     defaults to `.`. Under `actions/checkout` — with `persist-credentials` on,
     the default — `.git/config` carries an `AUTHORIZATION: basic <token>`
     header, so the count difference between a matching and a non-matching guess
     is one bit of that token, and the Action posts it into a PR comment. Every
     search therefore runs with `--exclude-dir=.git` (grep) or a negated
     `.git` glob (ripgrep, which skips it by default but not under `--hidden`,
     `--no-ignore` or `-uuu`). The exclusion beats a re-including user glob.
- **No shell, ever.** An absence command is tokenised into a CANONICAL argv
  vector — short clusters split, inline flag values separated, `--` before the
  operands — and spawned directly. The argv that runs is exactly the argv that
  was validated, in one shape rather than four. Nothing reconstructs a string for `/bin/sh`, so quoting
  and metacharacter escaping are not defences this tool has to get right —
  there is no interpreter left to escape from.

  **Evidence:** `packages/claims/src/runners.ts:271@7412847` — `const result = spawnSync(segment.binary, args, {`

  One consequence is deliberate:
  **shell globs are not expanded**. `src/*.ts` is passed through literally and
  the search reports a missing file rather than silently matching nothing. Use
  `-r` with `--include=`/`-g`.
- **A closed flag allowlist.** Allowlisting the binary is not enough, and this
  is the part that is easy to get wrong. `rg --pre <cmd>` runs `<cmd>` against
  every searched file — arbitrary code execution behind a command that still
  begins with `rg`. `--hostname-bin` is a second exec flag, `-z` shells out to
  decompressors, `-f` and `--exclude-from` read attacker-named files, `--files`
  turns the checker into a directory lister, `grep -R` follows symlinks out of
  the repository during its walk, and `-q` or `-m 0` makes every absence claim
  return zero regardless of the pattern. Every flag must be named in the
  per-binary allowlist; an unrecognised flag is `UNSAFE`, never passed through.
  Variable expansion (`$VAR`) is refused outside single quotes rather than
  silently searched for as literal text.

  Denials are **per binary**, because the same letter means different things to
  the two tools: `rg -L` is `--follow` and `rg -z` is `--search-zip`, but
  `grep -L` is `--files-without-match` and `grep -z` is `--null-data`. Refusing
  a harmless grep flag with ripgrep's reason would be the checker asserting
  something false, which is not a thing this tool gets to do.

  **Evidence:** `packages/claims/src/commandSafety.ts:101@7412847` — `["pre", "runs an arbitrary command against every searched file"],`
- **Two time budgets.** A single search is killed after 10s
  (`searchTimeoutMs`), and all searches in one run share a 120s budget. The
  per-search limit bounds one anchor; without the run-wide one a document
  simply carries more anchors, and a document may carry unlimited anchors.

  **Evidence:** `packages/claims/src/runners.ts:18@7412847` — `export const DEFAULT_SEARCH_TIMEOUT_MS = 10_000;`
- **A clean environment.** `RIPGREP_CONFIG_PATH` and `GREP_OPTIONS` are removed
  from the child environment: both smuggle flags in from outside the validated
  argv.

**The failure mode these guards exist to prevent is a passing verdict.** A
refused command that still reported `OK` would be worse than no checker, because
the green result is what a reviewer reads.

## Adoption

Anchors attach to **anything a human approves** — a formal design doc or
ADR, an ephemeral plan-mode plan (the anchor gates the approval moment, not
the archive), or a PR description, which is the one claim-carrying document
every workflow has. Pick whichever artifact your workflow already produces.

1. **See it fire first**: `npx @nullius-inverba/claims demo` builds a sandbox
   fixture — one claim per verdict class — and checks it. No adoption
   required; ten seconds.
2. **Author-side**: teach your agents (or your team) the convention — the
   [plugin](../plugin/) ships a skill for Claude Code, and the skill text is
   plain markdown you can paste into any harness's instructions file.
3. **Check locally**: `npx @nullius-inverba/claims check "docs/rfcs/**/*.md"` from the
   repo root.
4. **Check in CI**: start **advisory** (report, never block). Let the team see
   verdicts on PRs for a few weeks before making the check `strict` — a red
   build on day one trains people to resent the convention rather than trust
   it.
5. **Reviewer-side**: the checker only sees claims written in the structured
   form. A claim asserted in bare prose with no anchor is a reviewer's
   catch — give your review agents a `[false-premise]` severity for an uncited
   load-bearing claim, a claim contradicted by the code, or a risk whose named
   binding moment is wrong, and treat it as a blocker _even when the
   conclusion it supports still looks right_. A right answer reached through a
   wrong premise still needs the premise fixed, because the next change will
   reason from it. See [the reviewer kit](../plugin/reviewers/false-premise.md).
