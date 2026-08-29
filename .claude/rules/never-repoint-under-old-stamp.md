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

When a stamped anchor **drifts**, either re-read the file and re-stamp both
halves, or leave the citation exactly as written and let it report `STALE`.
Updating the line number under the original commit hash is the one edit that
is never correct.

Drift is the case this rule is about, and the checker names it. If the verdict
is `ADVISORY` rather than `STALE`, you have the other case and the prohibition
does not apply — see "The one exception" below. Do not decide which case you
are in from memory of what you typed.

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

## The one exception, and it is the checker's call rather than yours

A line number can be wrong for two reasons, and only one of them is drift.

**Drift** — the quote *was* at that line at that commit, and the code has moved
since. Repointing rewrites a true assertion into a false one. Forbidden, and
the whole subject of this rule.

**Never true** — the line number was wrong when it was written, because the
author estimated it instead of reading it, and it has never matched at any
commit. Correcting it under the same stamp turns a false assertion into a true
one. That is not repointing; it is the "re-read and re-stamp" this rule opens by
demanding, with the hash half already correct.

**Do not adjudicate this yourself.** The two edits are byte-identical in a diff,
so an author's account of which one they were making is exactly the evidence
this repository does not accept anywhere else. The checker already distinguishes
them, and it is the only thing entitled to:

- **`STALE`** — the quote was at that line at that commit. Drift. Repointing is
  forbidden; re-stamp both halves or leave it alone.
- **`ADVISORY`, with the detail `the line number was already wrong there`** — the
  quote was in the file at that commit but never on that line. Correcting the
  line number under the unchanged stamp is the remedy, and the checker is asking
  for it.

The verdict comes from a branch that fires only when the commit gate has already
passed — the text was genuinely in that file at that hash — and the position was
wrong in the snapshot itself:

**Evidence:** `packages/claims/src/checkClaims.ts:459@5b7f9f2` — `    // get wrong at authoring time without lying: the quote was real, the line`

**Evidence:** `packages/claims/src/checkClaims.ts:464@5b7f9f2` — `      detail: `verified at ${rev}, but the line number was already wrong there — ${gate.detail}`,`

So the procedure is mechanical: run `check`, read the verdict for that anchor,
and act on it. If you have not run `check`, you do not know which edit you are
about to make.

### Why the exception is written this way

The obvious phrasing — "unless the citation was only a draft guess" — would have
been worse than no exception at all. It turns on what the author intended, which
nothing can verify from the artefact, and it is available to anyone who wants it:
*my line number was only ever an estimate* is unfalsifiable and always true
enough. An unconditional rule with an unverifiable escape hatch is a rule that
has stopped binding while still appearing to.

Keying the exception to a verdict keeps the boundary where every other boundary
in this repository sits — in code that re-reads the artefact — and costs one
command to establish.

## The incident

The stamped path checks the quote against the named commit and refuses to
explain a mismatch away as later drift, because the snapshot it read cannot
have moved:

**Evidence:** `packages/claims/src/checkClaims.ts:412@52f64ec` — `that commit is immutable, so no later edit can explain this`
