---
name: check-design-code-fences
description: In post-review, diff design.md's fenced TS signature blocks against the shipped signature — prose and code fences drift apart across proposal iterations
metadata:
  type: feedback
---

Re-check every fenced `ts` signature block in a change's `design.md` against
the implementation, not just the surrounding prose. The two drift apart during
Stage-2/3 iteration: the prose gets rewritten, the code fence does not.

**Why:** in `add-authoring-ergonomics`, Decision 1's fence declared
`planRewrites(intent: { stamp: string | null; fix: boolean })` while the
shipped `RewriteIntent` takes `stamp: { rev, verify } | null` — and the
design's own later prose already described the `verify` callback. `nullius
check` never catches this: a code fence is not an Evidence Anchor, so it is
invisible to the checker and to a prose-level read.

**How to apply:** post-review on any change whose design.md contains fenced
signatures. Grep the fence's identifier in `packages/claims/src`, compare
parameter-by-parameter, and report a mismatch as `[concern]` — the design is
the document a future reader trusts for the API shape.

Related: [[feedback_reread-spec-after-design-rewrite]],
[[feedback_verify-counts-not-just-anchors]].
