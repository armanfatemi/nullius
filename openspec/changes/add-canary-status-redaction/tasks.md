# Tasks — add-canary-status-redaction

No new verdict, no new command, no exit-code change. Five message sites
routed through one redacting accessor; `canary plant` is the declared
exception. The `CANARY-PRESENT` guard row is deferred to a follow-up.
See `design.md` Decisions 4 and 5.

## Code this change reasons about

**Evidence:** `packages/claims/src/cli.ts:1026@2792fa1` — `  if (sub === "status") {`

**Evidence:** `packages/claims/src/cli.ts:1017@2792fa1` — ``      console.log(`CANARY-CAUGHT — the review flagged ${entry.doc}:${entry.line}`);``

**Evidence:** `plugin/hooks/hooks.json:14@2792fa1` — `        "matcher": "^(Task|Agent)$",`

## 0. Prerequisites / setup

- [ ] 0.1 `pnpm build` and confirm the baseline (765 kernel tests, 6 known
      ugrep-baseline `flagConformance` failures, per `CLAUDE.md`).
- [ ] 0.2 Re-confirm all three consumer sites named in `design.md` Context
      still read the command the way this proposal assumes (CI's
      `canary status` line, SKILL.md's two references) — a quick grep, not a
      rewrite, since a stale line reference here would misdirect the fix.

## 1. Redact the presence branch

- [ ] 1.1 Change `packages/claims/src/cli.ts`'s `status` handler's presence
      branch to print `active canary (planted ${entry.plantedAt})`, dropping
      `entry.doc`/`entry.line` from the message. Exit code and the absence
      branch (`"no active canary"`) unchanged.
- [ ] 1.2 Update the command's own `--help` text (`nullius canary --help`,
      the `status` line) if it currently documents the message format in a
      way that would now be inaccurate.

## 2. Redact `check`'s two canary warnings

Added at refinement iteration 1; see `design.md` Decision 2. Pre-review
established that redacting `status` alone leaves a shorter path to the plant
open, because `check` prints the document itself.

- [ ] 2.1 In `packages/claims/src/cli.ts`, drop `${activeCanary.doc}` from the
      outside-the-matched-set warning, and remove its `run \`canary status\``
      remedy — after task 1.1 that command cannot answer it. Keep the warning
      itself: "a registered canary points at a document outside the matched
      set" is still the diagnostic a human needs.
- [ ] 2.2 In the same block, drop `${activeCanary.doc}` from the stale-registry
      warning. Keep the `delete .git/nullius/canaries.json` remedy — it does not
      require knowing which document, and it is the only signal a human gets
      that the registry has desynchronized from the tree.
- [ ] 2.3 Both remain `console.error` at their current severity. This change
      redacts what they say, never whether they fire.

## 2b. One redacting accessor, and the remaining message sites

Rewritten at refinement iteration 3; see `design.md` Decision 5. Enumerating
call sites was tried three times and missed two surfaces. These tasks build the
accessor first, then route every site through it, so section 1 and section 2
become callers rather than independent edits.

- [ ] 2b.1 In `packages/claims/src/canary.ts`, add an accessor that renders a
      `CanaryEntry` for human output in redacted form — presence and
      `plantedAt`, never `doc` or `line`. Give it an explicit, named way to
      request the unredacted form, used by `canary plant` alone. `plant` must
      read as a declared exception, not as a site somebody forgot.
- [ ] 2b.2 Route `canary status`'s presence branch (task 1.1) through it.
- [ ] 2b.3 Route `check`'s two warnings (tasks 2.1, 2.2) through it.
- [ ] 2b.4 Route `canary verify`'s CAUGHT and MISSED messages through it.
      Exit codes unchanged (`0` caught, `1` missed, `3` tainted, `2` unusable).
- [ ] 2b.5 Route `canary clear`'s confirmation through it
      (`packages/claims/src/cli.ts:1348`). `clear` takes no operand, so this is
      the shortest path of the six and the one the other messages advertise as
      their remedy.
- [ ] 2b.6 Route `clearCanary`'s refusal message through it
      (`packages/claims/src/canary.ts:344`). Note this is a thrown `Error`
      message, not a `console` call — confirm the accessor is usable there
      before assuming it is, since it is the one site that is not a direct
      print.
- [ ] 2b.7 Leave `canary plant`'s own output unredacted, through the explicit
      exception from 2b.1. It prints the location at the one moment the
      coordinator legitimately needs it, and `SKILL.md` Stage 2 Step 3
      instructs recording it then.
- [ ] 2b.8 **Do not touch `canaryGuardResult`.** The `CANARY-PRESENT` guard
      row is deferred to a follow-up change (`design.md` Decision 4). Leaving
      it alone is also what keeps the existing assertion at
      `packages/claims/src/canary.test.ts:296-306` valid — it pins that
      result's source line, and an earlier draft of this plan would have broken
      it without saying so.

## 3. Unit tests

**No CLI-level test for `canary status` exists today.** Pre-review checked
`packages/claims/src/canary.test.ts` (covers `canary.ts`'s functions, never
`cli.ts`'s handler), `packages/claims/src/cli.characterization.test.ts` (lists
`canary` only as a known command name), and `packages/claims/src/cliArgs.test.ts`
(parses `-h` only). So this section writes the first coverage of these branches
rather than adding to existing coverage — the earlier draft asked the
implementer to "confirm existing tests are unaffected," and those tests are not
there to confirm.

