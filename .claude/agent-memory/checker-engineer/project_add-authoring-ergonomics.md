---
name: add-authoring-ergonomics-pre-review
description: 2026-08-27 pre-review of add-authoring-ergonomics (--stamp/--fix/--format json); iteration 0 blockers fixed in iteration 1, residual concerns on marker-splice fidelity and verifyAtRev's return vocabulary
metadata:
  type: project
---

Pre-review (plan) of `openspec/changes/add-authoring-ergonomics/`, branch
`add-authoring-ergonomics`. Adds `check --stamp`, `check --fix`, `--format json`,
per-command `--help`. No new verdict, no union or PASSING change — correctly so.

**Iteration 0's two blockers were fixed correctly in iteration 1** (verified
against `checkClaims.ts` at 87eb675):
- `--fix` now filters on `claim.rev === undefined`, not verdict. Sound: the
  fail-open branch returns `checkUnstamped`'s result whose `claim` is the
  original *stamped* claim, so `claim.rev` stays defined. The reverse hole does
  not exist — a malformed `@rev` fails the whole PRESENCE regex, so the line
  parses as no claim at all.
- `--stamp` now gates on `readFileAtRev` status `"ok"` via a new exported
  `verifyAtRev`, not on a `Verdict`. Correct: no `Verdict` can say whether HEAD
  was consulted.

**Kernel facts re-derived here, worth keeping:**
- The drift window scan uses substring mode while `locate` prefers exact, so
  `drift`'s reported line can differ from the uniqueness survey's line. Removing
  the scan changes the verdict in one shape (exact-far + substring-near) and the
  `detail` *number* in a second shape (both inside the window) — the second is
  easy to miss.
- `where.first` is provably non-null at both the `drift` and `wrong-line`
  branches, so `foundLine` from `locate` is always defined there.
- The marker regexes do not capture the separator (`\s*[—–-]+\s*`) or trailing
  whitespace. Any rewriter must splice by match index; rebuilding from capture
  groups silently normalizes the em-dash.
- `driftWindow`/`minAnchorChars` defaults resolve at exactly one site
  (`checkClaims.ts:598-599`); a second resolver must be fed the same options.

**Why:** Stage 2 review of the change that makes the kernel write user documents
for the first time.
**How to apply:** At post-review, check the rewriter splices rather than rebuilds,
and that `verifyAtRev`'s return type is named and documented as not-a-`Verdict`.

**Post-review (2026-08-28, diff `main...feat/add-authoring-ergonomics`):** one
blocker found — `ClaimResult.foundLine`'s JSDoc claims it is absent on
"everything the stamped path returns", but `checkStamped`'s fail-open branch
returns `checkUnstamped`'s result verbatim, so a stamped claim with an
unreadable rev and a working-tree `drift`/`wrong-line` carries `foundLine`.
Reproduced against `dist/`. Behaviour is safe only because `rewrite.ts` filters
on `claim.rev !== undefined` independently; the false comment invites a future
caller to drop that guard and repoint under a stamp.

Also derived and worth keeping: `verifyAtRev` is threshold-INDEPENDENT — `ok`
and `weak-anchor` both stamp, everything else is `not-at-rev`, so
`driftWindow`/`minAnchorChars` cannot loosen the stamp gate. And
`parsePresenceMarker` reuses the same three regex objects as `parseClaims` in
the same precedence order with no `g` flag, so no shared-`lastIndex` hazard and
no way for the rewriter to parse a line differently from the checker.

**Post-review pass 2 (2026-08-28, fix commit 5909b77):** blocker fixed and
closed — `checkStamped`'s fail-open branch now returns an explicit
`{claim, verdict, detail}` (`checkClaims.ts:412-417`); it was the only path
where a stamped result could inherit `foundLine` (every other `checkStamped`
return is an explicit literal, no spreads). Residual concern: the JSON report's
documented pass/fail contract (`checkReport.ts:239-241`, "read `failing`" /
summary fields) does not hold on the no-match run — `summarize([], true)` gives
`failures: 0`, `markerFloorFailed: false` while the process exits 1
(`cli.ts:720`), so a consumer must also read the new `diagnostics` array. That
requirement is described narratively, not stated as a consumer rule.
