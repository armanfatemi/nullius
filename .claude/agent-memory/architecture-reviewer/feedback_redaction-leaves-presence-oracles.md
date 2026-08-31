---
name: redaction-leaves-presence-oracles
description: After a redaction lands, re-review the messages that survived for what their presence/absence discloses — a warning that fires only when a doc is NOT the target is a one-bit oracle
metadata:
  type: feedback
---

When a change redacts a value out of messages, do a second pass asking what
each *surviving* message discloses by firing at all. A message whose branch
condition is the redacted fact leaks the fact without printing it.

**Why:** on `add-canary-status-redaction` (2026-08-30, post-review) every
string was correctly redacted, but `check`'s out-of-scope warning
(`packages/claims/src/cli.ts:1108`) fires exactly when the matched set does
*not* contain the plant, and under `--probing` every other canary output is
suppressed. So `check --probing <one-doc>` per document is a clean binary
oracle for the plant's location, requires no knowledge, and survives the
follow-up that was promised to close the guard row.

**How to apply:** for each message left standing after a redaction, write down
its firing condition. If the condition is a predicate over the secret, the
message is a side channel regardless of its text. Same pass catches
count-claims in the CHANGELOG: re-derive the number of redacted sites from the
diff rather than trusting the entry's enumeration.
Related: [[feedback-enumerate-against-declared-boundary]],
[[feedback-verify-counts-not-just-anchors]].
