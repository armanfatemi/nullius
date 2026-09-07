# Proposal — report-unhonoured-stamps

> **Depends on:** None

## Problem

A rev-stamped anchor makes two assertions, and the stamp exists so they can
fail differently: *this text was in this file at this commit* is settled against
something immutable and is the hard gate; *it is still on line N* is a claim
about the working tree and is advisory. When the stamped commit cannot be read,
the first assertion cannot be evaluated at all, and the checker falls back to
the working tree and borrows its verdict:

**Evidence:** `packages/claims/src/checkClaims.ts:417@0c52173` — `if (!isFailure(fallback.verdict)) {`

That fallback is correct. What is missing is that it is silent. A passing
working-tree verdict is returned unchanged, with nothing anywhere recording that
the gate did not run — and the run then closes by asserting that it did:

**Evidence:** `packages/claims/src/cli.ts:1582@0c52173` — `All ${run.checked} grounding marker(s) verified.`

Observed directly. A document carrying one anchor whose quote is genuinely
present in the working tree, stamped `@0000000` — a commit that exists in no
repository — is checked on a full-history clone and reports:

```
OK            probe.md:7  packages/claims/src/checkClaims.ts:439@0000000
All 1 grounding marker(s) verified.
```

The card says `0 failing of 1` and `Verdicts: ok 1`. The JSON summary carries
`verdicts: {ok: 1}` and no field naming the unhonoured stamp. Every surface
reports a verification that did not happen, and no surface offers a reader any
way to notice.

This is the project's own thesis failing on itself: a green result standing in
for a check that never ran, which is the single defect nullius exists to make
impossible.

**The condition is not rare, and it is not only about squash.** Every route to
an unreadable commit produces it — a shallow clone (`actions/checkout` defaults
to `fetch-depth: 1`, and the shipped Action performs no checkout of its own, so
this is the default an adopter gets), a fork, a squash- or rebase-merged branch,
or a history rewritten by someone else. In each case the silence lands on the
common case rather than the rare one, because an honest anchor's working-tree
half normally still passes.

## Why now

The requirement already exists in the current spec and is not implemented:

**Evidence:** `openspec/specs/check-cli/spec.md:129@0c52173` — `### Requirement: The run SHALL report how many stamps it could not honour`

Its implementing task is recorded as complete:

**Evidence:** `openspec/changes/archive/2026-09-01-add-stamp-failopen-control/tasks.md:34@0c52173` — `- [x] 2.2 Count stamps that could not be honoured and surface the total in the`

**Evidence:** `grep -rn 'could not honour' packages/claims/src/` → 0 results

So this is not a new capability being argued for. It is a requirement that
shipped its verdict-semantics half and lost its reporting half, and a checked
box that nothing re-checked — the same shape as a review that reports success
having reviewed nothing.

## What changes

`check` counts every rev-stamped anchor whose commit could not be read,
regardless of what the working-tree fallback then returned, and surfaces the
total on all three report surfaces (plain, card, JSON). The count is advisory
and never changes an exit code: an unreadable commit is not evidence about the
author, and this change does not make it so.

Where the count is non-zero, the report names the likely cause rather than only
the number — a shallow clone is a different remedy (`fetch-depth: 0`) from a
rewritten branch (re-pin), and the checker already knows which it is looking at
because it asks git whether the repository is shallow.

The summary line that currently overstates is corrected in the same pass: a run
that could not honour every stamp it saw does not get to say all markers were
verified.

## Non-goals

- **Failing on an unhonoured stamp.** The fail-open is deliberate and argued;
  this change makes it visible, not strict. No exit code moves.
- **Changing which verdict an unresolvable commit produces.** The clone-based
  discriminator stays exactly as it is.
- **Deciding whether a resolvable-but-unreachable commit should count.** That is
  the separate open change `add-rev-ancestry-check`, and this one is written so
  that either outcome there simply changes which anchors land in this count.
- **Requiring `fetch-depth: 0`.** The Action does not perform the checkout and
  will not start.

## Capabilities

### New Capabilities

*(none)*

### Modified Capabilities

- `check-cli`: the existing requirement "The run SHALL report how many stamps it
  could not honour" is tightened to say *which* stamps count (all unreadable
  ones, not only those whose fallback failed), on which surfaces the total
  appears, and that the summary line may not claim full verification when the
  total is non-zero.

## Impact

- `packages/claims/src/checkClaims.ts` — carry the unhonoured-stamp fact out of
  `checkStamped` on the passing path, where it is currently discarded.
- `packages/claims/src/checkReport.ts` — the shared summary the card and JSON
  render from.
- `packages/claims/src/cli.ts` — the plain-text closing line.
- `spec/fixtures/` — no new fixture. `.rev-lane/short-sha.md` is already exactly
  this case, and already runs in CI; what it lacks is any assertion about what
  it *prints*, which is why the gap survived it. Its CI step gains a `grep` for
  the new line, and a unit test asserts the total by name.
- No change to the GitHub Action's inputs or to any exit code.

## Size estimate

Small. One fact threaded from `checkStamped` to the report builders, three
render sites, one fixture, and the unit tests that assert the count by name.
