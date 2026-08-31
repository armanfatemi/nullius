# Proposal — add-stamp-failopen-control

> **Depends on:** None

## Problem

A rev stamp is part of the document, and the document is untrusted input. On a
pull request the author controls every byte of it, including the commit a
citation names. Today, naming a commit the clone cannot resolve converts a
**failing** anchor into a passing one.

The fail-open branch computes the ordinary working-tree verdict, returns it
when it passes, and replaces it when it fails:

**Evidence:** `packages/claims/src/checkClaims.ts:412@8211685` — `if (!isFailure(fallback.verdict)) {`

**Evidence:** `packages/claims/src/checkClaims.ts:424@8211685` — `verdict: "unverifiable-rev",`

That replacement verdict is in the passing set:

**Evidence:** `packages/claims/src/checkClaims.ts:185@8211685` — `"unverifiable-rev",`

So a document whose every claim is invented exits 0. Appending seven zeros to
a citation is strictly less work than opening the file, which inverts the
premise the spec's own forgery paragraph rests on — it weighs only the
expensive forgery, hunting history for a commit where a claim happens to be
true, and concludes that is more work than reading the file. It is. This is
not.

The behaviour is deliberate, and the comment says so:

**Evidence:** `packages/claims/src/checkClaims.ts:408@8211685` — `// checked, and only its FAILING verdicts are softened: a checker that`

It is also asserted by a test named for the reasoning behind it:

**Evidence:** `packages/claims/src/revAnchors.test.ts:157@8211685` — `expect(isFailure("unverifiable-rev")).toBe(false);`

**The reasoning is sound and must survive this change.** A commit this clone
never had is not evidence about the author: the clone may be shallow, the PR
may come from a fork, the branch may have been squash-merged. A checker that
cannot read the history it was pointed at does not get to call anyone a
fabricator. `.claude/rules/merge-never-squash.md` documents and defends exactly
that, and `add-rev-ancestry-check` restates it as settled.

So the naive remedy is wrong. Refusing to soften any failure would report
`FABRICATED` for a squash-merged proposal that cited code it then modified —
the precise outcome `.claude/rules/rev-stamp-change-anchors.md` exists to
prevent, and the one that teaches a team to stop reading the output.

## Why now

The hole is live in `main` and in the published package, and it is already
described in public: branch `claude/security-citation-rot-71m1nw` carries both
the finding and a fix that never merged. The exploit is disclosed; only the
remedy is missing.

It also defeats the gate in exactly the configuration most projects run.
`actions/checkout` defaults to `fetch-depth: 1`, so on a default checkout every
stamped anchor is unresolvable and the softening is the normal path rather
than the exception.

## What changes

The discriminator moves off the document and onto the repository. Failing open
stops being a property of one citation's rev and becomes a property of whether
this clone can read history at all.

- A **shallow** clone genuinely cannot settle history: keep failing open.
- A clone with **full history** that cannot find a named commit has produced a
  fact about the citation, not about itself: report the working-tree verdict,
  failures included.
- The documented remedy for the squash case is unchanged and already written
  down — `merge-never-squash.md` instructs re-pinning to the squash commit.

The run also reports how many stamps went unhonoured, so a shallow checkout is
visible rather than silent.

## Impact

- `check` gains a repository-level probe and one new advisory verdict.
- Two tests in `revAnchors.test.ts` pin the current behaviour and are rewritten;
  the requirement they were protecting is preserved under the shallow case and
  restated as a scenario.
- `spec/evidence-anchors.md`'s forgery paragraph is corrected — its premise is
  what this change falsifies.
