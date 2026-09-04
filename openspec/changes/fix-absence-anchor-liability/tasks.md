# Tasks — fix-absence-anchor-liability

## 0. Prerequisites

- [ ] `pnpm build`.
- [ ] Reproduce: add a `%0A` anywhere and watch an archived design document fail.

## 1. Design

- [ ] Choose between a stamp, archive-advisory, and declared scope. Confirm with
      checker-engineer: this changes what a verdict means, not only when it fires.
- [ ] Decide which verdict an afterlife failure earns, and which union it joins.

## 2. Implementation

- [ ] Implement the chosen rule in the absence-claim path.
- [ ] Leave the live-document behaviour exactly as it is.

## 3. Tests

- [ ] A merged or archived document's absence claim behaves as decided.
- [ ] A live document's absence claim still hard-fails on a wrong count.
- [ ] Both assertions fail against the pre-change code.

## 4. Verification

- [ ] `pnpm build`, `pnpm type-check`, `pnpm test` — 6 ugrep failures only.
- [ ] Dogfood gates, both polarities.
- [ ] `openspec validate fix-absence-anchor-liability`.
