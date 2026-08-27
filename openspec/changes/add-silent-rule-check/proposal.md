# Proposal — add-silent-rule-check

> **Depends on:** None

## Problem

`add-rules-compliance` (merged, PR #40) specified a `SILENT-RULE` check but never
implemented it — Section 3 of its `tasks.md` was deliberately deferred because
the design was unresolved. Nothing today verifies that every rule
`nullius rules select --paths <paths>` names as applicable for a run actually
reached a delivered verdict. A rule can go silent for any of three reasons —
the compliance subagent was never dispatched, it was dispatched but never
reported, or it reported something not recognized as a verdict — and a
`/comply` run looks identical to a clean one in all three cases.

## Why now

Directly deferred, at explicit user decision, from a change that has now
merged. This proposal resolves the open design questions that deferral
recorded, rather than leaving `tasks.md` 3.1–3.3 unchecked indefinitely.
Closes issue #8 (attestation ledger) and half of issue #11, per
`add-rules-compliance/proposal.md`'s own Impact section.

## What changes

- **A concrete, previously-unidentified prerequisite fix to `plugin/commands/comply.md`.**
  The journal's `dispatch` record's `task` field is populated from the Task/Agent
  tool's `description` parameter if given, or else only the **first line** of
  `prompt`, clipped to 200 characters:

  **Evidence:** `packages/kit/src/record.ts:157@612f36b` — `const task = str(input["description"]) ?? firstLine(str(input["prompt"]));`

  `buildComplianceBrief`'s rule id appears at `## Rule ${rule.id}`, which is the
  brief's 7th rendered line, not its first:

  **Evidence:** `packages/claims/src/audit.ts:282@612f36b` — `## Rule ${rule.id}`

  So a `/comply` dispatch through the Task/Agent tool today would NOT carry a
  recoverable rule id into the journal unless the dispatcher explicitly passes
  `description` naming it — `/comply`'s instructions must be edited to do this.
- **A journal-side check (kernel)** that cross-references the rule ids
  `rules select` names for a run against that run's journal, and reports
  `SILENT-RULE` for any rule with no delivered verdict. Exact placement
  (extend `JournalVerdict`, or a new narrower union) is Decision 1 in
  `design.md` — genuinely open, argued both ways, not asserted.
- **No change to `/comply`'s existing verdict collection or anchor-verification
  behaviour.** `COMPLIANT`/`VIOLATION` already require anchors `check`
  re-verifies deterministically (`add-rules-compliance`'s existing, shipped
  design) — this proposal does not touch that.

## Non-goals

- **Verdict correctness.** `SILENT-RULE` checks liveness only — did rule `X`
  reach *some* delivered verdict — never whether that verdict is honest. A
  subagent that fabricates a `COMPLIANT` with an anchor that would fail `check`,
  or reflexively claims `NOT-APPLICABLE` on anything ambiguous, still counts as
  "delivered" here. This is a real, known gap, deliberately out of scope: a
  fresh devil's-advocate review of this idea's premise raised it unprompted,
  and closing it would mean connecting the journal to `/comply`'s separate,
  manual `check <plan>` re-verification step — a materially bigger, more
  architecturally novel proposal, tracked as a follow-up rather than folded in
  here.
- **Distinguishing *why* a rule went silent** beyond what `JournalVerdict`
  already provides (`no-terminal`, `silent-reviewer`, etc. already exist for
  the general dispatch-coverage question). `SILENT-RULE` answers "was rule `X`
  covered," not "which of three failure modes explains why not" — `design.md`
  notes where the existing members already partially answer this for free.
- **Cross-journal aggregation.** `add-journal-identity`'s (active, unmerged)
  `witness survey` verb aggregates reports across many journals for a
  different question; unrelated to this single-run check.

## Dependencies

### Hard (must be merged before this starts)

None. Both real prerequisites — `add-witness-recording` and
`add-rules-compliance` — are already merged/archived.

### Soft (design assumes these exist; graceful degradation if absent)

None.

### Enables (future changes that will depend on this)

- Closes the remaining half of issue #8 (attestation ledger) and the
  `/rule-audit` half of #11, per `add-rules-compliance`'s own Impact section.
- A future, separate proposal connecting delivered-verdict liveness to
  anchor-verification correctness (see Non-goals) would build on this.

## Size estimate

|                                 |                                              |
| ------------------------------- | -------------------------------------------- |
| Estimated tasks                 | ~16                                          |
| Packages or surfaces touched    | 2 (packages/claims, plugin/commands)         |
| Risk                            | MEDIUM                                       |
| Expected sessions to implement  | 1                                            |

MEDIUM: growing `JournalVerdict` (if that's the chosen path) is confirmed
structurally safe — no exhaustive switch exists over it anywhere in the
codebase — but this is architecturally novel in a different way: no existing
function in this codebase takes journal content plus an externally-sourced
expected list, so this is a new checking shape, not a mechanical extension of
an established one.

## Open questions

- **Union placement (Decision 1, design.md).** Does `silent-rule` join the
  existing `JournalVerdict`, or does this get its own narrower union, matching
  the `Verdict` → `WiringVerdict` → `RuleVerdict` precedent of "a new kind of
  check gets its own union"? Every current `JournalVerdict` member is
  determinable from the journal's own content alone (confirmed — see
  design.md Context); `silent-rule` would be the first that needs external
  input. Argued, not settled — for Stage 2 review.
- **Rule-id matching convention.** Once `description` carries the rule id
  (see "What changes"), does the check match by exact string equality against
  `description`, or does it also need to handle the case where a `/comply` run
  is resumed/re-dispatched and the same rule id appears in more than one
  dispatch record? Left to `design.md`.
