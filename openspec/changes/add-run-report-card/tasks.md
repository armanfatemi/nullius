# Tasks — add-run-report-card

## 0. Prerequisites / setup

- [ ] `fix-run-report-duplication` is merged to `main`.
- [ ] `pnpm build`.
- [ ] Capture a run report JSON over a range whose bundle validates, as a test input.

## 1. The row model

- [ ] `CardRow` type: id, question, backing section id, **tier id**, mark, result text.
- [ ] The row table: one entry per question, naming its section id and the
      **typed numeric field** its failing figure is read from.
- [ ] A row's failing figure is always a first-class numeric field on the section,
      never a cell parsed out of a rendered `table`. Where a section holds the
      figure only in a cell today — `outcomes` carries `count` as the *total*,
      with `never reported` as a cell — add the field to the section rather than
      teaching the card to parse. Parsing a rendered table would make the card's
      mark depend on presentation.
- [ ] `buildCard(report: RunReport): Card` — projection only; no `RunReportInput` parameter.
- [ ] Tier is read from the `ReportTier` containing the backing section. **No map
      from record kind to tier anywhere in the card** — `SELF_REPORTED_KINDS` in
      the validator is the only such classification, and the module header
      forbids a second.
- [ ] Four marks, not three: `status: "not-recorded"` and *a resolvable count
      that is absent* both render not-recorded. An absent count is never zero.
- [ ] A row whose section id is absent is omitted; the card records the omission.
- [ ] **Test the omission**, which is a distinct behaviour from any mark: build a
      report with a row's section removed, assert the row is absent from the card
      and that the card names what it omitted. A mark test cannot cover this.
- [ ] Unit test per row: clear, attention, and not-recorded for each.
- [ ] Row tests run against a `RunReport` built by `buildRunReport` from
      `spec/fixtures/report/pr58-bundle.json` (the bundle that validates) and from
      the no-bundle case, not against a hand-built `ReportSection`. A synthetic section that agrees with the lookup
      table proves only that the table agrees with itself; the test must be able
      to fail when a row names the wrong underlying field.
- [ ] Test: a section that moves to a different tier moves its row's tier, with no
      card-side edit.
- [ ] Test: a section with `status: "data"` and no `count` renders not-recorded,
      not clear. This is the case that would otherwise print green for a number
      nobody recorded.

## 2. The derived metrics — as SECTIONS, before any card work

These land in `buildRunReport` as ordinary sections in the tier that owns their
records. They are **not** card-only values: a row with no backing section has no
containing tier, which would force the implementer to hand-assign one and
reintroduce the map section 1 forbids.

- [ ] New section `session-span` in the **hook-attested** tier: active time,
      window count, the threshold, and the wall-clock span.
- [ ] New section `loop-depth` in the **self-reported** tier — `stage` is in
      `SELF_REPORTED_KINDS`, so this row is the coordinator's own account.
- [ ] Extend the existing `prompts` section (hook-attested) with a character total.
- [ ] No new section for the agent list: `dispatches` already carries that table.
- [ ] Test: every card row resolves to a section that exists in the built report,
      asserted by iterating the row table — so a row can never be added without
      its section.
- [ ] Active time: sum gaps below the threshold, count windows, keep the span separate.
- [ ] Name the idle threshold as an exported constant and print it.
- [ ] Operator turns and characters, read from `chars` so redacted bundles still count.
- [ ] Loop depth from the maximum `stage.iteration`, tier read from its section.
- [ ] Agent list by name and dispatch count, with no role classification.
- [ ] Expose `phase`, `iteration` and `chars` on `RecordView`.
- [ ] **Test — active time diverges from span.** A journal with one long idle gap:
      assert active time excludes it, the window count is 2, and the span is
      reported separately and is larger. The naive implementation (span) must fail
      this test. Design Decision 5 rests on a ~9x divergence on real data; without
      this case the threshold logic can ship unexercised.
- [ ] **Test — the printed threshold is the constant that drove the computation.**
      Assert against the exported constant, not against a literal: a decorative
      number that agrees with nothing would pass a string-presence check.
- [ ] **Test — operator characters survive redaction.** A bundle whose prompt text
      is withheld still reports a non-zero character count. This is the whole
      reason the metric is characters rather than words.
- [ ] **Test — loop depth reads the maximum iteration**, not the count of `stage`
      records and not the last one seen.
- [ ] **Test — agent list carries no role field**, asserted by name, so a later
      change cannot quietly reintroduce role inference.

## 3. Rendering

- [ ] `renderCard` emitted ahead of the tiers in `renderMarkdown`.
- [ ] Summary line stating how many rows are unanswerable, above the table.
- [ ] The tier-strength sentence above the table.
- [ ] Escape every interpolated value; agent names and prompts are contributor-controlled.
- [ ] Test: a report over budget keeps its card **byte-identically**. Assert the
      card substring is equal to the card rendered without truncation, not merely
      that a marker is present — a presence check passes on a half-truncated card.

## 4. The JSON form

- [ ] Add the `card` key; leave `tiers` unchanged.
- [ ] Every row carries its backing section id and tier id, so a restated value is
      traceable to its source.
- [ ] Test: each row's value equals the value in the section it names. The card
      restates; assert the restatement rather than trusting it.
- [ ] Raise `RUN_REPORT_VERSION` to 2 and assert it in a test.
- [ ] Golden for the card, markdown and JSON.
- [ ] **Review the `NULLIUS_UPDATE_GOLDENS=1` diff by hand before accepting it**,
      and state in the commit what changed and why. Goldens regenerate blindly, so
      an accepted diff is the last place a calibration bug can hide.

## 5. The Action

- [ ] Wrap the tiered document in a details block beneath the card.
- [ ] Confirm the run report marker is unchanged and the upsert still matches.
- [ ] **Teach the Action version 2.** Its gate is `[ "$version" != '1' ]`, an
      equality test, so raising the version makes it post no comment at all — the
      step succeeds and silently skips the artefact this change exists to produce.
      Replace it with an accepted-version set.
- [ ] Test the gate both ways: the raised version posts; a genuinely unknown
      version still refuses and names the version it saw.
- [ ] **Test that the two version vocabularies cannot drift.** The version now
      lives in `witnessReport.ts` and in `action/action.yml`. Add a unit test that
      reads the Action's accepted-version set out of the YAML and asserts it
      contains `RUN_REPORT_VERSION`. Without it, the next bump reproduces exactly
      the silent-no-comment failure this round found, and no test would catch it.
- [ ] Verify end to end on a real range that a comment is actually produced, not
      only that the renderer emitted markdown.

## 6. Verification

- [ ] `pnpm build`, `pnpm type-check`, `pnpm test` — 6 ugrep failures only.
- [ ] `node packages/claims/dist/cli.js check 'spec/**/*.md' --require-markers`.
- [ ] `node packages/claims/dist/cli.js check 'openspec/**/*.md'`.
- [ ] Both witness fixtures at their expected exit codes.
- [ ] `openspec validate add-run-report-card`.
