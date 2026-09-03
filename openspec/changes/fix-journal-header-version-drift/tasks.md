# Tasks — fix-journal-header-version-drift

## 0. Prerequisites

- [ ] `pnpm build`.
- [ ] Reproduce with `spec/fixtures/report/stale-header-bundle.json`.

## 1. Design confirmation

- [ ] Confirm the correction mechanism with checker-engineer before writing code.
- [ ] Confirm the record shape the validator will accept as a version correction.

## 2. Implementation

- [ ] Bounded first-line read to establish the declared version.
- [ ] Append a correction when the declared version is below `SCHEMA_VERSION`.
- [ ] Leave existing header bytes untouched.
- [ ] Keep the whole check off the O(N) path inside the append lock.

## 3. Tests

- [ ] Unit: a 0.2 journal receiving a 0.6 kind ends up valid.
- [ ] Unit: the original header bytes are unchanged.
- [ ] Unit: appending to a long journal reads at most one line.
- [ ] Fixture: a journal that spans a version bump validates clean.
- [ ] Regression: the test fails against the pre-fix code.

## 4. Verification

- [ ] `pnpm build`, `pnpm type-check`, `pnpm test` — 6 ugrep failures only.
- [ ] Both witness fixtures at their expected exit codes.
- [ ] `openspec validate fix-journal-header-version-drift`.
- [ ] Note explicitly that this repository's own hooks run the published kit and do not exercise this fix until release.
