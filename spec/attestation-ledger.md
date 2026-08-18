# Attestation Ledger

**Version 0.1 — draft.** The third convention checked by
[`@nullius-inverba/claims`](../packages/claims/), alongside
[Evidence Anchors](./evidence-anchors.md) and
[Binding Moments](./binding-moments.md). Like Binding Moments, this half is
**additive and severable** — a document with no ledger has nothing here
checked.

## The problem this solves

Three states hide inside a reviewer that returns nothing: _I checked and
found something_, _I checked and found nothing_, and _nobody checked_.
Orchestration layers — human or agent — collapse all three into "no issue
reported," so a review gate can die silently while everything downstream
inherits success-shaped output around the hole.

The fix is the same move the rest of this repo makes: convert a silent gap
into an assertion that can be wrong out loud. **Writing `None` is a valid
answer; writing nothing is not.** An explicit `None` is a claim someone can
later disbelieve and check. An omission is nothing at all.

## The block

Copy-paste form — declare what was dispatched, attest what came back:

```markdown
**Ledger:** entry-review
**Expected:** `rule-audit`, `schema-review`, `security-review`
**Delivered:**
- `rule-audit` — 2 findings → `reviews/rule-audit.md`
- `schema-review` — None.
```

`security-review` is declared and has no delivery entry, so this block fails
the check with `UNDELIVERED` — silence, made loud.

## The grammar, pinned

Ledger checking activates **only** on a line beginning `**Ledger:**` — the
opener names the review cycle. `**Expected:**` and `**Delivered:**` lines
outside an activated block are inert prose; nobody's bug-report vocabulary
accidentally becomes a failing check. Inside an activated block, a line that
fits no shape is `MALFORMED` — a sloppy attestation is exactly the thing the
checker exists to surface. Blocks inside fenced code are ignored, like every
other marker.

- `**Expected:**` — reviewer names as inline code, comma-separated:
  `` `rule-audit`, `schema-review` ``. Names in prose (no backticks) are
  malformed, not silently unmatched.
- `**Delivered:**` — nothing else on the line; entries follow as list items.
- Entry: `` - `name` — <outcome> ``. The outcome is either the literal
  `None` (trailing period accepted) or findings text, optionally ending in
  `→ ` + an inline-code findings path.
- **Names match exactly, with counted multiplicity.** A name expected twice
  needs two delivery entries — 2-of-3 deliveries of a repeated dispatch is
  visible, not laundered by name-level matching.
- A findings path must exist and passes the same path-safety guard as every
  cited path (`MISSING-FILE` / `UNSAFE-PATH` otherwise).

## Verdicts

| Verdict            | Meaning                                                             | Passes? |
| ------------------ | ------------------------------------------------------------------- | ------- |
| `UNDELIVERED`      | Declared, and no delivery entry — the silence itself                 | ❌      |
| `EMPTY-DELIVERY`   | An entry with no outcome — state findings or the literal `None`      | ❌      |
| `UNKNOWN-REVIEWER` | An `**Expected:**` name outside the configured vocabulary            | ❌      |
| `UNDECLARED`       | Delivered but never declared — extra coverage, surfaced not punished | ✅      |

When an undelivered name is a near match of a delivered one, the detail says
so — a typo'd declaration explains itself instead of manufacturing
undeliverable silence:

```
UNDELIVERED      evidence.md:6  secruity-review
                 ! declared and silent — no delivery entry for 'secruity-review'; did you mean 'security-review' (delivered)?
```

The failing verdicts ship in the checker's verdict union:

**Evidence:** `packages/claims/src/checkClaims.ts:45` — `| "undelivered"`

## The reviewer vocabulary

Set `"reviewers"` in `nullius.config.json` to close the namespace — an
invented reviewer name then fails as `UNKNOWN-REVIEWER` with the vocabulary
quoted, exactly parallel to binding moments. Unset, names are free-form:
zero-config adoption first.

```json
{ "reviewers": ["rule-audit", "schema-review", "security-review"] }
```

## What this does NOT certify

The scope discipline of Evidence Anchors applies unchanged: verdicts certify
**form, never substance**.

- An attested `None` certifies that someone wrote `None` — not that the
  review was any good, nor even that it ran. The ledger makes the attestation
  exist so it can be disbelieved and checked; judging it stays with humans.
- `UNDELIVERED` names **non-delivery**, the observable fact. Whether the
  reviewer was dead, silently broken, or its report withheld by
  infrastructure is invisible to a document checker — distinguishing those
  states needs orchestrator cooperation, and pretending otherwise here would
  manufacture confidence.
- Ledger blocks count as grounding markers for `--require-markers` and the
  density report: a document whose only checkable content is a ledger is a
  grounded document.

## Adoption

1. Add the block to whatever your review flow already produces — review
   evidence in a PR description, a run log, the tail of a design doc.
2. `check` picks it up with no flags and no config: the verdicts ride the
   same reporting, exit codes, CI Action, and plan-approval hook as anchors.
3. Close the vocabulary once names stabilize.
