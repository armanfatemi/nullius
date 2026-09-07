# Tasks — add-pr-template-pointer

## 0. Prerequisites / setup

- [x] `pnpm build` — the CLIs run from `dist/`, so verification before this is meaningless.

## 1. `planPointer` visits every host group

Settled in `design.md` Decision 4. Do not re-decide any of this at the keyboard.

- [x] Restructure `POINTER_HOSTS` into groups. Group one is `CLAUDE.md`,
      `AGENTS.md` with the existing `POINTER_LINE`. Group two carries the new
      PR-description sentence and exactly two hosts (Decision 5):
      `.github/PULL_REQUEST_TEMPLATE.md` then
      `.github/pull_request_template.md`. Do not add root-level or `docs/`
      spellings — their precedence relative to `.github/` could not be cited,
      and they are an accepted, documented limitation.
- [x] Rewrite the constant's docstring. It currently reads "Where a pointer would
      go, in preference order", which describes a flat list; preference now
      operates within a group and not across groups.
- [x] Add the PR-description pointer constant beside `POINTER_LINE`, exported,
      addressed to the pull request description rather than to the codebase.
- [x] Change `planPointer`'s return type to `PlannedFile[]`. Visit every group;
      within a group keep the existing first-match-wins early exit unchanged, so
      a repo with both `CLAUDE.md` and `AGENTS.md` still gets exactly one
      pointer.
- [x] Run the whitespace-collapsed idempotence check against the *group's own*
      sentence, not a global one.
- [x] Update `buildPlan`'s single call site to push every returned file rather
      than one-or-note. It is the only caller of `planPointer`; find it by
      searching for the name rather than by line number, which drifts.
- [x] Make the not-found note per-group, emitted once per group that matched no
      host. Keep the existing note's *wording* within a group — an `" or "` join
      over that group's own hosts, plus the trailing copyable sentence — because
      first-match-wins still holds inside a group. Note the existing expression
      `POINTER_HOSTS.join(" or ")` cannot be kept verbatim once the constant
      holds groups; it becomes a join over the group's hosts.

## 2. Hook wiring

- [x] None. `init` is invoked directly; no harness hook delivers this.
      Confirmed in Stage 2 review — `planPointer` is called only from `buildPlan`.

## 3. Fail-open behaviour + local checks

- [x] Absent PR template → not-found note, exit unchanged, no file created.
- [x] Present but unreadable → `skip` with the existing "left alone rather than clobbered" reason.
- [x] Pointer already present → `unchanged`, and running `init` twice is byte-identical.
- [ ] `--dry-run` prints the same plan it would apply and writes nothing.

## 4. Tests

- [x] `packages/kit/src/init.test.ts` — pointer appended to an existing PR template.
- [x] **Cross-group coexistence:** a repository with BOTH `CLAUDE.md` and a PR
      template gets a pointer in each, with the correct per-group sentence. This
      is the test that fails against the pre-change code; without it the feature
      can ship as a no-op. Watch it fail first.
- [x] **Within-group exclusivity, the regression guard for grouping.** Fixture
      has BOTH `CLAUDE.md` and `AGENTS.md`. The load-bearing assertion is the
      **negative** one — asserting `CLAUDE.md` got the pointer stays true under
      exactly the flat-list collapse this test exists to catch, so it proves
      nothing on its own:

      ```ts
      expect(readFileSync(join(root, "AGENTS.md"), "utf8")).not.toContain(POINTER_LINE);
      ```

      Equivalently, assert the plan contains no `AGENTS.md` entry. This test is
      green before and after the change; it earns its place because it is the
      only thing in the suite guarding the collapse of groups back into a flat
      visit-everything list.
- [x] Idempotence: second `init` leaves both files byte-identical. Note this
      also catches a global-instead-of-per-group check: the PR sentence would
      never register as present and would be appended again on the second run.
- [x] **Missing group reported even when another group matched:** fixture has
      `CLAUDE.md` present and NO PR template. Assert `CLAUDE.md` gets its
      pointer AND `plan(root).notes` carries a not-found note naming the PR
      template. The `CLAUDE.md`-present half is the whole point — a fixture with
      neither host is red pre-change for the wrong reason (the template is not a
      known host yet) and would stay green under a reintroduced first-match-wins
      suppression, which is the defect this change has already had named twice.
