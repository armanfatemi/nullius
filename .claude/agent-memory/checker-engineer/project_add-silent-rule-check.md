---
name: add-silent-rule-check-prereview
description: add-silent-rule-check (RuleCoverageVerdict / checkRuleCoverage) — pre-review at plan stage 2026-08-26; union placement endorsed, terminal-vs-delivered-verdict trigger blocker open
metadata:
  type: project
---

Pre-reviewed `openspec/changes/add-silent-rule-check/` at plan stage on
2026-08-26 (change proposed at `ca6ce01`, anchors stamped `@612f36b`). Adds a
fifth union `RuleCoverageVerdict = "ok" | "silent-rule"` in a new
`packages/claims/src/ruleCoverage.ts`, deliberately separate from
`witness.ts`'s `JournalVerdict`.

**Decision 1 (separate union) endorsed.** The discriminator is a different
*question* + a different *input shape*, not a different artifact class —
`checkClaims`/`wiring`/`rules` all read repo files, so artifact class was never
what drove the earlier splits. Design.md argues it on the right axis.

**Open blocker to re-check post-review:** `silent-rule`'s trigger is
"dispatch reached a terminal (`report`) record", but `witness.ts:127`'s
`OUTCOMES = ["found", "empty", "no-report"]` means a `no-report` terminal is a
terminal — so a rule that explicitly reported nothing counts as covered, while
the spec's own requirement heading says "must reach a delivered verdict". Same
shape as `add-rules-compliance`'s `rule-rot` trigger calibration.

**Second open item:** Decision 3's two-scanner bounding argument ("drift is
bounded to record shape, which `malformed` catches") has a hole — the terminal
*kind vocabulary* is versioned (`witness.ts:136-144`, `KINDS_V01..V03`); a
future second terminal kind would be valid to `validateJournal` and invisible
to a hardcoded `"report"` scan, producing a hard-failing false positive that
`malformed` never sees.

**How to apply:** if this comes back post-review, check the trigger condition
first (does a `no-report` terminal still count as covered?) and whether the
terminal kind set is pinned by a test. See
[[add-rules-compliance-prereview]] for the prior change in this family.

**Also noted (repo hygiene, not this change's fault):** two unstamped anchors
in `.claude/agents/checker-engineer.md` have drifted — `checkClaims.ts:167`
(now 169) and `wiring.ts:85` (now 111).
