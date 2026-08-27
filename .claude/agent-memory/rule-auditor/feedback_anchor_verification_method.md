---
name: feedback-anchor-verification-method
description: How to verify stamped Evidence Anchors precisely without off-by-one/two errors, and where unstamped anchors tend to hide
metadata:
  type: feedback
---

When verifying a stamped Evidence Anchor (`path:line@hash`) against the
commit it names, use `git show <hash>:<path> | awk 'NR>=X && NR<=Y{print
NR": "$0}'` (or plain `awk 'NR==N'`) rather than `sed -n 'A,Bp' | cat -n`. The
`cat -n` row number is 1-indexed from the *start of the sed window*, not the
file — converting back to a real file line is `file_line = A + row - 1`, and
it is very easy to drop the `-1` and misreport a correct anchor as
`STALE`/`FABRICATED`, or worse, wave through a genuinely wrong one. Mid-audit
on `add-wiring-malformed-input` I made exactly this arithmetic slip once
(flagged `wiring.ts:42@hash` as off-by-one when it was actually correct) and
caught it by re-deriving with direct `awk NR==N` before writing it up. Always
do the direct `NR==N` spot-check before reporting an anchor mismatch as
confirmed — see [[rule-auditor-anchor-verification]] pattern generally.

**A separate, real pattern worth watching for on every proposal-mode audit:**
authors in this repo sometimes write a bare inline citation — a
backtick-wrapped `path:line` (occasionally followed by a quoted excerpt in
parens) — with no `**Evidence:**` label and no `@hash` stamp, sitting right
next to a sibling citation in the *same paragraph* that is fully stamped in
canonical `**Evidence:**` form. `add-wiring-malformed-input`'s design.md had
this exactly once (`spec/wiring.md:224-226`, unstamped, immediately after
`spec/wiring.md:137-144@8c6ea59`, stamped, one sentence apart) plus several
more scattered through proposal.md's Non-Goals section. These bare citations
turned out to be factually accurate when checked by hand, but being unstamped
they have no checker protection against future drift — worth flagging as a
`[concern]` under `rev-stamp-change-anchors.md` (not a confirmed `[blocker]`,
since it's genuinely unclear whether the citation grammar the tool parses
covers unlabeled bare citations at all — see `plugin/reviewers/false-premise.md`
boundary notes in the rule-auditor system prompt about not reading
`spec/evidence-anchors.md` to settle that without a matching `applies_to`
glob).

**How to apply:** When grepping citations in `openspec/changes/**/*.md`,
don't only grep for `\*\*Evidence:\*\*` lines — also grep for the bare
backtick `path:line(@hash)?` pattern across the whole doc, and diff the two
sets. Anything in the second set but not the first is a candidate unstamped
anchor worth spot-checking for accuracy and flagging.
