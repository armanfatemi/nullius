# Tasks — add-witness-recording

## 1. Schema v0.2 (kernel — lands first, before any producer exists)

- [x] 1.1 Add `journal` header record (version, origin, session, source) to
      `witness.ts`; headerless input validates as v0.1
- [x] 1.2 Add `mutation` kind; advance the per-path hash map; forbid reliance
      on mutations
- [x] 1.3 Add `UNSUPPORTED-VERSION` finding (single, terminal)
- [x] 1.4 Update `spec/witness-journal.md` to v0.2; extend both fixtures; add
      a v0.1-compat fixture
- [x] 1.5 Surface `origin` in the `witness validate` summary

## 2. Kit package scaffolding

- [x] 2.1 Create the kit package (working name `@nullius-inverba/kit`),
      depending on the kernel; resolve the `packages/witness` placeholder
      (fold its README's promises into the kit or the spec)
- [x] 2.2 Implement `witness record`: stdin payload → record append with
      advisory lock; per-event correlation in TypeScript with unit tests for
      the parallel, missing-`tool_use_id`, and resume cases

## 3. Claude Code hook pack

- [x] 3.1 One-line shims for PreToolUse:Task, PostToolUse:Task,
      PostToolUse:Edit|Write, Stop, SessionEnd; wire into `plugin/hooks/`
- [x] 3.2 Session-end synthesis of `no-report` terminals
- [x] 3.3 Advisory Stop-hook validation (exit 0, `stop_hook_active` guard)
- [x] 3.4 Probe fixture: record the installed harness's actual payload shape
      for `doctor` (see add-init-doctor) to diagnose against

## 4. CI and docs

- [x] 4.1 Dogfood: run the hook pack in this repo, commit a real journal as a
      fixture, validate it in CI
- [x] 4.2 Document the self-reported tier and its limits in the plugin README