- [ ] 3.1 Add CLI-level coverage of `canary status`'s **presence** branch:
      assert the output contains the `plantedAt` value, and assert it does NOT
      contain the planted document's path.
      **Bind the negative assertion to the actual planted values** — assert
      against `entry.doc` and against the composed `` `${entry.doc}:${entry.line}` ``.
      Do NOT use a bare `.not.toContain(":")`: the fixed message still embeds
      `entry.plantedAt`, an ISO timestamp containing colons, so that assertion
      would FAIL against correctly-fixed code. (An earlier draft of this task
      said it would "pass vacuously" — that was backwards, and the two failure
      modes are opposite. The binding recommendation above was always the right
      one; only its rationale was wrong.)
- [ ] 3.2 Add CLI-level coverage of the **absence** branch: output is exactly
      `no active canary`, exit code `0`. This branch is unchanged by this
      change, which is the point — it pins the half that must not move.
- [ ] 3.3 Assert the presence branch still exits `1`. Every consumer named in
      `design.md` Context reads this exit code and nothing else, so it is the
      contract most likely to be broken silently.
- [ ] 3.4 Add coverage for the two `check` warnings from section 2: assert each
      fires under its triggering condition and that neither output contains the
      registered canary's document path. Bind negatively to `entry.doc`, per
      3.1's reasoning.
      **How to construct each condition**, since one is not obvious:
      the out-of-scope warning needs a canary registered against a document
      outside the glob `check` is given — plant, then check a different path.
      The stale-registry warning needs a matched document whose planted claim
      has been removed while the registry entry survives, with `--probing` off;
      there is no CLI sequence that produces this, because `clearCanary`
      (`packages/claims/src/canary.ts:340-350`) removes the planted line and
      deletes the registry atomically. The test must hand-edit the document to
      strip the planted line, leaving `.git/nullius/canaries.json` in place.
      Both are constructible against the temp-repo fixture pattern already used
      in `packages/claims/src/canary.test.ts`.
- [ ] 3.5 Add coverage for `canary verify`'s two messages (task 2b.4): assert
      neither CAUGHT nor MISSED output contains `entry.doc`, and assert both
      still return their existing exit codes. The MISSED case is the one a
      reviewer would actually use as a side channel — it needs only a scratch
      file — so construct it that way.
- [ ] 3.6 Add coverage for `canary clear`'s confirmation (task 2b.5): assert the
      output does not contain `entry.doc`, and that `clear` still reports
      success and still removes the planted line.
- [ ] 3.7 Add coverage for `clearCanary`'s refusal message (task 2b.6): register
      a canary, hand-edit the document so the registered line no longer carries
      the planted claim, and assert the thrown message does not contain
      `entry.doc` while still telling the operator what to do. This is the same
      hand-edited setup 3.4's stale-registry case needs; share it.
- [ ] 3.8 Add a direct unit test of the accessor from task 2b.1: the redacted
      form contains `plantedAt` and neither `doc` nor `line`, and the explicit
      unredacted form contains all three. This is the one test that does NOT
      need the built CLI — the accessor is exported from `canary.ts` — and it is
      the test that pins the rule the other five rely on.

## 4. Fixtures and CI gate

- [ ] 4.1 The CI dogfood gate's `nullius canary (self)` step calls
      `canary status` only *after* `canary clear`
      (`.github/workflows/ci.yml:199-200`), so it exercises the absence branch
      this change does not touch. Confirmed at pre-review by two reviewers
      independently; re-confirm it still passes unmodified. No fixture change
      needed — this change adds no verdict, so
      `.claude/rules/verdict-needs-fixture-and-test.md` does not apply.

## 5. Documentation

- [ ] 5.1 `spec/canary.md`: if it documents `status`'s or `check`'s output
      format, update it to match. Re-check the two Evidence Anchors already in
      that file (`spec/canary.md:51`, `spec/canary.md:81`, citing `canary.ts` —
      not `cli.ts`, so likely unaffected, but confirm rather than assume).
- [ ] 5.2 CHANGELOG.md: a `### Fixed` entry naming the leak this closes,
      framed the way `CHANGELOG.md`'s existing security/consent-adjacent
      fixes are framed (e.g. kit 0.2.0's `.nullius/` consent-boundary entry)
      — a behavior change made for a concrete reason, not a routine tweak.

## 6. Verification

- [ ] 6.1 **`pnpm build` FIRST, before the test suite.** Tasks 3.1-3.7 are
      CLI-level tests: `packages/claims/src/cli.ts` exports nothing and ends in
      `process.exit(main())`, so they cannot import it and must spawn the built
      `dist/cli.js` — the pattern `packages/claims/src/cli.characterization.test.ts`
      already uses, whose own header states it requires a build. An earlier
      draft of this section ran the suite first and rebuilt only before the
      manual check, which would have scored every new test against the binary
      built at task 0.1, before any edit in this change existed. That is
      `.claude/rules/build-before-cli.md`'s exact failure, reproduced inside
      this plan's own verification section.
- [ ] 6.2 Full test suite and type-check. Baseline is six `flagConformance`
      failures on a machine where `grep` is ugrep; any other count is real, and
      the flag table is never the thing to edit.
- [ ] 6.3 Both anchor gates, per `CLAUDE.md`:
      `check 'README.md' 'spec/**/*.md' --require-markers` and
      `check 'openspec/**/*.md'`.
- [ ] 6.4 Manually plant a canary, then run each of `canary status`, `check`
      against a glob that excludes the planted document, and `canary clear`.
      Confirm none of the three names a document or line. Then confirm
      `canary plant`'s own output still DOES — the exception is the point, and
      a redaction that swallowed it would break the coordinator's only source.
