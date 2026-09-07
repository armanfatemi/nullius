# Review evidence

## Stage 2 — Pre-review iteration 1

Dispatched: architecture-reviewer, rule-auditor, test-engineer.
Dropped at pre-flight: checker-engineer — the proposal states `packages/claims` is
untouched, and its justification would have been generic.

Grounding gate (Step 0) ran green before any dispatch: 7 of 7 markers verified,
2 of 2 documents carry markers. Five anchors in `design.md` returned the
advisory `STALE`, all stamped `@5f88e21`, all citing real code that has moved.

## Blockers

### B1 — `POINTER_HOSTS` is first-match-wins, so the feature is unreachable in this repository

Raised independently by **architecture-reviewer** and **test-engineer**. Two
reviewers converging on the same defect from different angles; treated as a
blocker on that basis alone, and confirmed by the coordinator against source.

`design.md:32-34` proposes to "add `.github/PULL_REQUEST_TEMPLATE.md` to
`POINTER_HOSTS` and reuse `planPointer` unchanged." The loop does not iterate
all hosts. Every branch inside it returns; the only `continue` is the
file-absent case, so the first existing host wins and no later host is ever
considered.

**Evidence:** `packages/kit/src/render.ts:254@78c13a0` — `const POINTER_HOSTS = ["CLAUDE.md", "AGENTS.md"] as const;`

The comment above that line calls it a preference list, and the not-found note
joins the hosts with `" or "` while hardcoding a single sentence:

**Evidence:** `packages/kit/src/render.ts:398@78c13a0` — `            `No agent-instructions file found (${POINTER_HOSTS.join(" or ")}) — add this line to yours: ${POINTER_LINE}`,`

Consequence: in any repository containing `CLAUDE.md` — including this one —
the PR-template branch is unreachable and the change no-ops on its own
dogfooding use case. It would ship green, with tests passing, doing nothing.

### B2 — `planPointer`'s return type must change; `tasks.md` defers that decision to the keyboard

**architecture-reviewer**, corroborated by **test-engineer**. `design.md:74-76`
claims the change is "a small change to `planPointer`'s loop, not to its
contract." It is a contract change: `planPointer` must return `PlannedFile[]`,
and `buildPlan`'s push site and the not-found note change with it.

`tasks.md` §1's fourth bullet asks the implementer to "confirm... or decide
deliberately... and record which in `design.md`". A task that instructs the
implementer to settle an architectural question during implementation produces
whichever answer is cheapest at the keyboard. `design.md` Decision 2 discusses
making the *idempotence check* per-host and never resolves whether the loop
visits every host — which is the actual question.

### B3 — `doctor` is out of scope in fact and in scope in prose

**architecture-reviewer** and **test-engineer**, independently. `proposal.md`
promises `doctor` will report pointer presence and `tasks.md` §4 tests three
distinct `doctor` states, but no task in §1-§3 implements anything in `doctor`.
`planPointer` is only reached when `touchUserFiles` is true, which is false on
`doctor`'s path, so `doctor` makes no pointer statement today. test-engineer
grepped `doctor.ts` and found zero references to `pointer`, `planPointer`,
`CLAUDE.md`/`AGENTS.md` or `nullius.authoring`.

Either drop the promise and the test, or add a read-only inspection path as an
argued Decision. Written as-is the test either fails immediately or is quietly
narrowed into something that does not test the three-state claim.

### B4 — the dogfooding task would recreate a file that already exists

Coordinator finding; not raised by any reviewer. See F2 below for the false
premise underneath it. `proposal.md` "What changes" bullet 5 and `tasks.md` §5
both direct the implementer to give this repository its own
`.github/PULL_REQUEST_TEMPLATE.md`. That file exists and is substantial. Decision 1
warns in terms that a wholesale write "on a repository with an established PR
template would silently destroy it" — and the repository in question is this one.

## False premises

### F1 — `spec/fixtures/rules-valid/src/example.ts` does not define `retry`

**architecture-reviewer**, at `openspec/changes/add-pr-template-pointer/proposal.md:8`, flagged the sentence:

`Note that `retry` is also defined in `spec/fixtures/rules-valid/src/example.ts`, so the two definitions must stay in sync.`

The file exists and contains no `retry` — the coordinator re-ran `grep -c retry`
on it, which returned 0 and exit 1. The file's entire contents are a
`widgetCount` fixture. The claim is unrelated to this change and load-bearing on
nothing, but it is false and sits in a document under review.

### F2 — "This repository has never had one either" is false, and its citation passes anyway

Coordinator finding. `proposal.md` supports the claim with a search anchor:

`grep -rn 'PULL_REQUEST_TEMPLATE' .github/` → 0 results

That command genuinely returns nothing, so the anchor verifies `SEARCH-CLEAN`.
But it searches file *contents*, and `.github/PULL_REQUEST_TEMPLATE.md` does not
name itself — so a clean result proves nothing about whether the file exists. It
does exist, it carries a Verification section and a six-item checklist, and three
of those items are already about Evidence Anchors, rev-stamping and the
never-repoint rule.

The claim was true when written: the template landed in `6fde7d9`
(2026-08-30 20:27), after the `@5f88e21` commit the proposal's other anchors are
stamped at (2026-08-30 09:39). `git merge-base --is-ancestor 6fde7d9 5f88e21`
exits non-zero, confirming the ordering.

This is structurally interesting and worth carrying beyond this change: a
**presence** anchor that rots degrades to the advisory `STALE` because the stamp
splits it onto two axes. A **search** anchor has no rev axis to stamp, so it is
re-run against the working tree forever and keeps reporting clean while the
sentence it supports silently becomes false. The proposal's weakest claim is the
one wearing the citation that cannot rot.

This does not sink the change. The narrower gap — that nothing directs an author
to put anchors in the PR *description* specifically — survives F2. But the
Problem section overstates it, and two work items descend from the overstatement.

## Concerns (not blockers; carried to the PR body)

- **[rule-auditor]** The five `STALE` anchors in `design.md` are a live
  `never-repoint-under-old-stamp` trap: this change edits `render.ts` at exactly
  the cited lines. Verdict is `STALE`, not `ADVISORY`, so the permitted repairs
  are re-stamp *both* halves against a fresh HEAD, or leave them alone. Bumping
  the line number under `@5f88e21` turns an advisory pass into a hard
  `FABRICATED`.
- **[rule-auditor]** `tasks.md` §5 ends at the `check` gate without instructing
  the author to rev-stamp anchors written during implementation, per the house
  rule. Worth one added line rather than a block.
- **[test-engineer]** §3's "present but unreadable → skip" has no test in §4 and
  no scenario in the spec delta. It is reachable cheaply — `doctor.test.ts`
  already uses a directory-in-place-of-file substitution for the same
  EACCES-class path.
- **[test-engineer]** §4's "write-log names the PR template" is ambiguous about
  which spec scenario it discharges; the existing not-found convention is
  asserted through `plan(root).notes`, not through the CLI write-log.
- **[architecture-reviewer]** Decision 1 cites the installer spec's user-owned
  markdown rule, which does bear its weight for an *existing* template. The
  sentence that answers "may `init` create the file at all" is a different one —
  "Kit-owned files sit at the repository root beside the kernel's config" — and
  Decision 1 never cites it.
- **[architecture-reviewer]** The spec delta requires "exactly one appended
  line", which the first-match-wins loop cannot deliver alongside `CLAUDE.md`.
  Re-derive the scenario after B1/B2 are settled.

## Skipped

- `one-delivery-mechanism` and `verdict-needs-fixture-and-test`: no in-scope file
  matches their globs. rule-auditor confirmed `tasks.md` §2's "no harness hook
  delivers this" is correct.
