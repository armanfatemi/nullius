---
name: evidence-anchors
description: Ground documents in verifiable citations. Use whenever writing or editing ANY document a human will approve or review that asserts something about the EXISTING codebase — a design doc, proposal, RFC, ADR, risk assessment, a PLAN (including plan mode), or a PR DESCRIPTION. Load-bearing claims must carry Evidence Anchors that the deterministic checker (npx @nullius-inverba/claims) can re-verify; a claim you cannot cite goes to "Open questions" instead.
---

# Evidence Anchors — grounding claims about existing code

You are writing a document that asserts things about the codebase. Reviewers
— human or agent — will check whether your _plan_ is good, but almost nobody
re-checks whether your _premises_ are true. A false premise that supports a
correct-looking conclusion sails through every review. This skill closes that
hole: every load-bearing claim carries a citation that forces you to open the
file, and a deterministic checker re-verifies the citation afterward.

The convention attaches to **anything a human approves**, not just formal
design docs. That includes a plan written in plan mode — ephemeral is fine;
the anchor gates the approval moment, not the archive — and a PR description,
which is the one claim-carrying document every workflow has. When a plan or
PR body asserts something load-bearing about existing code, anchor it.

Full spec: https://github.com/armanfatemi/nullius/blob/main/spec/evidence-anchors.md

## What needs an anchor

A **load-bearing claim** is a statement about what the existing code, config,
or infrastructure does, on which a design decision rests — anything in a
rationale, an "alternatives considered … rejected because …", a risk
assessment, or a constraint.

- "The deployment runs 2 replicas" → load-bearing, cite it.
- "`PaymentProcessor` already owns a retry queue" → load-bearing, cite it.
- "No service reads this collection" → load-bearing absence, cite the search.
- "Option B is simpler to reason about" → judgment, NO anchor.
- "Users may find this confusing" → product risk, NO anchor.

**The rule: if you cannot cite it, you may not assert it.** Move the claim to
an `## Open questions` section instead. Do not decorate judgment calls with
citations — citation theater trains readers to skim past the anchors.

## The presence form — the thing exists

Open the file. Then write:

```markdown
**Evidence:** `path/to/file.ext:LINE` — `exact text appearing on that line`
```

- Path is repo-relative (never absolute, never `~`, never `..`).
- The quoted text must actually appear on that line (whitespace is
  normalized, so indentation differences are fine).
- If the cited text itself contains a backtick, use a double-backtick span:
  ``**Evidence:** `libs/x.ts:4` —``const q = `query {}`;` `
- **Quote something that could be wrong.** Matching is substring-based, so a
  one- or two-character quote is trivially true and asserts nothing; it
  verifies as `WEAK-ANCHOR`. Quote enough of the line that a real change to the
  code would contradict it.
- **Quote something that occurs once.** A quote matching several lines is
  `WEAK-ANCHOR` while it sits on its cited line, and a hard `UNPINNED` failure
  once that line number goes stale — at that point neither half of the citation
  identifies anything. A stale line number on its own is not a failure:
  `DRIFT` and `WRONG-LINE` pass, and tell you the citation needs updating.
- **Stamp the commit you read.** Run `git rev-parse --short HEAD` and put it in
  the anchor:

  ```markdown
  **Evidence:** `path/to/file.ext:LINE@a1b2c3d` — `exact text on that line`
  ```

  This is worth the extra token. Without it, the checker has only the working
  tree, so it cannot tell a fabrication from code someone deleted afterwards —
  and your honest document goes red on an unrelated refactor a month from now.
  With it, the claim is settled against a commit that cannot change: it passes
  or fails permanently on what you actually saw, and everything the repository
  does afterwards is the advisory `STALE`. Use a commit hash, never a branch
  name — `@main` means something different next week, and is refused.
- For a long quote, or one spanning lines, put it in a fenced block under the
  marker instead — a multi-line block must match consecutively from the cited
  line:

  ````markdown
  **Evidence:** `services/orders/handler.ts:88`

  ```ts
  const result = await retry(() => publish(event), {
    attempts: 5,
  });
  ```
  ````

## The absence form — the thing does not exist

Run the search. Then write the search and its result:

```markdown
**Evidence:** `grep -rn --include='*.graphqls' '@shareable' services/ | grep enum` → 0 results
```

