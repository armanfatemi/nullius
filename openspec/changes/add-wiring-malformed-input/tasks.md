# Tasks — add-wiring-malformed-input

## 0. Prerequisites / setup

- [x] 0.1 Re-read `packages/claims/src/wiring.ts`, `wiringScan.ts`,
      `frontmatter.ts`, and `spec/wiring.md` at the commit this work actually
      starts from, and re-confirm the line numbers cited in `design.md` — this
      proposal's anchors are rev-stamped at `8c6ea59` and will go `STALE`
      (line moved, still true) or `FABRICATED` (text changed) if the branch
      has moved since.

## 1. Verdict type + parse-failure plumbing

- [x] 1.1 Add `"malformed-hooks"` and `"unclosed-frontmatter"` to
      `WiringVerdict` (`packages/claims/src/wiring.ts`), each with a one-line
      doc comment matching the existing members' style.
- [x] 1.2 Add the `parseError`-shaped field to `HarnessArtifact`
      (`packages/claims/src/wiring.ts`) per `design.md` Decision 2.
- [x] 1.3 In `checkWiring`, check the new field once per artifact, ahead of
      the existing per-field loops, and push the corresponding finding when
      set.
- [x] 1.4 In `frontmatter.ts`, factor `parseFrontmatter`'s fence-matching
      logic into a shared internal helper, and add the new additive export
      that answers "opened but never closed," per `design.md` Decision 3.
      `parseFrontmatter`'s own signature and behavior do not change.
- [x] 1.5 In `wiringScan.ts`: populate the new field in the hook-source loop
      when `JSON.parse` throws (reusing the existing `try`/`catch` in
      `hookCommands`, or a sibling check at the call site — implementer's
      call, but do not change `hookCommands`'s own return contract, since
      `wiringScan.test.ts:170`'s existing assertion on it must keep passing
      unchanged); populate it in `markdownArtifact` when the new
      `frontmatter.ts` helper reports an unclosed fence.
- [x] 1.6 Update the stale comment at `wiringScan.ts:120-124` (currently
      framing the JSON-parse silence as final: "this is a deliberate scope
      boundary, not an oversight") to describe where the verdict now surfaces
      instead — `hookCommands` itself still returns `[]` on parse failure;
      only the caller now also records the failure.

## 2. Unit tests (one assertion per verdict)

- [ ] 2.1 `wiring.test.ts`: a `checkWiring` case where a `HarnessArtifact` has
      `malformed-hooks` set on the new field → asserts the finding's verdict,
      artifact, and detail.
- [ ] 2.2 `wiring.test.ts`: same for `unclosed-frontmatter`.
- [ ] 2.3 `wiringScan.test.ts`: a hooks/settings fixture that fails to parse →
      `scanHarnessRoot` produces an artifact with the new field set (in
      addition to the existing `hookCommands` return-`[]` assertion at line
      170, which stays as-is).
- [ ] 2.4 `wiringScan.test.ts`: a markdown fixture with an opened, never-closed
      frontmatter fence → `scanHarnessRoot` produces an artifact with the new
      field set, and every declared-field array (`dispatches`, `skills`,
      `reads`, `globs`) still reads `[]` as before.
- [ ] 2.5 `frontmatter.test.ts`: the new additive helper — asserts `true` for
      an opened/unclosed fence, `false` for no frontmatter at all, `false` for
      a normally-closed block. `parseFrontmatter`'s own existing tests
      (including the `toBeNull()` assertion at line 44) are not touched.

## 3. Fixtures — valid and broken — and the CI gate

- [ ] 3.1 Add a broken hooks/settings fixture under
      `spec/fixtures/wiring-broken/` containing invalid JSON.
- [ ] 3.2 Add a broken markdown fixture under `spec/fixtures/wiring-broken/`
      whose frontmatter opens and never closes.
- [ ] 3.3 Extend `wiringScan.test.ts`'s `"the broken fixture trips every hard
      verdict"` test (line 187) to include `"malformed-hooks"` and
      `"unclosed-frontmatter"` in the expected `Set<WiringVerdict>`.
- [ ] 3.4 Confirm `"the valid fixture has no findings at all"` (line 181)
      still passes unchanged — the valid fixture has no malformed input to
      trip these on.

## 4. Spec delta (this change's own `specs/wiring/spec.md`)

- [ ] 4.1 Already drafted as part of this proposal
      (`specs/wiring/spec.md` in this change folder) — confirm it still
      matches the implementation once code lands, and adjust scenarios if the
      implementation resolved an Open Question differently than assumed.

## 5. Documentation and full verification

- [ ] 5.1 Update `spec/wiring.md`'s verdict table (`spec/wiring.md:257-265`,
      currently 7 rows) to add the two new rows, and update the "eighth
      member, `ok`" prose (`spec/wiring.md:267-278`) for the new total member
      count.
- [ ] 5.2 Update `spec/wiring.md`'s gap #1 passage
      (`spec/wiring.md:118-121`, "A file that fails to parse as JSON yields no
      hooks and no finding…") — this is no longer true once `malformed-hooks`
      ships, and the passage should say what happens now instead of
      describing a limitation that has been closed.
- [ ] 5.3 Update `CHANGELOG.md`'s "Seven verdicts" line
      (`CHANGELOG.md:23-29`) to the new count and name the two additions.
- [ ] 5.4 Full verification sweep: `pnpm build && pnpm type-check`; `pnpm
      test`; `node packages/claims/dist/cli.js wiring`; `node
      packages/claims/dist/cli.js check 'README.md' 'spec/**/*.md'
      --require-markers`; `node packages/claims/dist/cli.js check
      'openspec/**/*.md'` — all exit 0.
