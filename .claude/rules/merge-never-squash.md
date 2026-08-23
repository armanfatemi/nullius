---
id: merge-never-squash
applies_to:
  - openspec/changes/**/*.md
  - spec/**/*.md
  - README.md
severity: blocker
---

# Merge with a merge commit; never squash

Pull requests in this repository land as merge commits. If one is squashed
anyway, re-pin every anchor it introduced to the squash commit before the
next check runs.

## What goes wrong

A squash rewrites the branch into a single new commit and leaves the original
unreachable from `main`. Every anchor stamped against one of those branch
commits now names a hash the clone cannot resolve — and the checker's
response is to *fail open*.

That is the right behaviour and the reason this rule has to exist. A missing
commit is not evidence about the author: the clone may be shallow, the PR may
have come from a fork, the history may have been rewritten by someone else
entirely. A checker that cannot read the history it was pointed at does not
get to call anyone a fabricator. So the verdict softens to the advisory
`UNVERIFIABLE-REV`, CI stays green, and the hard gate silently stops existing
for every claim in the change — with no failure anywhere to say so.

A squash therefore does not break the build. It disarms it, quietly, for
exactly the documents that carried the most evidence.

## The incident

The fail-open branch names squash-merging first among the reasons a stamped
commit may be absent, and softens only the failing verdicts on that axis:

**Evidence:** `packages/claims/src/checkClaims.ts:388@52f64ec` — `squash-merged, because the clone is shallow, or because this is a fork`
