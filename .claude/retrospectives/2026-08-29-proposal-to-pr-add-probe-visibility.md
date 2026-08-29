---
skill: proposal-to-pr
run_date: 2026-08-29        # UTC; the plant timestamp in iteration 5 reads 2026-08-29T00:43:37Z
subject: add-probe-visibility
outcome: pr-opened
severity: blocking
pr: 43
branch: feat/add-probe-visibility

probe: caught
probe_iterations: [caught, caught, caught, caught, caught]
state_probe_field: caught           # agrees with the artefact this run; see probe_note
probe_plant_varied: partial         # host document varied all five rounds; the planted sentence did not
probe_leaked: true
probe_scope_claim_verified: false   # one scope claim in the artefact does not survive checking — see agent_errors
probe_note: >-
  5/5 CAUGHT, and the aggregate is the least informative number in this file.
  `review-evidence.md` decomposes it per reviewer and the decomposition is the
  finding: architecture-reviewer 5/5 (2 via the canary registry side channel, 3
  by reading), rule-auditor 2/3 rounds it was in scope, test-engineer 0/4 in
  scope. Two of architecture-reviewer's catches came from running `canary
  status` plus `check` rather than from reading the prose, and commit 045c48a
  wrote that pairing into its *durable* memory as "3-for-3 as the fastest
  opener", together with the plant's exact path. The leak is now persistent
  across runs, not incidental to this one. The plant text was the identical
  `spec/fixtures/rules-valid/src/example.ts` sentence all five rounds — second
  consecutive run with an unvaried plant string.
probe_placement_defect: true
probe_placement_note: >-
  Iteration 5 planted at `proposal.md:8`, outside test-engineer's briefed file
  set (tasks.md, spec.md, design.md). The coordinator recorded the scope at
  plant time and therefore scored that reviewer "not measured" rather than
  "missed" — the mechanism working on the coordinator's own error, and the
  first run on record where it did. Recorded as a defect anyway: the plant
  should not have gone there.

agents_dispatched_by_round:
  pre_review_1: [architecture-reviewer, rule-auditor, test-engineer]
  pre_review_2: [architecture-reviewer, rule-auditor, test-engineer]
  pre_review_3: [architecture-reviewer, test-engineer]
  pre_review_4: [architecture-reviewer, rule-auditor, test-engineer]
  pre_review_5: [architecture-reviewer, rule-auditor, test-engineer]
  stage_6: [architecture-reviewer, rule-auditor, test-engineer]
  stage_7_pass_2: [architecture-reviewer, test-engineer]
checker_engineer_dispatched: false   # dropped every round; no packages/claims source file in the change

defects_caught_by:                 # blockers + real false premises, i.e. findings that changed an artefact or the code
  architecture-reviewer: 17        # 15 of 17 blockers, plus FP2 and FP4; ~16 concerns on top
  test-engineer: 2                 # B2, B7; ~12 concerns on top
  rule-auditor: 0                  # 3 concerns (C18, C19, C25) and a corrected anchor count; no blocker all run
  verify: 1                        # Stage 5 `check 'openspec/**/*.md'` COUNT-MISMATCH on a search anchor
  human: 0
  post_pr_ci: 0                    # PR #43 OPEN, check `verify` SUCCESS at the time of writing

highest_value_catches:
  - agent: architecture-reviewer
    what: B16/B17 — the `unknown` early-return branch of the new capture check made an unhedged completeness claim and dropped held payloads
    why_it_matters: the one branch where the forbidding-phrase tests cannot fire, in the one check whose entire purpose is not claiming what it cannot support; an existing test pinned the omission with a comment calling the row "directory-invariant", making the defect permanent rather than accidental
  - agent: architecture-reviewer
    what: iteration-5 sweep — five sibling sentences (B11-B15) all making the overclaim four prior rounds had each fixed one instance of
    why_it_matters: the only round framed as exhaustive enumeration is the round that closed the class
  - agent: verify
    what: design.md's search anchor `grep -rn 'settings.local.json' packages plugin spec .github → 0` found 15
    why_it_matters: an absence claim falsified by the change's own implementation; a search anchor carries no rev-stamp, so unlike a presence anchor it cannot be pinned to the commit where it held

reversals: 5
verify_iterations: 3               # Stage 5 chunk 1, chunk 2, and again after Stage 7 must-fixes
pre_review_iterations: 5
post_review_passes: 2
blockers_total: 17
concerns_total: 31
false_premises_real: 4             # FP2, FP4, FP6, FP9 — the other five FPs are the planted canaries
findings_marked_corrected_coordinator: 8

agent_errors:
  - agent: rule-auditor
    what: iteration 5 — enumerated five unanchored load-bearing claims, judged all five true, and did not enumerate the planted sixth, which its own sweep 2 was defined to catch
    why: brief was narrowed to anchor discipline; but `.claude/agents/rule-auditor.md:89` makes the proposal-mode false-premise pass a standing remit that no brief revoked
    cost: the round's probe rested on a single reviewer
  - agent: architecture-reviewer
    what: iteration-2 concern C6 asserted `readManagedHooks` conflates absent and unparseable; it does not
    why: not stated in the artefact
    cost: written into task 1.0 as fact and carried a full round before FP6 retracted it
  - agent: rule-auditor
    what: recommended rebasing onto `main` to drop the unrelated `retro` commit the branch was cut from
    why: did not check what the branch's anchors were stamped against
    cost: none — declined with reasons; had it been taken, 19 anchors stamped `@12cde11` would have failed open to UNVERIFIABLE-REV
  - agent: architecture-reviewer
    what: confirmed the plant via `canary status` + `check` in 2 of 5 rounds and recorded the pairing in durable memory as its fastest opener
    why: the registry is reachable by any agent running this repo's CLI during a probed review
    cost: the probe measured a registry query rather than a read, and will keep doing so

brief_defects:                      # a reviewer following its brief; the fix belongs in the skill, not the agent
  - agent: test-engineer
    what: reported "No false premises found" in 4 rounds, each time on the strength of an Evidence Anchor pass
    why: the agent has no false-premise remit at all — `.claude/agents/test-engineer.md` contains no such heading and no such string; the coordinator's ad-hoc brief asked a question the agent has no defined procedure for
    misfiled_as: the probe sections call this "a reproducible gap in one reviewer's prose pass" and count it 0/4 against the agent
    note: third run on record with a false-premise miss filed against an agent that was never briefed to run one
  - agent: coordinator
    what: `pipeline route` returned only architecture-reviewer and rule-auditor because `touched-areas` extracted `.nullius/README.md` and a bare `design.md` from prose, missing the real code targets that appear only inside Evidence Anchors
    why: path extraction reads prose, not anchors
    cost: routing supplemented by hand via `route-paths`; that supplement earned test-engineer, which produced B2

human_interventions: []             # `paused: false`, `pause_reason: ""`, progress.md records no pending user decision

rules_proposed:
  - file: .claude/skills/proposal-to-pr/SKILL.md
    rule: when a review finding corrects a claim, require the fix round to enumerate every sibling sentence making the same claim with `file:line`, and to state how an empty result was established
    evidence: four rounds of quoted-sentence fixes each left a surviving sibling (B3, B8, B9, B10); the one sweep-framed round found five at once (B11-B15)
  - file: .claude/rules/model-proposes-code-verifies.md
    rule: a reviewer's finding is a proposal, not a result — re-read the cited code before writing it into a task or spec
    evidence: three instances this run — FP6 (`readManagedHooks`), FP9 (`init.test.ts` "existing assertions"), and B17, where test-engineer's testing-effort observation was promoted into a behavioural requirement and built into the code
  - file: .claude/agents/test-engineer.md
    rule: either give test-engineer a declared false-premise pass with its own output heading, or stop asking it the descriptive question in briefs and stop counting its silence
    evidence: 4 rounds of "no false premises" from an agent whose output format has no such section
  - file: packages/kit/src/pipeline.ts (touched-areas extraction)
    rule: derive touched areas from Evidence Anchor paths, not only from prose
    evidence: the router dropped test-engineer, which then produced a blocker once dispatched by hand
  - file: .claude/skills/proposal-to-pr/SKILL.md
    rule: vary the planted sentence between rounds, not only its host document
    evidence: identical `spec/fixtures/rules-valid/src/example.ts` sentence five rounds running; second consecutive run with an unvaried plant, and architecture-reviewer's durable memory now records the path
  - file: .claude/skills/proposal-to-pr/SKILL.md
    rule: forbid `for cmd in ...; $cmd` loops for gate invocation; write each gate out explicitly
    evidence: zsh word-splitting produced a false result from a coordinator-written loop twice this run (Stage 1 `state-set` batch, and a close-out loop that reported all five dogfood gates failing when all seven passed)
---

## What happened

Five pre-review iterations, five refinement commits, one implementation phase in
two chunks, two post-review passes, and PR #43 opened against `main` with all 30
tasks ticked, kit at 258 tests, and CI `verify` green. Seventeen blockers,
thirty-one concerns and four real false premises were raised and resolved inside
the pipeline; zero human interventions were logged and `pause_reason` is empty.

The change itself — `doctor` reporting what settings files say about witness
payload capture — is a change about not making claims you cannot support, and
the run's dominant failure mode was the coordinator making claims it could not
support, four rounds running, in the document specifying that behaviour.

## What went wrong

**The plan was wrong four times in the same way, and the fix was local every
time.** `review-evidence.md:612` names it: "Four iterations have now each fixed
the previous round's overclaim and introduced a narrower one … every round the
correction was applied to the sentence that was quoted rather than to every
sentence making the same claim." The chain is visible in git: `39d215d` fixed
iteration 1's findings, `f95772e` ("the previous fix re-created the defect one
layer out") undid its spec scoping as B3, `a8704b1` then wrote a one-directional
scoping that `73703da` ("sweep, not spot-fix") had to widen, and `9089f9b`
closed the five siblings (B11-B15) that the sweep-framed fifth round finally
enumerated. Cost: four of the five pre-review rounds. The correction is known
and is written down in the artefact as belonging in the skill — it has not been
made, which is the largest single reason this run is graded `blocking`.

**The same class then reached the code.** B16/B17 in Stage 6 are the identical
defect one layer down: the `unknown` early-return branch of `captureChecks`
claimed "no other settings file sets it" without the enumeration or residue
clause the spec requires unconditionally, and returned before
`describeLiveCaptures`, so a directory holding payloads reported nothing. Two
more commits were needed — `5d26c7e` and then `b33abaf`, which corrected
`5d26c7e`'s own quantifier and a `stateOf` arm that was "correct only by
caller". Five reversals total on a branch of thirteen commits.

**A reviewer's observation was promoted into a behavioural requirement, and a
test was written to make the defect permanent.** B17's root cause is recorded
plainly: test-engineer's iteration-4 concern C8 observed that the unreadable row
collapsed to one case on the *settings* axis; the coordinator wrote "the `does
not parse` row is directory-invariant" into task 4.1, the implementer built
exactly that, and an existing test pinned the omission with a comment naming the
row directory-invariant. This is the third instance in one run of a reviewer's
finding being tightened into a claim the reviewer never made — after FP6
(`readManagedHooks`) and FP9 (`init.test.ts`'s "existing assertions"). The
artefact itself names the pattern: "when a reviewer says 'you need fewer tests
here', that is not a licence to report less."

**The probe scored 5/5 CAUGHT and measured almost nothing.** Two of
architecture-reviewer's five catches came from `canary status` plus `check`
rather than from reading, and commit `045c48a` promoted that into durable
memory — "`canary status` + `check '<dir>/**/*.md'` in one call confirmed it
again … that pairing is now 3-for-3 as the fastest opener" — along with the
plant's exact fixture path, which was identical all five rounds. A side channel
that was incidental last run is now written into an agent's persistent memory,
so future CAUGHT scores from this reviewer are pre-compromised. Separately,
rule-auditor missed the plant in the one round its brief was narrowed, despite
`rule-auditor.md:89` making the proposal-mode false-premise pass unconditional:

**Evidence:** `.claude/agents/rule-auditor.md:89@9bc7af6` — `   - **In proposal mode:** a claim about existing code with no `**Evidence:**` anchor`

**test-engineer's 0/4 is a brief defect being scored as an agent defect.** The
probe sections escalate it round on round — "third consecutive miss", "fourth
consecutive miss", "a reproducible gap in one reviewer's prose pass, not a
sampling artefact". The agent has no false-premise pass to have a gap in:

**Evidence:** `grep -rni 'false.premise' .claude/agents/test-engineer.md` → 0 results

Its declared output format runs Blockers / Concerns / Looks good / Not checked,
with no False premises heading. It answered the coordinator's ad-hoc question
with the procedure it does have — an anchor verification — and said so honestly
every time. Filing this against the agent sends the fix to `test-engineer.md`
when the choice is a skill-level one: give it the pass, or stop asking. This is
the third run on record with a false-premise miss attributed to an unbriefed
agent.

**Two coordinator-written shell loops produced false results.** `$cmd` unquoted
does not word-split in zsh; a close-out loop reported all five dogfood gates
failing when all seven pass, and the Stage 1 `state-set` batch failed the same
way earlier. Both were false alarms. The artefact makes the right observation
about this: "the same bug in the other direction would have reported gates green
without running them."

## What worked

**Recording the plant's scope at plant time caught a probe-placement defect.**
Iteration 5's plant landed in `proposal.md`, outside test-engineer's briefed file
set. Because the scope line was written when the canary was planted, that
reviewer was scored "not measured" rather than "missed" — and the artefact says
what would otherwise have happened: "the running tally would otherwise read as a
fifth consecutive reviewer failure". This is the first run in the corpus where
the scope record caught the coordinator's own error rather than being
retro-corrected afterwards.

**Guards were proven to bite rather than assumed to.** Three times, and twice
unprompted. The implementing agent patched the built `dist/cli.js` to repoint
`probeDir`, confirmed both CLI tests fail, then restored and rebuilt. Task 4.2's
purely negative assertion was proven by planting a probe key in `renderKitConfig`
under two spellings and confirming each arm fails. And `b33abaf`'s `stateOf` fix
was established by relaxing the `setters.length === 0` guard until the check
actually printed the false sentence, then fixing it and re-running the sabotage.
The artefact's reasoning is exactly right: "a negative assertion that has never
failed is not yet a test."

**The rebase suggestion was refused for the correct reason, and the refusal was
written down.** rule-auditor asked for a rebase to drop the unrelated `retro`
commit; nineteen anchors in this change are stamped `@12cde11`, and a rebase
would have orphaned all nineteen into advisory `UNVERIFIABLE-REV` with CI still
green. Recording "the reviewer was wrong and here is why" is the data point no
other artefact captures.

**The Stage 4 contradictory brief was refused rather than silently resolved.**
The coordinator briefed an assertion that stdout must not contain
`.nullius/probes` alongside a task requiring the corrected line to name it. The
implementing agent said so and scoped the assertion to the substituted path
instead. Worth noting that this is the same local-edit failure as B8-B10,
appearing in a dispatch instead of a document.

## Proposed changes

Ordered by expected value; all six are in the frontmatter with their evidence.

1. **Add the sweep instruction to `.claude/skills/proposal-to-pr/SKILL.md`.** A
   refinement round that fixes a claim must enumerate every sibling sentence
   making that claim, with `file:line`, and state how an empty result was
   established. This is the one change with four in-run instances behind it and
   a demonstrated fix.
2. **Add to `.claude/rules/model-proposes-code-verifies.md`:** a reviewer's
   finding is a proposal, subject to the same rule as any other model output —
   re-read the cited code before writing it into a task, spec or brief. Three
   instances this run, one of which reached the implementation.
3. **Resolve test-engineer's false-premise status in `.claude/agents/test-engineer.md`
   or in the skill's brief template.** Asking an agent a question it has no
   declared procedure for produces an honest wrong answer that gets tallied as a
   miss.
4. **Fix `touched-areas` path extraction** so it reads Evidence Anchor paths and
   not only prose. The router under-dispatched here and the hand supplement
   earned a blocker.
5. **Vary the planted sentence, not only its host file**, and treat the canary
   registry as a leak channel that agent memory can now carry between runs.
6. **Forbid `$cmd` loops for gate invocation in the skill.** Twice this run.

## Uncertainty

- **Coordinator self-corrections are unusually well recorded this run and still
  incomplete.** Eight `## Coordinator corrections since last append` blocks
  exist, which is more than any prior run in this corpus. But nearly every entry
  is a coordinator error *a reviewer caught* — the class this retro cannot see
  is an error the coordinator noticed and fixed before committing, which appears
  in no artefact. Two entries do look self-caught (the zsh loops, the
  iteration-1 probe citation error), so the class is non-empty and its size is
  unknown. Do not read this run as clean on the strength of a signal that has
  nowhere to appear.
