---
name: add-silent-rule-check-prereview
description: add-silent-rule-check (RuleCoverageVerdict / checkRuleCoverage) — pre-review rounds 1-2 plus post-review of shipped code (2026-08-26); all plan blockers landed, one residual TERMINAL_RECORD_KINDS typing concern
metadata:
  type: project
---

Reviewed `openspec/changes/add-silent-rule-check/` at plan stage (anchors
`@612f36b`) and again post-implementation on branch
`openspec/add-silent-rule-check` (2026-08-26). Adds a fifth union
`RuleCoverageVerdict = "ok" | "silent-rule"` in
`packages/claims/src/ruleCoverage.ts`, separate from `JournalVerdict`.

**Decision 1 (separate union) endorsed** — different question + different
input shape (externally-produced expected rule-id list), not artifact class.

**All three plan-review items shipped correctly.** Decision 5's trigger
(`outcome: "found"` AND a `COMPLIANT`/`VIOLATION`/`NOT-APPLICABLE` substring)
is enforced in one place, `deliversVerdict`. `witness.ts` gained only an
additive exported const. `--expect-rules` runs strictly after the
`unsupported-version` early return in `runWitness`.

**Round-2 terminal-kind gap: reduced, not closed.** `TERMINAL_RECORD_KINDS`
is exported and imported, so there is one list instead of two — but it is
hand-written beside `case "report":` and typed `readonly string[]`, not
`readonly Kind[]`. `witness.ts` itself argues at `KIND_INTRODUCED` that
hand-written copies drift and derives instead. Filed as a concern, not a
blocker.

**Verified true about the codebase** (2026-08-26): `record.ts:119`
`EXCERPT_LIMIT = 2000`; `record.ts:309` genuinely duplicated verbatim at
`:360` (subagent-stop vs `reportFor` paths); `witness.ts` reports
`duplicate-id` as a hard verdict, which is why `checkRuleCoverage`'s
id-keyed terminal map cannot cross-attribute coverage on a run that
otherwise passes; `buildComplianceBrief` puts read-receipt + verdict at the
top of the answer (`audit.ts:294-298`).

**How to apply:** the read-receipt (rule id echoed back) was NOT used as a
liveness signal — only the verdict keyword, matched as a plain substring, so
`NON-COMPLIANT` and any prose merely mentioning the word both count as
delivered. If a future change tightens that, it is a calibration decision on
the same footing as `PASSING` membership. See
[[add-rules-compliance-prereview]].
