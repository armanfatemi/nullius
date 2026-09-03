# Tasks — fix-probe-self-disclosure

## 0. Prerequisites

- [ ] `pnpm build`.
- [ ] Reproduce: plant twice against an unchanged tree and confirm the sentences match.
- [ ] Count the published occurrences on `main` to size the existing exposure.

## 1. Design confirmation

- [ ] Decide what varies per plant: a seed, an explicit symbol override, or a
      different harvest strategy. Confirm with checker-engineer.
- [ ] Decide what `plant` does when its claim is already public: refuse, or
      choose another candidate.

## 2. Implementation

- [ ] Vary the planted claim.
- [ ] Search the working tree for the claim before planting.
- [ ] Add the discoverable state to the verify vocabulary.

## 3. Tests

- [ ] Two plants against one tree produce different claims.
- [ ] A claim already present in a tracked file is refused, by name.
- [ ] The discoverable verdict fires, asserted by name and not only by exit code.
- [ ] Regression: each test fails against the pre-fix code.

## 4. Verification

- [ ] `pnpm build`, `pnpm type-check`, `pnpm test` — 6 ugrep failures only.
- [ ] Dogfood gates, both polarities.
- [ ] `openspec validate fix-probe-self-disclosure`.