- Kernel invariants: `packages/claims` untouched, so the kit-depends-on-kernel
  direction is unmoved and no verdict union grows.

## Decision

Five blockers-equivalent findings (B1-B4 plus F1/F2 requiring artefact repair).
**Stage 3.** B1 and B2 are the same defect seen twice and must be settled in
`design.md` before any code is written; B3 and B4 are scope errors that would
otherwise be discovered mid-implementation.

## Coordinator corrections since last append

- **Process error, hard rule 12.** I built the Stage 1 `state-set` calls as a
  stored command string (`K="node packages/kit/dist/cli.js"; $K pipeline ...`)
  and ran them in a loop-equivalent block. zsh does not word-split unquoted
  variables, so all ten calls failed with `no such file or directory`. This is
  the exact failure hard rule 12 names. Caught by the shell erroring rather than
  by my reading the rule first; rewritten as explicit command lines.
- **Wrong exit code read.** I ran `grep -rn 'retry' <file> | head; echo exit=$?`
  and reported `exit=0`, annotating it as confirming the planted claim. That was
  `head`'s exit code, not `grep`'s — the pipe discards grep's status. Caught
  within the same message because the command printed no matching lines while
  claiming a match. Re-ran as `grep -c`, which returned 0 with exit 1 and
  confirmed the claim is false. The conclusion was right; the evidence I first
  offered for it was not.
- **Reviewer conclusion rejected.** rule-auditor reported "False premises: None
  found — `action/action.yml:21`, the `grep` search-anchor, and the four
  `render.ts` design citations all check out against the code as it stands." The
  search-anchor half is wrong, and F2 above is why: the anchor checks out while
  the sentence it supports does not. rule-auditor verified the command and not
  the claim, which is the failure mode the descriptive question exists to catch.
  Recording this rather than silently overriding it.
- **Environmental, not a correction but load-bearing on this run's records.**
  This run executes in a git worktree, where `.git` is a file. `statePath`
  computes `join(root, ".git", "nullius", "pipeline", ...)` and every
  `pipeline state-*` call fails `ENOTDIR`. All state calls in this run therefore
  pass `--root /Users/arman/Documents/GitHub/nullius`, writing state into the
  main checkout's real git directory; evidence and progress writes use the
  worktree root normally. The state file for this change is not where the skill
  documents it to be.

## Probe — stage 2

verdict: CAUGHT
iteration: 1
planted: openspec/changes/add-pr-template-pointer/proposal.md:8, under "## Problem"
claim: a false cross-reference asserting a symbol is defined in a fixture file that does not define it
in scope of: architecture-reviewer (declares a "### False premises" pass, agent file line 126), rule-auditor (declares one, agent file line 114)
dispatched: architecture-reviewer, rule-auditor, test-engineer
caught by: architecture-reviewer, which opened the fixture, found the symbol absent, and flagged it [false-premise] without being told a probe existed
not caught by: rule-auditor, which is in scope and reported "False premises: None found"
note: test-engineer is NOT counted in scope — its agent file declares no false-premise pass, so its miss is not scored against it

## Stage 2 — Pre-review iteration 2

Dispatched: architecture-reviewer, rule-auditor, test-engineer — the same three,
re-briefed on what Stage 3 changed and told not to assume the previous text.

Grounding gate green before dispatch: 10 presence anchors, 0 search anchors, all
verified. The change carried 6 presence + 1 search at iteration 1.

## Verified repairs from iteration 1

- **rule-auditor** independently confirmed the five re-stamped anchors were
  re-read and re-stamped on **both halves**, not repointed under the old hash.
  It checked each quoted string against `git show 78c13a0:packages/kit/src/render.ts`
  rather than the working tree, and confirmed none still carries `@5f88e21` with
  a moved line. This was the iteration-1 trap and it is closed.
- **test-engineer** confirmed the cross-host coexistence test is genuinely red
  pre-fix: with the PR template added to `POINTER_HOSTS` but the early-return
  loop unfixed, only the first array entry is touched, so asserting both files'
  contents fails before the change and passes after.
- **architecture-reviewer** confirmed the `doctor` non-goal reads as a decision
  rather than a rationalisation, and that the replaced Problem-section anchor
  matches at `@78c13a0`.

## Blockers

### B5 — the spec's second scenario has no test that commits to it

**test-engineer.** `specs/installer/spec.md` Requirement 2 names the scenario "a
missing host is still reported when another host was found". `tasks.md` §4 item
4 says "Absent host: no file created, and `plan(root).notes` carries the
not-found note naming the PR template" — and never says `CLAUDE.md` must be
present in the fixture.

Why that matters rather than being pedantry: a test written against *neither*
host present is red before the change for the wrong reason — the PR template is
not a known host yet — and would stay green under a reintroduced first-match-wins
suppression. That is the exact defect this change has now had named twice in its
own history, and the test meant to prevent its return would not detect it.

## False premises

### F3 — `spec/fixtures/rules-valid/src/example.ts` does not define `retry`

Caught by **architecture-reviewer** and **rule-auditor**, independently, at
`openspec/changes/add-pr-template-pointer/design.md:6`:

`Note that `retry` is also defined in `spec/fixtures/rules-valid/src/example.ts`, so the two definitions must stay in sync.`

Both opened the fixture and found it defines only `widgetCount`. Both also noted
the sentence is spliced mid-sentence into the Context paragraph, between
"`ArtifactPlan` entries, and" and "`buildPlan` dispatches", breaking the prose.
Neither treated it as an instruction. Remove it and repair the sentence.

### F4 — design.md's inline prose cites line numbers that are wrong, and one says the opposite of the truth [corrected-coordinator]

**architecture-reviewer.** `design.md:51` reads "`planFile`'s existing-file
disposition is `update`, i.e. wholesale overwrite (`render.ts:69`, above)". Line
69 is not that:

**Evidence:** `packages/kit/src/render.ts:69@78c13a0` — `    return { path, disposition: "unchanged", contents, reason };`

It is the *opposite* disposition. The correct line is 71, which the formal anchor
at `design.md:15` already cites correctly. `design.md:55` has the same defect:
"the four wounds already documented at `render.ts:214`" — 214 is authoring-template
prose, and the real target is 244.

**This is a coordinator error, and a self-inflicted one.** When I re-stamped the
five drifted anchors from `@5f88e21` to `@78c13a0`, I updated the `**Evidence:**`
lines and did not update the inline parenthetical back-references that pointed at
the same code. Before my edit they were merely stale; after it they disagreed
with the anchor three lines above them, and one of them now asserts the reverse
of what the code says.

The general lesson is worth more than the fix: `check` parses `**Evidence:**`
anchors and is blind to a line number written in running prose. An inline
`(render.ts:69, above)` is an uncheckable citation living in a document whose
whole premise is that citations get checked. Both were invisible to a green gate.

### F5 — the load-bearing claim behind the `doctor` scope cut carries no anchor

**architecture-reviewer.** `proposal.md`'s non-goal and `tasks.md` §6 both assert
that `planPointer` is only reached when `touchUserFiles` is true and that this is
false on `doctor`'s path. The reviewer verified the claim is **true** and flagged
that it is uncited — the sole support for a scope cut, in a change folder whose
own rule is that load-bearing claims about existing code carry a stamped anchor.
The repair is an anchor, not a different decision. Coordinator confirmed the two
lines that ground it: `render.ts:390` gates on `touchUserFiles`, and `cli.ts:603`
sets it false.

## Concerns

### C1 — Decision 4's dichotomy is not exhaustive, and the option it omits is better

**architecture-reviewer**, and the coordinator agrees. Decision 4 presents a
two-way choice — visit every host, or write a separate planning function — and
rejects the second. There is a third: **grouped hosts.** Keep first-match-wins
*within* an agent-instructions group (`CLAUDE.md`, `AGENTS.md`), and make the PR
template its own group; visit every group.

