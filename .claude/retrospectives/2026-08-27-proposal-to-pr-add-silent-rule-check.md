---
skill: proposal-to-pr
run_date: 2026-08-27
subject: add-silent-rule-check
outcome: pr-opened
severity: notable
pr: 41
branch: openspec/add-silent-rule-check

probe: caught
probe_iterations: [caught, caught]
probe_note: >-
  Two plants, one per pre-review iteration, both at
  openspec/changes/add-silent-rule-check/proposal.md:8 under `## Problem`.
  Iteration 1 caught independently by all four dispatched reviewers, iteration 2
  by all three, none naming the probe machinery. This is the first run of the
  three on record with no MISSED at iteration 1, and the reason is recorded in
  the artefact itself: `review-evidence.md:46` says the synthesis was written
  with the canary's full repo-relative path and the planted sentence quoted
  verbatim "specifically because a documented, previously-recurring coordinator
  mistake ... cost a false MISSED reading on two consecutive prior pipeline
  runs." The fix that worked was a coordinator *memory* file, not the SKILL.md
  change proposed after each of the last two runs — see finding 3.
probe_scope_claim_verified: true   # architecture-reviewer does declare a false-premise pass; the plant is in openspec/
state_probe_field: caught          # agrees with the artefact this run, because both iterations scored the same

agents_dispatched: [architecture-reviewer, checker-engineer, rule-auditor, test-engineer]
agents_dispatched_stage6: [architecture-reviewer, checker-engineer, rule-auditor, test-engineer]
defects_caught_by:
  architecture-reviewer: 8
  checker-engineer: 6
  test-engineer: 2
  rule-auditor: 1
  coordinator: 1
  verify: 1
  human: 0
  post_pr_ci: 0

reversals: 2
reversals_undercounted: true   # two more reworks happened inside 67c0c8e and never became commits
refine_iterations: 2           # converged with zero blockers on round 2
verify_iterations: 1
verify_autofix_rounds: 0

agent_errors:
  - agent: checker-engineer
    what: recommended pinning the terminal-kind set "by test" in ruleCoverage.test.ts
    why: did not check that witness.ts's Kind/VOCABULARY are module-private, so the test would have pinned checkRuleCoverage's own guess and nothing else
    cost: one refinement iteration and one reversal — though the same agent caught it itself in iteration 2, before any code was written

coordinator_errors:            # from review-evidence.md's own correction sections
  - what: dispatched two parallel Stage 4 streams sharing one wire format without putting the contract in both briefs
    cost: the run's only Stage 6 blocker; every real /comply run would have reported 100% of its rules SILENT-RULE
    filed_as: coordinator/brief defect, not agent defect — see finding 1
  - what: had no way to tell whether the session-limit-terminated agent's work was reliable
    cost: full manual file-by-file re-verification of the Stage 4 diff; resolved by trusting neither assumption
  - what: iteration 1's terminal-kind fix named the right mitigation without checking it was enforceable
    cost: one reversal, caught by checker-engineer at iteration 2

human_interventions: []        # state records paused=false and no pause reasons; progress.md:34 "None currently open"

infra_events:
  - at: stage-4
    what: kernel/CLI implementation agent terminated mid-run by an account-level session-limit error, producing no self-report
    artefact_damage: spec/fixtures/rule-coverage-broken.jsonl line 7 left truncated mid-JSON-object
    recovered: true

rules_proposed:
  - file: .claude/skills/proposal-to-pr/SKILL.md
    at: Stage 4 dispatch
    rule: when Stage 4 splits into parallel streams that meet at an interface, write the wire format into tasks.md and into every brief that touches it — a doc comment on one side of the seam is not a contract
    evidence: the Stage 6 blocker; the kernel's own doc comment stated the format and the comply.md implementer never read it
    status: new
  - file: packages/claims/src/ruleCoverage.test.ts (or a new dogfood gate)
    rule: couple plugin/commands/comply.md's documented `description` value to ruleCoverage.ts's exact-equality matcher mechanically
    evidence: no test or CI step in the repo references comply.md; both fixtures use bare ids, so the prose fix is the only thing standing between a relabelled dispatch and a silent 100%-failure
    status: new
  - file: .claude/skills/proposal-to-pr/SKILL.md
    at: Stage 2 Step 5
    rule: state that the synthesis is the artefact `canary verify` scores — full repo-relative paths, claims quoted verbatim
    evidence: unapplied after two runs proposed it; this run only avoided the third repeat because a coordinator memory file carried the lesson
    status: re-proposal (third)
  - file: .claude/skills/proposal-to-pr/SKILL.md
    at: SKILL.md:610 / state schema :184
    rule: record the probe as a sequence, not a single overwritten scalar
    evidence: this run's two iterations happened to agree, so state is accurate by coincidence; the previous run's MISSED is still erased
    status: re-proposal (third)
  - file: .claude/skills/proposal-to-pr/SKILL.md
    at: Stage 4 / SKILL.md:187
    rule: commit per task-section during Stage 4, as the state schema's own resume model already assumes
    evidence: 23 tasks landed in one 953-line commit; the session-limit interruption therefore had no committed boundary to resume from
    status: new
