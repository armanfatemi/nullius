---
name: add-rules-compliance-prereview
description: add-rules-compliance (RuleVerdict / rules select) — pre-review iterations 1-3 (2026-08-26); all plan-stage blockers and concerns cleared at iteration 3; open work is post-review verification only
metadata:
  type: project
---

Pre-reviewed `openspec/changes/add-rules-compliance/` at plan stage on
2026-08-26 (iterations 1 and 2). Adds `packages/claims/src/rules.ts` +
`rulesScan.ts` with a fourth verdict union `RuleVerdict` (`ok`,
`ungrounded-rule`, `rule-rot`, `malformed-rule-header`) plus `rules select
--paths`.

**Iteration 1 blockers — all fixed in iteration 2:** `ok` member and
`ok`-first ordering, the `PASSING` set + `isRuleFailure` (tasks 1.2, mirroring
`checkClaims.ts:169-179`), the `rule-rot` trigger, the `verifyClaim`
false premise (Decision 3 now names the two real integration shapes), the
Decision 3 / Open Questions contradiction, verdict casing, `**`-matches-zero,
and the traversal-safety leg (tasks 1.4).

**Iteration 2 findings — both fixed at iteration 3 (spot-checked):** tasks.md
1.3 now names `isFailure` on the `Verdict` the reused per-claim check returns
and spells out why `isRuleFailure` (a `RuleVerdict` predicate) is the wrong
one; design.md Decision 3's export list now matches
`grep "^export " checkClaims.ts` exactly, all ten. No blockers or concerns
left at plan stage.

**Correct my own iteration-1 over-claim, which propagated into tasks.md 1.3:**
it is NOT true that every current rule's incident anchor is already `stale`.
Verified at `d83ad69`: 4 of 8 anchors drifted (`never-repoint`,
`merge-never-squash` ×2, `model-proposes`, `verdict-needs-fixture`); 3 sit at
unchanged lines and would report `ok` (`build-before-cli` package.json:32,
`one-delivery-mechanism` detect.ts:132, `rev-stamp-change-anchors`
ci.yml:149). The `isFailure`-not-`!== "ok"` argument still holds on the
drifted ones — but say "several", not "all seven".

**How to apply:** at post-review, check `PASSING`/`isRuleFailure` landed as
specified and that the `rule-rot` call site passes a `Verdict` to `isFailure`,
not a `RuleVerdict` to `isRuleFailure`. See
[[add-wiring-malformed-input-prereview]] for the prior change in this file
family.
