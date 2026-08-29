---
name: test-helper-reuse-claims
description: When a design says a new path will "reuse the existing helper" or "reuse the discipline", open the helper and check its actual contract — collapsed error returns and hardcoded spawn options usually make the reuse impossible
metadata:
  type: feedback
---

A Decision that places new code in an existing module because it "reuses" a
helper is a claim about that helper's contract, not just about cohesion. Read
the helper before accepting it.

**Why:** on `add-journal-sealing` (2026-08-29, iteration 2) Decision 6 put
write-capable git in `packages/kit/src/identity.ts` to reuse its bounded-git
discipline. The private `runGit` there collapses every failure to `null`,
hardcodes `input: ""`, and treats empty stdout as failure — so it cannot express
`mktree` (stdin), cannot report `update-ref` success (empty stdout), and cannot
distinguish a compare-and-swap rejection (retry) from a missing binary (give
up). The reuse argument was sound as intent and false as implementation.

**How to apply:** grep the named helper's signature and return type, then list
what the new caller needs from it (stdin? exit code? stderr? success with no
output?). A mismatch is a `[concern]` on the placement decision, because the
implementer will either fork the helper or widen its contract — and widening it
silently changes the existing caller's failure semantics.

Related: [[check-design-code-fences]], [[feedback-verify-counts-not-just-anchors]].