---

## What happened

Six commits implemented the `SILENT-RULE` journal-coverage check deferred from
the previous run — `ruleCoverage.ts` with its own `RuleCoverageVerdict` union, a
`witness validate --expect-rules` flag, two fixtures, two CI gate lines, and a
rewritten dispatch contract in `plugin/commands/comply.md` — opening PR #41 with
CI green (`statusCheckRollup` → `verify` SUCCESS) and no review comments yet.
Stage 2 ran two pre-review iterations and converged with zero blockers on the
second. Stage 6 re-reviewed the real diff with all four reviewers and returned
one blocker, which was fixed before the PR opened.

The change itself is not my subject and I make no claim about whether it is
correct. As a *run*: two git-visible reversals, one Stage 4 agent killed
mid-write by an account-level session limit, three coordinator self-corrections
on the record, a probe that came back CAUGHT 7-for-7 across both iterations, and
one defect that would have made the shipped feature fail on every real
invocation while CI stayed green.

## What went wrong

**1. Two parallel Stage 4 streams picked different wire formats for the same
interface, and only a cross-file review found it.** `plugin/commands/comply.md`
instructed dispatching with `description: "comply: <rule-id>"`. The kernel
matches by exact string equality:

**Evidence:** `packages/claims/src/ruleCoverage.ts:169@1a1c266` — `    const matching = dispatches.filter((dispatch) => dispatch.task === ruleId);`

`architecture-reviewer` did not argue this — it ran it, and recorded that a
journal with `"task":"comply: build-before-cli"` and an otherwise-valid
`COMPLIANT` report still produced `SILENT-RULE`, exit 1
(`review-evidence.md:178`). Every real `/comply` run would have reported 100% of
its rules silent. CI would have stayed green throughout, because both fixtures
use bare ids — a gate exercising a path the product never takes, which is this
repository's own named failure shape arriving in its own feature.

**This is a brief defect, not an agent defect.** The coordinator's own root cause
(`a497474`) is that the two streams "each independently chose a wire format for
the same interface without seeing the other's work," and that the kernel side's
doc comment stated its expectation to a reader who was never dispatched to read
it. Filing this against the `comply.md` implementer sends the fix to an agent
file for a failure the agent was never told to prevent. The fix belongs at the
dispatch: a shared wire format between two concurrent briefs is a coordination
artefact.

The repair shipped is prose in `comply.md` — an explicit "bare rule id, and
nothing else" plus the failure mode spelled out:

**Evidence:** `plugin/commands/comply.md:61@1a1c266` — `explicitly to the **bare rule id, and nothing else** — e.g.`

Nothing mechanical now couples the two sides. `grep` over `packages/**` finds no
test or CI step that reads `comply.md`, so the identical defect returns the next
time someone "improves" the label.

**2. Stage 4 landed 23 tasks in one commit, and the session limit hit inside
it.** The implementation agent was terminated by an account-level error with no
self-report, leaving `spec/fixtures/rule-coverage-broken.jsonl` truncated
mid-JSON-object (`review-evidence.md:136`). The interruption is not the
pipeline's fault. Having no committed checkpoint to resume from is: the state
schema already assumes per-section commits —

**Evidence:** `.claude/skills/proposal-to-pr/SKILL.md:187@1a1c266`

```markdown
`sub_phase` and `sub_phase_progress` are written after every task-section commit
```

