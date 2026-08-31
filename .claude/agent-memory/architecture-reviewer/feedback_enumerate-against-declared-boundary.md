---
name: enumerate-against-declared-boundary
description: When a design declares a scope test ("in scope if X"), grep every call site against that test yourself instead of reviewing the listed surfaces
metadata:
  type: feedback
---

When a proposal states a *boundary* rather than a list — "a command is in scope
if a reviewer can reach the location through it" — re-derive the set yourself
with a grep for the leaking expression (e.g. `entry.doc`/`entry.line`), and
compare it against the surfaces the change enumerates. Review the boundary's
closure, not the change's list.

**Why:** `add-canary-status-redaction` grew one surface per review round for
three rounds (status → check warnings → verify + guard row). Each round the
document argued the new surface was the last one. A single grep at iteration 3
found two more the change's own stated test admits, one of which is named as
the remedy by a message the change was redacting.

**How to apply:** any change framed as "apply X uniformly" or "the boundary is
Y". One grep for the concrete leaking symbol settles it in seconds, and a
surface the boundary admits but the change omits is a `[blocker]`, not a nit —
the change reports having closed a vector while a shorter one stays open.
Related: [[verify-counts-not-just-anchors]].

**Grep the throw sites too, not just the print sites.** On the same change at
iteration 4, a "route every render through one accessor" redesign still missed
`plantCanary`'s duplicate-plant refusal (`packages/claims/src/canary.ts:276`),
which renders `doc:line` from a thrown `Error` and is reachable with no
knowledge of the target at all. An accessor closes the sites its author greps
for; `console.log` greps miss `throw new Error(...)` and validation warnings.

**Instance (2026-08-31, add-run-ledger-producer):** a proposal claimed "every
reviewer returns a declared contract — `[blocker]`, `[concern]`, `[looks-good]`,
`[false-premise]`". Grepping each tag against all four `.claude/agents/*.md`
reviewer files showed `checker-engineer.md` and `test-engineer.md` declare zero
`[false-premise]`. A "declared contract" spanning several agent files drifts per
file; count each tag in each file rather than trusting the summary sentence.
