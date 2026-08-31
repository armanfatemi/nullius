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

## 2b. Redact the guard row and `canary verify`

Added at refinement iteration 2; see `design.md` Decisions 3 and 4. These are
the third and fourth leaking surfaces, found after Decision 2 was written.

- [ ] 2b.1 In `packages/claims/src/canary.ts`, change `canaryGuardResult` to
      build its result with `source: { doc, line: 0 }` instead of
      `line: entry.line`. `0` means document-level, no specific line.
      **This is a new sentinel** — no `line: 0` convention exists in the
      package today and nothing validates `line > 0` (both checked at design
      time). Document the meaning in the function's doc comment, which already
      describes the result as document-level.
- [ ] 2b.2 Confirm the redaction survives `--format json`. The same `source`
      field feeds both renderers, which is why 2b.1 edits the construction
      rather than the formatter — but confirm it rather than assume it, because
      "the fix was applied at the wrong layer" is the defect this task exists
      to avoid.
- [ ] 2b.3 In `packages/claims/src/cli.ts`, drop `${entry.doc}:${entry.line}`
      from `canary verify`'s CAUGHT and MISSED messages. Both still say which
      outcome was scored; neither says where. Exit codes unchanged
      (`0` caught, `1` missed, `3` tainted, `2` unusable).
- [ ] 2b.4 Leave `canary plant`'s output alone — it prints the location by
      design, at the one moment the coordinator legitimately needs it, and
      `SKILL.md` Stage 2 Step 3 instructs recording it then.

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
- [ ] 3.5 Add coverage for the `CANARY-PRESENT` guard row (task 2b.1): plant a
      canary, run `check` over a glob that matches the planted document, and
      assert the result's source line is not the planted line. Assert this for
      **both** the human format and `--format json` — the json assertion is the
      one that catches a fix applied at the renderer instead of at the result.
- [ ] 3.6 Add coverage for `canary verify`'s two messages (task 2b.3): assert
      neither CAUGHT nor MISSED output contains `entry.doc`, and assert both
      still return their existing exit codes.

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
