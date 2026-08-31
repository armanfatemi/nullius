# Fixture — an unresolvable stamp cannot rescue a failing anchor

`forged.md` is a document in which **every claim is invented**, each one
stamped with a commit that does not exist. Before the fix it exited 0 and
printed "All 3 grounding marker(s) verified".

The gate has two halves and CI runs both, because either one alone would pass
while the other was broken:

```sh
# Full history: the stamps cannot excuse the fabrications.
! node packages/claims/dist/cli.js check spec/fixtures/.stamp-failopen/forged.md

# The same document in a shallow clone still refuses to accuse.
# (See the ci.yml step; it clones this repo with --depth 1 to prove it.)
```

**Do not "fix" this fixture.** It is supposed to fail. A run where it stops
failing is a run where `@0000000` has become a universal bypass again.

The paths cited below are real files in this repository, so the failure is
`FABRICATED` — the file was opened and the text was not there — rather than
merely a missing path. That distinction is the point: the fixture proves the
content check ran and was believed, not that the checker choked on a bad path.

## Why this directory starts with a dot

The self-check gate runs `check 'spec/**/*.md' --require-markers` over this
tree. A fixture whose whole purpose is to carry false claims would fail that
gate, and so would this README, which carries no anchors at all.

Glob expansion skips dot-directories, which is how every other must-fail
markdown fixture here stays out of the self-check — `rules-broken` and
`wiring-broken` both hide theirs under `.claude/`. Same trick, stated out loud
because the leading dot is otherwise the kind of thing someone tidies away.
