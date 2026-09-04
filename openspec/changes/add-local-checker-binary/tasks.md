# Tasks — add-local-checker-binary

## 0. Prerequisites

- [ ] `pnpm build`.
- [ ] Reproduce: render a report from the working tree and from the pinned
      release over one range, and confirm they differ.

## 1. Implementation

- [ ] Read the override in the Action; fall back to `npx` with the pin.
- [ ] Apply it at every invocation site, not only the first.
- [ ] Label the comment when the override is in use.

## 2. Safety

- [ ] Confirm the override cannot be set from pull-request-controlled content.
- [ ] Confirm a fork's pull request cannot reach it.

## 3. Tests

- [ ] Unset override: the invocation is byte-identical to today's.
- [ ] Set override: the pinned install does not run.
- [ ] The label appears only when the override is used.
- [ ] Each fails against the pre-change Action.

## 4. Verification

- [ ] `pnpm build`, `pnpm type-check`, `pnpm test` — 6 ugrep failures only.
- [ ] This repository's own workflow renders a comment from its working tree.
- [ ] `openspec validate add-local-checker-binary`.
