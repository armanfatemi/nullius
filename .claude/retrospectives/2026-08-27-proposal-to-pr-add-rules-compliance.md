---
skill: proposal-to-pr
run_date: 2026-08-27
subject: add-rules-compliance
outcome: pr-opened
severity: notable
pr: 40
branch: add-rules-compliance

probe: missed
probe_iterations: [missed, caught, not-scored]
probe_note: >-
  Three plants, one per pre-review iteration, all at
  openspec/changes/add-rules-compliance/proposal.md:6. Iteration 1 scored a
  tool-certified MISSED for the *identical* reason as the previous run's
  iteration 1 — the synthesis abbreviated the path and paraphrased the planted
  sentence, defeating both of verifyCanary's match paths — while three of four
  reviewers had in fact quoted the plant verbatim and refused its embedded
  imperative. Iteration 2 CAUGHT, independently, by architecture-reviewer and
  checker-engineer, neither naming the probe machinery. Iteration 3 was a narrow
  two-reviewer spot-check whose briefs never asked anyone to read the `## Why`
  section the canary lives in; correctly recorded as unscored rather than
  asserted either way. Scope claim checked against the agent files: both
  architecture-reviewer and rule-auditor do declare a false-premise pass in
  proposal mode, so `in scope of:` is accurate this run.
probe_scope_claim_verified: true
state_probe_field: caught   # what .state.json says — erases iteration 1's MISSED

agents_dispatched: [architecture-reviewer, checker-engineer, rule-auditor, test-engineer]
defects_caught_by:
  checker-engineer: 12
  architecture-reviewer: 8
  test-engineer: 5
  rule-auditor: 2
  coordinator: 1
  verify: 0
  human: 0
  post_pr_ci: 0

reversals: 2
reversals_undercounted: true   # all 3 pre-review rounds landed in one commit
refine_iterations: 3           # cap is 3; converged with zero blockers on round 3
verify_iterations: 2           # two section verifies, each green first time
verify_autofix_rounds: 0

agent_errors: []               # none recorded or found — see Uncertainty

coordinator_errors:            # from review-evidence.md's own correction sections
  - what: synthesis abbreviated the canary's path and paraphrased its claim
    cost: iteration 1 probe scored MISSED for a live review layer
  - what: named "verifyClaim-level machinery" in design.md without checking the export exists
    cost: one false premise in the design; fixed in Stage 3
  - what: cited an anchor at :2 for text on :3, under a non-standard `**Evidence (...):**` marker
    cost: the claim went silently unchecked rather than failing loudly
  - what: specified RULE-ROT's trigger as "on failure" with no pass/fail boundary
    cost: a naive reading would have misfired on every legitimately-stale rule
  - what: overstated "all 7 grounded rules" would rot; true count is 4 of 7 files, 5 of 8 anchors
    cost: one iteration; the underlying conclusion was never wrong
  - what: wrote isRuleFailure in tasks.md where design.md correctly said isFailure
    cost: one blocker round
  - what: listed checkClaims.ts's exports incompletely while the next sentence relied on a missing one
    cost: one concern round
  - what: framed comply.md's re-verification gap as "minor"; architecture-reviewer disputed it
    cost: none to code — framing corrected in the record and the PR body
  - what: did not notice the KERNEL_MODULES loop test was not a regression test for its own fix
    cost: caught by test-engineer at Stage 6

human_interventions:
  - at: end-of-stage-5
    question: ship Sections 1+2 and defer Section 3, or keep going?
    why_asked: Section 3's witness.ts design was never settled by any of the 3 review rounds
    encodable: true

