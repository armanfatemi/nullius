# Fixture — an absent commit means the same thing at any hash length

Two documents making the **same true claim** about `LICENSE:1`, each stamped
with a commit that does not exist. They differ only in how many characters the
hash has.

Both must exit **0**. Before the fix, `long-sha.md` exited 1 as
`MISSING-FILE-AT-REV` — "this citation was never true" — because git reports a
path problem rather than a revision problem once the rev is a complete object
id, and the classifier read that as a fact about the file (#70).

```sh
node packages/claims/dist/cli.js check spec/fixtures/.rev-lane/short-sha.md   # 0
node packages/claims/dist/cli.js check spec/fixtures/.rev-lane/long-sha.md    # 0
```

**Both polarities are the gate, not either one.** `short-sha.md` alone would keep
passing if the fix broke and started accusing only long hashes; `long-sha.md`
alone would keep passing if the checker stopped verifying anything at all. The
pair asserts that hash LENGTH does not change a verdict, which is the actual
property.

`git rev-parse HEAD` and `$GITHUB_SHA` both print 40 characters, so the failing
case was the one an author reaches for first.

## Why this directory starts with a dot

The self-check runs `check 'spec/**/*.md' --require-markers` over this tree.
These documents cite commits that do not exist, and this README carries no
anchors at all, so both would distort that gate. Glob expansion skips
dot-directories — the same reason `.stamp-failopen`, `rules-broken` and
`wiring-broken` hide theirs.
