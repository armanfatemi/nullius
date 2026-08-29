# Tasks — add-rev-ancestry-check

New `Verdict` member (`unreachable-rev`), advisory. Breaking change to
`check --format json`'s schema version. See `design.md` Decisions 1-2.

## Code this change reasons about

**Evidence:** `packages/claims/src/checkClaims.ts:100@2792fa1` — `` * `unknown-rev` and `unavailable` are kept apart from `no-file` deliberately.``

**Evidence:** `packages/claims/src/checkClaims.ts:404@2792fa1` — `  if (atRev.status !== "ok") {`

**Evidence:** `packages/claims/src/checkClaims.ts:429@2792fa1` — `  const gate = evaluateAgainst(atRev.lines, claim, driftWindow, minAnchorChars);`

**Evidence:** `packages/claims/src/checkClaims.ts:178@2792fa1` — `const PASSING: ReadonlySet<Verdict> = new Set<Verdict>([`

**Evidence:** `packages/claims/src/runners.ts:236@2792fa1` — `export function headRev(root?: string, timeoutMs = DEFAULT_GIT_TIMEOUT_MS): string | null {`

**Evidence:** `packages/claims/src/checkClaims.ts:120@2792fa1` — `  readFileAtRev?: (path: string, rev: string) => RevRead;`

**Evidence:** `packages/claims/src/checkReport.ts:262@2792fa1` — `export const REPORT_VERSION = 1;`

## 0. Prerequisites / setup

- [ ] 0.1 `pnpm build` and confirm the baseline (765 kernel tests, 6 known
      ugrep-baseline `flagConformance` failures, per `CLAUDE.md`).
- [ ] 0.2 Re-read `revAnchors.test.ts` in full before writing anything — its
      three existing `describe` blocks ("the gate axis", "the rot axis", "an
      unreadable commit fails open") are the precedent to match; this
      change adds a fourth, "the ancestry axis."

## 1. Verdict type + predicate

- [ ] 1.1 Add `"unreachable-rev"` to `Verdict` in `checkClaims.ts`, with a
      doc comment matching the style of its neighbors (`stale`,
      `unverifiable-rev`) explaining what it means and why it is advisory.
      Add it to `PASSING`.
- [ ] 1.2 Add `isAncestorOfHead?: (rev: string) => boolean | null` to
      `CheckDeps` (`null` = could not determine, fail open), documented the
      same way `readFileAtRev` is documented as optional.
- [ ] 1.3 Implement the injected default in `runners.ts`: a function
      following `headRev`'s exact pattern (`spawnSync("git", ["-C", base,
      "merge-base", "--is-ancestor", rev, "HEAD"], { shell: false, ... })`)
      — exit `0` → `true`, exit `1` → `false`, any error/timeout/non-0/1
      exit → `null`.
- [ ] 1.4 In `checkStamped`, after the content check at the stamped commit
      passes, call `deps.isAncestorOfHead?.(rev)`. `false` → relabel the
      result's verdict to `unreachable-rev` (detail names the commit and
      says it resolves but is not part of the checked-out branch's
      history). `true` or `null` → leave the verdict untouched. Never call
      this when the content check itself already failed.

## 2. Unit tests

- [ ] 2.1 `revAnchors.test.ts`: new `describe("rev-stamped anchors — the
      ancestry axis", ...)` block, matching the file's existing style
      (temp git repo, real commits, real `git` calls — not mocked).
- [ ] 2.2 Case: a rev that resolves and is an ancestor of `HEAD` — verdict
      unchanged (`ok`), same as today.
- [ ] 2.3 Case: a rev that resolves (e.g. an orphan branch's tip, still in
      the local object database) but is NOT an ancestor of `HEAD` — verdict
      is `unreachable-rev`, and `isFailure("unreachable-rev") === false`.
- [ ] 2.4 Case: `isAncestorOfHead` not supplied in `deps` at all (mirrors the
      existing "falls open the same way when no git reader was supplied at
      all" case for `readFileAtRev`) — verdict unchanged, no crash.
- [ ] 2.5 Case: content check FAILS at the stamped commit (e.g.
      `fabricated`) for a rev that also happens to be unreachable — verdict
      stays whatever the content check produced; ancestry is never
      consulted. Regression guard for task 1.4's ordering requirement.
- [ ] 2.6 `runners.test.ts`: the new ancestry-check function directly —
      `true`/`false`/`null` cases, plus a timeout case matching
      `revFileReader`'s existing timeout test shape.

## 3. Spec delta

- [ ] 3.1 `spec/evidence-anchors.md`'s verdict table gains a row for
      `unreachable-rev`, advisory, next to `unverifiable-rev`.

## 4. Fixtures and CI gate

- [ ] 4.1 Confirm whether this warrants a new fixture under
      `spec/fixtures/` or is adequately covered by `revAnchors.test.ts`'s
      unit-level temp-repo tests — `unverifiable-rev` and `stale` have no
      dedicated top-level CI fixture either (per `.github/workflows/ci.yml`'s
      dogfood gates), so match that precedent rather than inventing a new
      fixture family for one advisory verdict.

## 5. Public exports, changelog, and full verification

- [ ] 5.1 Bump `REPORT_VERSION` from `1` to `2` in `checkReport.ts`, per
      `design.md` Decision 2's stated consequence. Update
      `checkReport.test.ts`'s exit-parity and schema-version pins
      accordingly.
- [ ] 5.2 CHANGELOG.md: a `### Breaking` entry — growing `Verdict` and
      bumping `REPORT_VERSION`, framed the way `0.7.0`'s CLI-parsing
      breaking change was framed (state what breaks, and why the
      alternative — silence — was worse).
- [ ] 5.3 Full test suite, type-check, both anchor gates, per `CLAUDE.md`.
- [ ] 5.4 Grep the codebase for any switch or if-chain enumerating `Verdict`
      members exhaustively (none were found during this proposal's survey —
      confirm that finding still holds at implementation time, since new
      code may have landed between proposal and implementation).
