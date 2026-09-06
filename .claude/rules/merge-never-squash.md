---
id: merge-never-squash
applies_to:
  - openspec/changes/**/*.md
  - spec/**/*.md
  - README.md
severity: blocker
---

# Merge with a merge commit; never squash or rebase

Pull requests in this repository land as merge commits. If one is squashed or
rebase-merged anyway, re-pin every anchor it introduced to the new commit
before the next check runs.

**This is a policy of this repository, not a requirement of the tool.** A
project adopting nullius may squash or rebase freely; what it gives up is
described under "What an adopting project should know" below. Do not carry this
rule into advice about someone else's repo.

## Rebase counts

A rebase-merge rewrites every commit on the branch into new objects with new
hashes, exactly as a squash does. The two are identical for this rule's
purposes, and only one of them used to be named here — which is how a rule
against rewriting history came to sound like a rule about one button.

## What goes wrong

A squash or rebase leaves the original branch commits unreachable from `main`.
Every anchor stamped against one of them now names a hash the clone may not be
able to resolve, and the two axes a stamp separates collapse back into one.

What follows from that depends on the clone, not on the citation:

| Clone | Unresolvable commit, failing working-tree verdict |
| --- | --- |
| Full history | the working-tree verdict stands, failures included |
| Shallow, or shallowness undeterminable | `UNVERIFIABLE-REV`, advisory |

So on the full-history clone this repository's CI uses, a rewrite does **not**
silently disarm the gate. It does something else, and the reason to keep merge
commits is that instead: an honest anchor whose cited code has legitimately
moved since loses the advisory `STALE` it was entitled to and reports a hard
`FABRICATED` — the verdict that means *the author did not open the file*, spent
on an author who did. The document is punished for the merge button.

The fail-open is real but narrower than it reads: it is a property of a clone
that cannot see history, which is a `fetch-depth` question rather than a merge
question, and it fires the same way for a shallow checkout of a repository that
has never squashed anything.

## What an adopting project should know

`@rev` stamping is opt-in. There is no config key that requires it, and an
unstamped anchor is checked entirely against the working tree, so a project
that never stamps has no dependency on commit reachability at all — squash,
rebase, force-push and history rewrites are irrelevant to it. What it forgoes
is the two-axis split: without a stamp the checker cannot tell *this was never
true* from *this was true and the code was deleted afterwards*, so honest
documents go red on unrelated refactors.

A project that does stamp and also rewrites history should re-pin after a merge,
or accept the occasional false `FABRICATED` on a document whose cited code has
since changed.

## The incident

The verdict a stamped anchor gets when its commit cannot be read is decided by
asking the clone, never the document — because the rev is part of the document
and the document is untrusted:

**Evidence:** `packages/claims/src/checkClaims.ts:439@866f99f` — `const shallow = deps.isShallowRepository?.() ?? null;`

Only when that question cannot be answered `false` is the computed failure
replaced by the advisory verdict:

**Evidence:** `packages/claims/src/checkClaims.ts:450@866f99f` — `verdict: "unverifiable-rev",`

That substitute is a member of the set of verdicts that pass, which is what
would turn a silenced hard gate into a green run — on a clone that genuinely
cannot judge:

**Evidence:** `packages/claims/src/checkClaims.ts:194@866f99f`

```ts
  "unverifiable-rev",
]);
```
