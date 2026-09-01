---
name: blockquoted-anchors-are-ungated
description: An Evidence Anchor written inside a markdown blockquote is not parsed by `nullius check` — it looks like grounding and is gated by nothing
metadata:
  type: feedback
---

An `**Evidence:**` line indented under a `>` blockquote is invisible to
`nullius check`. The file's anchor count silently excludes it and the run
reports "All N grounding marker(s) verified" without ever reading it.

**Why:** Observed 2026-08-31 on
`openspec/changes/archive/2026-08-30-add-journal-identity/review-evidence.md`,
where a "Superseded" note added a blockquoted anchor at
`packages/kit/src/record.ts:763`. `check` reported 7 anchors for a file
containing 8 `Evidence:` lines, and the blockquoted one was off by three lines
(the real line was 766) — proof it had never been verified by anything.

**How to apply:** When a diff adds an Evidence Anchor inside a blockquote,
callout, or any other wrapper, run `check` on that file and compare the
reported anchor count against `grep -c 'Evidence:'`. A mismatch means the new
citation carries the appearance of grounding with none of the gate. Superseding
notes and "this was true then" annotations are where this shape shows up,
because the natural way to write them is as a quote. Related:
[[feedback_verify-counts-not-just-anchors]].
