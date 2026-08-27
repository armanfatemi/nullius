# Tasks — add-rules-compliance

## 1. Kernel

- [x] 1.1 `packages/claims/src/rules.ts` (pure core) + `rulesScan.ts` (the
      only module that reads files/globs, mirroring `wiring.ts`/
      `wiringScan.ts`): `parseRuleHeader` — wraps the existing
      `parseFrontmatter`/`declaredList`, adds closed-key/required-id
      /severity-enum validation (config.ts-style); no new frontmatter
      reader, no change to the rule files themselves; a malformed header is
      a `RuleVerdict` (`malformed-rule-header`), not a thrown error, so a
      directory scan reports every bad file, not just the first
- [x] 1.2 `RuleVerdict` union (separate from `Verdict` and from
      `WiringVerdict`), members lowercase-kebab and `ok`-first, matching the
      sibling unions' own convention: `ok`, `ungrounded-rule`, `rule-rot`,
      `malformed-rule-header`. A `PASSING` set (`ok`/`ungrounded-rule`/
      `rule-rot`; `malformed-rule-header` excluded) plus an `isRuleFailure`
      wrapper, mirroring `checkClaims.ts:169-179`'s `PASSING`/`isFailure`
      exactly — do not decide passing/failing from a bare `!== "ok"` check
      anywhere.
- [x] 1.3 Incident-anchor verification: any `**Evidence:**` anchor anywhere
      in a rule's body (no heading-text match required — settled in
      design.md Decision 3) is checked via `checkClaims.ts`'s existing
      per-claim verification (either a new export exposing it, or claims
      synthesized through `checkClaims` + `CheckDeps` — implementer's
      choice, both route through the same checker). Zero anchors →
      `ungrounded-rule`. One or more, `isFailure` true for any → `rule-rot`.
      **`rule-rot` must test `isFailure(checkedVerdict)` — `checkClaims.ts`'s
      own function, applied to the `Verdict` the reused per-claim check
      returns — never a bare `verdict !== "ok"`.** Do not reach for
      `isRuleFailure` here: that wraps `RuleVerdict` (task 1.2's own outer
      verdict, `ok`/`ungrounded-rule`/`rule-rot`/`malformed-rule-header`),
      a different union from the `Verdict` the per-claim check returns —
      passing the wrong union's predicate the wrong value is exactly the
      confusion three separate unions exist to prevent. Concretely: 5 of
      the 8 incident anchors across the 7 grounded rule files already
      report `stale` today (a passing verdict) from ordinary line drift; a
      naive inequality check would misreport 4 of those 7 rules as rotted
      immediately.
- [x] 1.4 `rules select --paths` with stable order and excluded count; glob
      matching is a small hand-rolled `appliesToMatches` (literal segments,
      `*`, `**` — the vocabulary the current 8 rule files actually use), not
      a `minimatch` dependency. `**` MUST match zero segments (so
      `packages/*/src/**/*.ts` matches `packages/claims/src/cli.ts`). Run
      `isSafeRepoPath` (or equivalent) on the candidate path before matching,
      mirroring `wiring.ts:357`'s existing traversal check on the pattern
      side.
- [x] 1.5 Fixtures: grounded rule, ungrounded rule (a **frozen copy** under
      `spec/fixtures/`, modeled on but not a live reference to
      `openspec-shall-first-line.md` — a future edit to that real rule for
      unrelated reasons must not silently stop this fixture testing what it
      claims), rotted rule, malformed header.
- [x] 1.6 Unit tests, one per `RuleVerdict` member, each asserting that
      specific verdict fires by name against its task-1.5 fixture — not
      just that the directory scan's exit code goes non-zero. Required by
      `.claude/rules/verdict-needs-fixture-and-test.md`: a fixture alone is
      not coverage.

## 2. Kit / plugin

- [x] 2.1 `packages/claims/src/audit.ts`: `buildComplianceBrief(rule,
      touchList)` — a sibling of `buildAuditBrief`, same starved-dispatch
      shape (untrusted-text framing, closed verdict vocabulary, anchor
      grammar `check` re-verifies), not a generalization of it. Both
      `COMPLIANT` and `VIOLATION` require an anchor into the plan that
      `check` re-verifies (per the Stage 2 fix to `specs/rules/spec.md`'s
      "Starved compliance briefs" requirement) — only `NOT-APPLICABLE` is
      unanchored.
- [x] 2.2 `/comply` plugin command: select → dispatch per rule → collect →
      re-verify BOTH `COMPLIANT` and `VIOLATION` anchors with `check`
- [x] 2.3 Read-receipt convention (rule id quoted back) documented in the
      brief template
- [x] 2.4 Export `selectRules` from `@nullius-inverba/claims` and import it
      directly in `packages/kit/src/pipeline.ts`'s `routeAgents` (same
      pattern as `parseConfig`/`validateJournal` today — no subprocess call
      to `rules select`) to pre-filter before dispatching `rule-auditor`,
      replacing the agent's own glob-matching; update the function's doc
      comment (currently line 141) to describe the pre-filter instead of the
      gap
- [x] 2.5 Update `packages/kit/src/pipeline.test.ts`'s existing
      `routeAgents` suite for the new conditional behavior — the test
      currently named `"always dispatches rule-auditor, because rule
      selection is the kernel's job"` (≈10 assertions hard-code
      unconditional inclusion) asserts exactly the premise task 2.4
      inverts; it must be rewritten, not deleted silently. Add a new
      assertion for the zero-applicable-rules exclusion case.

## 3. Journal integration (unblocked — add-witness-recording landed
      2026-08-21)

- [ ] 3.1 Journal rule dispatches from `/comply` via `witness record`
- [ ] 3.2 `SILENT-RULE` as a journal query; fixture with one silent rule,
      plus a unit test asserting `SILENT-RULE` fires by name (not only the
      fixture's exit code) — same `verdict-needs-fixture-and-test.md`
      obligation as task 1.6
- [ ] 3.3 Close the loop with issue #8 (ledger) and #11 (/rule-audit half)
