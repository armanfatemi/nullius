# Tasks — add-run-report-card

## 0. Prerequisites / setup

- [ ] `fix-run-report-duplication` is merged to `main`.
- [ ] `pnpm build`.
- [ ] Capture a run report JSON over a range whose bundle validates, as a test input.

## 1. The row model

- [ ] `CardRow` type: id, question, backing section id, tier, mark, result text.
- [ ] The row table: one entry per question, naming its section id and its failing count.
- [ ] `buildCard(report: RunReport): Card` — projection only; no `RunReportInput` parameter.
- [ ] A row whose section id is absent is omitted; the card records the omission.
- [ ] Unit test per row: clear, attention, and not-recorded for each.

## 2. The derived metrics

- [ ] Active time: sum gaps below the threshold, count windows, keep the span separate.
- [ ] Name the idle threshold as an exported constant and print it.
- [ ] Operator turns and characters, read from `chars` so redacted bundles still count.
- [ ] Loop depth from the maximum `stage.iteration`, marked self-reported.
- [ ] Agent list by name and dispatch count, with no role classification.
- [ ] Expose `phase`, `iteration` and `chars` on `RecordView`.

## 3. Rendering

- [ ] `renderCard` emitted ahead of the tiers in `renderMarkdown`.
- [ ] Summary line stating how many rows are unanswerable, above the table.
- [ ] The tier-strength sentence above the table.
- [ ] Escape every interpolated value; agent names and prompts are contributor-controlled.
- [ ] Test: a report over budget keeps its card.

## 4. The JSON form

- [ ] Add the `card` key; leave `tiers` unchanged.
- [ ] Raise `RUN_REPORT_VERSION` to 2 and assert it in a test.
- [ ] Golden for the card, markdown and JSON.

## 5. The Action

- [ ] Wrap the tiered document in a details block beneath the card.
- [ ] Confirm the run report marker is unchanged and the upsert still matches.
- [ ] Confirm the Action refuses a document version it does not recognise.

## 6. Verification

- [ ] `pnpm build`, `pnpm type-check`, `pnpm test` — 6 ugrep failures only.
- [ ] `node packages/claims/dist/cli.js check 'spec/**/*.md' --require-markers`.
- [ ] `node packages/claims/dist/cli.js check 'openspec/**/*.md'`.
- [ ] Both witness fixtures at their expected exit codes.
- [ ] `openspec validate add-run-report-card`.
