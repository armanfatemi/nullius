# Tasks — add-run-report-card

## 0. Prerequisites / setup

- [x] `fix-run-report-duplication` is merged to `main`.
- [x] `pnpm build`.
- [x] Capture a run report JSON over a range whose bundle validates, as a test input.

## 1. The row model

- [x] `CardRow` type: id, question, backing section id, **tier id**, mark, result text.
- [x] The row table: one entry per question, naming its section id and the
      **typed numeric field** its failing figure is read from.
- [x] Add two named optional numeric fields to `ReportSection`, one per row that
      has no figure today, and populate them where the sections are built:
      `outcomes` gains the never-reported count (its `count` is the total of all
      three terminal states), and `canary` gains a figure for the probe row (it
      is built with notes and no count at all).
- [x] Test each new field is populated from a real built report, and that the
      row reading it produces the right mark. Two named fields, not a general
      multi-figure capability — that belongs to `add-run-report-metrics`.
- [x] A row's failing figure is always a first-class numeric field on the section,
      never a cell parsed out of a rendered `table`. Where a section holds the
      figure only in a cell today, add the field to the section rather than
      teaching the card to parse. Parsing a rendered table would make the card's
      mark depend on presentation.
- [x] `buildCard(report: RunReport): Card` — projection only; no `RunReportInput` parameter.
- [x] Tier is read from the `ReportTier` containing the backing section. **No map
      from record kind to tier anywhere in the card** — `SELF_REPORTED_KINDS` in
      the validator is the only such classification, and the module header
      forbids a second.
- [x] Four marks, not three: `status: "not-recorded"` and *a resolvable count
      that is absent* both render not-recorded. An absent count is never zero.
- [x] A row whose section id is absent is omitted; the card records the omission.
- [x] **Test the omission**, which is a distinct behaviour from any mark: build a
      report with a row's section removed, assert the row is absent from the card
      and that the card names what it omitted. A mark test cannot cover this.
- [x] Unit test per row: clear, attention, and not-recorded for each.
- [x] Row tests run against a `RunReport` built by `buildRunReport` from
      `spec/fixtures/report/pr58-bundle.json` (the bundle that validates) and from
      the no-bundle case, not against a hand-built `ReportSection`. A synthetic section that agrees with the lookup
      table proves only that the table agrees with itself; the test must be able
      to fail when a row names the wrong underlying field.
- [x] Test: a section that moves to a different tier moves its row's tier, with no
      card-side edit.
- [x] Test: a section with `status: "data"` and no `count` renders not-recorded,
      not clear. This is the case that would otherwise print green for a number
      nobody recorded.

## 2. Deferred — the derived metrics

Active time, operator characters and loop depth are **not in this change**. Three
pre-review rounds established they are kernel work, not rendering: `ReportSection`
carries one numeric field where they need four, the renderer may not derive a
tier from a record kind, and `RecordView` has no `origin` to attribute a derived
span with. They are filed as `add-run-report-metrics`, which depends on this
change and arrives through this change's row model with no new card mechanism.

- [x] Confirm no task below reintroduces a metric row.

## 3. Rendering

- [x] `renderCard` emitted ahead of the tiers in `renderMarkdown`.
- [x] Summary line stating how many rows are unanswerable, above the table.
- [x] The tier-strength sentence above the table.
- [x] **Test the tier-strength sentence by content**, and that it is present
      whenever any row sits in the self-reported tier. A task to write a sentence
      is not an assertion that it says anything.
- [x] **Test that the agent row asserts no role.** The spec requires it and the
      refusal is one of three the change is built on; nothing currently would
      fail if a later edit added a role-classification pass. Assert the row
      carries no role field and that its text is names and counts only.
- [x] Escape every interpolated value; agent names and prompts are contributor-controlled.
- [x] **Test the escaping by name**, which is the one security-relevant rendering
      claim the card makes and the only §3 claim that had no assertion. An agent
      name or section title containing a pipe, a newline, a backtick or a leading
      `#` must render inertly with the table structure intact. Use the existing
      `escapeCell` tests as the model; the checked document and the bundle are
      both contributor-controlled input.
- [x] Test: a report over budget keeps its card **byte-identically**. Assert the
      card substring is equal to the card rendered without truncation, not merely
      that a marker is present — a presence check passes on a half-truncated card.

## 4. The JSON form

- [x] Add the `card` key; leave `tiers` unchanged.
- [x] Every row carries its backing section id and tier id, so a restated value is
      traceable to its source.
- [x] Test: each row's value equals the value in the section it names. The card
      restates; assert the restatement rather than trusting it.
- [x] Raise `RUN_REPORT_VERSION` to 2 and assert it in a test.
- [x] Golden for the card, markdown and JSON.
- [x] **Review the `NULLIUS_UPDATE_GOLDENS=1` diff by hand before accepting it**,
      and state in the commit what changed and why. Goldens regenerate blindly, so
      an accepted diff is the last place a calibration bug can hide.

## 5. The Action

- [x] Wrap the tiered document in a details block beneath the card.
- [x] Confirm the run report marker is unchanged and the upsert still matches.
- [x] **Teach the Action version 2.** Its gate is `[ "$version" != '1' ]`, an
      equality test, so raising the version makes it post no comment at all — the
      step succeeds and silently skips the artefact this change exists to produce.
      Replace it with an accepted-version set.
- [x] Test the gate both ways: the raised version posts; a genuinely unknown
      version still refuses and names the version it saw.
- [x] **Test that the two version vocabularies cannot drift.** The version now
      lives in `witnessReport.ts` and in `action/action.yml`. Add a unit test that
      reads the Action's accepted-version set out of the YAML and asserts it
      contains `RUN_REPORT_VERSION`. Without it, the next bump reproduces exactly
      the silent-no-comment failure this round found, and no test would catch it.
- [x] Verify end to end on a real range that a comment is actually produced, not
      only that the renderer emitted markdown.

## 6. Verification

- [x] `pnpm build`, `pnpm type-check`, `pnpm test` — 6 ugrep failures only.
- [x] `node packages/claims/dist/cli.js check 'spec/**/*.md' --require-markers`.
- [x] `node packages/claims/dist/cli.js check 'openspec/**/*.md'`.
- [x] Both witness fixtures at their expected exit codes.
- [x] `openspec validate add-run-report-card`.
