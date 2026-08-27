# Tasks — add-silent-rule-check

## 1. `plugin/commands/comply.md`: carry the rule id into the journal

- [ ] 1.1 Edit the dispatch step (currently step 2) so that when dispatching
      each starved brief via the Task/Agent tool, the instructions require an
      explicit `description` parameter naming the rule id — e.g. `comply:
      <rule-id>`. Without this, `record.ts`'s `task` field falls back to the
      brief's first line (`buildComplianceBrief`'s opening sentence, not the
      rule id — see design.md Context).

## 2. Kernel: `RuleCoverageVerdict` + `checkRuleCoverage`

- [ ] 2.1 New file `packages/claims/src/ruleCoverage.ts` (pure core, no fs/git
      access — design.md Decision 2): `RuleCoverageVerdict = "ok" |
      "silent-rule"`, lowercase-kebab per this repo's convention (uppercase is
      a display-only form — see `WiringVerdict`/`RuleVerdict` precedent). A
      `PASSING` set (`["ok"]`, matching `JournalVerdict`'s own — a rule either
      has a delivered verdict or it doesn't, no partial credit) and
      `isRuleCoverageFailure`.
- [ ] 2.2 `checkRuleCoverage(journalContent: string, expectedRuleIds:
      readonly string[]): RuleCoverageFinding[]` — a minimal, independent scan
      (design.md Decision 3): parse only `dispatch` and `report`/terminal
      records, ignore every other kind. For each id in `expectedRuleIds`, find
      dispatch records whose `task` field equals it (see task 1.1 and the
      matching-convention open question in design.md — resolve during
      implementation, document the choice made).
      **A rule counts as covered only when its matching dispatch's terminal
      `report` has `outcome: "found"` AND its `findings` excerpt contains
      `COMPLIANT`, `VIOLATION`, or `NOT-APPLICABLE` (design.md Decision 5 —
      this was Stage 2's one blocker: "reached a terminal record" is NOT the
      same fact as "delivered a verdict", and `outcome: "no-report"`/`"empty"`
      are terminals that must still produce `silent-rule`).** No matching
      dispatch, no terminal, or a terminal with no recognized verdict string
      all produce `{ verdict: "silent-rule", ruleId, detail }`. Covered → no
      finding for that id (implicitly `ok`).
- [ ] 2.3 Do NOT touch `packages/claims/src/witness.ts`'s `JournalVerdict`,
      `validateJournal`, or its internal record-parsing — this is a new,
      separate union and function (design.md Decision 1/3).
- [ ] 2.4 `RuleCoverageFinding` has NO `line` field — an absent-rule finding
      has no single journal line to point at (unlike every `JournalFinding`,
      which is about one record). Shape: `{ ruleId: string; verdict:
      RuleCoverageVerdict; detail: string }`. See task 3.2 for how this
      reports differently from a line-based finding.

## 3. CLI wiring

- [ ] 3.1 `packages/claims/src/cliArgs.ts`: add an optional `--expect-rules
      <id...>` flag to `witness validate`'s argument parsing (`WitnessArgs`
      gains `expectRules: string[] | undefined`).
      **This is NOT a drop-in mirror of `rules select`'s `--paths` parsing —
      `parseWitness` (`cliArgs.ts:267-272`) currently accepts NO flags at
      all** (every `-`-prefixed arg is rejected via `rejectMisplaced`); this
      task is a structural change to that shared flag-rejection logic, not
      an additive copy of an existing flag-accepting parser. Also add a
      `FLAG_OWNERS` entry (`cliArgs.ts:82-89`) for `--expect-rules`, or a
      misplaced use of it under another command reports the wrong home in
      its own error message. (Stage 2: checker-engineer, test-engineer, and
      architecture-reviewer independently caught this same understatement —
      read task 3.1 carefully before starting, this is not as small as it
      first reads.)
