# Proposal — harden-rev-lane

> **Depends on:** None

## Problem

The git lane learns two things from git, and it gets both by guessing.

**It infers whether a commit exists from the wording of a path error.** The
read is one `git show` and the outcome is classified by string-matching
stderr:

**Evidence:** `packages/claims/src/runners.ts:213@df26905` — `stderr.includes("exists on disk, but not in") ||`

git only says `invalid object name` for a rev shorter than 40 hex. At exactly
40 the argument is already a complete object id, so git skips the revision
complaint and reports a path problem instead — which that branch reads as
"the commit exists and lacks this file". Observed directly:

```console
$ git show 0000000:app.ts
fatal: invalid object name '0000000'.

$ git show 0000000000000000000000000000000000000000:app.ts
fatal: path 'app.ts' exists on disk, but not in '0000000000000000000000000000000000000000'
```

The consequence is that one anchor gets two verdicts depending on the LENGTH
of its hash. Against a file that genuinely contains the quote, a 7-character
absent rev is `OK` and a 40-character absent rev is `MISSING-FILE-AT-REV` —
the verdict whose message is "this citation was never true". `git rev-parse
HEAD` and `$GITHUB_SHA` both produce 40 characters, so this fires on the most
natural input an author can give. Tracked as #70.

**It assumes git resolves paths the way this checker does.** The path is
interpolated bare:

**Evidence:** `packages/claims/src/runners.ts:173@df26905`

```ts
    const result = spawnSync("git", ["-C", base, "show", `${rev}:${path}`], {
```

In `<rev>:<path>` a bare path resolves from the top of the repository, not from
the directory git was pointed at. So a checker run inside a subdirectory reads
files ABOVE its root through the git lane, while the working-tree lane refuses
the same citation. Observed from a subdirectory `sub/` of a repository whose
root holds `above.txt`:

```console
$ git -C sub show 049a447:above.txt
SECRET_TOKEN=hunter2          # read it

$ git -C sub show 049a447:./above.txt
fatal: path 'sub/above.txt' does not exist in '049a447'
```

Because the verdict depends on whether the quoted text matches, the exit code
answers "is my guess about that file right" — one bit per run, over a
directory the checker was never pointed at. Tracked as #71.

## Why the existing test did not catch the second one

There is a test named for exactly this property, and it passes:

**Evidence:** `packages/claims/src/revAnchors.test.ts:186@df26905` — `it("never reads a path that escaped the repo, stamped or not", () => {`

It cites `../../etc/passwd`. That is a **syntactic** escape and the path guard
rejects it before any read, which is what the test asserts. The defect is a
**semantic** escape: `above.txt` contains no `..`, passes the guard, and escapes
inside git's own resolution. The test's name describes a stronger property
than its assertion checks, which is why the gap survived it.

## Why now

Both defects are live in the published 0.9.0, and both were reported on
2026-08-19 on a branch that never merged. The third defect that branch found —
the `@0000000` bypass — has since been fixed on its own terms (#61), so what
remains is these two.

They pull in opposite directions and that is the point of fixing them
together: one lets a citation read what it must not, the other calls an honest
author a fabricator. Both come from the same habit of learning facts about git
by reading its prose instead of asking it a question.

## What changes

- Commit existence is asked directly, with `git cat-file -e <rev>^{commit}`,
  which is length-independent. stderr is no longer the source of that fact.
- Paths are addressed as `<rev>:./<path>`, anchoring resolution at the directory
  the checker was pointed at, so both lanes answer to the same root.

## Impact

- No new verdict, and no verdict changes meaning. A 40-character absent rev
  stops being `MISSING-FILE-AT-REV` and takes the fail-open path that a short
  one already takes — subject to the clone discriminator added in #61.
- One extra git call per distinct rev, cached alongside the existing read
  cache.
- The escape test is rewritten to cover the semantic case it was named for.
