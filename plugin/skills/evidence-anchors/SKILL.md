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

## The absence form — the thing does not exist

Run the search. Then write the search and its result:

```markdown
**Evidence:** `grep -rn --include='*.graphqls' '@shareable' services/ | grep enum` → 0 results
```

- Only `grep` / `rg` pipelines — no other binaries, no `;`, `&&`, `||`,
  `$( )`, backticks, or redirection (the checker refuses to execute them).
- Use `--include=` / `-g` instead of `**` shell globs (the re-run shell has
  no globstar, so a `**` pattern silently matches nothing).
- One line of output per match — never `grep -c`.

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

## Review dispatches — declare and attest (attestation ledger)

When a document records that reviews happened — review evidence in a PR
description, a run log, a design doc's sign-off section — declare the
dispatches and attest every outcome. **Writing `None` is a valid answer;
writing nothing is not**: an explicit `None` can be disbelieved and checked,
an omission is invisible. The checker fails any declared dispatch with no
delivery entry (`UNDELIVERED`).

Copy this shape exactly:

```markdown
**Ledger:** entry-review
**Expected:** `rule-audit`, `schema-review`
**Delivered:**
- `rule-audit` — 2 findings → `reviews/rule-audit.md`
- `schema-review` — None.
```

- Only the `**Ledger:**` opener activates checking — it must name the review
  cycle.
- Names are inline code in BOTH sections and must match exactly; a name
  expected twice needs two delivery entries.
- Each entry: `` - `name` — <outcome> ``. The outcome is the literal `None`
  or findings text, optionally ending `→ ` + an inline-code findings path
  (the file must exist).
- An entry with no outcome fails (`EMPTY-DELIVERY`). Do not attest an outcome
  you do not know — leave the entry out and let `UNDELIVERED` tell the truth.
- If `nullius.config.json` defines `reviewers`, use only those names.

Spec: https://github.com/armanfatemi/nullius/blob/main/spec/attestation-ledger.md

## Before presenting the document

Run the checker from the repo root and fix every failure:

```sh
npx @nullius-inverba/claims check "<glob for your docs>"
```

A `FABRICATED` or `COUNT-MISMATCH` verdict is not a citation typo — re-examine
the decision that claim was supporting. `DRIFT` passes but tells you the line
number to update. Do not present a document whose check fails.
