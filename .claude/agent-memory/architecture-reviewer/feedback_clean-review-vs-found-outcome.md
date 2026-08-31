---
name: clean-review-vs-found-outcome
description: The kit recorder marks a report `found` whenever the return text is non-empty, so any verdict keyed on "a reviewer produced no structured finding" misfires on an honest clean review
metadata:
  type: feedback
---

Whenever a design keys a hard journal verdict on *the absence* of a structured
record derived from an agent's return text, check the recorder's `found`/`empty`
boundary before accepting the calibration argument.

**Why:** `packages/kit/src/record.ts` decides `outcome: "found"` on exactly one
test — `text.trim().length !== 0` (the two terminal paths, sync and
`SubagentStop`). It is never "the agent found something". So a reviewer that
follows its own instruction to "say so plainly. Do not pad." on a clean pass
returns untagged prose, which is `found` with zero extracted findings — and
`SILENT-REVIEWER` fires on precisely the well-behaved case. Caught on
`add-run-ledger-producer` (2026-08-31, pre-review iteration 2), where the design
had already argued that a verdict firing on 3 dispatches in 5 "gets learned as
noise" and then scoped the verdict by a denominator that did not close this hole.

**How to apply:** a hard verdict derived from the *absence* of a prose pattern is
the mirror of invariant 4 and deserves the same `[blocker]`. Ask: what does the
producer actually write for the honest, nothing-to-report case, and does the new
verdict fire on it? Related:
[[feedback-enumerate-against-declared-boundary]],
[[feedback-verify-counts-not-just-anchors]].
