# Tasks — add-canary-status-redaction

No new verdict, no new command, no exit-code change. See `design.md`
Decision 1.

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
      A bare `.not.toContain(":")` passes vacuously against the fixed code,
      because `plantedAt` is an ISO timestamp and contains colons; it would
      prove nothing while looking like a regression test.
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

- [ ] 6.1 Full test suite, type-check, both anchor gates, per `CLAUDE.md`.
      Baseline is six `flagConformance` failures on this machine (ugrep); any
      other count is real.
- [ ] 6.2 **`pnpm build` before any manual CLI check below.** Tasks 1.1 and 2.x
      edit `cli.ts`, and the CLIs run from `dist/` — without a rebuild here,
      6.3 would exercise the pre-change binary and certify work that does not
      exist yet (`.claude/rules/build-before-cli.md`).
- [ ] 6.3 Manually plant a canary, run `canary status`, confirm the printed
      line names no document and no line number. Then, with the canary still
      planted, run `check` against a glob that does NOT include the planted
      document and confirm the warning fires without naming it. Then
      `canary clear`.
