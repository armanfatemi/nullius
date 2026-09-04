# Proposal — fix-absence-anchor-liability

> **Depends on:** None

## Problem

A presence anchor can be pinned to a commit. An absence anchor cannot, and the
asymmetry has a consequence nobody has had to pay until now.

A presence anchor carries a stamp — `path/to/file.ts:88@a1b2c3d` — so the claim
it makes is about a commit that cannot change. A later edit degrades it to the
advisory `STALE`, and the document's author is not accused of anything.

An absence anchor has no such slot. The two claim types say it themselves — a
presence claim carries the commit and explains why, and an absence claim carries
a command and a number and nothing else:

**Evidence:** `packages/claims/src/parseClaims.ts:52@6754f87` — `   * The commit the author verified against, when the anchor is rev-stamped.`

**Evidence:** `packages/claims/src/parseClaims.ts:69@6754f87` — `export interface AbsenceClaim {`

So the count is re-run against the working tree on every check. So the claim it makes is not "this was true at
that commit" but "this is true now" — of a repository the document's author
stopped being able to influence the moment their change merged.

The result is that **every merged document carrying an absence anchor is a
standing liability against every future unrelated change.** A `→ 0 results`
anchor in an archived design document fails the moment anyone, anywhere, adds a
first instance of the thing it observed the absence of. The failing change did
not touch that document and has no stake in it.

This is observed, not hypothetical. `add-maintainer-card` added a
workflow-command escaper, which introduced the first `%0A` in the repository —
and turned `add-pr-process-report`'s already-merged design document red:

**Evidence:** `.github/workflows/ci.yml:272@6754f87` — `          node packages/claims/dist/cli.js check 'openspec/**/*.md'`

The remedy available was to edit the merged document's own count and narrative,
which a rule audit correctly called "the only one available, not one the rules
bless". An unrelated change rewriting another change's frozen design record is a
poor outcome however carefully it is worded.

## Why now

The cost scales with the number of merged documents carrying absence anchors,
and that number only grows. It is cheapest to decide the rule while there are
two instances rather than twenty.

## What changes

The design question is what an absence anchor should mean once its document is
merged, and there are three candidate answers worth arguing:

- **A stamp for absence claims.** `grep … @a1b2c3d → 0` re-runs the command
  against that commit rather than the working tree. Faithful to the presence
  anchor's split, and expensive: it means running a search inside a historical
  checkout.
- **Advisory once archived.** An absence anchor in `openspec/changes/archive/**`
  degrades to advisory rather than failing, on the same reasoning that makes a
  drifted line number advisory — the claim was true when written and the author
  cannot maintain it.
- **A declared scope.** The anchor names the change it belongs to, and a check
  scoped to a different change does not evaluate it.

## Non-goals

- **Weakening the absence anchor for a live document.** In the change that
  wrote it, a `→ 0` anchor is a hard claim and stays one. The problem is only
  its afterlife.
- **Retroactively editing the counts already changed.** Two exist; both are
  accurate and both name their reason.

## Size estimate

Small in code, and the design is the work. The three options differ in cost by
an order of magnitude and only one of them needs a historical checkout.
