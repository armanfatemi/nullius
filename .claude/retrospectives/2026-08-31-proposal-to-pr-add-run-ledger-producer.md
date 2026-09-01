---
skill: proposal-to-pr
run_date: 2026-08-31        # UTC; state created_at 2026-08-31T05:56:30Z, updated_at 2026-08-31T23:17:04Z —
                            # the whole run falls inside one UTC day, unusually for this pipeline
subject: add-run-ledger-producer
outcome: pr-opened
severity: blocking          # NOT a judgement on the change, which verifies unusually well. See "Why blocking".
pr: 74
branch: feat/add-run-ledger-producer

probe: caught
probe_iterations: [caught, caught-but-leaked, caught, caught]
state_probe_field: agrees   # probe_iter_1..4 all "caught"; four `## Probe — stage 2` sections all CAUGHT.
                            # Round for round the state file and the artefact agree — but see probe_note:
                            # the state field alone loses every qualification the artefact records.
probe_scope_claim_verified: true    # re-checked against the agent files: architecture-reviewer.md and
                                    # rule-auditor.md mention false-premise (8 and 5 times); checker-engineer.md
                                    # and test-engineer.md, zero. The `in scope of:` lines are correct.
probe_placement_defect: false       # every plant landed inside both false-premise agents' declared scope
probe_plant_varied: false           # host rotated proposal -> design -> tasks -> proposal; the SENTENCE was
                                    # byte-identical in all four rounds, and the artefact says so each time
probe_leaked: true                  # iteration 2 only: the coordinator appended a note to review-evidence.md
                                    # naming the plant's existence and host document BEFORE the round was scored
probe_in_scope_read_catches: [2, 1, 1, 1]   # of 2 in-scope reviewers per round. rule-auditor read-caught it
                                            # once in four rounds (iteration 1); tipped by the leak in 2;
                                            # missed in 3 and 4. architecture-reviewer: 4 of 4.
probe_note: >-
  Four CAUGHTs is the most flattering number in this run and the least informative. Three of the four
  carry qualifications the tool's verdict cannot see: iteration 2's third catch came from a reviewer
  that cited the coordinator's own leaked note rather than the file; iterations 3 and 4 were carried by
  a single in-scope reviewer while the other missed; and the planted sentence never varied across four
  rounds, so a reviewer seeing it a fourth time is an easier test than the first, not a harder one.
  The honest reading is that ONE reviewer (architecture-reviewer) kept the layer alive for four rounds,
  and rule-auditor's read-based catch rate went 1/1, then 0/1, 0/1 — declining on a probe that was
  getting easier. The coordinator disclosed all three qualifications itself, in the round they occurred.

agents_dispatched: [architecture-reviewer, checker-engineer, rule-auditor, test-engineer]
dispatch_rounds:
  pre_review_1:  {dispatched: 4, delivered: 4}   # checker-engineer NOT in the router's answer; added by hand
  pre_review_2a: {dispatched: 4, delivered: 0}   # API session limit (429) before any agent's first file read
  pre_review_2b: {dispatched: 4, delivered: 4}
  pre_review_3:  {dispatched: 4, delivered: 4}
  pre_review_4a: {dispatched: 4, delivered: 1}   # 429 again; only test-engineer returned
  pre_review_4b: {dispatched: 3, delivered: 3}
  stage_6:       {dispatched: 4, delivered: 4}
reviewer_dispatches_journal: 29     # .nullius/runs/0c54eff6-….jsonl, `agent` field: rule-auditor 8,
                                    # architecture-reviewer 8, checker-engineer 7, test-engineer 6
no_report_dispatches: 7             # journal ground truth: 7 report records with outcome "no-report",
                                    # clustered at 2026-08-31T06:29:08Z (4) and T15:59:09Z (3) — exactly the
                                    # two rounds review-evidence.md describes. 24% of reviewer dispatches
                                    # returned nothing. Corroborated by code, not by the coordinator's account.

defects_caught_by:          # first-named raiser of the 22 "Raised by" blocker/false-premise entries
  checker-engineer: 13      # 59% of the run's evidenced findings — and the router omitted it in iteration 1
  architecture-reviewer: 5  # incl. Stage 6 B1, the most serious defect of the run (an ungated citation)
  test-engineer: 3          # all three testability: a named check that cannot see the change, twice
  rule-auditor: 1           # Stage 6 B3 (unstamped anchors). Plus one correct call the coordinator discarded
                            # as a "reviewer error" — see agent_errors and "What went wrong" #1.
  verify: 0                 # Stage 5 ran twice and passed twice; it caught nothing this run
  human: 0                  # three interventions, no defect caught directly
  post_pr_ci: 0             # PR #74 OPEN, statusCheckRollup empty at retro time; mergeable CONFLICTING

