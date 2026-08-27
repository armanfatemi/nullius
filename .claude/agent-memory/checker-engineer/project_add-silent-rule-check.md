---
name: add-silent-rule-check-prereview
description: add-silent-rule-check (RuleCoverageVerdict / checkRuleCoverage) — pre-review iterations 1-2 (2026-08-26); trigger blocker fixed by Decision 5, terminal-kind pin still weak
metadata:
  type: project
---

Pre-reviewed `openspec/changes/add-silent-rule-check/` at plan stage on
2026-08-26 (anchors stamped `@612f36b`). Adds a fifth union
`RuleCoverageVerdict = "ok" | "silent-rule"` in a new
`packages/claims/src/ruleCoverage.ts`, separate from `JournalVerdict`.

**Decision 1 (separate union) endorsed** — different question + different
input shape (externally-produced expected rule-id list), not artifact class.

**Iteration 1 blocker — FIXED in iteration 2.** Decision 5 now requires the
terminal `report` to have `outcome: "found"` AND a `findings` excerpt
containing `COMPLIANT`/`VIOLATION`/`NOT-APPLICABLE`. design.md Decision 5,
`specs/rule-coverage/spec.md`'s first requirement, and tasks 2.2 agree.

**Iteration 1 concern — PARTIALLY fixed, still open.** Terminal-kind
versioning: mitigation is "pin the terminal-kind set with a unit test" (task
4.3), but `witness.ts`'s `KINDS_V03` / `Kind` / `VOCABULARY` are
module-private and not re-exported from `index.ts`. A test living in
`ruleCoverage.test.ts` pins only its own behaviour and passes unchanged after
a v0.4 adds a second terminal kind. Needs an exported vocabulary to assert
against.

**Verified true about the codebase** (2026-08-26): `record.ts:119`
`EXCERPT_LIMIT = 2000`; `record.ts:309` genuinely duplicated verbatim at
`:360` (subagent-stop vs `reportFor` paths) so its `WEAK-ANCHOR` is real
duplication, not a proposal error; `witness.ts:356` unsupported-version stop;
`witness.ts:143` `KINDS_V03`; `witness.ts:73` "Terminal, and alone".
`buildComplianceBrief` puts the read-receipt + verdict at the top of the
answer (`audit.ts:294-298`), so the 2000-char clip is not a truncation risk.

**How to apply:** post-review, check task 4.3's test actually fails on a
schema bump, and whether the read-receipt (rule id echoed back) was used as
the liveness signal instead of / alongside the verdict keyword. See
[[add-rules-compliance-prereview]].