rules_proposed:
  - file: .claude/skills/proposal-to-pr/SKILL.md
    at: Stage 2 Step 5
    rule: the synthesis is the artefact canary verify scores — full repo-relative paths, claims quoted verbatim
    evidence: identical MISSED at iteration 1 of two consecutive runs; proposed after run 1, never applied
    status: re-proposal
  - file: .claude/skills/proposal-to-pr/SKILL.md
    at: ":610 / state schema :184"
    rule: record the probe as a sequence, not a single overwritten scalar
    evidence: state reads probe=caught for a run whose artefact records missed, caught, not-scored
    status: re-proposal
  - file: .claude/skills/proposal-to-pr/SKILL.md
    at: Stage 4 / state schema
    rule: clear sub_phase and sub_phase_progress when leaving Stage 4
    evidence: state at stage=pr still reads "Section 3 (journal integration) next" for a deferred section
    status: re-proposal
  - file: .claude/skills/proposal-to-pr/SKILL.md
    at: state schema :184 and Stage 2 Step 6
    rule: add an out-of-scope probe outcome to the enum; the coordinator had to invent one
    evidence: iteration 3 wrote "verdict:not-planted-in-scope", a value the enum does not contain
    status: new
  - file: CLAUDE.md
    at: a new .claude/rules/ file, or the commit guidance
    rule: never stage an agent-memory commit with git commit -a; it sweeps unrelated working-tree edits
    evidence: 08bcd15 reverted NULLIUS_WITNESS_PROBE; d83ad69 reintroduced it; 917c2a9 reverted it again
    status: new
  - file: packages/claims/src/parseClaims.ts
    at: EVIDENCE_PREFIX
    rule: a near-miss Evidence marker should be reported, not silently invisible
    evidence: "`**Evidence (Decision 4):**` failed the prefix, so the claim was never extracted or checked"
    status: new
---

## What happened

Eight commits landed a new deterministic rules kernel (`rules.ts` / `rulesScan.ts`
with its own `RuleVerdict` union), a `/comply` plugin command, and a
`routeAgents` pre-filter that makes `rule-auditor`'s dispatch conditional —
opening PR #40 with CI green (`statusCheckRollup` → `verify` SUCCESS on head
`d502a72`). Stage 2 ran three pre-review iterations, converging to zero blockers
and zero false premises on the last round the cap permits. Stage 6 re-reviewed
the real diff, returned zero blockers, fixed four findings and recorded four more
as open concerns in the PR body.

The change shipped at partial scope: 11 of 14 tasks. Section 3 (`SILENT-RULE`
journal integration) was deferred by explicit user decision because its
`witness.ts` design was never settled — all three review rounds recorded it as
"unstarted, no coverage plan to review yet."

The change itself is not my subject and I make no claim about it. The run
produced two reversals, nine coordinator self-corrections recorded in its own
evidence file, one probe false negative that is a verbatim repeat of the previous
run's, and one unrelated settings regression that rode in on the branch base.

## What went wrong

**1. The iteration-1 probe MISSED for the identical reason as the previous run,
because the fix was proposed and never applied.** The previous retrospective's
first proposal was that Stage 2 Step 5 must state that the synthesis is the
artefact `canary verify` scores, and require full repo-relative paths and
verbatim quotes. `SKILL.md` has not been touched since (`git log` on it ends at
`562130c`, which predates that retro), and iteration 1 of this run failed exactly
the same way: `review-evidence.md:50` records that the first draft "abbreviated
the path (`proposal.md:6` instead of `openspec/changes/add-rules-compliance/proposal.md:6`)
and paraphrased the claim instead of quoting it, so neither match fired."

This is a **skill defect, not a coordinator defect** — for the second time. The
brief still does not tell the coordinator that the document it is writing is
being string-matched. The per-run cost is small (one iteration's probe reads
`MISSED` for a review layer that was alive 3-of-4). The corpus cost is not: two
of two runs now carry a false negative in the one field that measures whether
review is happening at all.

**2. The probe verdict still overwrites itself in state.** `SKILL.md` mandates a
re-plant per refinement round and mirrors the verdict into a single scalar:

**Evidence:** `.claude/skills/proposal-to-pr/SKILL.md:610@d502a72`

```markdown
Also mirror the verdict into state: `state-set <change> probe caught`.
```

