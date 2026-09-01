# Proposal — add-diff-scoped-strictness

> **Depends on:** None

## Problem

nullius tells an adopting repository to start advisory and, after a few weeks,
to flip the whole repository to strict. Those are the only two positions the
published guidance offers:

**Evidence:** `spec/evidence-anchors.md:497@5f88e21` — `4. **Check in CI**: start **advisory** (report, never block). Let the team see`

The installer encodes the same reasoning as a default:

**Evidence:** `packages/kit/src/profiles.ts:125@5f88e21` — `    // PR turn red on day one. The generated file says how to tighten it.`

and the kernel names the failure mode it is avoiding:

**Evidence:** `packages/claims/src/checkClaims.ts:165@5f88e21` — ` * unrelated refactor — which is what teaches a team to add `continue-on-error``

All three are correct, and together they produce a gate that never turns on. A
repository with a backlog of unanchored or drifted documents faces one switch
with two positions: advisory, which never fails, or strict, which fails every
open pull request on the day it is flipped, including the ones that touched
nothing relevant. The backlog does not shrink on its own, so the switch is
never flipped, and a checker that cannot fail is a checker whose result nobody
needs to read.

There is no third position today. No flag by any of the obvious names exists
anywhere in the checker package:

**Evidence:** `grep -rnE -- '--diff|--changed|--since|--base|--scope' packages/claims/src/` → 0 results

The pattern above once also included `changedFiles`, and `add-pr-process-report`
made that term non-zero — its renderer scopes a run report by the range's
changed-file set. **No flag by any of these names exists, which is what this
paragraph claims**, so the pattern is narrowed to the flags rather than the
claim being weakened: an internal identifier in another verb's renderer was
never evidence about `check`'s argument surface.

Range handling does exist in the package, but under the `oracle` verb and
unreachable from `check`, whose argument surface has no field for it:

**Evidence:** `packages/claims/src/cliArgs.ts:99@5f88e21` — `  range: string;`

The Action's strictness surface is a single boolean with no slot for one:

**Evidence:** `action/action.yml:28@5f88e21` — `    description: Fail the job when any claim is unverified. Default false (advisory).`

## Why now

This is the item that decides whether an outside project can adopt nullius at
all, and it is the one the other maintainer-visibility changes are worth the
least without. A grounding card that can only ever report an advisory number
is a nicer rendering of a check nobody is obliged to act on.

## What changes

- `check` gains a scoping flag naming a commit range. Anchors in documents the
  range touched are **in scope**; everything else is checked and reported but
  cannot fail the run.
- The exit code is computed from in-scope failures only. Out-of-scope failures
  are counted separately and always reported.
- The out-of-scope failure count is rendered as a **visible, named number** —
  the outstanding debt gets a denominator rather than becoming invisible.
- When the range cannot be resolved — shallow clone, absent base, fork without
  the base fetched — `check` exits with a usage error rather than guessing.
  It does not silently widen or narrow the gate.
- The Action gains a scoped strictness mode alongside `strict`.
- This repository adopts scoped strictness in its own CI.

## Non-goals

- **A new `Verdict` member.** Scoping is a filter over results, not a verdict.
  Growing the exported union bumps the report version and breaks any consumer
  that switches on `verdict` exhaustively — the report's own policy is explicit
  that a consumer reading `failing` instead is unaffected:

  **Evidence:** `packages/claims/src/checkReport.ts:236@5f88e21` — ` * - Adding a member to the `Verdict` union is ALSO breaking — for any consumer`

- **A new `nullius.config.json` key.** Older published kernels reject unknown
  keys, so a config-borne flag would break CI on the repos least able to
  diagnose it — the trap already documented in the kit:

  **Evidence:** `packages/kit/src/render.ts:82@5f88e21` — `  // published kernel (through 0.4.0) rejects unknown keys, and the Action runs`

- **Ancestry verification of the resolved base.** Adjacent and deliberately
  separate; see `add-rev-ancestry-check`.
- **Automatically repairing out-of-scope failures.**

## Dependencies

### Hard (must be merged before this starts)

None.

### Soft (design assumes these exist; graceful degradation if absent)

- `add-maintainer-card` — the two-tier result is legible to a maintainer only
  if something renders both tiers. Without it, scoped strictness ships as a
  number in a text dump.
- `add-oracle-conservation` — landed the only commit-range parsing in the
  repository (`packages/claims/src/oracleGit.ts:67@5f88e21` — `export function parseRange(range: string): ParsedRange | { error: string } {`),
  which this change should reuse rather than re-derive.
- `add-rev-ancestry-check` — may introduce the `merge-base` helper this change
  would otherwise write.

### Enables (future changes that will depend on this)

None known. This is the terminal piece of the maintainer-adoption set.

## Size estimate

|                                |                                        |
| ------------------------------ | -------------------------------------- |
| Estimated tasks                | ~25                                    |
| Packages or surfaces touched   | 4 (packages/claims, action/, spec/, .github/workflows) |
| Risk                           | HIGH                                   |
| Expected sessions to implement | 2                                      |

## Open questions

1. **Does the advisory tier ever get repaired, or does this institutionalize a
   permanently-broken half of the repository?** This is the strongest objection
   raised against the change and it is not settled by anything in the code. The
   partial answer in "What changes" — publish the out-of-scope count so the
   debt is visible — makes the tier legible without making it shrink. Whether
   that is enough, or whether scoped strictness needs a ratchet that tightens
   over time, is unresolved.
2. **Does scoping teach contributors to avoid touching documents?** A
   contributor who learns that editing a design doc pulls it into the strict
   tier has been given an incentive not to edit design docs. Resolve in
   Stage 3; it may argue for scoping by *cited path* despite Decision 1.
3. **What is the correct behaviour on a fork PR where the base is not
   fetched?** "Exit with a usage error" is proposed, but a hard error on the
   contributor's first PR is its own adoption problem.