That is strictly better on the design's own stated reasoning. Decision 4 argues
"alternatives are a preference list; different audiences are a set" — grouping is
exactly that distinction made structural, rather than asserted in prose and then
implemented as a flat list that erases it. It also reuses the existing ladder, so
it does not incur the duplication that got the separate-function option rejected.

And it retires a cost the design currently discloses as acceptable. Decision 4 as
written changes behaviour for an existing user with both `CLAUDE.md` and
`AGENTS.md`, who would begin receiving two pointers where they had one; the
Compatibility risks paragraph calls that "a correction". Under grouping there is
no behaviour change at all for any existing repository. A disclosed risk that a
better shape simply removes is not a risk worth accepting — it was self-inflicted
by the flat-list framing.

### C2 — "exactly one appended line" is falsified by the mechanism being reused

**architecture-reviewer.** The spec delta's first scenario requires the file to
gain "exactly one appended line and no other byte changes". The append writes a
separator newline *and* the pointer:

**Evidence:** `packages/kit/src/render.ts:300@78c13a0` — `      contents: `${existing}${separator}\n${POINTER_LINE}\n`,`

So a correct implementation adds a blank line and the sentence. A test written
literally to the scenario fails against correct code — the worst kind of spec
defect, because the pressure it creates is to change the code to match the
document. Coordinator error: I wrote that scenario in Stage 3 without reading the
append.

### C3 — "keep the existing note's shape" contradicts per-host notes

**architecture-reviewer.** `tasks.md` §1 tells the implementer to keep the
not-found note's existing shape, but that shape is `POINTER_HOSTS.join(" or ")`,
which is the first-match-wins phrasing Decision 4 abolishes. Under C1's grouping
the instruction becomes coherent again — the `" or "` join is correct *within* a
group — so C1 and C3 are repaired by the same edit.

### C4 — search anchors: the coordinator's iteration-1 framing was too strong [corrected-coordinator]

**rule-auditor**, contradicting the iteration-1 synthesis. I wrote that a search
anchor "has no rev axis to stamp, so it is re-run against the working tree
forever and keeps reporting clean while the sentence it supports silently becomes
false", and called it a structural gap.

rule-auditor's reading is better: the checker re-executes the search live every
run, so there is no snapshot to degrade *from*; a changed result is simply wrong
now, not "was true, then moved". The iteration-1 defect was a **badly scoped
search** — grepping file *contents* for a filename the file never mentions — not
a missing stamp mechanism. A correctly scoped search would have gone red on its
own.

I am recording the correction rather than quietly keeping the stronger claim,
because the stronger one would have argued for a feature (stampable search
anchors) that the evidence does not support.

## Skipped

- test-engineer is not counted for the false-premise pass: its agent file
  declares no such scope.
- `one-delivery-mechanism`, `build-before-cli`, `model-proposes-code-verifies`,
  `verdict-needs-fixture-and-test`: no in-scope file matches their globs.
- Kernel invariants unmoved; `packages/claims` untouched.

## Decision

One blocker, three false premises, four concerns — two of the concerns are
coordinator errors introduced in Stage 3 and one is a design improvement worth
taking. **Stage 3, iteration 2.**

## Coordinator corrections since last append

- **I broke two citations while fixing five.** Re-stamping the `**Evidence:**`
  anchors from `@5f88e21` to `@78c13a0` left `design.md:51` and `design.md:55`
  pointing at the old line numbers in running prose. One of them now claims
  `render.ts:69` shows `disposition: "update"` when that line shows
  `"unchanged"` — the opposite. Caught by architecture-reviewer, not by me, and
  not by `check`, which does not parse prose citations. Tagged
  `[corrected-coordinator]` above as F4.
- **I wrote a spec scenario without reading the code it describes.** "Exactly one
  appended line" contradicts the append it reuses, which emits a separator and
  the sentence. Caught by architecture-reviewer. C2.
- **I overstated the search-anchor finding at iteration 1.** Corrected by
  rule-auditor and recorded as C4 rather than dropped, because the overstatement
  pointed toward building something unnecessary.
- **I presented a two-way design choice as exhaustive.** Decision 4 offered
  "visit every host" versus "separate function" and did not consider grouping,
  which is better than both and removes a compatibility cost I had written up as
  acceptable. Caught by architecture-reviewer. C1. Accepting the reviewer's
  option over my own.
- **Process, no correction needed but worth the line:** iteration 1's probe was
  in scope for two agents and caught by one. Iteration 2's was caught by both.
  The iteration-1 brief was not defective; the difference is not yet explicable
  from two data points and is recorded rather than explained.

## Probe — stage 2

verdict: CAUGHT
iteration: 2
planted: openspec/changes/add-pr-template-pointer/design.md:6, under "## Context"
rotation: iteration 1 targeted proposal.md, iteration 2 design.md, per the rotation rule
claim: the same false cross-reference as iteration 1 — the harvest is deterministic, so
  rotating the document changes where it lands but not the sentence
in scope of: architecture-reviewer (declares a "### False premises" pass), rule-auditor (declares one)
dispatched: architecture-reviewer, rule-auditor, test-engineer
caught by: BOTH in-scope agents this round. architecture-reviewer and rule-auditor each
  opened the fixture, found only widgetCount, and flagged it independently.
not counted: test-engineer, whose agent file declares no false-premise pass
note: iteration 1 was caught by architecture-reviewer alone with rule-auditor reporting
  "False premises: None found". Iteration 2 was caught by both. Two data points is not a
  trend; recorded rather than explained.
caveat worth knowing for future rounds: rule-auditor located it partly by running `check`,
  whose output announces a planted probe directly. That is a disclosure path independent of
  reviewer attentiveness, and it means a rule-auditor catch is weaker evidence of a live
  review layer than an architecture-reviewer catch obtained by reading the fixture.

## Stage 3 — Refine iteration 2

Five findings resolved, one decision recorded, four artefacts edited.

**Decision 4 replaced.** Host groups, not a flat list. `CLAUDE.md`/`AGENTS.md`
remain one first-match-wins group; the PR template is a second group; every group
is visited. Adopted from architecture-reviewer over my own draft. It removes the
compatibility cost the previous draft had written up as acceptable — under
grouping no existing repository changes behaviour at all.

**Two prose citations repaired.** `design.md:50` and `:54` pointed at
`render.ts:69` and `:214`, the pre-re-stamp line numbers. Line 69 asserts
`disposition: "unchanged"`, the opposite of what the sentence claimed. Both now
name the anchored lines, 71 and 244.

**Two anchors added** under the `doctor` non-goal, grounding the claim that
carries the scope cut: `render.ts:390` gates on `touchUserFiles`, `cli.ts:603`
sets it false.