- [ ] 3.2 `packages/claims/src/cli.ts`'s `runWitness`: when `--expect-rules`
      is given —
      1. Run `validateJournal(content)` first.
      2. **If its findings include `unsupported-version`, do NOT run
         `checkRuleCoverage` at all** (design.md Decisions 3 and 4) — report
         only the validation failure, exit non-zero.
      3. Otherwise, also call `checkRuleCoverage(content, expectRules)` and
         merge its findings into the same report/exit-code.
      `RuleCoverageFinding` has no `line` field (task 2.4) — report it in a
      format that doesn't imply one, e.g. `SILENT-RULE  <ruleId>  <detail>`
      rather than `runWitness`'s existing `<VERDICT> <journal>:<line>
      <subject>` line shape, which assumes a line number every
      `JournalFinding` has and no `RuleCoverageFinding` does.
- [ ] 3.3 Without the flag, `witness validate`'s behaviour is byte-for-byte
      unchanged — add a test asserting this (existing `witness.test.ts`
      fixtures must still pass with no flag).
- [ ] 3.4 Add a unit test for the `unsupported-version` skip (task 3.2 step
      2): a journal declaring an unreadable schema, run with
      `--expect-rules`, must report `unsupported-version` and exit non-zero
      WITHOUT any `silent-rule` finding — pin this by name, since it's the
      fix for a false premise caught in Stage 2 review (design.md Decision 3).

## 4. Unit tests (`.claude/rules/verdict-needs-fixture-and-test.md` — blocker severity)

- [ ] 4.1 `ruleCoverage.test.ts`: a unit test asserting `silent-rule` fires by
      name for (a) a rule id with no matching dispatch at all, and (b) a rule
      id whose dispatch exists but has no terminal record. A separate test
      asserting `ok` (no finding) when every expected id has a
      dispatch-with-terminal.
- [ ] 4.2 A test for the re-dispatch case decided in task 2.2 (same rule id
      appearing in more than one dispatch record) — whichever convention was
      chosen, pin it by name so a future change can't silently flip it.
- [ ] 4.3 A test pinning the current terminal-kind set (design.md Decision
      3, risk 3): assert `checkRuleCoverage` recognizes `"report"` as the
      only terminal kind. Written so that a future schema version adding a
      second terminal kind fails this test rather than silently
      misclassifying a covered rule as `silent-rule`.
- [ ] 4.4 A test for the two-independent-scanners risk (design.md Decision
      3, risk 1; Stage 2 concern, test-engineer): a journal containing one
      structurally malformed `dispatch` or `report` record (bad JSON, or a
      record missing its `id`) alongside otherwise-valid records. Assert
      that `checkRuleCoverage`'s scan does not silently treat the malformed
      record as a valid dispatch/terminal (e.g. does not report a rule
      `ok`-covered on the strength of a record `validateJournal` itself
      would flag `malformed`) — whether by skipping it, or by producing its
      own finding; document which.

## 5. Fixtures and the CI gate

- [ ] 5.1 `spec/fixtures/rule-coverage-valid.jsonl` (or similar, following
      this repo's `spec/fixtures/<name>-valid`/`<name>-broken` naming
      convention) — a journal where every expected rule id has a
      dispatch-with-terminal.
- [ ] 5.2 `spec/fixtures/rule-coverage-broken.jsonl` — a journal with one rule
      id silently missing (covers task 4.1's cases), plus either this file or
      a sibling fixture covering the `outcome: "no-report"`-still-silent case
      (task 2.2 / design.md Decision 5) and the malformed-record case (task
      4.4) — split into separate fixture files if one journal covering all
      three gets hard to read.
- [ ] 5.3 CI dogfood gate in `.github/workflows/ci.yml`, mirroring the
      pattern `add-rules-compliance` established for `nullius rules (self)`:
      valid fixture passes with `--expect-rules`, broken fixture fails
      negated. Do not skip this — `add-rules-compliance`'s own Stage 6
      post-review caught exactly this omission for the `rules` command, and
      it is the first thing three independent reviewers converged on.

## 6. Spec delta

- [ ] 6.1 `specs/rule-coverage/spec.md` (or fold into the existing `rules`
      capability under `openspec/specs/` if a sibling reviewer judges that
      more coherent) — SHALL/MUST on the requirement's first line
      (`.claude/rules/openspec-shall-first-line.md` — the parser reads only
      line one), at least one `#### Scenario:` block, mirroring
      `add-rules-compliance/specs/rules/spec.md`'s shape for the analogous
      "Silent rules fail the run" requirement it already sketched (now
      superseded by this proposal's actual design — do not just copy it
      verbatim without checking it still matches `RuleCoverageVerdict`'s
      shape, not `RuleVerdict`'s).

## 7. Public exports and full verification

- [ ] 7.1 Export `RuleCoverageVerdict`, `isRuleCoverageFailure`,
      `checkRuleCoverage`, and `RuleCoverageFinding` from
      `packages/claims/src/index.ts`, following the existing per-module
      export-block convention.
- [ ] 7.2 `pnpm build && pnpm type-check && pnpm test` clean (known baseline:
      exactly 6 `flagConformance` failures, all in that one file — see
      CLAUDE.md; anything else is real).
- [ ] 7.3 Full dogfood gate sweep, both polarities — `witness`, `wiring`,
      `rules`, `check` — confirming nothing in this proposal's diff regressed
      an unrelated gate.

## 8. Close the `/comply` loop (blocked on design.md's open question)

- [ ] 8.1 `plugin/commands/comply.md`'s final report step: after collecting
      verdicts, run `witness validate --expect-rules <ids from step 1>
      <this session's journal>` as a final integrity check, and report a
      `SILENT-RULE` finding to the user exactly as prominently as a
      `VIOLATION`. **Blocked on resolving how the command discovers the
      current session's journal path** — design.md's first Open Question.
      Do not guess at a mechanism; investigate during implementation and
      document what was found.