- Only `grep` / `rg` pipelines, and only with allowlisted flags. There is no
  shell: the command is spawned as an argv vector, so `;`, `&&`, `||`, `$( )`,
  backticks, redirection and variable expansion are all refused, as is any
  flag not on the allowlist (`--pre`, `-z`, `-f`, `--files`, `-q` and friends).
- Search paths must be repo-relative, exactly like presence citations.
- Use `--include=` / `-g` instead of shell globs — with no shell, a `*` pattern
  is passed through literally rather than expanded.
- One line of output per match — never `grep -c`.
- **An absence anchor is weaker than a presence anchor, and you should treat it
  that way.** A presence anchor makes you open a file; an absence anchor makes
  you run one search, which is easy to get wrong and still have pass. Its
  verdict is `SEARCH-CLEAN`, not `OK` — it certifies the search, never the
  absence. For a load-bearing absence ("nothing else consumes this"), stack
  several searches — the symbol, the string key, the topic name — and write down
  the blind spots you know remain (dynamic dispatch, DI containers, generated
  code, other repos).

## Compatibility risks — name the binding moment

When claiming a change risks version-skew breakage, first ask: **is this
caught at build time** (types, codegen, schema composition)? If CI catches
it, it is not a runtime risk — delete the paragraph. If it survives, name
when it binds, from the project's closed list (see `nullius.config.json`, or
the default six for replicated services):

```markdown
**Risk:** <one line>
**Binds at:** `rollout-window`
**Skew path:** <producer @ver> → <medium> → <consumer @ver>
**Symptom:** <what observably fails, and where you would see it>
**Mitigation closes it because:** <ties explicitly to the named moment>
```

Then cite the fact that makes the moment real (replica count, the consumer
subscription, the strategy block's absence).

Spec: https://github.com/armanfatemi/nullius/blob/main/spec/binding-moments.md

## Before presenting the document

Run the checker from the repo root and fix every failure:

```sh
npx @nullius-inverba/claims check "<glob for your docs>"
```

A `FABRICATED` or `COUNT-MISMATCH` verdict is not a citation typo — re-examine
the decision that claim was supporting. `DRIFT`, `WRONG-LINE` and `STALE` pass
but tell you the line number to update. Do not present a document whose check
fails.

Two formatting notes, so the checker sees what you meant: a marker written as a
list item (`- **Evidence:** …`) is read normally, but a marker indented four
spaces under a paragraph is treated as quoted example text and **ignored** —
the same as one inside a fenced block. Anchor at the left margin, or as a list
item.

## When the claim needs more than a citation

`check` certifies that the text is where you said it is. It does not certify
that the line supports the sentence above it — a real, accurately quoted line
under a claim it does not entail passes. When a claim is load-bearing enough to
want that second question asked, hand it to `nullius audit <doc>`: each claim
goes to its own agent, alone, and is told to refute it. That is also the honest
route for an absence claim grep cannot settle, which comes back as
`UNVERIFIABLE-BY-SEARCH` rather than as false confidence.

## When you weaken a test, anchor the reason

If your project runs `nullius oracle`, a `deleted`, `skipped` or `weakened`
oracle raises an obligation discharged by a witness-journal `decision` naming
the same `{path, change}` pair. That verdict certifies only that a reason was
**recorded** — it never assesses whether the reason is any good, and no model is
ever asked to.

Which leaves a gap worth closing by hand. `rationale` is prose, written by the
agent that made the edit, and an agent that will loosen an assertion to get
green will also write a fluent sentence about why that was necessary. So:

**The rationale for a hard oracle change carries an Evidence Anchor into the
implementation that made it necessary.**

```json
{"kind":"decision","id":"dec1",
 "choice":"loosened the retry timing assertion",
 "rationale":"the helper now backs off exponentially, so a fixed 100ms bound asserted the old contract. **Evidence:** `src/retry.ts:41@a1b2c3d` — `  const delay = base * 2 ** attempt;`",
 "justifies":{"path":"test/retry.test.ts","change":"weakened"}}
```

Now the reason is falsifiable. `check` re-verifies it forever, and if the
implementation is later reverted the anchor goes `STALE` — surfacing a test edit
that has quietly lost its justification, months after anyone would have thought
to look for it.

**This is a convention, not a verdict, and deliberately so.** Requiring an
anchor mechanically would mean deciding which rationales are load-bearing, and
the rule everywhere else here is that anchors do not go on judgment calls. The
honest claim for the convention is narrow: it does not stop anyone taking the
shortcut, it stops the shortcut being *private*.
