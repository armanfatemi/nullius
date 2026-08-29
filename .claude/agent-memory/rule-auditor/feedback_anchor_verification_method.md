---
name: feedback-anchor-verification-method
description: How to verify stamped Evidence Anchors precisely without off-by-one/two errors, where unstamped anchors hide, and how to tell a benign STALE drift from a real repoint violation
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

**A load-bearing claim about external state (e.g. "issues #4/#6/#7 are all
CLOSED") is checkable the same way an anchor is — just with a different
tool.** On `add-authoring-ergonomics` iteration 1, design.md asserted three
GitHub issues were closed as the basis for correcting the proposal's "closes
#7" framing (FP3 from iteration 0). `gh issue view <n> --json state` for each
confirmed it directly rather than trusting the doc's own "as of this design"
framing. Costs three cheap `gh` calls; treat any bare state-of-the-world claim
about issues/PRs the same as an Evidence Anchor — verify it, don't wave it
through because it reads as already-corrected.

**How to apply:** When grepping citations in `openspec/changes/**/*.md`,
don't only grep for `\*\*Evidence:\*\*` lines — also grep for the bare
backtick `path:line(@hash)?` pattern across the whole doc, and diff the two
sets. Anything in the second set but not the first is a candidate unstamped
anchor worth spot-checking for accuracy and flagging.

**A `STALE` verdict from the tool is not automatically a
`never-repoint-under-old-stamp.md` violation — check `git blame` before
flagging.** On `add-silent-rule-check` post-review, `node
packages/claims/dist/cli.js check` reported `design.md:17`
(`witness.ts:688@612f36b`) as `STALE`: the quoted text was genuinely at line
688 at commit `612f36b`, but had drifted to line 703 in the current working
tree. That drift was NOT a repoint — `git blame -L 17,17` showed the anchor
line was written once (in the proposal's first commit) and never touched
again; the drift was caused entirely by *later commits on the same branch*
inserting ~11 lines earlier in `witness.ts` (adding `TERMINAL_RECORD_KINDS`),
which shifted everything below it. Leaving the citation exactly as written
and letting it report `STALE` is the *correct*, rule-prescribed behavior, not
a violation — the violation would be someone editing the `688` to `703`
while keeping `@612f36b`. **How to apply:** before writing up any `STALE` or
`FABRICATED` finding as a rule violation, run `git blame -L <line>,<line>` on
the anchor line itself. If blame shows one commit and it's never been
edited since, the drift is passive (rule followed correctly, mention as
`[looks-good]` if anything); only an anchor whose line number changed in a
*later* commit while the `@hash` suffix stayed fixed is the actual violation.
Also worth independently re-deriving any coordinator's own account of a
fixture fix (e.g. via `node -e` + `JSON.parse` per line) rather than trusting
the narrative in `review-evidence.md`/commit messages — cheap to do, and is
exactly the `model-proposes-code-verifies.md` discipline applied to my own
audit process, not just to the code I'm auditing.