— and `67c0c8e` is a single 953-line commit across 14 files, so there were no
task-section commits to write them after. `add-silent-rule-check.state.json`
carries no `sub_phase` key at all. The recovery was the right one (the
coordinator re-read every changed file against `design.md` rather than treating a
missing self-report as either a pass or a failure) but it was a whole-diff
re-read, because that was the only granularity available.

**3. The SKILL.md canary fix is unapplied for the third consecutive run; it just
did not cost anything this time.** `SKILL.md`'s last commit is `562130c`,
2026-08-24, which predates both prior retrospectives that proposed changing it.
The reason this run scored CAUGHT at iteration 1 — the first time that has
happened — is recorded at `review-evidence.md:46`: the coordinator knew about the
paraphrasing trap from a documented prior incident and quoted the plant verbatim.
That is agent memory doing the work of a skill instruction. It is a real result
and it is fragile in a specific way: it holds only while that memory file is
loaded, and it is invisible to any future coordinator that reads `SKILL.md` and
concludes the synthesis format is free-form.

**4. The probe is still a single overwritten scalar in state.**

**Evidence:** `.claude/skills/proposal-to-pr/SKILL.md:184@1a1c266`

```
probe                  caught | missed | tainted | not-planted
```

This run's `"probe": "caught"` is accurate, but only because both iterations
scored the same. Nothing changed since the previous run recorded a MISSED that
state erased; a rollup counting probe misses from state still reads zero for that
run.

**5. One reversal was a mitigation that could not have worked.**
`checker-engineer` recommended in iteration 1 that the terminal-kind set be
"pinned by test." In iteration 2 the same agent found that `witness.ts`'s `Kind`
and `VOCABULARY` are module-private, so the test would have pinned
`checkRuleCoverage`'s own hardcoded guess and gone on passing through exactly the
schema change it existed to catch (`review-evidence.md:86`). `tasks.md` at
`d96b0e4` records the replacement in its own words: "replacing an earlier draft's
unenforceable 'pin by test in ruleCoverage.test.ts' plan." The self-catch is
genuinely good; the initial recommendation was still an unchecked claim about an
export, which is the centre of that agent's remit.

Worth noting as a pattern rather than a verdict on the code: the replacement
couples the *consumer* mechanically —

**Evidence:** `packages/claims/src/witness.ts:419@1a1c266` — `export const TERMINAL_RECORD_KINDS: readonly string[] = ["report"];`

— which `ruleCoverage.ts` imports, while the link back to `validateJournal`'s
switch is a comment on each side pointing at the other (`tasks.md` task 2.5).
`checker-engineer` separately raised at Stage 6 that the constant is typed
`readonly string[]` rather than `readonly Kind[]`, so a vocabulary change is not
a compile error either; that was recorded and deliberately deferred
(`review-evidence.md:182`). So the same run was bitten by comment-coupling in
finding 1 and accepted comment-coupling as a residual in finding 5. Both
decisions were argued; I only observe that the run did not connect them.

## What worked

- **The four-reviewer Stage 6 diff pass earned its dispatch.** The wire-format
  blocker existed only in the seam between two files that were each individually
  correct against their own stated assumptions. The coordinator says so plainly
  in its own correction section (`review-evidence.md:199`) — it had reviewed both
  files thoroughly, including the matching-convention doc comment, and still did
  not cross-check them. This is the clearest case on record of the post-review
  stage catching something no per-file review could.

- **`architecture-reviewer` verified by executing, not by arguing.** It
  constructed a journal with the prefixed `task` value and observed exit 1. A
  reviewer that produces a reproduction instead of a well-reasoned suspicion is
  the difference between a blocker and a concern, and it is why this one was
  fixed the same stage it was found.

- **The coordinator refused to treat a missing self-report as either a pass or a
  failure.** The interrupted agent's output was neither trusted nor discarded; it
  was re-derived from the design, file by file. That found two real defects (the
  truncated fixture, and a characterization test the fixture fix invalidated)
  that no self-report would have surfaced, because there was no self-report.

- **`checker-engineer` caught an inert mitigation before any code existed.** A
  test that pins its own assumption is the `verdict-needs-fixture-and-test`
  failure one level up, and it was found at the tasks.md stage, at the cost of one
  refinement round instead of a shipped no-op test.

- **The narrowed iteration-2 dispatch was justified in the artefact.**
  `rule-auditor` was dropped with a stated reason (its one iteration-1 concern
  was resolved as a side effect) rather than silently, and the probe section
  records that it was dropped, so the iteration-2 scope claim stays auditable.

