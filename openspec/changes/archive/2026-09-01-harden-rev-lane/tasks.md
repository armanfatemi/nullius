# Tasks — harden-rev-lane

Two fixes in `revFileReader`. No new verdict; no verdict changes meaning.
See `design.md`.

## Code this change reasons about

**Evidence:** `packages/claims/src/runners.ts:173@df26905` — `const result = spawnSync("git", ["-C", base, "show", `${rev}:${path}`], {`

**Evidence:** `packages/claims/src/runners.ts:204@df26905` — `stderr.includes("unknown revision") ||`

**Evidence:** `packages/claims/src/runners.ts:213@df26905` — `stderr.includes("exists on disk, but not in") ||`

**Evidence:** `packages/claims/src/revAnchors.test.ts:186@df26905` — `it("never reads a path that escaped the repo, stamped or not", () => {`

## Tasks

- [x] 1.1 Add a rev-existence probe to `revFileReader` using
      `git cat-file -e <rev>^{commit}`, cached per rev, under the existing git
      timeout and `childEnv()`.
- [x] 1.2 Consult it before classifying stderr: a rev that does not exist is
      `unknown-rev` regardless of what `git show` said about the path.
- [x] 2.1 Address the blob as `<rev>:./<path>` so resolution anchors at the
      checked root.
- [x] 3.1 Unit test: a 40-character absent rev and a 7-character absent rev
      produce the SAME verdict for the same claim (#70). The 40-character case
      must be asserted explicitly — the original test used 16 characters,
      which is why this shipped.
- [x] 3.2 Unit test: a stamped anchor citing a path outside the checked root
      is refused, with no `..` in the path (#71).
- [x] 3.3 Rewrite the escape test per Decision 3, keeping the syntactic case
      and adding the semantic one.
- [x] 3.4 Fixture plus a CI step exercising the 40-character case end to end,
      per `.claude/rules/verdict-needs-fixture-and-test.md`.
- [x] 4.1 CHANGELOG entry recording both, with the reproductions.