- [x] Absent group, nothing else present: no file created, note still emitted.
- [x] Unreadable host → `skip`. Reachable without `chmod` by placing a directory
      where the file should be; `doctor.test.ts` already uses that pattern for
      the same EACCES-class path.
- [x] **Case-sensitivity guard first, before either test below.** Detect at
      runtime whether the filesystem distinguishes case (write one spelling,
      `existsSync` the other). Both tests below are meaningless where it does not
      — on this machine's APFS, `existsSync` on the uppercase spelling returns
      true when only the lowercase file exists, so the loop matches at position 1
      and the fallthrough is never exercised. Follow the house pattern in
      `flagConformance.test.ts`: `skipIf` the case-dependent tests, AND add an
      `it.skipIf(!IN_CI)` that asserts the filesystem IS case-sensitive, so a
      silent skip in CI is itself a failure. A bare `skipIf` is not sufficient —
      that file documents why.
- [x] **Alternate spelling is found (Decision 5):** case-sensitive only. A
      repository whose only template is `.github/pull_request_template.md` gets
      the pointer there and NO not-found note for the template group.
- [x] **Within the template group, the first spelling wins:** case-sensitive
      only. A repository with both `.github/PULL_REQUEST_TEMPLATE.md` and
      `.github/pull_request_template.md` gets the pointer in the uppercase one,
      with the negative assertion on the lowercase — `.not.toContain` on its
      contents, not merely a positive assertion on the other.
- [x] **Neither spelling present → the note fires.** Both hosts absent is the
      only condition that may emit the template group's not-found note; assert it
      does not fire when either one is present.
- [ ] `packages/kit/src/init.cli.test.ts` — the write-log names the PR template.

- [ ] **Document the case-insensitive caveat where a reader will hit it.** On a
      case-insensitive filesystem a repository whose template is
      `.github/pull_request_template.md` matches at the uppercase entry, so the
      pointer lands correctly but `PlannedFile.path` — and therefore the
      write-log — names a spelling that does not exist in git. This is feature
      behaviour, not a test artefact. A comment beside the group literal, and a
      line in the CHANGELOG entry.

## 5. Documentation

- [ ] `openspec/changes/add-pr-template-pointer/specs/installer/spec.md` delta,
      re-derived after Decision 4: the "exactly one appended line" scenario is
      about the template's own bytes, not about the run as a whole.
- [ ] Append the pointer to this repository's **existing**
      `.github/PULL_REQUEST_TEMPLATE.md` (dogfood). It already exists and
      already carries a checklist — append one line, do not rewrite the file.
- [ ] `action/README.md` — cross-reference, since the PR-body check is what the pointer feeds.
- [ ] CHANGELOG entry.
- [ ] Rev-stamp every Evidence Anchor written into this change folder at
      authoring time (`git rev-parse --short HEAD` when the cited file is read).
      Do not repoint an existing line number under an old stamp; re-stamp both
      halves or leave the citation alone.
- [ ] `node packages/claims/dist/cli.js check 'openspec/**/*.md'` passes.

## 6. Follow-ups (explicitly out of scope, tracked here)

- [ ] An advisory verdict for bare inline citations. `check` parses
      `**Evidence:**` anchors and is blind to a backtick `path:line` written in
      running prose, so an uncheckable citation can sit beside a checked one and
      survive a green gate — it did so twice in this change's own review, once
      after the defect had already been reported. rule-auditor's judgement, which
      I endorse: a prose rule saying "never write a bare line number" would be
      enforceable only by eye, and the honest fix is mechanical, in
      `checkClaims.ts`. That is a kernel change and out of scope here by this
      proposal's own non-goals.
- [ ] `doctor` reporting whether the pointer is present. Dropped in Stage 3:
      `doctor` never calls `planPointer` today (it runs with `touchUserFiles`
      false) and `doctor.ts` has no pointer awareness at all, so this is new
      surface rather than an extension. Consequence accepted for now: a pointer
      deleted by hand is not reported. Worth its own change.
