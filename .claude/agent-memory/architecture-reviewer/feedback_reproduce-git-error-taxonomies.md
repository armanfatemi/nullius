---
name: reproduce-git-error-taxonomies
description: When a design classifies git failures by exit code + message prefix, reproduce the FULL space of failures in a scratch repo — a permanent fault usually shares the prefix with the transient ones and gets retried forever
metadata:
  type: feedback
---

A Decision that says "git reports X and Y the same way, so collapse them" is a
claim about git's *whole* error space, not just about X and Y. Reproduce the
third, fourth and fifth failures yourself before accepting the collapse.

**Why:** on `add-journal-sealing` (2026-08-29, iteration 3) Decision 1 collapsed
a CAS mismatch and a held ref lock into one retryable `contended` outcome,
correctly noting both are exit 128 opening `cannot lock ref '<ref>'`. In a
scratch repo a **broken ref** (`printf garbage > .git/refs/<ref>`) produces the
same exit code and the same opening clause — `... : unable to resolve reference
'<ref>': reference broken`. A predicate keyed on the prefix therefore retries a
permanent fault until the wall-clock budget is exhausted, on every session end,
forever. The discriminator that works is the **trailing clause**, which the
design had already observed differed but treated as incidental.

**How to apply:** build the scratch repo and enumerate: normal, compare
mismatch, held `.lock`, corrupt ref file, ref path as a directory, read-only
`.git`. Compare exit code *and* full stderr. Report a permanent fault that
lands in a retryable bucket as a `[blocker]` — it is the fail-open-but-burn-the-
budget shape, not a crash, so nothing in CI will surface it.

Related: [[feedback-verify-counts-not-just-anchors]],
[[test-helper-reuse-claims]].

**The same check applies to a state-reading predicate, not just a text-parsing
one.** Iteration 5 of `add-journal-sealing` replaced the string predicate with
"re-read the ref tip and decide from its state", which requires `readRefTip` to
separate "ref absent" (legitimate first seal) from "tip unreadable". Reproduced:
`git rev-parse --verify --quiet <ref>` exits **1 with empty stdout for both** an
absent ref and a broken one (`printf garbage > .git/refs/<ref>`) — the only
difference is a `warning: ignoring broken ref` on **stderr**. `show-ref
--verify` exits 128 for both; `for-each-ref` exits 0 for both. So a design that
forbids reading git's error output cannot get this distinction from git's exit
codes, and must say which signal it uses. Also verified there: a held
`.lock` leaves the tip unchanged (so it classifies as blocked/not-moved,
correctly), and a corrupt ref rejects even a zero-OID create.
