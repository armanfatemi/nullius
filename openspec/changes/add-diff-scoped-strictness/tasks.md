# Tasks — add-diff-scoped-strictness

## 0. Prerequisites / setup

- [ ] `pnpm build`.
- [ ] Read `packages/claims/src/oracleGit.ts` `parseRange` and decide reuse versus extraction.

## 1. Range resolution

- [ ] Extract or share `parseRange` so `check` and `oracle` do not diverge on range syntax.
- [ ] Resolve the range to a set of changed paths via `git diff --name-status`.
- [ ] Unresolvable range → exit 2 with the range named (Decision 3). Never widen, never narrow.

## 2. Scoping the run

- [ ] New `CheckArgs` field + flag in `packages/claims/src/cliArgs.ts`; reject it on other verbs.
- [ ] Partition results by whether `source.doc` is in the changed set (Decision 1).
- [ ] `summarize` counts in-scope failures into `failures` and out-of-scope into a new sibling field.
- [ ] `exitCode` unchanged — it keeps reading `failures`, whose meaning is preserved (see Compatibility risks).
- [ ] `--require-markers` interaction: decide and document whether the marker floor is scoped too.

## 3. Reporting

- [ ] Human renderer prints the out-of-scope failure count as a named line (Decision 5).
- [ ] JSON summary gains the out-of-scope count as an additive field; `version` unchanged.
- [ ] Out-of-scope results still render individually, marked as not counting.

## 4. Unit tests

- [ ] In-scope failure fails the run; the same failure out of scope does not.
- [ ] Out-of-scope failures are reported and counted, never dropped.
- [ ] Unresolvable range exits 2 and does not fall back to either tier.
- [ ] `summary.failures` still equals the count that decides the exit code.
- [ ] A pre-scoping JSON consumer reading only existing fields sees a consistent report.

## 5. Fixtures + CI gate

- [ ] Fixture repo with one failing anchor in a touched document and one in an untouched document.
- [ ] Assert the exit code flips with the range, not with the fixture contents.
- [ ] Leave the six environmental `flagConformance` failures alone.

## 6. Action + spec + dogfood

- [ ] Action input for scoped strictness alongside `strict`; the two must not be silently combinable.
- [ ] Bump the Action's pinned `claims-version` to the release carrying the flag.
- [ ] Amend `spec/evidence-anchors.md`'s adoption guidance — the advisory-start step gains a third position.
- [ ] `openspec/changes/add-diff-scoped-strictness/specs/check-cli/spec.md` delta.
- [ ] This repo's CI adopts scoped strictness (dogfood).
- [ ] CHANGELOG entry.
- [ ] `node packages/claims/dist/cli.js check 'openspec/**/*.md'` passes.
