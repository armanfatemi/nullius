# Tasks — add-run-report-metrics

## 0. Prerequisites

- [ ] `add-run-report-card` merged to `main`.
- [ ] `pnpm build`.

## 1. Kernel groundwork — before any metric

- [ ] Add the maximum pipeline iteration to the validator's ledger counts.
- [ ] Add `origin` to `RecordView`, and decide what an absent origin means.
- [ ] Extend `ReportSection` to carry named numeric figures beyond `count`.
- [ ] Extend `dataSection` accordingly; leave `count` meaning what it means.
- [ ] Tests for each, including a section that carries four figures.

## 2. Attribution

- [ ] A derived figure records the tier of its input records.
- [ ] A span crossing tiers is reported unattributed, not hook-attested.
- [ ] Test: a journal mixing origins produces an unattributed active-time figure.

## 3. The metrics

- [ ] `session-span`: active time, window count, threshold, span.
- [ ] Name the idle threshold as an exported constant.
- [ ] Extend `prompts` with a character total, read from `chars` so a redacted
      bundle still counts.
- [ ] `loop-depth` from the validator's figure.
- [ ] Test: active time excludes a long idle gap, window count is exact, span is
      separate and larger. The naive span-only implementation must fail it.
- [ ] Test: the printed threshold is the exported constant, not a literal.
- [ ] Test: operator characters survive a bundle with prompt text withheld.

## 4. Rendering

- [ ] The card projects the new sections through the existing row model, with no
      new card-side mechanism.
- [ ] Test: each new row's tier is the tier its section was placed in.

## 5. Verification

- [ ] `pnpm build`, `pnpm type-check`, `pnpm test` — 6 ugrep failures only.
- [ ] Dogfood gates, both polarities.
- [ ] `openspec validate add-run-report-metrics`.
