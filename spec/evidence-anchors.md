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

**Quote something that could be wrong.** Matching is substring-based, so a
one-character quote is trivially true and establishes nothing. A quote shorter
than `minAnchorChars` (default 8), or one matching several lines of the file,
verifies as `WEAK-ANCHOR`: the point of the anchor is that re-reading the file
could contradict it, and a quote that cannot be contradicted has not made
anyone look.

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
| `DRIFT`          | Text found within the drift window (default ±3 lines) — the file moved under the doc | ✅      |
| `WRONG-LINE`     | Distinctive text exists in the file, but not near the cited line — stale, not wrong  | ✅      |
| `UNPINNED`       | The quote is neither distinctive nor on its cited line — it pins nothing down        | ❌      |
| `FABRICATED`     | Text does not appear in the file at all                                              | ❌      |
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

**Evidence:** `packages/claims/src/checkClaims.ts:95` — `const DEFAULT_MIN_ANCHOR_CHARS = 8;`

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

**Scope of the guarantee.** Verdicts certify _form_: the text exists at the
cited location, the count matches, the moment is in the vocabulary. They never
certify _entailment_ — a real-but-selectively-quoted line passes. The narrow
problem this spec closes is unsupported factual claims about observable
artifacts; whether the evidence supports the decision drawn from it belongs to
the reviewer layer (see Adoption, the `[false-premise]` severity).

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

  **Evidence:** `packages/claims/src/runners.ts:150` — `shell: false,`

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

  **Evidence:** `packages/claims/src/commandSafety.ts:101` — `["pre", "runs an arbitrary command against every searched file"],`
- **Two time budgets.** A single search is killed after 10s
  (`searchTimeoutMs`), and all searches in one run share a 120s budget. The
  per-search limit bounds one anchor; without the run-wide one a document
  simply carries more anchors, and a document may carry unlimited anchors.

  **Evidence:** `packages/claims/src/runners.ts:15` — `export const DEFAULT_SEARCH_TIMEOUT_MS = 10_000;`
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
