---
id: never-repoint-under-old-stamp
applies_to:
  - openspec/**/*.md
  - spec/**/*.md
  - docs/**/*.md
  - README.md
severity: blocker
---

# Never move a line number while keeping the old stamp

When a stamped anchor drifts, either re-read the file and re-stamp both
halves, or leave the citation exactly as written and let it report `STALE`.
Updating the line number under the original commit hash is the one edit that
is never correct.

## What goes wrong

A stamped anchor asserts something about a commit that cannot change: *this
text was at this line, at this hash*. Repointing the line while keeping the
hash rewrites that assertion into one that was never true — the text was not
at the new line at the old commit — and the checker settles it against the
immutable snapshot and says so. An advisory `STALE`, which passes and merely
asks you to re-read, becomes a hard `FABRICATED`, which fails and accuses.

The damage is worse than a red build. `FABRICATED` is the verdict that means
*the author did not open the file*, and it is the signal reviewers are meant
to treat as serious. Spending it on a well-meaning line-number tidy-up is how
the verdict gets reclassified as noise, and a verdict that reads as noise is a
gate that has stopped working while still appearing to run.

## The incident

The stamped path checks the quote against the named commit and refuses to
explain a mismatch away as later drift, because the snapshot it read cannot
have moved:

**Evidence:** `packages/claims/src/checkClaims.ts:412@52f64ec` — `that commit is immutable, so no later edit can explain this`
