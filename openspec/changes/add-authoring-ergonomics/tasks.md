# Tasks — add-authoring-ergonomics

Tests for `--stamp`/`--fix` live in temp-dir tests (style of
`packages/claims/src/revAnchors.test.ts`), never under `spec/fixtures/**`,
which are read-only inputs to CI gates for other subsystems.

## 1. Rewrite machinery

- [x] 1.1 `rewriteMarker` exported from `parseClaims.ts` beside the PRESENCE
      regexes: splices by match index so only the `:LINE` / `@rev` character
      spans change (the separator dash and everything outside those spans are
      copied verbatim); mirrors the DOUBLE-before-SINGLE try order; null when
      not a marker. `planRewrites` in new `rewrite.ts` (pure; re-parses the
      source line and skips `marker-changed` on mismatch). Tests:
      `marker-changed` skip is reported and the line is byte-identical; an
      em-dash separator survives a rewrite; hand-rolled property test in
      `rewrite.test.ts` — generator over all three marker shapes ± stamp ±
      list prefix ± separator variant, embedded in random content, 200 trials
      over a seeded PRNG (fixed seed); oracle: every byte outside the
      `:LINE`/`@rev` spans of affected marker lines is identical to the input
- [x] 1.2 `foundLine?: number` on `ClaimResult`, set from `locate`'s
      exact-preferred unique match on `drift`/`wrong-line`; the drift window is
      measured from that line and the substring window scan is removed
      (design Decision 2). Edit the DRIFT row of `spec/evidence-anchors.md`
      to say the unique match is within the window. Tests: `foundLine` present
      only on those two verdicts; absent on the stamped path; exact-far /
      substring-near → `wrong-line` naming the exact line; exact-near /
      substring-nearer → `drift` naming the exact line
- [x] 1.3 `--fix`: rewrite for `drift`/`wrong-line` **with `claim.rev`
      undefined only**; compose with `--stamp`. Tests: a stamped anchor is never
      rewritten, including when `readFileAtRev` returns `unknown-rev` and the
      verdict is `drift`; `fabricated`/`unpinned` byte-identical; `drift` and
      `wrong-line` repoint and re-check `ok`
- [x] 1.4 `headRev(root)` in `runners.ts`; `verifyAtRev` exported from
      `checkClaims.ts` returning the named `RevVerification` vocabulary (not a
      `Verdict`; no PASSING set) and requiring `readFileAtRev` status `ok`; the
      CLI passes the same `CheckOptions` it gave `checkClaims`; `--stamp` stamps
      unstamped `ok`/`weak-anchor` (and just-fixed) anchors that `verifyAtRev`
      returns `ok`/`weak-anchor` for; exit 2 when HEAD cannot be resolved.
      Tests (temp git repos; `unavailable` via the injected `CheckDeps` seam):
      uncommitted edit added the quote (local `ok`, absent at HEAD) →
      `not-at-rev`, not stamped; uncommitted edit removed the quote (local
      `fabricated`, present at HEAD) → not a candidate, byte-identical, still
      failing;
      `readFileAtRev` `unavailable` → `rev-unreadable`, nothing stamped; no
      HEAD → exit 2, no writes; clean `ok` gains `@<head>` and re-checks `ok`;
      `--fix --stamp` repoints then stamps at the new line

## 2. Output

- [x] 2.1 Split `runCheck` into collect and render; failure count and marker
      floor computed from the collected structure; `failing` computed via
      `isFailure`, never by enumerating failing verdicts; `--format
      <human|json>` with the Decision 5 schema (`version: 1`, `foundLine`,
      `summary.next`, `rewrites`) and the stated compatibility policy in a doc
      comment. Tests: JSON renderer over a fixed result set; the collected
      structure's failure count and marker-floor flag for a mixed result set
- [ ] 2.2 Exit-code parity pinned in `cli.characterization.test.ts`: passing
      doc, failing doc, `--require-markers` over an unanchored doc — `--format
      json` vs human exit codes equal, stdout parses as JSON, human output
      unchanged

## 3. Surface polish

- [x] 3.1 Per-command `--help` (`cliArgs.ts` returns `command` on help; USAGE
      split into per-command blocks; one example each; one line of philosophy
      per command). Tests: `cliArgs.test.ts` `check --help` → help with
      `command: "check"`; characterization: exits 0, prints exactly one example
- [ ] 3.2 Zero-marker funnel: closing line becomes `next: nullius audit <doc>
      --propose` (largest matched doc), replacing `All 0 grounding marker(s)
      verified.`; `summary.next` under `--format json`. Tests: replacement
      (old string absent), and `summary.next` present

## Follow-ups — outside this change, not tasks of it

- Adopt JSON output in the GitHub Action's comment rendering once a release
  ships `--format json`; `action/action.yml` pins the published version.
- Human step after the PR is open: comment on closed issues #4 and #7 with
  the PR link, noting the severity-separation half of #4 remains open.
  Outward-facing; not run by the pipeline.
- Author's call, surfaced by two reviewers: whether the funnel should name
  plain `audit <doc>` instead of `--propose`. One constant; implemented as the
  proposal states until ruled otherwise.