So `add-rules-compliance.state.json` reads `"probe": "caught"` for a run whose
artefact records MISSED, CAUGHT, not-scored. Anything counting probe misses from
state — the cheap thing to build over forty runs — reports zero misses for this
run and for the previous one. Both real misses are invisible to the field
designed to hold them.

**3. Iteration 3 needed a probe outcome the schema does not have.** The state
enum is closed at four values:

**Evidence:** `.claude/skills/proposal-to-pr/SKILL.md:184@d502a72`

```
probe                  caught | missed | tainted | not-planted
```

Iteration 3 was a deliberately narrow two-reviewer spot-check; the canary was
replanted but neither brief asked anyone to read the `## Why` section it sits in.
The coordinator's handling of this was **correct and is the best judgement call
in the run** — it declined to run `verify` and bank a `MISSED` it knew would be a
placement artefact, and declined equally to assert `CAUGHT`. But to record that
it had to invent `verdict: not-planted-in-scope`, a value nothing can parse. The
right response is to widen the enum, not to narrow the judgement.

**4. An unrelated settings change rode in on the branch base, for the second
time.** `.claude/settings.json` was reverted once at `08bcd15` — "a settings
change this branch never intended to carry" — then reintroduced by `d83ad69`, an
"agent memory update" commit that swept 10 memory files and one unrelated
`NULLIUS_WITNESS_PROBE` line into a single commit, then reverted again at
`917c2a9`. Had `rule-auditor` not caught it at Stage 6, PR #40 would have
silently pre-decided a question that belongs to `add-probe-visibility`, an
unmerged proposal. The pattern is the `git commit -am` sweep that `08bcd15`'s own
message already named, and naming it did not stop it recurring one run later.

Two things make this less bad than it reads: the regression was inherited from
the branch base rather than authored by this run, and the review layer caught it
unaided. One thing makes it worse: this is the second occurrence, and nothing
mechanical changed in between.

**5. A near-miss Evidence marker made a claim invisible rather than red.** The
coordinator wrote `**Evidence (Decision 4):**` in `design.md`. The extractor
requires the marker exactly:

**Evidence:** `packages/claims/src/parseClaims.ts:110@d502a72` — `const EVIDENCE_PREFIX = /^\s*(?:[-*+]\s+|\d+[.)]\s+)?\*\*Evidence:\*\*/;`

A line failing that prefix is not a malformed claim — it is not a claim. The
same file's header says an `**Evidence:**` line matching none of the known shapes
"is reported as" malformed, so the *shape* is policed once the prefix matches;
the *prefix* is not. The anchor was also off by one line, and neither fault was
reported by `check`. It took `architecture-reviewer` reading the file to find it.
This is the failure mode this repository exists to eliminate, in its own
extractor: a citation that looks checked, is not checked, and produces no signal
either way.

**6. `KERNEL_MODULES` is a hardcoded enumeration that silently mis-routes.**
Stage 6's routing dispatched only three of four reviewers, because
`packages/kit/src/pipeline.ts`'s hardcoded module list had not been updated for
`rules.ts` — so `checker-engineer`, whose entire remit is which verdict union a
new verdict belongs to, was not routed for the diff that adds a brand-new verdict
union. Fixed at `17373ad` before dispatch. The coordinator caught this itself,
by running `route-paths` and reading the output rather than trusting it, and that
is the run's best single moment. But the underlying shape survives: a new kernel
module still has to be remembered into a list, and forgetting it silently removes
a reviewer instead of failing.

**7. Stage 4's sub-phase state was never cleared — also a repeat.** With
`"stage": "pr"` and a user decision to defer Section 3 recorded in `progress.md`,
the state file still reads `"sub_phase_progress": "... Section 3 (journal
integration) next"`. A resume reading state would pick up work the user
explicitly stopped. The previous retrospective proposed clearing these on leaving
Stage 4; it was not applied.

## What worked

