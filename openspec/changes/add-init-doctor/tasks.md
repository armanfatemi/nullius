# Tasks — add-init-doctor

## 1. Kernel prerequisites

- [x] 1.1 Restructure the CLI to per-command parsers (hand-rolled is fine;
      the shared flag namespace is what must go)
- [ ] 1.2 Reserve `configVersion` in kernel config (accept and ignore)
- [ ] 1.3 Tag the Action `v1`; update README to pin it

## 2. init

- [ ] 2.1 Profile definitions as data (plans / prs / specs), including the
      OpenSpec preset globs
- [ ] 2.2 Harness/repo detection; plugin-deference on Claude Code
- [ ] 2.3 Renderers: `nullius.config.json`, `.nullius/kit.json`, workflow
      file, pointer blocks; `--dry-run`; printed write-log
- [ ] 2.4 Idempotency tests: re-run, user-edited pointer line, deleted marker

## 3. doctor

- [ ] 3.1 Local checks (hooks resolvable, shims executable, configs parseable,
      journal dir writable, workflow present)
- [ ] 3.2 Harness payload probe integration (from add-witness-recording 3.4)
- [ ] 3.3 Live fixture proof as the final step
- [ ] 3.4 `--fix`: re-render managed artifacts; ownership matching via the
      command-path convention only

## 4. Docs

- [ ] 4.1 README quickstart becomes `init` first, personas second
- [ ] 4.2 Document the managed-artifact conventions in the kit README
