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

A squash rewrites the branch into a single new commit and leaves the
originals unreachable from `main`. Every anchor stamped against one of those
branch commits now names a hash the clone cannot resolve — and the checker's
response is to *fail open*.

That is the right behaviour, and the reason this rule has to exist. A missing
commit is not evidence about the author: the clone may be shallow, the PR may
have come from a fork, the history may have been rewritten by someone else
entirely. A checker that cannot read the history it was pointed at does not
get to call anyone a fabricator.

So a squash does not break the build. It disarms it, quietly, for exactly the
change that carried the most evidence — and a disarmed gate and a satisfied
one produce the same green check.

## The incident

When the stamped commit cannot be read, the checker discards the failing
verdict it computed against the working tree and returns a different one in
its place:

**Evidence:** `packages/claims/src/checkClaims.ts:401@90105d8` — `verdict: "unverifiable-rev",`

That substitute is a member of the set of verdicts that pass, which is what
turns a silenced hard gate into a green run:

**Evidence:** `packages/claims/src/checkClaims.ts:172@90105d8`

```ts
  "wrong-line",
  "stale",
  "unverifiable-rev",
]);
```
