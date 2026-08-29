# Proposal — add-rev-ancestry-check

> **Depends on:** None

## Problem

A rev-stamped anchor (`path:LINE@rev`) is verified by asking git to read the
file's content at that commit. `RevRead`, the type that read produces, is
documented as deliberately distinguishing "commit did not resolve" from
"commit resolved but the file was not there":

**Evidence:** `packages/claims/src/checkClaims.ts:100@2792fa1` — `` * `unknown-rev` and `unavailable` are kept apart from `no-file` deliberately.``

`checkStamped` — the function that decides a stamped anchor's verdict for
`check` — honors this distinction correctly: an unresolvable commit fails
open (lines 404-427), while a file genuinely absent at a commit that DID
resolve is a hard failure (lines 396-401), because that is a fact about the
author rather than about the clone. That reasoning is sound and is exactly
what `.claude/rules/merge-never-squash.md` documents and defends. (`RevRead`
has a second consumer, `verifyAtRev` — the gate `--stamp` writes behind —
that collapses this same distinction into one `rev-unreadable` outcome:

**Evidence:** `packages/claims/src/checkClaims.ts:646@2792fa1` — `  if (atRev.status !== "ok") return "rev-unreadable";`

for its own, different reason: `--stamp` only needs "was this readable,"
never "was this a fabrication." This proposal does not touch `verifyAtRev`.)

**This proposal is about a different, orthogonal property: resolvability is
not ancestry.** `git show <rev>:<path>` succeeds whenever the commit object
exists anywhere in the local object database — reachable from `HEAD`,
reachable from some other branch or tag, or merely not yet garbage-collected.
It does not check whether `<rev>` is part of the history the current `HEAD`
(or a PR's branch) will actually ship. When it resolves, execution reaches
the real content-matching function — the same one `checkUnstamped` calls
against the working tree, with no parameter or branch that could carry
ancestry information even if something wanted to check it:

**Evidence:** `packages/claims/src/checkClaims.ts:288@2792fa1` — `function evaluateAgainst(`

**Evidence:** `packages/claims/src/checkClaims.ts:429@2792fa1` — `  const gate = evaluateAgainst(atRev.lines, claim, driftWindow, minAnchorChars);`

**This already happened.** A real proposal once had 28 anchors stamped
against the tip of an abandoned local branch — resolvable in the author's own
clone (the branch still existed there), and therefore reported a clean `ok`
verdict locally, with nothing distinguishing it from a stamp against real,
shipped history. Whether a *different* clone (CI's, a reviewer's fresh
checkout) can also resolve the same commit depends on incidental facts —
whether the abandoned branch is still on the remote, whether it has been
garbage-collected, how deep the clone is — not on whether the commit is
actually part of what the PR ships. `git show` cannot tell the difference,
and today, nothing else in this codebase does either: no `git merge-base`,
`git branch --contains`, or `--is-ancestor` call exists anywhere in
`packages/`.

## Why now

The 28-anchor incident already happened once. Left unfixed, the same
scenario — stamping against history that resolves locally but is not part of
the branch a PR opens from — reports full confidence with no signal that
anything is off, in exactly the tool whose job is not to do that.

## What changes

- `checkStamped` gains an ancestry check, run **only after** the content
  check at the stamped commit already passes (an anchor whose content
  doesn't match doesn't need an ancestry opinion — it is already failing for
  a stronger reason). If the stamped `rev` resolves but is **not** an
  ancestor of `HEAD`, the verdict is relabeled to a new, **advisory**
  member — see `design.md` Decision 1 for why advisory, not failing, is the
  entire point.
- The check is injected the same way `readFileAtRev` already is — an
  optional `CheckDeps` field, following `headRev`'s existing
  `spawnSync("git", [...], { shell: false, ... })` pattern (no shell, no
  string interpolation into a command line). A caller with no git available
  gets the fail-open path, unchanged from today.
- `git merge-base --is-ancestor <rev> HEAD` is checked against `HEAD` (the
  ref actually checked out when `check` runs), which is what a PR's CI run
  has checked out at verification time — matching the exact moment the real
  incident's inconsistency would have mattered.

## Non-goals

- **Not a hard-failing verdict.** Explicitly rejected as an alternative in
  `design.md` Decision 1 — see the false-positive risk discussed there
  (rebases, history rewrites, and legitimately-off-branch-but-still-valid
  citations all resolve without being ancestors, and none of those are
  evidence the author fabricated anything).
- **Not touching the existing `unverifiable-rev` fail-open path**, which
  handles a rev that does not resolve at all — a different, already-correct
  mechanism for a different failure mode. This proposal only adds a check
  for revs that *do* resolve.
- **Not adding a `--strict-ancestry` flag or any other behavior that could
  turn the new verdict into a failure.** If that turns out to be wanted
  later, it is a separate proposal with its own justification — this one
  does not create the lever.

## Dependencies

### Hard (must be merged before this starts)

None.

### Soft (design assumes these exist; graceful degradation if absent)

None.

### Enables (future changes that will depend on this)

None known.

## Size estimate

|                                 |                                          |
| ------------------------------- | ------------------------------------------ |
| Estimated tasks                 | ~10                                         |
| Packages or surfaces touched    | 1 (`packages/claims`)                       |
| Risk                            | MEDIUM — new `Verdict` member, public API   |
| Expected sessions to implement  | 1                                           |

## Open questions

- Whether the new verdict belongs on the kernel's exported `Verdict` union
  (where `unverifiable-rev` already lives, since both describe the stamped
  path's outcome) or needs its own separate union, following the
  `WiringVerdict`/`RuleVerdict`/`RuleCoverageVerdict`/canary's `VerifyOutcome`
  precedent of "new checking dimension, own union." `checkStamped` returns a
  `ClaimResult` whose `verdict` field is typed `Verdict` directly, which is a
  real constraint on this choice, not just a style preference — Decision 2 in
  `design.md` works through it.