reversals: 2
reversal_detail:
  - what: the c8305b1 ancestry claim — stated four times, then reversed
    where: review-evidence.md:451 (wrong) vs :892 (correction); progress.md:30-37; commit 4be6fe3
  - what: "check --stamp" wrote stamps into three files outside this change; reverted before commit
    where: review-evidence.md:920-922 — attested only by the coordinator's own note, not visible in git
verify_iterations: 2        # Stage 5 full, then re-run in full after Stage 7. No auto-fix loop recorded.
refinement_iterations: 4    # state max_refine raised 3 -> 4 by the operator
tasks_shipped: 55/57        # counted in tasks.md: 55 [x], 2 [ ]. progress.md's count here is correct.
coordinator_self_corrections_recorded: 28   # bullets across 9 "## Coordinator corrections since last append"
                                            # blocks; 16 findings additionally tagged [corrected-coordinator].
                                            # This is the first run in this corpus where the standing blind
                                            # spot is largely NOT blind — see "What worked".

agent_errors:
  - agent: rule-auditor
    what: missed the planted false premise in iterations 3 and 4, in scope both times
    why: unknown — it read the host document (tasks.md, then proposal.md) and reported other findings from it
    cost: none to the change; the probe's in-scope catch rate fell to 1 of 2 for three consecutive rounds
  - agent: architecture-reviewer
    what: counted docs/icon.svg as scope creep by this change
    why: the file is untracked and belongs to a foreign in-flight diff in the working tree
    cost: one line of adjudication (review-evidence.md:849-851)
  - agent: rule-auditor
    what: NOT an error — recorded as one and was correct
    why: it stated c8305b1 "is reachable from main"; the coordinator overrode it from memory
    cost: the false claim survived two more rounds and reached the PR body's risk framing

brief_defects:              # the coordinator's brief was wrong; filing these against the agents would be wrong
  - what: briefed the kernel chunk to hand-edit KIND_INTRODUCED, which its own comment forbids
    outcome: the agent read the comment, declined the instruction, and said so (review-evidence.md:717-720)
  - what: briefed provenance.selfReported in a form whose three buckets would not partition the records
    outcome: the agent implemented the design's stated rule and documented the divergence (:722-725)
  - what: scoped the identity chunk to identity.ts; the header composition is in journalFile.ts
    outcome: user.name was resolved and dropped; wiring became an explicit task for another chunk (:726-730)
  - what: briefed the docs chunk that README.md is checked in CI with --require-markers
    outcome: true of the committed ci.yml, false of the working tree; README anchors now unchecked, and
             README was excluded from the PR entirely (:859-866, :914-919)
  - what: briefed a reviewer on an anchor move visible only in uncommitted work
    outcome: the reviewer said it could not verify it from git (:646-650)