- **The coordinator recorded the probe verdict the tool actually produced rather
  than the one it could argue for.** `review-evidence.md:70` — "Recorded as
  MISSED because that is what the tool actually certified; not overridden with an
  asserted CAUGHT." It had a complete, correct, and as far as I can tell true
  diagnosis in hand explaining why the MISSED was its own writing artefact, and
  still did not launder it into a pass. That is `model-proposes-code-verifies`
  applied by an agent to its own scoreboard, at its own expense.

- **Nine coordinator self-corrections are on the record.** The previous
  retrospective flagged coordinator self-correction as the standing blind spot.
  It is substantially less blind here: the "Coordinator corrections since last
  append" section fired four times, and three of those times it honestly reads
  "None." A section that records its own absence is worth more than one that only
  appears when there is something to say.

- **`checker-engineer` caught the highest-stakes defect three rounds before any
  code existed, and all three kernel reviewers confirmed it in the shipped
  diff.** `RULE-ROT` had to trigger on `isFailure(verdict)` and never on
  `verdict !== "ok"`, because grounded rules' incident anchors legitimately report
  `stale` — a passing verdict. A naive condition would have reported most of the
  repo's own rules as rotted from the moment it shipped, i.e. a new checker whose
  first act is to cry wolf about the rules it checks. `rules.ts:238` ships
  `isFailure`, and `rules.test.ts:184-208` pins it by name with an explicit
  stale-does-not-trigger test.

- **The convergence rule promoted a `[concern]` correctly.** No reviewer labelled
  the missing CI dogfood gate a blocker, but three raised it independently and it
  was fixed on that strength. A new checker with no CI step is a checker that can
  go quiet without anything noticing — precisely the `verdict-needs-fixture-and-test`
  failure shape, arriving one level up.