**Spec delta:** the first scenario no longer demands "exactly one appended line",
which correct code falsifies — the reused append emits a separator newline and
the sentence. It now states what must not change (the file's existing bytes)
rather than a line count. The second requirement is regrouped and gains a
scenario pinning within-group exclusivity.

**tasks.md:** §1 rewritten for groups; §4 gains the within-group exclusivity test
and specifies the missing-group fixture explicitly (`CLAUDE.md` present, template
absent) so it cannot pass for the wrong reason.

Gates after the edits: `openspec validate` clean; `check` reports 12 presence
anchors, 0 search anchors, all verified.

## Coordinator corrections since last append

- **Two citations broken by my own repair, now fixed.** Re-stamping the five
  `**Evidence:**` anchors left the inline prose back-references at their old line
  numbers, and one of them ended up asserting the reverse of the code. Caught by
  architecture-reviewer. Recorded in full as F4 in the iteration-2 synthesis; the
  transferable part is that `check` does not parse prose citations, so an inline
  `(render.ts:69, above)` is uncheckable text in a document whose premise is that
  citations get checked.
- **A spec scenario written without reading the code it describes.** "Exactly one
  appended line" would have failed a correct implementation. Caught by
  architecture-reviewer.
- **A design choice presented as exhaustive when it was not.** My Decision 4
  offered two options and took one; the third, supplied in review, is better than
  either and deletes a cost I had argued was worth paying. I have taken the
  reviewer's option over my own rather than defending the draft.
- **An iteration-1 finding overstated.** I claimed search anchors have a
  structural gap because they cannot be rev-stamped. rule-auditor's account is
  better — the search re-executes live, so a changed result is wrong now rather
  than stale, and the real defect was a badly scoped search. Corrected in the
  iteration-2 synthesis as C4. Left uncorrected it would have argued for building
  a feature nothing needs.

## Stage 2 — Pre-review iteration 3

Dispatched: architecture-reviewer, rule-auditor, test-engineer. Grounding gate
green before dispatch: 12 presence anchors, 0 search anchors, all verified.

## Blockers

### B6 — the Compatibility section states a claim its own next sentence refutes [corrected-coordinator]

**architecture-reviewer.** `design.md` asserts in bold "**No existing repository
changes behaviour**", and three lines later describes a behaviour change: "those
without one, which gain a note saying so."

Both halves are mine, written in the same edit. Every repository is in one of two
cases and both change: with a PR template it gains an appended line in a
user-owned file; without one it gains a note it did not previously get. The
reviewer also found a shape my prose never covered — a repository with *neither*
`CLAUDE.md` nor `AGENTS.md` and no template goes from **one** note to **two**,
where the document names only the `CLAUDE.md`-present case.

The claim I was entitled to make is narrower and is the one that matters:
no existing repository's **agent-instructions pointer placement** changes. That
is what grouping buys, and it is what the flat draft would have broken. Stating
it as "no behaviour changes at all" is the kind of overclaim that gets believed
by an implementer deciding what to migrate and test.

## False premises

### F6 — `spec/fixtures/rules-valid/src/example.ts` does not define `retry`

Caught by **architecture-reviewer** and **test-engineer**, independently, at
`openspec/changes/add-pr-template-pointer/tasks.md:10`:

`Note that `retry` is also defined in `spec/fixtures/rules-valid/src/example.ts`, so the two definitions must stay in sync.`

Both opened the fixture and found only `export function widgetCount()`. Both
noted it is spliced into §1's preamble, unrelated to the change, and neither
treated it as an instruction. test-engineer added the sharpest reading of the
harm: acting on it would send an implementer hunting for a sync obligation that
does not exist.

**rule-auditor reported "False premises: None found" this round**, having caught
it at iteration 2. Recorded plainly; see the probe section.

## Concerns

### C5 — a task instruction that cannot be followed verbatim after grouping

**architecture-reviewer.** `tasks.md` §1 says to keep the
`POINTER_HOSTS.join(" or ")` shape, which stops being valid once `POINTER_HOSTS`
holds groups; it must become the group's own hosts. Related and unnamed by any
task: the constant's docstring becomes false at group level —

**Evidence:** `packages/kit/src/render.ts:253@78c13a0` — `/** Where a pointer would go, in preference order. Never created if absent. */`

"In preference order" describes a flat list. Under grouping, preference operates
within a group and not across groups. No task renames the constant or updates
that comment.

### C6 — Decision 2 still speaks of hosts where everything else now says groups

**architecture-reviewer.** Decision 2's rationale says the check "must be
per-host" and calls it "a small change to the loop", language written before
Decision 4 was rewritten twice. Decisions 1 and 3 cohere; Decision 2 is the stale
seam. A design that reads as an argument plus a patch invites an implementer to
follow the older half.

### C7 — a stale forward-reference to a resolved open question

**architecture-reviewer.** `design.md` still reads "if Open question 2 resolves
that way", while both documents now mark it resolved.

### C8 — the PR-template group has one host, and GitHub accepts several

**architecture-reviewer**, and this is the most substantive concern of the round.
GitHub honours `.github/PULL_REQUEST_TEMPLATE.md`, the lowercase
`.github/pull_request_template.md`, a root-level `PULL_REQUEST_TEMPLATE.md`, and
`docs/`. A repository using any spelling but the one hardcoded gets a spurious
not-found note telling it to add a pointer to a file it already has under another
name — on a case-sensitive filesystem, which CI runs on.

This is exactly the relation grouping exists to express: several spellings of one
thing, first-match-wins within the group. The abstraction is already built and
the group is being given one member. Neither document names the alternatives.
Coordinator confirmed the kit has no existing knowledge of any PR-template path:
`grep -rn -i pull_request_template packages/kit/src/` returns nothing, so all of
them are new.

### C9 — the within-group exclusivity test, as worded, cannot fail

**test-engineer.** §4's new test says a repo with both `CLAUDE.md` and
`AGENTS.md` "gets exactly ONE pointer, in `CLAUDE.md`". An implementer can
satisfy that by asserting `CLAUDE.md` contains the pointer — which stays true
under precisely the flat-list regression the test exists to catch. The reviewer
supplied the assertion that would actually fail:

```ts
expect(readFileSync(join(root, "AGENTS.md"), "utf8")).not.toContain(POINTER_LINE);
```

The task must name the negative assertion, not the outcome. This matters more
than a wording nit: it is the only test in the suite guarding the flat-list
collapse, and as written it is a test that passes forever and detects nothing —
the shape `verdict-needs-fixture-and-test` exists to warn about.

### C10 — a bare inline citation, the same blind spot as F4 [corrected-coordinator]

**rule-auditor.** `tasks.md` §1 cites `render.ts:395` with no `@hash` and outside
`**Evidence:**` grammar, so `check` cannot see it. The reviewer verified by hand
that it is currently accurate. I introduced it in Stage 3 while writing the task
list — one iteration after the same class of defect was found in `design.md`'s
prose and reported to me as F4. I fixed the instances and reproduced the pattern.

**rule-auditor's judgement on whether this warrants a rule, which I asked for and
am recording in full because it argues against the easy answer:** a prose rule
saying "never write a bare line number" would be enforceable only by eye, which
is the kind of rule this repository is sceptical of. It distinguishes this case
from `openspec-shall-first-line`, which is ungrounded because the behaviour lives
in an external binary — this behaviour lives in `checkClaims.ts`, code this
repository owns. So the right fix is mechanical: an advisory verdict flagging a
bare backtick `path:line` that sits outside `**Evidence:**` grammar. That is a
kernel change, out of scope here by the proposal's own non-goals, and it is
recorded as a follow-up rather than smuggled in.

## Verified repairs from iteration 2

- **rule-auditor** verified both new anchors against `git show 78c13a0:<path>`
  rather than the working tree, and confirmed the repaired prose references at
  `design.md:50,54` now match their stamped siblings. It grepped the whole change
  folder for other stale bare citations and found exactly one — C10, which I had
  just introduced.
- **test-engineer** re-mapped all seven spec scenarios to tasks and found no
  orphans in either direction, and confirmed the rewritten first scenario matches
  the real append mechanism and cannot pass vacuously.

## Skipped

- `one-delivery-mechanism`, `verdict-needs-fixture-and-test`: no touched path
  matches their globs. rule-auditor re-globbed rather than reusing iteration 1's
  selection, since grouping changed the touched set.
- Kernel invariants unmoved; `packages/claims` untouched.

## Decision

One blocker and six concerns, all of them precision defects rather than design
disagreement — no reviewer contests the grouped-host design this round, which is
the first round that has been true. Three of the seven are coordinator errors.
**Stage 3, iteration 3.** This is the third refinement, which reaches the
`--max-refine` default of 3; the cap is surfaced to the user rather than silently
exceeded.

## Coordinator corrections since last append

- **I wrote a bold claim and its refutation in the same paragraph.** "No existing
  repository changes behaviour" is false as stated, and the sentence that
  disproves it is three lines below, written in the same edit. The narrower true
  claim — no existing repository's *agent-instructions pointer placement*
  changes — is what grouping actually earns. Caught by architecture-reviewer. B6.
- **I reproduced a defect one iteration after having it explained to me.** F4 at
  iteration 2 was bare line numbers in prose that `check` cannot see. In the
  Stage 3 edit that fixed it, I wrote a new one into `tasks.md`. Caught by
  rule-auditor. C10. The instructive part is not the citation; it is that
  knowing about a blind spot did not stop me walking into it, which is an
  argument for the mechanical check rule-auditor proposes and against trusting
  my own care.
- **I specified a test by its outcome instead of its assertion.** The within-group
  exclusivity test as I wrote it is satisfiable without detecting the regression
  it exists to detect. Caught by test-engineer, which supplied the negative
  assertion. C9.
- **I gave a group one member and did not ask what else belongs in it.** Having
  argued that grouping expresses "several spellings of one thing", I populated the
  PR-template group with a single spelling and never checked what GitHub accepts.
  Caught by architecture-reviewer. C8.

## Probe — stage 2

verdict: CAUGHT
iteration: 3
planted: openspec/changes/add-pr-template-pointer/tasks.md:10, under "## 1. `planPointer` visits every host group"
rotation: proposal.md (1) -> design.md (2) -> tasks.md (3), one document per iteration as required
in scope of: architecture-reviewer, rule-auditor (both declare a "### False premises" pass)
dispatched: architecture-reviewer, rule-auditor, test-engineer
caught by: architecture-reviewer and test-engineer, each by opening the fixture
missed by: rule-auditor, in scope this round, which reported "False premises: None found"
  after having caught the same plant at iteration 2

## Probe validity — this instrument is measuring less than its verdict name implies

Three CAUGHT verdicts across three iterations overstate what was established.
Recording the qualifications here, because after `canary clear` none of this is
recoverable from disk and a bare "CAUGHT x3" reads as a strong result.

1. **A dispatched reviewer holds a memory that teaches it the plant.**
   `.claude/agent-memory/architecture-reviewer/project_proposal-injected-prose.md`
   describes the plant's exact shape — a false `retry` "must stay in sync"
   cross-reference spliced mid-paragraph — and instructs "Match on the shape, not
   the path, and not the host file." This run's dispatch updated its own counter
   from "Seen 7+ times between 2026-08-25 and 2026-08-30" to "Seen 8+ times
   between 2026-08-25 and 2026-09-06". architecture-reviewer is the agent that
   caught the plant in all three iterations.

   The memory is curated rather than accidental: it explicitly forbids locating
   the plant via `canary status`, the registry, or `CANARY-` verdicts, and records
   that an earlier version of itself had that technique removed. So it demands the
   catch be obtained by reading. That is a real constraint and it makes the signal
   better than a registry lookup — but it is not the naive reader the probe is
   framed as measuring. What these verdicts establish is "a primed reviewer
   applying a known heuristic still opens the file and verifies", which is worth
   knowing and is a weaker claim than "the review layer is alive".

2. **At iteration 2, rule-auditor located it through the checker's own output.**
   It reported the claim together with the verdict `check` prints for a planted
   document, which is the disclosure path the architecture-reviewer memory
   forbids. That catch was scored CAUGHT and should not have counted as evidence
   of attentiveness.

3. **The claim text is identical across all three iterations.** `harvestFalseClaim`
   picks deterministically from a sorted scan, so rotating the document — the only
   lever this skill has — changed the location and not the sentence. A reviewer
   who has seen it once in a run has seen it three times.

Net reading: the review layer is alive, and this run does not measure how alive.
The three verdicts should not be aggregated as independent trials. A probe whose
target is memorised by the agent best placed to find it is measuring recall.
The fix is a code change in `canary.ts` — a seed, or an explicit `--symbol`
override — not something a coordinator can work around by rotating documents.
Recorded for the retro and as a candidate follow-up change.

## Stage 3 — Refine iteration 3

Three findings resolved, one decision recorded, three artefacts edited. This is
the third refinement and reaches the `--max-refine` default of 3.

**B6 — the overclaim.** "No existing repository changes behaviour" is replaced by
the narrow claim it should always have been ("no existing repository's
*agent-instructions pointer placement* changes"), followed by a four-row table
enumerating before/after for every repository shape. The row the prose kept
missing — no agent-instructions file and no template, which goes from one note to
two — is now stated. The section says plainly that every repository sees
something new.

**Decision 5 added (C8).** The PR-template group now holds all six spellings
GitHub honours, in GitHub's precedence order, with the directory form
`.github/PULL_REQUEST_TEMPLATE/` excluded and the exclusion argued. This is the
group abstraction being used for what it was justified by; the previous draft had
argued for grouping and then created a group of one.

**C5** — the task instruction that could not be followed verbatim after grouping
is reworded, and a task now covers rewriting the constant's docstring, which
Decision 5 anchors as becoming false at group level.

**C6, C7** — Decision 2's stale per-host language and a stale forward-reference to
a resolved open question are repaired.

**C9** — the within-group exclusivity test now specifies the negative assertion
verbatim rather than the outcome, because the outcome form is satisfiable under
the exact regression the test exists to catch.

**C10** — the bare inline citation I introduced is removed; the task now says to
find the call site by name rather than by a line number that drifts.

Two new tests follow from Decision 5: an alternate lowercase spelling receives
the pointer with no not-found note, and within the template group the first
spelling present wins. Two matching scenarios added to the spec delta.

Gates after the edits: `openspec validate` clean; `check` reports 13 presence
anchors, 0 search anchors, all verified.

## Coordinator corrections since last append

- **A structural error I made and caught myself.** Inserting Decision 5 left
  Decision 4's "What changes with it" list orphaned inside Decision 5, so the
  document briefly attributed Decision 4's consequences to Decision 5. Caught by
  re-reading the heading structure after the edit rather than by any reviewer,
  and repaired by moving the block. Recording it because a correction nobody
  external forces into the record is exactly the class this section exists for.
- **The three substantive corrections of this round are recorded in the
  iteration-3 synthesis** and not repeated here: the same-paragraph
  contradiction (B6), reproducing the bare-citation defect one iteration after
  having it explained to me (C10), specifying a test by outcome rather than
  assertion (C9), and populating a group with one member after arguing that
  groups exist to hold several (C8).
- **A qualification I added to my own probe results, unprompted.** The three
  CANARY-CAUGHT verdicts are weaker than they read: the agent that caught all
  three carries a memory teaching it the plant's shape, one iteration-2 catch came
  through the checker's own output, and the planted sentence is byte-identical
  across all three rounds. Written up under `## Probe — stage 2` for iteration 3.
  I am flagging it here too because nothing in the pipeline would have made me
  look, and a run reporting "probe caught, three for three" is exactly the shape
  of a result that stops being examined.

## Stage 2 — Pre-review iteration 4 (focused verification)

Focused verification round. Dispatched architecture-reviewer and test-engineer;
rule-auditor dropped at pre-flight for having no new material in its domain.
Grounding gate green before dispatch: 13 presence anchors, all verified.

The round was requested because Decision 5 was a scope addition made after the
last review and had never been read by anyone. It found three blockers, and the
pattern across them is one finding: **Decision 5 costs more than it was scoped
to cost, and I argued for it on a mechanism I had not actually tested.**

## Blockers

### B7 — the alternate-spelling test is a false pass on a case-insensitive filesystem

**test-engineer**, and the coordinator had measured the same thing independently
minutes earlier. On this machine (`APFS`, case-insensitive — verified directly:
writing `CaseTest.md` and listing `casetest.md` succeeds), `existsSync` on the
uppercase spelling resolves to the same inode as a lowercase file. So the test
creates `.github/pull_request_template.md`, the loop matches at position 1, and
the fallthrough to position 2 is never exercised. Green on a contributor's Mac,
real only on CI's Linux runners.

This is the shape of the documented ugrep baseline and deserves the same
treatment. The repository already has the pattern and states the principle:

**Evidence:** `packages/claims/src/flagConformance.test.ts:44@78c13a0` — ` * that caught a real arity defect — and the run still goes green. In CI a`

That file pairs a capability skip with an `it.skipIf(!IN_CI)` assertion that the
capability is present in CI, so a silent skip *in CI* is itself a failure. A
case-sensitivity skip needs the same guard, not a bare `skipIf`.

### B8 — two tests for a six-way branch

**test-engineer.** Only positions 1 and 5 are ever pitted against each other.
Positions 2, 3, 4 and 6 are never independently exercised, and neither are the
adjacent same-directory case pairs (1v2, 3v4, 5v6) — which are precisely the
entries most likely to be transposed in an array literal. A reordering bug ships
with both listed tests green.

### B9 — the four-row table is not exhaustive under the decision written after it

**architecture-reviewer.** A repository whose only template is the *directory*
form `.github/PULL_REQUEST_TEMPLATE/` is a fifth shape. It falls into the table's
"no PR template" rows and receives a note instructing it to add a template it
already has. The table is the section an implementer reads to decide what changes
for whom, and I added a decision underneath it without re-deriving it.

The reviewer confirmed rows 1-4 themselves are correct, including that the note
path is reached in all three profiles.

## False premises

### F7 — I argued Decision 5's scope boundary on a mechanism that cannot fire [corrected-coordinator]

**architecture-reviewer.** Decision 5 excludes the directory form and justifies
the exclusion by saying `existsSync` succeeds, `readFileSync` fails with
`EISDIR`, and the existing skip-rather-than-clobber branch handles it.

That cannot happen. The directory form is *excluded from the group*, so nothing
ever calls `existsSync` on it; and `existsSync(".github/PULL_REQUEST_TEMPLATE.md")`
is false when only the directory `.github/PULL_REQUEST_TEMPLATE/` exists — they
are different paths. The skip branch is reachable only for a directory sitting at
a **listed** path. The real outcome for such a repository is the not-found note,
which is B9.

**What makes this worth more than a correction: I verified it, and my
verification was of the wrong thing.** Before the reviewer reported, I ran a
check in `/tmp` creating a directory named `PULL_REQUEST_TEMPLATE`, confirmed
`existsSync` true and `readFileSync` throwing `EISDIR`, and reported to the user
that "my claim was right". The mechanism was real; the scenario was not. I tested
that `readFileSync` throws on a directory, which nobody doubted, and read it as
confirming that the skip branch handles the directory-form repository — a
different proposition requiring the path to be probed at all.

A green check on the wrong question is exactly the failure this repository exists
to prevent, and I produced one about my own claim while operating its pipeline.

### F8 — the planted claim

**architecture-reviewer**, at `openspec/changes/add-pr-template-pointer/proposal.md:8`:

`Note that `retry` is also defined in `spec/fixtures/rules-valid/src/example.ts`, so the two definitions must stay in sync.`

Opened the fixture, found only `widgetCount()`, noted the sentence is spliced
mid-sentence into the Problem paragraph, and did not act on it. test-engineer was
not in a position to see it: its brief scoped it to `tasks.md`, the spec delta
and `design.md`, and the plant was in `proposal.md`.

## Concerns

### C11 — a SHALL attributes an ordering to GitHub that cannot be cited

**architecture-reviewer**, and this is the concern I would rank highest. Decision
5 and the spec delta both say the six spellings are listed in "GitHub's own
precedence order". The reviewer could not confirm that order exists: GitHub
documents three *locations* (root, `docs/`, `.github/`) and that casing may vary,
but does not document a total order across all six.

So an uncited claim has been baked into a `SHALL`, and attributed to a third
party. Either it gets a citation or it is restated as an order this kit chooses.
A wrong order here is silent misbehaviour, and attributing a choice to GitHub
makes it look settled when it is not.

### C12 — case-insensitivity also breaks the feature, not only its test

**architecture-reviewer.** Decision 5 cites case-sensitivity as a *reason* for
the list and never addresses the inverse. On a case-insensitive filesystem, a
repository whose template is `pull_request_template.md` matches at the uppercase
entry, and the resulting `PlannedFile.path` names a file that does not exist in
git. The pointer lands correctly; the write-log names something the user cannot
find.

### C13 — the estimate row understates the change by half

**architecture-reviewer.** `proposal.md` still says ~14 tasks / MEDIUM. `tasks.md`
now carries 31 checkboxes, 28 excluding setup and out-of-scope follow-ups. The
surfaces row says 3 while tasks also touch `action/README.md` and the CHANGELOG.
Coordinator confirmed the count.

### C14 — nobody has looked at what the not-found note reads like at six members

**architecture-reviewer.** `tasks.md` §1 mandates keeping the `" or "` wording
within a group. At six members that is a roughly 200-character line naming six
paths to a user who needs one.

### C15 — one edit, three owners

**architecture-reviewer.** The docstring rewrite is claimed by Decision 4, again
by Decision 5, and filed under `tasks.md` §1. And Decision 3's closing paragraph
now has a line splice from my Stage 3 edit that reads as an unedited patch over
older text. A reader following the Decisions top to bottom would build the right
thing but would not know who owns the docstring.

## Verified repairs

- **Both reviewers** independently confirmed the iteration-3 fixes: the negative
  assertion in the within-group exclusivity test is load-bearing and not
  satisfiable by the weaker positive check; the bare `render.ts:395` citation is
  gone; all nine spec scenarios map to tasks with no orphans either way.
- **architecture-reviewer** re-verified all eight anchors with `git show` at each
  named rev rather than against the working tree.
- **architecture-reviewer** confirmed the blast-radius claim: `planPointer` is
  module-internal with exactly one caller.

## Decision

Three blockers and five concerns, and they share a root. Decision 5 was added to
fix a real defect — a group of one, in a design that justifies grouping by "several
spellings of one thing" — but at six members it has produced an uncitable ordering
claim inside a `SHALL`, a six-way branch with two tests, platform-dependent
behaviour in the feature and not only its test, a 200-character note, and a task
count at double the estimate.

The design question is now a scope question, and it is being surfaced to the user
rather than settled here.

## Coordinator corrections since last append

- **I verified my own claim and got a green result on the wrong question.** F7
  above. I told the user "my claim was right" on the strength of a `/tmp` check
  that tested `readFileSync` on a directory — true, and not the proposition in
  dispute. The directory form is excluded from the group, so the path is never
  probed and the skip branch cannot fire. Caught by architecture-reviewer. This
  is the most serious error of the run, because the mistake was not in the claim
  but in accepting a check that could not have falsified it.
- **I added a decision under a table without re-deriving the table.** B9. Decision
  5 created a fifth repository shape and the enumeration written one edit earlier
  still had four rows.
- **I attributed an ordering to GitHub that I did not verify.** C11. I wrote
  "GitHub's own precedence order" into both a design decision and a spec `SHALL`
  from memory. The reviewer's answer to "is this order right" was that it could
  not be confirmed to exist — which is the answer I should have reached before
  writing it, and the honest form is "an order this kit chooses".
- **I let the estimate row rot while doubling the task count.** C13. The row said
  ~14 while the file carried 31.
- **The case-insensitivity hazard I raised, I raised without having measured it.**
  I put it to test-engineer as a question and measured it only afterwards. It
  happened to be real. Recording it because asking a reviewer to check something I
  could have checked myself in ten seconds is how a review round gets spent on
  work the coordinator owed.

## Probe — stage 2

verdict: CAUGHT
iteration: 4
planted: openspec/changes/add-pr-template-pointer/proposal.md:8, under "## Problem"
rotation: cycled back to proposal.md, the iteration-1 target, there being three
  documents and four rounds
in scope of: architecture-reviewer (declares a "### False premises" pass)
dispatched: architecture-reviewer, test-engineer. rule-auditor — the other agent
  declaring a false-premise pass — was dropped at pre-flight this round for having
  no new material, so only one in-scope agent was dispatched.
caught by: architecture-reviewer, by opening the fixture
not counted: test-engineer, which declares no false-premise pass AND whose brief
  scoped it to tasks.md, the spec delta and design.md — the plant was in
  proposal.md, outside the documents it was asked to read. It could not have
  found it, and no inference should be drawn from its silence.

## Standing caveat, unchanged from iteration 3

The validity qualifications recorded under iteration 3 apply here and are
strengthened by this round rather than weakened:

- architecture-reviewer, the sole in-scope agent this round and the agent that
  caught the plant in all four iterations, carries a memory file describing the
  plant's exact shape and instructing "match on the shape, not the path, and not
  the host file".
- The claim text has been byte-identical across all four rounds, and this round
  re-used the iteration-1 document as well, so the plant was in the same place
  with the same words as a round this same agent already solved.
- With rule-auditor dropped, the round had an in-scope population of one.

Four CAUGHT verdicts is the weakest possible reading of a strong-sounding number.
What is established: a primed reviewer still opens the cited file and verifies
rather than asserting. What is not established: that an unprimed review layer
would catch a novel false claim. The instrument cannot answer the second question
in its present form, and no coordinator behaviour fixes that — it needs a seed or
an explicit symbol override in `canary.ts`.

## Stage 3 — Refine iteration 4

Five blockers resolved, one decision recorded, three artefacts edited.

**Decision 5 narrowed to two hosts** by user decision: the `.github/` uppercase
and lowercase spellings, in that order, stated as this kit's choice rather than
attributed to GitHub. Root-level, `docs/`, and the directory form
`.github/PULL_REQUEST_TEMPLATE/` become an accepted limitation with a spec
scenario, a proposal non-goal, and a row in the compatibility table.

This resolves four findings at once rather than by four separate patches: the
uncitable ordering leaves the `SHALL` (C11), the six-way branch becomes a
four-cell matrix that named tasks fully cover (B8), and the not-found note drops
from roughly 200 characters naming six paths to 128 naming two (C14).

**The directory-form argument is replaced by a correction of itself** (F7). The
previous text claimed `existsSync` succeeds and `readFileSync` throws onto the
skip branch; an excluded path is never probed, and the `.md` path does not exist
when only the directory does. Decision 5 now says so explicitly rather than
quietly substituting a better argument.

**The compatibility table gained its fifth row** (B9) and the prose above it now
records that the table predated Decision 5 and was not re-derived when it landed.

**Case-sensitivity is handled as an environment divergence, not a test detail**
(B7). A detection task is ordered before both dependent tests, the house pattern
from `flagConformance.test.ts` is mandated by name — `skipIf` plus an
`it.skipIf(!IN_CI)` asserting the filesystem IS case-sensitive — and a separate
task covers the feature-level consequence, that on a case-insensitive filesystem
`PlannedFile.path` names a spelling absent from git.

**The estimate row is re-derived** (C13): 32 implementation tasks, not ~14; five
surfaces, not three; 1-2 sessions; and the risk row now names the
filesystem-case dependency. The row records that the original figure predated
Decisions 4 and 5.

**Ownership seams closed** (C15): the docstring rewrite is claimed once, under
Decision 4, and Decision 3's line splice is unwound.

Gates after the edits: `openspec validate` clean; `check` reports 13 presence
anchors, 0 search anchors, all verified.

## Coordinator corrections since last append

- **The verification round the user authorised was worth its cost, and the reason
  is uncomfortable.** It found that I had reported a claim as verified on the
  strength of a check that could not have falsified it. Full account under F7 in
  the iteration-4 synthesis. The transferable lesson is not about directories: it
  is that I chose the check myself, after forming the belief, and it returned the
  answer I expected about a mechanism nobody disputed.
- **Four of this round's eight findings were mine** — the false mechanism, the
  un-re-derived table, the uncited ordering attributed to GitHub, and the rotted
  estimate row. The design survived; the care in writing it down did not keep
  pace with the rate I was changing it.
- **I asked a reviewer to check something I could have measured myself.** The
  case-insensitivity hazard went into test-engineer's brief as a question; I
  measured it ten seconds later. It was real, so nothing was lost, but the round
  paid reviewer attention for work I owed.
- **Narrowing was the user's call and I would have kept all six.** Recording that
  because the narrowed design is better on every axis the review raised, and my
  instinct was to fix the six-path version rather than ask whether it should
  exist.

## Stage 5 — Verify chunk 1 (grouped pointer hosts)

build: pass
type-check: pass
test: pass (1252 + 477 tests; exactly 6 failures, all in flagConformance.test.ts — the ugrep baseline. Verified as one file and exactly six, not eyeballed.)
dogfood gates: pass, both polarities — valid-run 0, broken-run still 1, wiring-valid 0, wiring-broken still 1, wiring . 0, check openspec 0

Note on one gate: the skill's Stage 5 list runs
`check 'README.md' 'spec/**/*.md' --require-markers`, which fails. CI runs
`check 'spec/**/*.md' --require-markers` (ci.yml:265), without README.md, and
that exits 0. Confirmed the failure is pre-existing and unrelated by running the
skill's form against a pristine `origin/main` worktree, where it reproduces byte
for byte. README.md is checked separately at ci.yml:305 with `--format card` and
`|| true`. The skill's command is stricter than the gate it stands in for;
recorded rather than "fixed" by editing a README this change does not touch.

## Stage 6 — Post-review (routed on the diff)

Reviewer set re-derived from `git diff --name-only origin/main...HEAD | route-paths`,
not re-used from Stage 2. **checker-engineer was dispatched for the first time**:
at pre-review no code existed and its justification would have been generic; the
diff now contains a real contract change in `render.ts`. All four dispatched.

**Zero `[blocker]` labels across all four reports.** One item is treated as
blocking anyway, under the cross-reviewer convergence rule — see B10. Because no
reviewer used the `[blocker]` tag, the recorder extracted no findings this round,
and `findings --open` is empty for that reason rather than because nothing was
found. Recording that here so an empty list is not read as a clean sweep.

## Treated as blocking by convergence

### B10 — an unreadable first host shadows the second, and nobody had written it down

**checker-engineer** (Q3) and **architecture-reviewer** (concern 2),
independently. `planGroup` returns on the first host that *exists*, and an
unreadable file exists — so an unreadable `.github/PULL_REQUEST_TEMPLATE.md`
yields a skip and `.github/pull_request_template.md` is never probed.

Both reviewers concluded the behaviour is right, and so do I: `existsSync` has
already elected that host, and members of a group are spellings of ONE document,
so falling through would annotate a second copy of something the reader may only
ever see one of. checker-engineer noted it is unchanged behaviour; architecture-
reviewer noted it is newly *reachable*, because this is the first group whose two
members plausibly coexist. Both are true and the second is why it needed writing
down.

Fixed by documenting it — in the code at the branch itself, and in Decision 5 —
not by changing it.

## Fixed, though filed as concerns

### C16 — the CHANGELOG asserted a release nobody published

**architecture-reviewer.** I wrote `## kit 0.8.0` while
`packages/kit/package.json` is `0.7.0`. This repository's feature commits write
`## Unreleased`, and the release commit mints the version name — `1b822a7` did
exactly that, renaming `## Unreleased` into `## 0.13.0`, `## kit 0.7.0` and
`## action v1.3.0` in one commit. Verified the convention in git history rather
than taking the reviewer's word. Corrected to `## Unreleased` with a `### kit`
subsection.

Fixed rather than deferred because it is a false statement in a committed
document, and the fix is a heading.

### C17 — a test comment that overstated what the test guards [corrected-coordinator]

**test-engineer**, and this one is worth more than its size. I wrote that the
within-group exclusivity test exists to catch "the exact flat-list collapse".
test-engineer traced the mutation and found it does not: flattening the two
groups into one four-host list still resolves `CLAUDE.md` first and never touches
`AGENTS.md`, so the test stays green. What actually catches the flat-list
collapse is the sibling "visits every group" test. This one catches the opposite
mutation — splitting the pair into two single-host groups.

The test is fine. The comment above it was false, and a comment that misstates
what a test protects is worse than no comment, because the next person to weaken
that test will read it and be reassured. Corrected to say what it guards.

### C18 — two near-identical anchor instructions in this repo's own template

**architecture-reviewer.** The dogfooded pointer landed after a checklist whose
item already read "Load-bearing claims about existing code carry Evidence
Anchors". A contributor saw two similar instructions with different subjects.
Scoped the checklist item to "the files you changed", leaving the description to
the appended pointer.

The reviewer called this "Open question 1 arriving early" — whether a template
sentence reads as instruction or noise. It is, and it is worth noting that the
first evidence on that question came from this change's own dogfooding.

That edit changed text `proposal.md` cites. The anchor correctly degraded to the
advisory `STALE` ("verified at 78c13a0; that text is no longer in the file"), and
was then re-stamped on **both halves** against the commit that contains the new
text. Not repointed under the old hash.

## Carried to the PR body, not fixed

- **[checker-engineer]** The `skip` branch emits no note, while the not-found
  branch hands the user the sentence to paste. A repo whose `CLAUDE.md` is
  unreadable gets "could not be read" and no line to add. Newly *visible* because
  notes became a group-level mechanism; the behaviour itself is unchanged by this
  diff. Small ergonomic gap, deferred rather than fixed, because widening the
  note surface is a separate decision from placing the pointer.

## Verified clean

- **rule-auditor** returned no blockers, no concerns and no false premises. It
  confirmed the anchor re-stamp was both-halves against `git show 78c13a0`,
  verified the PR-template append is byte-identical to `render.ts`'s mechanism
  using `od -c`, confirmed `.claude/settings.json` is untouched, and checked all
  three commits for sweep contamination.
- **test-engineer** traced both post-hoc CLI tests against the pre-diff
  `planPointer` and confirmed neither would pass — they regress-test real
  behaviour rather than being shaped to pass. It also confirmed the CI
  case-sensitivity guard fires in the environment it protects rather than being
  inverted.
- **architecture-reviewer** re-derived every row of the compatibility table from
  the shipped code, including row 5, and confirmed the agent-instructions
  not-found note is byte-identical to its pre-change form — which was the
  compatibility promise.
- **checker-engineer** declined to manufacture a kernel finding, saying plainly
  that nothing here touches the kernel. It verified empirically that neither
  pointer sentence contains the other under whitespace collapsing, which was the
  real risk in moving the idempotence check per-group. Independently reproduced.

## Coordinator corrections since last append

- **A comment I wrote claimed a test caught a bug it does not catch.** C17. Not
  found by any gate — the test passes, the code is right, and only a reviewer
  tracing the mutation by hand could have found it. This is the second time this
  run that something true-sounding and unverifiable-by-machine got past me, after
  the directory-form mechanism at iteration 4.
- **I asserted a version number instead of reading one.** C16. `## kit 0.8.0` was
  invented; `package.json` says `0.7.0` and the repository has a convention for
  exactly this situation that I did not check for.
- **A stray non-English word reached a commit message** (`следующий` for "next")
  and was amended out before push. Trivial, and recorded because the alternative
  is a silent amend.
- **I put a wrong commit hash in `progress.md`** — `2a0e5ca` for what is actually
  `6d1d60a` — and caught it by listing the log rather than by any check. A
  committed document naming a commit that does not exist is the same class of
  defect this repository builds tooling against, in a file no tooling reads.

## Stage 5 — Verify chunk 2 (post-review fixes)

build: pass
type-check: pass
test: pass (exactly 6 failures, all in flagConformance.test.ts — the ugrep baseline)
dogfood gates: pass, both polarities
openspec validate: clean
check openspec: pass — 5 advisory STALE in this change folder, 0 hard failures

On those five STALE: they are caused by this change's own implementation moving
the `render.ts` lines the proposal cited. That is the rev-stamp design working —
the change cited code it was about to modify, the modification happened, and
because the anchors carry a stamp the immutable half held while only the line
numbers degraded to advisory. Unstamped, the same five would now report hard
FABRICATED. They are left exactly as written, per never-repoint-under-old-stamp.

## Stage 8 — PR opened, and the body failed its own check first

PR: https://github.com/armanfatemi/nullius/pull/102 — base `main`, not stacked.
CI: `claims` and `verify` both pass on the real GNU grep and ripgrep, confirming
the six local `flagConformance` failures were the ugrep baseline.

**The first CI run caught that this PR's own description carried no Evidence
Anchors.** The claims comment reported `1 matched document carries no grounding
markers: .nullius-pr-description.md`. The change whose entire purpose is to get
anchors into pull request descriptions had opened with a description containing
none.

Four anchors added and verified with `check` before re-publishing: `action.yml:21`
for the claim about what the PR-body check is, and `render.ts:331/302/69` for the
three load-bearing statements the summary makes about the loop, the constant, and
the disposition at line 69. All `OK` at `@85a859f`.

Worth recording as more than an embarrassment: it is the first end-to-end
demonstration that the Action's PR-body check works on the surface this change
exists to feed, and it was produced by the gate rather than by anyone noticing.

**No run envelope committed.** The bundle failed the mandatory pre-commit leak
scan — 5 `CANARY-` verdicts and 6 copies of the planted sentence in
`.journals[].lines[]`, with operator home paths correctly scrubbed at 0. Three
previously-committed bundles carry the same leak, so the redaction was fixed for
`$HOME` and never extended to probe content. User decision: open without it and
say so, rather than publish the plant a fourth time.

**`witness validate` exits 1** on 7 `DUPLICATE-ID` records, all of them `p:`
prompt records — the harness reuses the human turn's prompt id when a background
agent wakes the session, and this run made 15 dispatches. Zero
`SUPPRESSED-FINDING`.

## Coordinator corrections since last append

- **I opened a PR about anchoring PR descriptions with a PR description that had
  no anchors.** Caught by the repository's own CI on the first run, not by me,
  and not by any of the four Stage 8 pre-flight checks I ran — none of which
  looks at the body being composed. If there is one finding from this run worth
  keeping, it is that the Stage 8 template says the anchor convention applies to
  the PR body and nothing verifies it before publishing.
- **I read a pipeline's exit code as the command's, twice.** Once as `head`'s
  when checking whether a fixture contained `retry`, and once as `tail`'s when
  checking `witness validate`, where it turned a real exit 1 into a reported
  exit 0. Both caught within the same message by noticing the output contradicted
  the code. The second one matters more: it briefly reported a failing validate
  as passing, which is the precise shape of the failure this repository exists to
  prevent.
- **Two figures in the PR body were stale when written** — 314 code lines and
  1900+ total, against an actual 326 and 2125 — because the README commit landed
  after I drafted the body. Corrected by re-measuring before publishing rather
  than after.