human_interventions:
  - at: stage-2/3, after iteration 3
    question: raise the refinement cap from 3 to 4?
    why_asked: the cap was reached with four blockers outstanding (review-evidence.md:342); the pipeline has
               no default for "out of rounds but not out of blockers"
    encodable: true
  - at: mid-run (before iteration 2's re-dispatch)
    question: commit nothing further during this run
    why_asked: the working tree carries a foreign in-flight change (README.md, CLAUDE.md, ci.yml,
               cli.characterization.test.ts, docs/icon.svg) that must not be swept into this PR
    encodable: true       # and the instruction was later reversed; it has a measurable downstream cost —
                          # see "What went wrong" #4
  - at: stage-4
    question: reinstall the plugin from the directory marketplace and start a new session
    why_asked: state human_commands; the repo's plugin/ is the marketplace SOURCE, not the live plugin
    encodable: false      # the reinstall genuinely needs a human — but the DRIFT is detectable, see proposals

rules_proposed:
  - file: .claude/skills/proposal-to-pr/SKILL.md
    rule: nothing about a live plant may be written to review-evidence.md before the round is scored —
          reviewers read the change folder, so that file is reviewer input, not a private log
    evidence: review-evidence.md:305-314 — the coordinator states this lesson itself; it is written nowhere
              the next run reads
  - file: .claude/rules/model-proposes-code-verifies.md  (or a new sibling rule)
    rule: a claim about git state — ancestry, reachability, what is on main — is settled by running the
          command, and a reviewer's git claim may never be recorded as a reviewer error without one
    evidence: review-evidence.md:451 asserts the opposite of `git merge-base --is-ancestor c8305b1 main`,
              which succeeds; PR #58 landed 2026-08-30T22:17-0600, before this run started at 05:56Z
  - file: .claude/skills/proposal-to-pr/SKILL.md
    rule: never invoke a gate through a pipe or wrapper that can replace its exit status
    evidence: review-evidence.md:469-475 — the grounding gate was piped through grep, so the plant proceeded
              on a red gate; the coordinator names the broken rule as "this pipeline's own"
  - file: .claude/skills/proposal-to-pr/SKILL.md
    rule: when a later stage falsifies an earlier synthesis, mark the wrong statement in place with a
          pointer to the correction; append-only leaves the error undisclosed at the point of retrieval
    evidence: review-evidence.md:451 still reads as fact 440 lines before its correction at :886-906
  - file: packages/kit/src/doctor.ts
    rule: doctor should compare the installed plugin cache's gitCommitSha against the repo's plugin/ HEAD
          and report drift
    evidence: nothing in packages/kit/src mentions gitCommitSha or plugins/cache (grep, 0 hits); the drift
              that blocked two tasks was discovered by hand at Stage 4 (review-evidence.md:678-693)
  - file: .claude/skills/proposal-to-pr/SKILL.md
    rule: progress.md's finding counts are derived from review-evidence.md or omitted, not typed
    evidence: progress.md:13 says "4 blockers, 8 concerns" for Stage 6; the Stage 6 header (review-evidence.md
              :761-763) reports 4 blockers and 6 concerns; the section enumerates 3 and 5. The previous run's
              commit c8305b1 is titled "fix progress.md's count" — this is the second occurrence.
  - file: .claude/skills/proposal-to-pr/SKILL.md
    rule: "refinement cap reached with blockers outstanding" is a deterministic condition — make it an
          automatic single extension or a pause with the blocker list attached, not a question
    evidence: review-evidence.md:342; state max_refine "4"
---

## What happened

`add-run-ledger-producer` took witness schema to 0.6 and shipped a producer for the
ledger kinds: 39 files, +7043/-325 across three commits (`19f7bd4` the change,
`40e259e` the anchor stamps kept separate because twelve stamps name `19f7bd4`,
`4be6fe3` the correction). Four pre-review iterations produced 15 blockers and 8
false premises; Stage 5 verified green twice; Stage 6 found 4 more blockers on the
real 42-path diff, all fixed; PR #74 opened against `main`, currently `OPEN` and
`CONFLICTING`. Two whole dispatch rounds were lost to API session limits, and the
run spans seventeen hours mostly because of them.

The change itself is the best-evidenced artefact in this corpus so far: both dogfood
polarities pass, the end-to-end demonstration runs real hook payloads through the
built CLI into a temp repo and shows `SUPPRESSED-FINDING` firing and then clearing
(`review-evidence.md:748-755`), and the coordinator recorded 28 of its own errors as
it made them. The severity below is about the *run*, not the change.

## What went wrong

**1. The coordinator overrode a reviewer who was right, and did it from memory.**
Across iterations 3 and 4 the coordinator stated in four places — this file,
`progress.md`, a reviewer brief, and the PR-risk framing — that `c8305b1` is "the tip
of the unmerged `feat/add-canary-status-redaction`", and filed rule-auditor's
contrary statement under `## Reviewer error, noted` (`review-evidence.md:451`). The
reviewer was correct. `git merge-base --is-ancestor c8305b1 main` succeeds; PR #58
merged it at 2026-08-30T22:17-0600, **one hour and thirty-nine minutes before this
run started** — so the claim was false for the entire run and was never true-then-stale.
The coordinator caught it itself at Stage 8 (`:886-906`) and corrected the PR body,
where the real risk (31 commits behind, 3 conflicts, confirmed by `git merge-tree`
and by `gh pr view`'s `CONFLICTING`) had been displaced by an imaginary squash risk.

This is the run's worst finding, and not because of its consequence, which is benign.
It is the pipeline's own thesis inverted: a model's recollection was allowed to
overrule a reviewer who had done the checking, and the artefact then recorded the
correct reviewer as the one in error. One round later the coordinator's false version
appears *as rule-auditor's own concern* (`:607-610`, C5: "the tip of the unmerged
`feat/add-canary-status-redaction`"), which is the same reviewer stating the opposite
of what it stated one round earlier. Either the reviewer was talked into it or the
synthesis overwrote it; the raw returns are not in the artefacts, so I cannot say
which. Both readings are bad in the same way.

**2. Three separate incidents of coordinator prose contaminating the review layer.**
The `c8305b1` override is one. The second: before re-dispatching iteration 2 the
coordinator appended a note to `review-evidence.md` naming the planted claim's
existence and host document; rule-auditor reads the change folder, cited that note,
and its catch had to be excluded from the verdict basis (`:305-314`, `:326-332`). The
third: before planting iteration 3 the coordinator piped the grounding gate through
`grep`, which replaced the checker's exit code with grep's, and the plant proceeded on
a gate that was red — two of its own new anchors were broken (`:469-475`). All three
were disclosed by the coordinator, in the round they happened, which is the good news.
None of the three is prevented by anything written in the tree, which is why they are
in `rules_proposed` and why this run is graded `blocking`.

**3. 7 of 29 reviewer dispatches returned nothing, and the pipeline has no retry policy.**
The journal is the ground truth here, not the narrative:
`.nullius/runs/0c54eff6-7534-4a71-b2f5-18be175db5cf.jsonl` holds 59 `dispatch` records
and 58 `report` records, of which 7 carry `outcome: "no-report"`, timestamped
`2026-08-31T06:29:08Z` (four) and `T15:59:09Z` (three) — matching `review-evidence.md`'s
two failure sections exactly, and confirming "dispatched 4, delivered 0" and "delivered
1 of 4" by code rather than by report. (The 59th dispatch with no report is this
retro, in flight.) The recovery was correct — both rounds recorded rather than absorbed,
both re-dispatched, no findings inferred — but recovery was manual each time, and the
second occurrence cost roughly five hours of wall clock waiting for a limit reset.

**4. The mid-run "commit nothing" instruction had a cost chain nobody priced.**
Iterations 2–4's refinements stayed in the working tree (`:183-185`). Three consequences
followed: Stage 6 B3 — three new anchors in `openspec/changes/**` could not be stamped
at all, because the code they cite was uncommitted and stamping against `HEAD` would
have asserted text at a commit where it verifiably was not (`:795-810`, correctly
refused); the iteration-4 brief defect where a reviewer was briefed on an anchor move
it could not verify from git (`:646-650`); and thirteen stamped anchors sitting at
advisory `STALE` with no commit to re-stamp against (`:709-713`). The instruction was
later reversed. It was given because of a foreign in-flight diff in the working tree —
which rule-auditor independently found at iteration 4 (`:611-615`) — and that condition
is detectable at Stage 1 without asking a human.

**5. The highest-yield reviewer was nearly not dispatched.** checker-engineer raised 13
of the 22 evidenced blocker/false-premise findings (59%), including 4 of iteration 1's 5.
It was **not in the router's answer** — `touched-areas` cannot parse the anchor-form
citation of `packages/claims/src/witness.ts` — and was added by hand after `route-paths`
confirmed the path earns it (`:5-9`). The routing gap already has an open change
(`openspec/changes/add-touched-areas-from-anchors/`); this run is a measurement of what
it costs, and the measurement is large.

**6. Counts disagree across three artefacts.** `progress.md:13` reports Stage 6 as "4
blockers, 8 concerns"; the Stage 6 header (`:761-763`) reports 4 blockers and 6
concerns; the section enumerates 3 blockers (B1–B3) and 5 concerns (C1–C5). One
rule-auditor blocker is counted in the header and absent from the enumeration. Small in
itself, and it is the second run in a row — the previous run's commit `c8305b1` is
literally titled "fix progress.md's count". Hand-typed counts in the one field a rollup
would read is a defect that will keep recurring.

## What worked

- **The coordinator wrote down 28 of its own errors, in the round they occurred.** Nine
  `## Coordinator corrections since last append` blocks, 16 findings tagged
  `[corrected-coordinator]`. Every retro in this corpus has had to file "coordinator
  self-corrections went unrecorded" under Uncertainty. This one largely does not, and
  that changes what a retro can see. Including the errors that make the coordinator look
  worst — the grep-masked gate, the plant leak, the reviewer it overrode — recorded
  without softening.
- **Refusals recorded as refusals.** Two subagents declined wrong briefs and said so
  (`:717-725`); the unstampable anchors were refused rather than faked, with `git show
  HEAD:packages/kit/src/record.ts` run to prove no line 766 exists (`:798-806`); the two
  ways to fake the `UserPromptSubmit` capture were named and refused (`tasks.md:9-18`);
  the `--stamp` overreach into three unrelated files was reverted because "a benign
  improvement is still a change nobody reviewed" (`:920-922`).
- **Stage 6 earned its dispatch.** Every one of its 4 blockers was created *by
  implementation* and could not have been found by any number of pre-review rounds: an
  anchor the coordinator wrote inside a blockquote where the checker does not parse it,
  with a wrong line number and nothing gating it (`:767-779`); a provenance partition
  off by exactly one on every 0.6 journal, contradicted by its own internal comment
  (`:781-793`); and anchors unstampable because the code was uncommitted. Per-dispatch
  yield: pre-review 15 blockers over 16 delivered dispatches; post-review 4 over 4. The
  diff-reading round is at least as productive per dispatch as the plan-reading rounds
  and gets one round to their four.
- **The gates were run against the committed tree, not the working tree** — `git archive`
  then re-run, precisely because the working tree carries foreign edits (`:880-884`).
  That is the `build-before-cli` failure mode generalised, and it was anticipated.
- **The absence anchor went loud on schedule.** `proposal.md`'s `grep … UserPromptSubmit
  → 0 results` became `COUNT-MISMATCH` (actual 8) the moment the subscription landed, and
  was rewritten rather than retired (`:700-707`).

## Proposed changes

Seven, listed with evidence in `rules_proposed`. The three that matter most:

1. **Settle git claims with git** (`.claude/rules/`, new, or a section in
   `model-proposes-code-verifies.md`). A statement about ancestry, reachability, or what
   is on `main` is settled by running the command; a reviewer's git claim may not be
   filed as a reviewer error without one. This run spent four artefacts and three rounds
   on a claim that `git merge-base --is-ancestor` answers in 40ms. Note that
   `openspec/changes/add-rev-ancestry-check/` is adjacent but not the same thing — it is
   about the *checker's* handling of stamped revs, not about the coordinator's.
2. **The evidence file is reviewer input** (`.claude/skills/proposal-to-pr/SKILL.md`).
   Nothing about a live plant goes into `review-evidence.md` before the round is scored.
   The coordinator derived this lesson itself mid-run and it is written nowhere the next
   run will read it.
3. **`doctor` should see plugin cache drift** (`packages/kit/src/doctor.ts`). Nothing in
   `packages/kit/src` mentions `gitCommitSha` or `plugins/cache` today. The installed
   plugin is pinned four `plugin/` commits back and has already lost `commands/comply.md`
   — a fact this run discovered by hand at Stage 4, after writing tasks that depended on
   it being false.

## Uncertainty

- **Whether iteration 4's C5 is rule-auditor's words or the coordinator's.** `:607-610`
  attributes the false `c8305b1` framing to a reviewer that stated the opposite at
  `:451`. The raw reviewer returns are not in any artefact, so I cannot distinguish
  "the reviewer was talked into it" from "the synthesis overwrote it". Also, Stage 8
  says the reviewer "told me so at iteration 4"; the entry it refers to sits in the
  iteration-3 section. The correction is itself imprecise about which round it corrects.
- **Whether PR #74's body ever carried the false squash risk.** The current body carries
  the real risk. `gh` does not cheaply show body revisions, and I did not widen the read.
- **Post-PR outcomes are absent, not clean.** `statusCheckRollup` is empty at retro time,
  minutes after Stage 8. `mergeable: CONFLICTING` corroborates the 3-conflict claim. No
  CI verdict, no human review comment exists yet; `post_pr_ci: 0` means unmeasured.
- **The coordinator self-correction blind spot is narrowed here, not closed.** 28 recorded
  corrections is the most any run in this corpus has disclosed, and it is still a
  self-report: an error the coordinator never noticed appears in no artefact I can read,
  and the density of recorded corrections is not evidence about the density of actual ones.
  The second reversal in `reversal_detail` (the `--stamp` overreach) is attested only by
  the coordinator's own note; it left no trace in git, so I cannot confirm the revert was
  complete.
- **Why rule-auditor missed the plant twice** is not determinable from the artefacts. It
  read the host document both rounds and reported other findings from it, so "did not read
  the file" is not available as an explanation.

## Why blocking

Not for the change, which is the best-verified in this corpus, and not for the 429s,
which are a harness failure the pipeline handled correctly. For the second clause of the
grade: *a failure that recurs until a rule, a skill, or a checker changes*. Three
incidents in one run share one shape — the coordinator's own writing contaminating or
overruling the review layer (an override of a correct reviewer, a plant leaked into
reviewer-visible prose, a gate whose red exit status was masked by a pipe). Each was
disclosed; none is prevented by anything in the tree; all three recur by default on the
next run. A run that documents its own defects this well and cannot stop them repeating
is exactly the case this grade is for.