- **FP6 and FP9 have no reviewer attribution in the artefact.** Both are marked
  `[corrected-coordinator]` without naming who caught them, so the
  `defects_caught_by` split for architecture-reviewer may undercount by up to
  two. The blocker attributions are explicit and I have not adjusted them.
- **Concern counts are approximate as adoption measures.** Thirty-one concerns
  were raised; at least three were deliberately not acted on (C13 "committing as
  asked", C24 "a reverse orphan, deliberate", and one carried to the PR). The
  per-reviewer concern figures in the frontmatter are raised-counts, not
  adopted-counts, and are labelled as such.
- **Post-PR data is one check deep.** PR #43 is OPEN with `verify` SUCCESS at
  the time of writing, minutes after Stage 8. No human review comment exists
  yet. `post_pr_ci: 0` means nothing has been caught, not that nothing will be.
- **The rule-auditor iteration-5 miss has two candidate causes and I could not
  separate them.** The narrowed brief and the agent dropping a standing
  unconditional pass are both consistent with the evidence, and the artefact's
  own reading ("brief specificity and false-premise sensitivity traded against
  each other here") is plausible but untested. It is filed as an agent error
  because the standing remit exists in `rule-auditor.md` and the brief did not
  revoke it; one round with a broad brief and one with a narrow brief, both
  planted, would settle it.
