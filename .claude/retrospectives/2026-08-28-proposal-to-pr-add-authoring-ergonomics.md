---
skill: proposal-to-pr
run_date: 2026-08-28
subject: add-authoring-ergonomics
outcome: pr-opened
severity: blocking
pr: 42
branch: feat/add-authoring-ergonomics

probe: caught
probe_iterations: [missed, caught, caught, caught, caught]
state_probe_field: caught         # agrees with iteration 4 only; the run's first probe was MISSED
probe_plant_varied: false         # same sentence, same line (proposal.md:6), all five rounds
probe_leaked: true
probe_note: >-
  The four CAUGHT scores do not measure reading. `review-evidence.md` records
  that architecture-reviewer confirmed the plant "via the local registry" in
  iterations 2, 3 and 4 ("third successive plant", "fourth time", "fifth
  successive plant"), and that rule-auditor identified the iteration-1 plant by
  reading iteration 0's own committed probe section. Two side channels, both
  structural: the per-clone registry is reachable by any agent that runs the
  repo's CLI, and the probe sections naming `proposal.md:6` are committed into
  the file the next round's reviewers read. Iteration 0's MISSED was a synthesis
  format failure, not a quiet review layer — the coordinator diagnosed this
  correctly by re-reading `verifyCanary` before acting on the score.
probe_scope_claim_verified: false
probe_scope_note: >-
  Every probe section lists "in scope of: ... checker-engineer and test-engineer
  (both briefed to read proposal.md in full)", and iteration 0 writes
  "test-engineer's false-premise pass spot-checked anchors only". Neither
  `.claude/agents/test-engineer.md` nor `.claude/agents/checker-engineer.md`
  contains the string "false premise" at fb8b963; only architecture-reviewer and
  rule-auditor declare that pass. test-engineer's two non-flags are therefore not
  agent misses. Second run on record with this same misattribution.

agents_dispatched: [architecture-reviewer, checker-engineer, rule-auditor, test-engineer]
agents_dispatched_iter2_4: [architecture-reviewer, rule-auditor]   # other two dropped at pre-flight
agents_dispatched_stage6: [architecture-reviewer, checker-engineer, rule-auditor, test-engineer]
agents_dispatched_stage6_pass2: [architecture-reviewer, checker-engineer]

defects_caught_by:              # adopted findings — ones that changed an artefact or the code
  architecture-reviewer: 17
  test-engineer: 8
  checker-engineer: 7
  rule-auditor: 4
  coordinator: 2                # promoted two architecture-reviewer [concern]s to blockers
  verify: 0                     # every Stage 5 gate passed first time; caught no defect
  human: 0
  post_pr_ci: 0                 # CI `verify` SUCCESS at 2026-08-28T19:43:02Z

highest_value_catches:
  - agent: rule-auditor
    what: all 28 design anchors stamped @87eb675, tip of an abandoned branch and not an ancestor of the PR head
    why_it_matters: resolvable in this clone, unreachable in CI's — all 28 would fail open to UNVERIFIABLE-REV, a hard gate silently disarmed on the change carrying the most evidence
  - agent: architecture-reviewer
    what: iteration-3 B1 — proposal and spec dropped Decision 4's working-tree precondition, so --stamp would launder a working-tree FABRICATED anchor into a passing STALE one
  - agent: checker-engineer
    what: iteration-0 B1/B2 — the design's fix filter and HEAD gate both rested on a false claim about checkClaims.ts's fail-open branch

reversals: 4
reversals_detail:
  - docs: anchors re-stamped 87eb675 -> 5d5b2e0 in 87f73dc after being stamped off-branch
  - docs: 87f73dc dropped the working-tree half of the stamp condition it was editing; 5cddd09 put it back
  - code: 5909b77 removed `foundLine` from the stamped fail-open return that bb44f65 had let leak there
  - code: fb8b963 corrected the no-match JSON report 5909b77 had just introduced (markerFloorFailed under --require-markers)

refine_iterations: 5            # Stage 2 iterations 0-4; cap was 3, raised to 4 by the user
verify_iterations: 6            # 5 chunk verifies + 1 for the Stage 7 fixes
verify_autofix_rounds: 0

agent_errors:
  - agent: architecture-reviewer
    what: cleared Decision 3 as sound and `never-repoint-under-old-stamp` as unreachable, citing checkClaims.ts:440-449
    why: read only the `atRev.status === "ok"` branch; checker-engineer's blocker sits upstream at :399-400
    cost: none — the parallel reviewer caught it in the same round and the coordinator resolved for checker-engineer
  - agent: rule-auditor
    what: did not flag the planted false premise in its iteration-3 or iteration-4 report
    why: both were focused re-checks of the round's deltas; the plant sat in an unchanged line it had already flagged twice
    scope_checked: true         # .claude/agents/rule-auditor.md:89 declares an unconditional proposal-mode false-premise pass
    cost: none this run (architecture-reviewer scored the probe) — but it means the CAUGHT rested on one agent reading one registry

coordinator_errors:             # from review-evidence.md's own "Coordinator corrections" sections
  - what: asserted a stamped anchor can never receive drift/wrong-line, and built --fix's safety on it
    caught_by: checker-engineer (iteration 0, B1/FP2)
  - what: asserted Decision 4's HEAD gate could reuse the stamped path's verdict
    caught_by: checker-engineer (iteration 0, B2)
  - what: Stage 3 iteration 0 rewrote design/proposal/tasks and left specs/check-cli/spec.md describing the two rejected behaviours
    caught_by: architecture-reviewer (iteration 1, B1/B2)
  - what: wrote "the machine output #6 named" into proposal.md without opening issue #6
    caught_by: architecture-reviewer (iteration 1, FP2)
  - what: left the proposal's --stamp bullet describing working-tree stamping after the spec rejected it
    caught_by: architecture-reviewer (iteration 2, FP2)
  - what: ran `git rev-parse --short HEAD` on the wrong branch and stamped 28 anchors off-branch
    caught_by: rule-auditor (iteration 2, C1)
  - what: while fixing the proposal bullet, dropped the working-tree precondition and permitted stamp laundering
    caught_by: architecture-reviewer (iteration 3, B1)
  - what: wrote "must NOT gain foundLine on the stamped path" into the 1.2 brief after pre-review had established the fail-open branch returns the unstamped result verbatim
    caught_by: checker-engineer (Stage 6, B1)
    filed_as: brief defect, not agent defect — the implementer followed the brief exactly

human_interventions:
  - at: stage-2/3 boundary, after iteration 3
    question: refinement cap of 3 reached with an open blocker — continue or ship?
    why_asked: the cap is a fixed number with no "one blocker left, one clause each in two files" escape
    encodable: true
  - at: stage-2 iteration 3
    question: none — the run idled after the iteration-3 notifications until the user prompted
    why_asked: coordinator recorded "I did not act on them until the user asked; the canary stayed planted for that interval"
    encodable: unknown
  - at: pr body
    question: funnel target `audit <doc> --propose` vs plain `audit <doc>`
    why_asked: two reviewers across two rounds recommended the plain form against the proposal's own wording; the coordinator declined to override the author and carried it
    encodable: false            # a design call, correctly left to the author

infra_failures:
  - stage: 4, chunk 2.1
    what: implementing agent terminated by a session rate limit after finishing the work, before reporting
    handled: coordinator reviewed runCheck/collectCheck/buildReport directly and ran the gates
  - stage: 7
    what: dispatched fixer agent stalled and hit the 600s watchdog after writing one test
    handled: coordinator applied the three fixes inline, kept the test

code_proposed:
  - file: packages/claims/src/canary.ts
    change: the taint check cannot see a paraphrase — a report saying "confirmed via the local registry" scores CAUGHT
    evidence: canary.ts:49 is a three-token literal list; canary.ts:318 states the intent it fails to enforce
  - file: packages/claims/src/checkClaims.ts
    change: warn when a stamp resolves locally but is not an ancestor of HEAD — today that is indistinguishable from a good stamp until CI fails open
    evidence: rule-auditor's iteration-2 C1; checkClaims.ts:424 returns unverifiable-rev, which checkClaims.ts:185 lists as passing

rules_proposed:
  - file: .claude/skills/proposal-to-pr/SKILL.md
    rule: vary the plant between iterations — never re-plant the same sentence at the same line in one change
    evidence: five identical plants; architecture-reviewer's own memory now records the registry as the fastest confirmation
  - file: .claude/skills/proposal-to-pr/SKILL.md
    rule: write `in scope of:` only for agents whose .claude/agents/<name>.md declares a false-premise pass
    evidence: two agent files with no such pass were listed as in scope in all five probe sections; second run with this defect
  - file: .claude/rules/rev-stamp-change-anchors.md
    rule: the stamp must be an ancestor of the branch the PR opens from — check with `git merge-base --is-ancestor`
    evidence: 28 anchors stamped at an abandoned branch tip; would have failed open across CI
---

## What happened

`add-authoring-ergonomics` shipped `check --fix`, `--stamp`, `--format json`,
per-command help and a zero-marker funnel line across 13 commits and 24 files,
opening PR #42 with CI `verify` green. Stage 2 ran five pre-review iterations —
two past the configured cap of three, raised once by the user — and converged
with zero blockers; Stage 6 ran twice, the second pass clean. Four reviewers were
dispatched at iterations 0, 1 and at Stage 6; two were dropped at pre-flight for
iterations 2 through 4.

The review layer worked hard and well on this run. The instrument that is
supposed to prove that did not.

## What went wrong

**1. The probe measured a side channel, not reading, for four consecutive
rounds.** The same sentence was planted at `proposal.md:6` in all five
iterations. From iteration 1 onward, `review-evidence.md`'s own probe sections
record how the plant was found: architecture-reviewer "confirmed via the local
registry" three rounds running, and rule-auditor recognised the iteration-1 plant
by reading iteration 0's committed probe section. Both channels are structural,
not brief leaks. Any agent that runs the repository's own CLI in this clone trips
the merge guard:

**Evidence:** `packages/claims/src/cli.ts:92@fb8b963` — `    --probing           suppress the CANARY-PRESENT merge guard, for the one run`

The taint check is designed to void exactly this, and says so:

**Evidence:** `packages/claims/src/canary.ts:318@fb8b963` — ` * reviewer that saw the probe machinery and cites the canary is an invalid`

It cannot enforce it, because it matches three literal tokens and the reviewers
described what they saw in English:

**Evidence:** `packages/claims/src/canary.ts:49@fb8b963` — `const TAINT_TOKENS = ["canaries.json", ".git/nullius", "CANARY-"];`

The cost is not this run — the reviewers plainly did read, and found 36 adopted
defects. The cost is that `probe: caught` in the corpus now means less than it
appears to, and the next reader cannot tell a healthy round from a leaked one
without reopening the evidence file. That is a green check standing in for a
check that did not happen, in the pipeline's own health instrument. It recurs
until `canary.ts` or the skill changes; care will not fix it, because the leak is
the repository working as designed.

**2. Anchors were stamped against a commit the PR does not descend from.** The
coordinator ran `git rev-parse --short HEAD` on an abandoned branch and stamped
28 design anchors at `87eb675`. Locally every one resolved; in CI's clone none
would, and the checker's answer to an unreadable rev is to fail open:

**Evidence:** `packages/claims/src/checkClaims.ts:424@fb8b963` — `      verdict: "unverifiable-rev",`

**Evidence:** `packages/claims/src/checkClaims.ts:185@fb8b963` — `  "unverifiable-rev",`

This is the `merge-never-squash` failure shape reached by branch divergence
instead of squashing, and no rule names that route. rule-auditor caught it at
iteration 2; the repair (verify file identity at `main`'s tip, re-stamp both
halves to `5d5b2e0`) is one of the run's two documentation reversals — `87f73dc`.

**3. A wrong brief put a defect into shipped code.** The coordinator wrote "must
NOT gain `foundLine` on the stamped path" into the 1.2 brief *after* iteration 0
had established that the fail-open branch returns the unstamped result verbatim.
The implementer followed the brief exactly; `bb44f65` shipped a stamped result
that could carry `foundLine`, and checker-engineer's Stage 6 blocker forced
`5909b77` to strip it. This is a skill/brief defect, not an agent defect — filing
it against the implementer would send the fix to the wrong file.

**4. One fix needed a fix.** `fb8b963` corrects the no-match JSON report that
`5909b77` had introduced two minutes earlier: under `--require-markers` a
no-match run exited 1 with `markerFloorFailed: false`, breaking the documented
"read `failing`" consumer rule. Caught by checker-engineer in the second Stage 6
pass, which is the pass working as intended.

**5. Edits fixed one artefact and broke another, twice.** Stage 3 iteration 0
rewrote design, proposal and tasks and left the spec mandating the two behaviours
the design had just rejected. Stage 3 iteration 2, correcting the proposal
bullet, dropped Decision 4's working-tree precondition and thereby permitted
`--stamp` to launder a working-tree `FABRICATED` anchor into a passing `STALE`
one — the exact laundering the proposal's own parenthetical forbids. Both were
caught by architecture-reviewer; together they account for two of the five
refinement iterations, and the second is why the cap had to be raised.

**6. `progress.md` stopped tracking the run.** Its "Phases completed" list ends at
Stage 3 iteration 2, and "Next 3 actions" still describes synthesising the
iteration-2 probe, while "Current phase" reads Stage 9. Stages 4 through 8 —
seven commits and every verify gate — left no trace in the ledger. The
authoritative record of this run is `review-evidence.md`, which is excellent;
`progress.md` would have misled a resuming session about where it was.

**7. The verify gate produced one false stop.** The coordinator's green-gate
script counted pnpm's `[ERR_PNPM_RECURSIVE_FAIL]` line as a seventh test failure
and refused to commit; re-reading the vitest summary (6 failed / 759 passed, all
`flagConformance`) resolved it. The ugrep baseline is documented in prose in
`CLAUDE.md` and re-derived by ad-hoc scripting on every run.

## What worked

- **Parallel reviewers disagreeing, and the disagreement being adjudicated on the
  code.** Iteration 0: architecture-reviewer cleared Decision 3 citing
  `checkClaims.ts:440-449`; checker-engineer blocked it at `:399-400`. The
  coordinator resolved for checker-engineer on the ground that the architecture
  read covered only one branch, and recorded the resolution. A single reviewer
  would have shipped that design.
- **The coordinator refusing to re-score its own probe.** Iteration 0's MISSED was
  diagnosed as a synthesis-format artefact by re-reading `verifyCanary`, and then
  left standing: "a re-score after the fact would be the coordinator grading
  itself." That is the right call and it is worth naming.
- **Promoting two `[concern]`s to blockers, and labelling the promotion as the
  coordinator's own.** Both contradicted a SHALL; both became real fixes.
- **Dropping reviewers at pre-flight when nothing in their domain moved.**
  Iterations 2-4 ran two reviewers and both survivors found only real coordinator
  errors — the drop cost nothing detectable.
- **Reviewers writing the lesson into their own memory.** This run produced
  `feedback_reread-spec-after-design-rewrite.md` and
  `feedback_check-design-code-fences.md` under `.claude/agent-memory/`. On the
  previous run a memory file, not a SKILL.md edit, was what actually stopped a
  recurring defect.

## Proposed changes

1. **`packages/claims/src/canary.ts` — make the leak visible to the scorer.** Two
   independent problems: the taint list is three literals against an open-ended
   paraphrase space, and the guard announces a live probe to every agent that runs
   `check` in the clone. Widening `TAINT_TOKENS` ("merge guard", "canary status",
   "registry") is cheap and will help, but it chases wording; the durable fix is
   for a planted round to be unrecognisable from inside the clone, which is a
   design question for the author. Until one lands, the corpus should read
   `probe: caught` as "not disproven".
2. **`.claude/skills/proposal-to-pr/SKILL.md` — vary the plant.** Same sentence,
   same line, five rounds, with the previous rounds' locations committed into the
   file reviewers read. Require a different sentence and a different location each
   iteration, and do not name prior plant locations in the copy of
   `review-evidence.md` a reviewer is handed.
3. **`.claude/skills/proposal-to-pr/SKILL.md` — ground the `in scope of:` line.**
   Write it only for agents whose `.claude/agents/<name>.md` declares a
   false-premise pass. This run listed two agents that declare none, and described
   one of them as having a "false-premise pass" that does not exist. Second
   occurrence of this misattribution on record.
4. **`.claude/rules/rev-stamp-change-anchors.md` — add the ancestry clause.** "Get
   the hash with `git rev-parse --short HEAD`" is silent about *which branch*, and
   a stamp on a non-ancestor commit is invisible locally and fails open in CI. Add:
   stamp only commits reachable from the branch the PR opens from, and verify with
   `git merge-base --is-ancestor <stamp> HEAD`. Better still, put it in the
   checker (proposal 1 of `code_proposed`) — a rule that depends on remembering a
   branch name is the kind of rule this repository normally refuses to rely on.
5. **`.claude/skills/proposal-to-pr/SKILL.md` — make the refinement cap
   evidence-shaped.** The cap stopped a run whose only remaining blocker was one
   clause in each of two files. Either allow the coordinator to spend an extra
   iteration when the open blocker list is a single item with a named one-line fix,
   or state plainly that the cap exists to force a human decision and that raising
   it is the expected outcome, not an exception.
6. **Encode the ugrep baseline.** `CLAUDE.md` documents "6 tests in
   `flagConformance.test.ts`" in prose, and every run re-derives it by grepping
   test output. A machine-readable baseline the verify gate compares against would
   have prevented this run's false stop, and prevents the more dangerous inverse —
   a seventh, real failure absorbed into "the known 6".
7. **`.claude/skills/proposal-to-pr/SKILL.md` — write `progress.md` at every stage
   boundary, or stop pretending it is a ledger.** It went stale after Stage 3 and
   nothing noticed. If `review-evidence.md` is the real record, say so and reduce
   `progress.md` to resume state only.

## Uncertainty

- **Coordinator self-corrections caught before anything was written are not
  recoverable.** `review-evidence.md` has unusually good "Coordinator corrections"
  sections for this run — eight entries, several process-level — but by
  construction they only cover what the coordinator chose to record. Errors it
  noticed and fixed inside a single edit appear in no artefact. This run should not
  be read as having exactly eight coordinator errors; it should be read as having
  at least eight.
- **`defects_caught_by` counts adopted findings, and the boundary is a judgement.**
  Where one blocker and one false premise describe the same underlying defect
  (iteration 0's B1/FP2) I counted one. Concerns folded silently into a later edit
  are counted; concerns explicitly left open are not. Another reader tallying the
  same file could land a few either way; the ordering (architecture-reviewer well
  ahead, then test-engineer and checker-engineer, then rule-auditor) is robust to
  that, the absolute numbers are not.
- **Whether the two reviewers dropped at pre-flight in iterations 2-4 would have
  found anything is unknowable.** The coordinator's argument for dropping them is
  recorded and reasonable; the counterfactual is not available.
- **CI is one data point.** `verify` was green at 2026-08-28T19:43:02Z, 42 seconds
  after the PR opened. No human review comments existed at the time of writing, and
  no post-merge signal exists at all.
- **The iteration-3 idle interval is undiagnosed.** The coordinator recorded that
  it did not act on the iteration-3 notifications until the user asked, and that
  the canary stayed planted meanwhile. Whether this was a dispatch-completion
  signal that never arrived or a coordinator that stopped is not determinable from
  the artefacts.
