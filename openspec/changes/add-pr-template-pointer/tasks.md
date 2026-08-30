# Tasks — add-pr-template-pointer

## 0. Prerequisites / setup

- [ ] `pnpm build` — the CLIs run from `dist/`, so verification before this is meaningless.

## 1. Command + arg parsing

- [ ] Add `.github/PULL_REQUEST_TEMPLATE.md` to `POINTER_HOSTS` in `packages/kit/src/render.ts`.
- [ ] Add the PR-description pointer constant beside `POINTER_LINE`, exported.
- [ ] Make `planPointer` select the pointer sentence per host, and run its
      whitespace-collapsed idempotence check against the selected sentence.
- [ ] Confirm `planPointer` still returns at most one `PlannedFile` per run, or
      decide deliberately that it may now return two (a repo with both
      `CLAUDE.md` and a PR template) — and record which in `design.md`.

## 2. Hook wiring

- [ ] None. `init` is invoked directly; no harness hook delivers this.

## 3. Fail-open behaviour + local checks

- [ ] Absent PR template → not-found note, exit unchanged, no file created.
- [ ] Present but unreadable → `skip` with the existing "left alone rather than clobbered" reason.
- [ ] Pointer already present → `unchanged`, and running `init` twice is byte-identical.
- [ ] `--dry-run` prints the same plan it would apply and writes nothing.

## 4. Tests

- [ ] `packages/kit/src/init.test.ts` — pointer appended to an existing PR template.
- [ ] Idempotence: second `init` leaves the file byte-identical.
- [ ] Absent host: no file created, note printed.
- [ ] `doctor` reports pointer present / absent / host-absent as three distinct states.
- [ ] `packages/kit/src/init.cli.test.ts` — the write-log names the PR template.

## 5. Documentation

- [ ] `openspec/changes/add-pr-template-pointer/specs/installer/spec.md` delta.
- [ ] This repository's own `.github/PULL_REQUEST_TEMPLATE.md`, carrying the pointer (dogfood).
- [ ] `action/README.md` — cross-reference, since the PR-body check is what the pointer feeds.
- [ ] CHANGELOG entry.
- [ ] `node packages/claims/dist/cli.js check 'openspec/**/*.md'` passes.
