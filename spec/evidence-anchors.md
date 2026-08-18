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

Two authoring constraints follow from how the command is executed:

- **Use `--include=` / `-g`, not a `**`shell glob.** The command runs under`/bin/sh`, which has no globstar — `services/\*_/_.graphqls`silently
degrades and matches nothing. Use`grep -rn --include='\*.graphqls' <pattern> services/`.
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
| `ADVISORY`       | Verified, but worth a human glance (see detail)                                      | ✅      |
| `DRIFT`          | Text found within the drift window (default ±3 lines) — the file moved under the doc | ✅      |
| `WRONG-LINE`     | Text exists in the file, but nowhere near the cited line                             | ❌      |
| `FABRICATED`     | Text does not appear in the file at all                                              | ❌      |
| `MISSING-FILE`   | The cited file does not exist                                                        | ❌      |
| `COUNT-MISMATCH` | The absence command returned a different count than claimed                          | ❌      |
| `UNSAFE-PATH`    | The cited path escaped the repo — never read                                         | ❌      |
| `UNSAFE`         | The absence command failed the sandbox rules — never executed                        | ❌      |
| `COMMAND-ERROR`  | The absence command failed to run                                                    | ❌      |
| `UNKNOWN-MOMENT` | A `**Binds at:**` value outside the project's closed list                            | ❌      |
| `MALFORMED`      | A marker line matching no valid shape                                                | ❌      |
| `UNDELIVERED`    | A declared review dispatch with no delivery entry ([Attestation Ledger](./attestation-ledger.md)) | ❌      |
| `EMPTY-DELIVERY` | A ledger delivery entry with no outcome — `None` is valid; nothing is not            | ❌      |
| `UNKNOWN-REVIEWER` | An `**Expected:**` name outside the configured reviewer vocabulary                 | ❌      |
| `UNDECLARED`     | A ledger report delivered but never declared — surfaced, not punished                | ✅      |
| `CANARY-PRESENT` | The document still contains a registered canary ([Canary](./canary.md))              | ❌      |

An `**Evidence:**` line that matches neither shape is `MALFORMED` rather than
silently skipped — a sloppy citation is exactly the thing the checker exists
to surface.

**A `FABRICATED` or `COUNT-MISMATCH` verdict is not just a citation typo.**
Re-examine the decision that claim was supporting.

**Scope of the guarantee.** Verdicts certify _form_: the text exists at the
cited location, the count matches, the moment is in the vocabulary. They never
certify _entailment_ — a real-but-selectively-quoted line passes. The narrow
problem this spec closes is unsupported factual claims about observable
artifacts; whether the evidence supports the decision drawn from it belongs to
the reviewer layer (see Adoption, the `[false-premise]` severity).

## Security model

The checked document is **untrusted input** — in a CI setting it is
PR-controlled content, and the checker's verdict may be posted to a public PR
comment. Two guards follow:

- **Path safety.** A presence citation names the file the checker reads.
  Without a guard, a citation pointing at `/etc/passwd` turns the checker into
  a file-probe oracle on the CI runner: the verdict leaks whether a path
  exists and whether a guessed string is in it. Paths are therefore checked
  **before any filesystem access**: no absolute paths, no `..` traversal, no
  home expansion.
- **Command safety.** An absence citation carries a shell command the checker
  re-runs. Every segment of the pipeline must begin with `grep` or `rg`, and
  no segment may contain `;`, `&&`, `||`, `$(`, a backtick, `>`, or `<`.
  Anything else is reported as `UNSAFE` and never executed.

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
