---
name: feedback-scope-boundaries-must-be-mechanisms
description: When a proposal excludes a leak/vector because "only the coordinator invokes that command", check reachability in code — a convention about who runs a command is not a mechanism
metadata:
  type: feedback
---

When a change scopes a vector out on the grounds that *the wrong actor never
runs that code path* — "invoked only by the coordinator", "only CI calls this",
"that stage runs after review" — treat the exclusion as unproven until you check
whether the excluded path is **reachable** by the actor it is being kept from.

**Why:** on `add-canary-status-redaction` (2026-08-30, pre-review iteration 2)
the design excluded `canary verify` from redaction, arguing the split was "when
the command runs": coordinator-only, at Stage 2 Step 5, after the review is
written. But `verify` reads the registry, prints the planted location on both
outcomes, and does not clear the entry (`packages/claims/src/cli.ts:1294-1328`)
— so a reviewer can run it on a scratch file mid-review and be handed the same
information the change is closing elsewhere. Stage numbering is a convention in
a skill document, not a guard in the code. The identical failure appeared as an
incompleteness in the *included* scope: the proposal described `check` as
leaking "in two warning branches" while the guard's own result row prints the
planted document and line in the normal report.

**How to apply:** for every "X is out of scope because only Y invokes it", ask
two questions against the code: can the untrusted actor invoke X directly, and
does invoking it early change any state that would reveal the misuse? If both
answers are "no consequence", the boundary is a convention and the exclusion is
a rationalization — flag it and say plainly whether the path belongs in scope.
Related: [[feedback-verify-counts-not-just-anchors]],
[[feedback-check-early-return-branches-against-unconditional-shalls]].
