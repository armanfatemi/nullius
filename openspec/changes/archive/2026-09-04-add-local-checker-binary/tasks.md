# Tasks — add-local-checker-binary

## 0. Prerequisites

- [x] `pnpm build`.
- [x] Reproduce: render a report from the working tree and from the pinned
      release over one range, and confirm they differ.

## 1. Implementation

- [x] Read the override in the Action; fall back to `npx` with the pin.
- [x] Apply it at every invocation site, not only the first.
- [x] Label the comment when the override is in use.

## 2. Safety

- [x] Confirm the override cannot be set from pull-request-controlled content.
- [x] Confirm a fork's pull request cannot reach it.

## 3. Tests

- [x] Unset override: the invocation is byte-identical to today's.
- [x] Set override: the pinned install does not run.
- [x] The label appears only when the override is used.
- [x] Each fails against the pre-change Action. Five of the nine do. The
      byte-identity test passes on both sides *by construction* — it asserts
      the unset case did not change — and the three safety tests are vacuous
      against an Action with no override to constrain.

## 4. Verification

- [x] `pnpm build`, `pnpm type-check`, `pnpm test` — 6 ugrep failures only.
- [x] This repository's own workflow renders a comment from its working tree.
      Needed three edits, not one: `uses: ./action` (the published tag cannot
      read an override it does not have yet), a `pnpm build` before it, and the
      job-level variable. It also needed two pre-existing defects in the card
      step fixed — see below — without which no card renders at all.
- [x] `openspec validate add-local-checker-binary`.

## 5. Found while verifying — fixed here, not proposed

Two defects in the `Grounding card` step, both pre-existing, both of which
made a locally verified card invisible on its own pull request. They are a
better explanation of instances 1 and 2 in the proposal than the version pin
is, and task 13 cannot be demonstrated with either in place.

- [x] The step runs under `set -u` and read `$PR_BODY_MODE`, which its `env:`
      block never declared. Bash aborts on an unbound variable with or without
      `-e`, so the step died before rendering and the Action posted its
      unstructured fallback — indistinguishable from a deliberate choice.
- [x] The step treated a non-zero exit from `check` as "the card did not
      render". `check` exits non-zero to report FINDINGS, so the card was
      discarded on exactly the runs that had something to say. The branch was
      written for a checker too old to know `--format card`, which writes
      nothing; emptiness is now the condition tested.
- [x] A regression test for each, executing the step rather than reading it,
      plus one asserting no step reads a variable its `env:` block does not
      declare — the general form of the first defect.
