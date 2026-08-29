---
name: feedback-repoint-adjudication
description: never-repoint-under-old-stamp only forbids falsifying a line number that was TRUE at the stamped hash — fixing a never-verified/never-committed guess under an otherwise-correct hash is not the forbidden edit
metadata:
  type: feedback
---

Adjudicated on `add-journal-sealing` iteration 3: author estimated two
anchor line numbers in `design.md` (`identity.ts:279`, `:281`) without
reading them, got `wrong-line`/advisory back from the checker naming the real
lines (271, 273), and edited the doc to 271/273 while keeping the same
`@a1a6a54` stamp — all before ever committing the wrong version (`git log -p`
showed no trace of 279/281 in history; the diff that landed introduced
271/273 fresh).

**Ruling: not a violation.** `never-repoint-under-old-stamp.md`'s text and
its own rationale ("What goes wrong") are both keyed to *drift*: an anchor
that WAS true at the stamped commit becoming false because someone moves the
line to chase later working-tree changes, while the hash (which names an
immutable snapshot) stays put. The precondition for the forbidden edit is
that the original claim was once true. Here it never was — 279/281 was a
guess, never verified, never exposed to any reviewer or CI run as a claim.
The hash `a1a6a54` itself needed no correction (it was the right commit to
have read); only the human's line-number guess was wrong. Editing to the
checker-confirmed true line under the same correct hash IS the rule's
prescribed remedy ("re-read the file and re-stamp" — here only the line half
needed correction, the hash half was already right).

**The gap worth naming:** the rule's bare sentence ("Updating the line number
under the original commit hash is the one edit that is never correct") reads
as an unconditional, diff-shape-only prohibition with no carve-out for
"the original was never true / never committed." A bystander auditing from
git history alone (as this agent normally does) cannot distinguish the two
cases if the wrong version WAS committed at some point — the diff would look
identical to a real violation. The distinguishing fact (was the pre-edit
value ever true, ever committed/reviewed) is not visible in the rule's text
and has to be reconstructed from author testimony or `git log -p` showing no
prior committed occurrence of the wrong line.

**How to apply:** When adjudicating a suspected repoint, don't just diff
before/after — check (a) did the "before" value ever get committed such that
a checker or reviewer could have relied on it as true, and (b) was the
"before" value ever independently verified as true at the stamped hash. If
either is no (as here — never committed, never verified), it's a pre-commit
correction, not a repoint, even though the observable git diff pattern is
identical to the forbidden case. If asked to audit this from a diff alone
with no author testimony, flag it as `[concern]` (unconfirmable which case it
is) rather than either clearing it silently or calling it a confirmed
`[blocker]`.
