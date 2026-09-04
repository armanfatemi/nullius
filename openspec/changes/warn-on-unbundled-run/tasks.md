# Tasks — warn-on-unbundled-run

## 0. Prerequisites

- [ ] `pnpm build`.
- [ ] Reproduce: record a session, skip `witness bundle`, read the card.

## 1. Design

- [ ] Choose between doctor, the report, and writing the bundle at a known point.
- [ ] Confirm the choice does not make the renderer read `.nullius/runs`, or
      argue explicitly why it should.

## 2. Implementation

- [ ] Implement the chosen notice.
- [ ] Say nothing when there are no journals for the range.

## 3. Tests

- [ ] Journals present, envelope absent: reported, naming the command.
- [ ] No journals: silent.
- [ ] Envelope present: silent.
- [ ] Each fails against the pre-change code.

## 4. Verification

- [ ] `pnpm build`, `pnpm type-check`, `pnpm test` — 6 ugrep failures only.
- [ ] Dogfood gates, both polarities.
- [ ] `openspec validate warn-on-unbundled-run`.
