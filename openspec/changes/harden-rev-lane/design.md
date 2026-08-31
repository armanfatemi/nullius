# Design — harden-rev-lane

## Decision 1 — Ask git a question rather than read its prose

Every classification in the current lane is a substring match over stderr:

**Evidence:** `packages/claims/src/runners.ts:204@df26905` — `stderr.includes("unknown revision") ||`

That is fragile in a specific way rather than in general. The wording is not
promised, it is localisable, and — as #70 shows — it changes with the SHAPE of
the input rather than with the fact being reported. A 40-character rev is not
a different kind of absent; it just makes git complain about a different thing
first.

So existence becomes a question with a boolean answer:

```console
$ git cat-file -e 0000000^{commit}                              ; echo $?
128
$ git cat-file -e 0000000000000000000000000000000000000000^{commit} ; echo $?
128
$ git cat-file -e <a real commit>^{commit}                      ; echo $?
0
```

Length-independent, and it cannot be confused by a path error because no path
is involved. stderr matching stays for the residual cases it is still the only
source for — "not a git repository", and the fallback reason string — but it
no longer decides the one thing that separates failing open from accusing
someone.

**Rejected: widening the stderr patterns to include the 40-character wording.**
It would fix the observed case and leave the mechanism intact, so the next
message git rewords reopens it. The reason this defect existed for eleven days
is that its own test used a 16-character SHA — the bug was invisible to
everything except the exact input nobody tried. A wider regex is another thing
that looks correct until the untried input arrives.

## Decision 2 — Both lanes answer to the same root

The working-tree lane is confined by `isSafeRepoPath` plus reading relative to
the checked root. The git lane was confined by neither: it inherits git's rule
that a bare path in `<rev>:<path>` is relative to the repository top.

Prefixing `./` anchors resolution at the current directory, which under
`-C base` is the checked root. Where the checked root IS the repository root —
the documented usage, and what CI does — the two forms are identical, so this
changes nothing for anyone running it as documented. It only closes the case
where they differ, which is the case that leaks.

**This is a confinement fix, not a traversal fix.** The path guard already
rejects `..` and keeps doing so; nothing here relaxes it. What is added is that
a path with no `..` at all can no longer mean a different file to the two lanes.

## Decision 3 — The escape test is rewritten rather than supplemented

**Evidence:** `packages/claims/src/revAnchors.test.ts:186@df26905` — `it("never reads a path that escaped the repo, stamped or not", () => {`

Its name claims the property this change is establishing; its body checks a
narrower one. Leaving it and adding a second test beside it would leave a test
whose name overstates it, which is how the gap survived in the first place —
someone reading the suite for coverage of exactly this question found it
already answered.

So it keeps its name, gains the semantic case, and the syntactic case stays as
a second assertion rather than the only one.

## Decision 4 — One extra process per rev, not per anchor

The existence check is cached on the rev, next to the existing read cache
keyed on `(rev, path)`. A document stamping forty claims against one commit
asks once. A document that stamps nothing never asks at all: the check runs
inside the read path, which only stamped anchors reach.
