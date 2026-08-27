---
name: feedback-verify-counts-not-just-anchors
description: Re-compute numeric/quantifier claims ("all 7 rules", "every anchor is stale") by running the tool — the anchor checker verifies quoted text, never the count wrapped around it
metadata:
  type: feedback
---

When a change document argues from a count or a universal quantifier — "all 7
grounded rules", "every current rule's anchor is already `stale`", "seven of the
eight files carry X" — re-derive the number yourself before accepting it, even
when the surrounding Evidence Anchors all verify `OK`.

**Why:** `nullius check` verifies that quoted text sits at a cited line. It says
nothing about the sentence wrapped around the quote. On
`add-rules-compliance` (2026-08-26, iteration 2) all 13 `design.md` anchors
verified `OK` while the prose two lines below one of them claimed a naive
`verdict !== "ok"` check would misreport "every one of those seven grounded
rules"; running `check '.claude/rules/*.md'` showed only 4 of 7 have a `stale`
anchor and 3 verify clean. The same overstatement had been copied into
`tasks.md`, and into the dispatcher's own briefing — a wrong count propagates
faster than a wrong quote because nothing re-checks it.

**How to apply:** Any claim of the form "all / every / none / N of the M" about
repo state is load-bearing and cheap to settle: run the relevant checker or a
`grep -l ... | wc -l` and compare. Flag mismatches `[false-premise]` even when
the conclusion they support is right — in that case the conclusion usually *is*
right, which is exactly the shape `spec/evidence-anchors.md`'s founding
incident describes. Related: [[proposal-injected-prose]].