- **`architecture-reviewer` refused the coordinator's own downgrade.** The
  coordinator wrote `comply.md`'s re-verification gap off as "a minor known gap";
  the reviewer disputed the characterisation and was right — it is a
  `model-proposes-code-verifies` gap, not a polish item. It still was not fixed
  (correctly: it is inherited from `/audit`'s identical shape and out of scope),
  but it is now in the PR body described accurately instead of dismissed. A
  reviewer that argues with the framing rather than only the facts is doing the
  job the roster exists for.

- **`test-engineer` went from 0 to 5.** It caught the missing `routeAgents` test
  task, the frozen-copy fixture problem, the fixture-without-unit-test blocker,
  the CI gate, and — best — that the `KERNEL_MODULES` regression test protected
  nothing, since the existing `for (const module of KERNEL_MODULES)` loop passes
  identically whether or not `rules.ts` is in the list. A test that iterates the
  thing it is meant to pin cannot detect that the thing is incomplete.

- **Both reversals are one line each, and neither is in shipped kernel code.**
  `917c2a9` removes one settings line; `17373ad` adds one array member.

## Proposed changes

I have applied none of these.

1. **`SKILL.md` Stage 2 Step 5 — re-proposal, unchanged.** State that the
   synthesis is the artefact `canary verify` scores, and that scoring matches
   either the full repo-relative `doc:line` or the claim verbatim. This is the
   second consecutive run to lose its iteration-1 probe to this. If it is not
   going to be applied, the honest alternative is to stop scoring iteration 1.
2. **`SKILL.md:610` / state schema `:184` — re-proposal, unchanged.** Append the
   probe verdicts (`probe_history=missed,caught,not-scored`) or key them per
   iteration. Two runs, two real misses, both invisible in state.
3. **`SKILL.md` state schema `:184` — new.** Add an out-of-scope outcome to the
   enum. The coordinator invented `not-planted-in-scope` because the correct
   judgement had no legal value; an invented value is worse for a rollup than a
   wrong one, because it parses as nothing.
4. **`SKILL.md` Stage 4 / state schema — re-proposal, unchanged.** Clear
   `sub_phase` and `sub_phase_progress` on leaving Stage 4.
5. **A new `.claude/rules/` file, or a line in `CLAUDE.md` — new.** Never stage
   an agent-memory commit with `git commit -a`. The evidence is three commits
   long and spans two runs: `08bcd15` reverted the line, `d83ad69` swept it back
   in alongside 10 memory files, `917c2a9` reverted it again. A prose warning in
   a revert message did not survive one run; this needs a rule, and ideally a
   `doctor` probe that notices `.claude/settings.json` drifting on a branch whose
   `touched_areas` does not name it.
6. **`packages/claims/src/parseClaims.ts` — new, and the one I would build
   first.** A near-miss Evidence marker (`**Evidence (...)**`, `**Evidence**:`,
   `*Evidence:*`) currently produces silence. Detect the near miss and report it,
   the same way a malformed shape is reported. The repository's whole argument is
   that an absent check must not look like a passed one, and its own extractor
   has an instance of that at the prefix.
7. **Not a rule, an observation for whoever owns `pipeline.ts`.**
   `KERNEL_MODULES` is a hardcoded enumeration whose staleness removes a reviewer
   silently. Consider deriving it, or failing loudly when a diff touches a
   `packages/claims/src/*.ts` that is neither listed nor explicitly excluded.

## Uncertainty

- **Coordinator self-corrections caught before anything was written remain
  unrecorded.** The nine entries in `coordinator_errors` all come from
  `review-evidence.md`'s own correction sections — that is, errors a *reviewer*
  found and the coordinator then wrote down. Errors it noticed and fixed on its
  own are in no artefact I can read. This run is unusually well instrumented and
  the class is still underreported by an unknown amount. I did not score the run
  clean on any signal with nowhere to appear.
- **`reversals: 2` undercounts, and is not comparable to the previous run's 4.**
  All three pre-review iterations landed as a single commit (`e05a586`), so every
  document correction inside Stage 2/3 — the `verifyClaim` false premise, the
  "all 7 rules" overstatement, the `isRuleFailure`/`isFailure` mix-up — is
  invisible to git. At least three real reversals happened that a commit-pair
  adjudication cannot see. The previous run spread the same phase over several
  commits and scored 4. **The metric is measuring commit granularity as much as
  rework**, and a rollup that ranks runs by it will be reading commit style.
- **I could not determine whether the "all 7 grounded rules" overstatement was
  the agent's or the synthesis's.** It appears at `review-evidence.md:19`
  attributed to `checker-engineer`, and at `:109` the coordinator claims it as
  "my own overstatement." Only the synthesis survives; the raw reviewer report
  does not. This decides whether the entry is an *agent* error or a *coordinator*
  error, which sends any fix to a different file, so I filed it as a coordinator
  error on the coordinator's own admission and flag that I could not verify it.
  `agent_errors: []` should be read as "none found in the surviving artefacts,"
  not "none occurred."
- **`defects_caught_by` is judgement, not measurement.** I counted findings that
  changed an artefact, an argument, or the code, and credited shared findings to
  every reviewer that raised them independently — so `checker-engineer: 12` and
  `architecture-reviewer: 8` overlap on the verdict-casing concern, the
  anchor-count false premise and the CI gate rather than describing 20 distinct
  defects. `rule-auditor: 2` is low but one of the two is the settings
  regression, which nothing else in the pipeline was positioned to find.
- **Post-PR data is one CI run old.** `verify` is SUCCESS on head `d502a72` and
  there are no review comments as of writing. `post_pr_ci: 0` means nothing has
  been caught yet, not that nothing will be.
- **Section 3's deferral is recorded as user-confirmed, but I cannot see the
  exchange.** `progress.md:27` says "Decision (user-confirmed): stop here" and
  the state file records no pause. I marked it `encodable: true` because all
  three review rounds had already recorded Section 3 as unstarted with no
  coverage plan — a signal the pipeline held in its own artefact and did not act
  on — but whether the user was asked or volunteered the decision, I do not know.
- This file sits outside every glob CI checks (`README.md`, `spec/**/*.md`,
  `openspec/**/*.md`), so its three Evidence Anchors are not gated. They were
  read at `d502a72` and each cites a file this change does not further modify.
