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

## 2. Unit tests

- [ ] 2.1 `cli.test.ts` (or wherever `canary status` is currently tested):
      assert the presence-branch message contains `entry.plantedAt` and does
      NOT contain `entry.doc` or a colon-separated line number — a negative
      assertion, not just a positive one, since the whole point is the
      absence of the location.
- [ ] 2.2 Confirm the existing absence-branch test (`"no active canary"`,
      exit 0) and the exit-code-1-when-active test are unaffected — run them
      before and after to prove this change is additive to test count, not
      a silent behavior change to something already covered.

## 3. Fixtures and CI gate

- [ ] 3.1 The CI dogfood gate's `nullius canary (self)` step
      (`.github/workflows/ci.yml`) calls `canary status` with no output
      assertion — confirm it still passes unmodified; no fixture change
      needed.

## 4. Documentation

- [ ] 4.1 `spec/canary.md`: if it documents `status`'s output format, update
      it to match. Re-check the two Evidence Anchors already in that file
      (`spec/canary.md:51`, `spec/canary.md:81`, citing `canary.ts` — not
      `cli.ts`, so likely unaffected, but confirm rather than assume).
- [ ] 4.2 CHANGELOG.md: a `### Fixed` entry naming the leak this closes,
      framed the way `CHANGELOG.md`'s existing security/consent-adjacent
      fixes are framed (e.g. kit 0.2.0's `.nullius/` consent-boundary entry)
      — a behavior change made for a concrete reason, not a routine tweak.

## 5. Verification

- [ ] 5.1 Full test suite, type-check, both anchor gates, per `CLAUDE.md`.
- [ ] 5.2 Manually plant a canary, run `canary status`, confirm the printed
      line names no document and no line number, then `canary clear`.