- **`test-engineer` verified `witness validate`'s no-flag output against a built
  `main` worktree** rather than against a pinned string literal
  (`review-evidence.md:192`). That is the correct way to assert a
  backward-compatibility claim about a CLI, and it is more work than the finding
  required.

## Proposed changes

I have applied none of these.

1. **`SKILL.md` Stage 4 dispatch — new, and the one I would write first.** When
   Stage 4 splits into concurrent streams that meet at an interface, the wire
   format goes into `tasks.md` and into every brief that touches it. This run's
   only blocker was a doc comment being asked to serve as a contract between two
   agents that could not see each other.
2. **A mechanical coupling between `comply.md` and `ruleCoverage.ts` — new.** A
   test that reads the documented `description` value out of `comply.md` and
   feeds it through the matcher, or a fixture whose ids are generated the way
   `comply.md` says to generate them. Today the only defence is a paragraph of
   prose warning a future editor not to relabel.
3. **`SKILL.md` Stage 2 Step 5 — re-proposal, third time, unchanged.** State that
   the synthesis is the artefact `canary verify` scores. It worked this run
   because a memory file remembered; that is not a mechanism, it is a person
   remembering, implemented in a model.
4. **`SKILL.md:610` / state schema `:184` — re-proposal, third time, unchanged.**
   Record the probe verdicts as a sequence.
5. **`SKILL.md` Stage 4 — new.** Commit per task-section, as the state schema's
   resume model already assumes. This is cheap and it converts an interruption
   from "re-read the whole diff" into "resume at the last section."

## Uncertainty

- **Coordinator self-corrections caught before anything was written are still
  unrecorded.** The three entries in `coordinator_errors` all come from
  `review-evidence.md`'s own correction sections, i.e. errors a reviewer surfaced
  or that the coordinator chose to write down after the fact. Errors it noticed
  and fixed silently are in no artefact I can read. I did not grade this run clean
  on any signal with nowhere to appear.
- **`reversals: 2` undercounts and is not comparable across runs.** The two I can
  adjudicate from git are `67c0c8e`→`a497474` (comply.md's wire format, undone)
  and `a041876`→`d96b0e4` (the terminal-kind mitigation, replaced). At least two
  more happened inside `67c0c8e` and left no trace: the truncated fixture was
  repaired before commit, and the characterization test was rewritten to match
  the repaired fixture. As the previous retrospective noted, this metric measures
  commit granularity as much as rework.
- **I could not determine whether `sub_phase` was cleared at the end of Stage 4
  or never written at all.** The state file has neither key, which is an
  improvement over the previous run's stale value either way, but the two causes
  imply opposite conclusions about whether the previous retro's proposal was
  applied. The single-commit Stage 4 makes "never written" the likelier reading.
- **`defects_caught_by` is judgement, not measurement.** I counted findings that
  changed an artefact, an argument, or the code, and credited convergent findings
  to every reviewer that raised them independently — so
  `architecture-reviewer: 8` and `checker-engineer: 6` overlap on the
  `parseWitness`/`FLAG_OWNERS` scope blocker and the `design.md:126` citation
  rather than describing 14 distinct defects. Concerns that were raised and
  deliberately deferred (three of `checker-engineer`'s at Stage 6) are not
  counted, per the "what was caught, not what was reported" rule; that arguably
  undersells a reviewer whose deferred findings were all legitimate.
- **The Stage 6 blocker's severity rests on the reviewer's own reproduction.** I
  verified the exact-equality matcher exists at `ruleCoverage.ts:169` and that
  `comply.md` now documents the bare form, but I did not re-run the reviewer's
  journal experiment. The "100% of rules silent" figure is
  `review-evidence.md:178`'s claim, checked against the code path but not
  re-executed.
- **Post-PR data is one CI run old.** `verify` is SUCCESS, and
  `pulls/41/comments` and `pulls/41/reviews` both project to length 0 as of
  writing. `post_pr_ci: 0` means nothing has been caught yet, not that nothing
  will be.
- This file sits outside every glob CI checks (`README.md`, `spec/**/*.md`,
  `openspec/**/*.md`), so its five Evidence Anchors are not gated. All were read
  at `1a1c266`, the branch head.
