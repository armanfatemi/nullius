# Tasks — add-init-doctor

## 1. Kernel prerequisites

- [x] 1.1 Restructure the CLI to per-command parsers (hand-rolled is fine;
      the shared flag namespace is what must go)
- [x] 1.2 Reserve `configVersion` in kernel config (accept and ignore)
- [x] 1.3 Tag the Action `v1`; update README to pin it. Done as `v1.0.0`
      (immutable) plus `v1` (moving major tag), both at `eb1511b`. The action
      now pins the checker too — `claims-version`, default `0.7.0` — because
      tagging the YAML while `npx` fetched npm's `latest` would have left `@v1`
      floating, and a breaking CLI change reaching every caller on publish day.
      `README.md` and `action/README.md` moved from `@main` to `@v1` in the
      same commit that created the pin, and the tag was cut after that merged,
      so neither ever documented a ref that did not exist.

## 2. init

- [x] 2.1 Profile definitions as data (plans / prs / specs), including the
      OpenSpec preset globs
- [x] 2.2 Harness/repo detection; plugin-deference on Claude Code
- [x] 2.3 Renderers: `nullius.config.json`, `.nullius/kit.json`, workflow
      file, pointer blocks; `--dry-run`; printed write-log
- [x] 2.4 Idempotency tests: re-run, user-edited pointer line, deleted marker

## 3. doctor

- [x] 3.1 Local checks (hooks resolvable, shims executable, configs parseable,
      journal dir writable, workflow present)
- [x] 3.2 Harness payload probe integration (from add-witness-recording 3.4)
- [x] 3.3 Live fixture proof as the final step
- [x] 3.4 `--fix`: re-render managed artifacts; ownership matching via the
      command-path convention only

## 4. Docs

- [x] 4.1 README quickstart becomes `init` first, personas second
- [x] 4.2 Document the managed-artifact conventions in the kit README
