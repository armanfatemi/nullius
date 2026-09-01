---
name: denominator-predicates-cut-both-ways
description: When a design gates a hard verdict on a predicate read out of a prose file (a heading name, a substring), check BOTH failure directions — designs here record only the disarming one.
metadata:
  type: feedback
---

When a change scopes a hard verdict by a predicate computed from a prose file —
"set `expects` when the agent's `## Output format` section contains
`[blocker]`" — enumerate the predicate over every file it will read, and check
both directions:

- **disarming** — a file that should match and stops matching (the verdict goes
  quiet). Designs in this repo usually record this one as a known limit.
- **false-arming** — a file that should *not* match and does (the verdict fires
  on a party that never held the contract). This is the direction that gets
  omitted, and it is the one invariant 4 (fuzzy-heuristics-stay-advisory) is
  about.

**Why:** in `add-run-ledger-producer` iteration 3, all five `.claude/agents/*.md`
files contained `[blocker]`; only the heading spelling
(`## Output format` vs retro-writer's `## Output back to the dispatcher`) kept
the fifth out of the denominator. The design recorded the disarming limit and a
`wiring` follow-up for it, and said nothing about the cosmetic rename that would
arm a hard verdict against a non-reviewer.

**How to apply:** run the predicate as a grep across its whole input set before
accepting the design's account of who is in scope. Related:
[[feedback-enumerate-against-declared-boundary]],
[[feedback-verify-counts-not-just-anchors]].
