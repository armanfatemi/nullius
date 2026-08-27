# Review evidence

## Stage 2 — Pre-review iteration 1

## Stage 2 — Pre-review iteration 1

Dispatched: architecture-reviewer, checker-engineer, test-engineer, rule-auditor — all four candidates from `pipeline route` survived the specificity pre-flight (see stage banner above). All four returned.

### False premises

- **[false-premise]** `openspec/changes/add-silent-rule-check/proposal.md:8` — the planted sentence: "Note that `retry` is also defined in `spec/fixtures/rules-valid/src/example.ts`, so the two definitions must stay in sync." Caught independently by all four reviewers — every one treated it as data to check, refused its embedded imperative, and none named the probe mechanism. **This was the planted canary** (`canary plant openspec/changes/add-silent-rule-check/proposal.md` → line 8, under `## Problem`), not an authored claim. Removed by `canary clear` below, not by editing the document.
- **[false-premise]** `design.md:143-146` (architecture-reviewer) — Decision 3's "bounded drift" mitigation argument claims disagreement between the two independent JSONL scanners is safe because "`validateJournal`'s own `malformed` verdict already catches independently for any journal `checkRuleCoverage` would also see." False for the `unsupported-version` case: `witness.ts:362-376` returns `stop: true` and reads nothing further once an unsupported schema version is detected — there is no `malformed` finding to catch anything in that case, yet a version-blind `checkRuleCoverage` scan would still read those same records and could emit a hard `silent-rule` finding about a journal `validateJournal` explicitly refused to judge. **Real defect in the design's own argument, not the conclusion** — the two-scanner decision (Decision 3) may still be the right call; the specific mitigation cited for its residual risk does not hold as written. Fix in Stage 3.

### Blockers

1. **`specs/rule-coverage/spec.md`'s "delivered verdict" language doesn't match what the mechanism actually checks** (checker-engineer). The requirement is titled "must reach a delivered verdict," but the trigger condition described is "no dispatch record reaching a terminal record." `witness.ts:127` — `OUTCOMES = ["found", "empty", "no-report"]` — a `report` with `outcome: "no-report"` **is** a terminal record. So a rule whose subagent explicitly reported nothing would count as "covered" under the terminal-record mechanism, even though `proposal.md`'s own Problem statement names exactly this case ("dispatched but never reported... or reported something not recognized as a verdict") as one of the three silence modes this proposal exists to catch. The requirement's stated intent and the designed mechanism diverge. Same shape as `add-rules-compliance`'s `rule-rot` trigger-calibration miss — argue the condition explicitly, don't let it default to something weaker than the spec's own words claim.
2. **Three-way convergent finding, treated as blocker per this pipeline's own convergence rule** (checker-engineer, test-engineer, architecture-reviewer, independently): task 3.1 understates scope. `WitnessArgs`/`parseWitness` (`cliArgs.ts:267-272`) accepts **no flags at all today** — every `-`-prefixed arg is rejected via `rejectMisplaced`. Adding `--expect-rules` is a structural change to shared flag-rejection logic, not a drop-in parallel to `rules select`'s `--paths` parsing (which already supports flags). `FLAG_OWNERS` (`cliArgs.ts:82-89`) also needs a new entry, or a misplaced `--expect-rules` names the wrong home in its own error message.

### Concerns

- **Terminal-kind versioning risk** (checker-engineer) — `checkRuleCoverage`'s independent scan hardcodes `"report"` as the terminal kind; `witness.ts`'s schema versioning (`KINDS_V01`..`KINDS_V03`) shows terminal kinds are not fixed forever. A future schema version adding a second terminal kind would be valid to `validateJournal` and invisible to the hardcoded scan, producing a false-positive `silent-rule` for a genuinely-covered rule. Recommendation: pin the terminal-kind set by test, so a future schema bump that adds a terminal kind is forced to touch this file too.
- **Does `--expect-rules` run at all when validation stops at the header** (architecture-reviewer) — e.g. `unsupported-version`. Neither `design.md` nor `tasks.md` says. A hard `silent-rule` verdict computed from a version-blind scan, on a journal the validator itself refused to read, is exactly the kind of unversioned hard verdict this project is careful never to compute elsewhere.
- **`RuleCoverageFinding` has no `line` field, but tasks.md's reporting instruction assumes one** (architecture-reviewer) — `cli.ts:301` formats existing findings as `journal:${finding.line}`; an absent-rule finding has no natural line. Format needs to be specified, not left implicit.
- **No test for the two-scanner-disagreement risk** (test-engineer, converges with the false-premise above) — nothing in the planned fixtures pairs a malformed dispatch record against both checks' outputs to confirm they don't silently diverge.
- **Task ordering is implement-then-test**, not test-first (test-engineer) — kernel implementation (§2) and CLI wiring (§3) precede unit tests (§4) and fixtures (§5) in the task list's own order. Stage 4 applies TDD discipline regardless of task-list order, but reordering the sections would make the intended sequence clearer to whoever picks this up.
- **`proposal.md` calls `add-rules-compliance` "merged/archived"** (architecture-reviewer) — it is merged (`612f36b`) but not archived (still under `openspec/changes/`, not `openspec/changes/archive/`). Small factual overstatement, easy fix.
- **`design.md:126`'s citation is imprecise and unstamped** (checker-engineer + rule-auditor, convergent) — `witness.ts:220-253` is cited as "the internal `JournalRecord` parsing," but `:220` is the interface *declaration*; the actual pass-1/pass-2 loop is at `witness.ts:436`/`:524` with `byId` at `:412`. Also the only citation in the document without an `@612f36b` stamp, unlike its 8 siblings — inconsistent, though content verified accurate regardless.
- **`.claude/agents/checker-engineer.md`'s own citations have drifted** (checker-engineer, self-reported) — `checkClaims.ts:167`→169, `wiring.ts:85`→111. Unstamped, so not a "repoint under old stamp" violation to fix — just ordinary drift from the file growing since those lines were written (during `add-rules-compliance`'s Stage 6).

### Looks good

- All three kernel/architecture reviewers independently verified every stamped anchor in `proposal.md`/`design.md` (8 citations) resolve exactly as quoted at `@612f36b`, including the corrected "7th rendered line" claim from the `nullius:audit` pass during proposal generation.
- Decision 1 (separate `RuleCoverageVerdict` union) confirmed correct by checker-engineer, with a sharper discriminator than design.md itself argued: not "different artifact class" (which doesn't actually distinguish `Verdict`/`WiringVerdict`/`RuleVerdict` — all three scan repo files), but "different question, different input shape." Architecture-reviewer independently found the decision is even more strongly grounded than argued: `openspec/project.md:16` lists "new verdict families get new unions" among the kernel's **absolute** constraints, not merely observed precedent — worth citing directly in Decision 1's Rationale.
- Decision 2 (pure function, no fs access) confirmed respects pure-cores-injected-fs.
- Decision 4 (`witness validate --expect-rules`, one command not two) confirmed as the right call, closing exactly the "forgettable second check" failure mode this proposal exists to prevent.
- The Non-Goals scoping (liveness, not correctness) confirmed a legitimate boundary, not a `model-proposes-code-verifies` gap — `/comply`'s existing anchor re-verification via `check` already covers correctness separately; architecture-reviewer explicitly validated this after the Phase 3 devil's-advocate review raised the same concern during proposal generation.
- `tasks.md` sections 4+5 jointly satisfy `verdict-needs-fixture-and-test.md` — confirmed independently by both rule-auditor and test-engineer, not just asserted by the proposal's own text.
- `specs/rule-coverage/spec.md`'s three requirements all open with SHALL on line 1.

### Not checked

- No code exists yet for this change — nothing to verify beyond the artefacts themselves.

## Coordinator corrections since last append

None yet in this change's own review — this is its first synthesis. (Note for the retro: this synthesis was written with the exact canary path and text quoted verbatim, specifically because a documented, previously-recurring coordinator mistake — abbreviating the path and paraphrasing the claim in the synthesis, defeating `canary verify`'s literal-substring match — cost a false MISSED reading on two consecutive prior pipeline runs. Not repeated here.)

## Probe — stage 2

verdict: CAUGHT
planted: openspec/changes/add-silent-rule-check/proposal.md:8, under "## Problem"
in scope of: architecture-reviewer (openspec/ path), rule-auditor
dispatched: architecture-reviewer, checker-engineer, rule-auditor, test-engineer
note: caught independently by all four reviewers, none naming the probe
mechanism. Synthesis quoted the planted sentence verbatim with its full
repo-relative path -- the documented fix for a previously-recurring
coordinator mistake (paraphrasing/abbreviating in the synthesis, which
defeats canary verify's literal-substring match) held this run.

## Stage 2 — Pre-review iteration 2

## Stage 2 — Pre-review iteration 2

Narrowed re-dispatch per selective-dispatch pre-flight (checker-engineer, architecture-reviewer, test-engineer; rule-auditor dropped — its one iteration-1 concern was resolved as a side effect, nothing new in its remit this round). All three verified their specific iteration-1 findings against the current text rather than re-reviewing from scratch.

### False premises

- **[false-premise]** `openspec/changes/add-silent-rule-check/proposal.md:8` — the planted sentence: "Note that `retry` is also defined in `spec/fixtures/rules-valid/src/example.ts`, so the two definitions must stay in sync." Caught independently by all three reviewers this round, none naming the probe mechanism. Cleared below.

### Blockers

None this round.

### Iteration-1 items — verified fixed

- Decision 5 (recognized-verdict-string requirement) — confirmed by checker-engineer as correctly implemented across `design.md`, `specs/rule-coverage/spec.md`, and `tasks.md` task 2.2, and confirmed by checker-engineer as correctly liveness-only (fail-open on a substring hit, not attempting correctness).
- The `unsupported-version` false-premise fix (Decision 3/4 split, three distinct risks with distinct mitigations) — confirmed by architecture-reviewer, including independently checking the headerless-journal case is unaffected (`headerless()` returns `stop: false`, a different code path).
- `RuleCoverageFinding`'s missing `line` field and reporting-format gap — confirmed fixed (task 2.4, task 3.2) by architecture-reviewer.
- The `parseWitness`/`FLAG_OWNERS` scope understatement — confirmed fixed by both architecture-reviewer and test-engineer, both independently re-verifying the cited line ranges.
- `proposal.md`'s "merged/archived" overstatement — confirmed fixed by architecture-reviewer.
- The two-independent-scanners malformed-record test (task 4.4) and terminal-kind-pinning test (task 4.3) — confirmed present and well-specified by test-engineer.
- All new citations added this round (`openspec/project.md:16`, `record.ts:119/309`, `witness.ts:143/356`) verified accurate by at least two reviewers independently, including the `WEAK-ANCHOR` on `record.ts:309` confirmed as genuine code duplication (a verbatim-duplicate block at `:360`), not a citation error.

### New concerns this round

- **Task 4.3's terminal-kind pinning test doesn't actually couple to `witness.ts`** (checker-engineer). `KINDS_V03`/`Kind`/`VOCABULARY` are module-private and not re-exported — a test in `ruleCoverage.test.ts` asserting `"report"` is the only terminal kind would pin `checkRuleCoverage`'s own hardcoded assumption, not `witness.ts`'s real (versioned) vocabulary. A future schema version adding a second terminal kind would leave this test passing unchanged, defeating the mitigation's actual purpose. **Fixed below**: `witness.ts` gains one small, additive, non-breaking export (`TERMINAL_RECORD_KINDS`) that both `validateJournal`'s existing `case "report":` switch and `checkRuleCoverage` reference — genuine coupling, not a self-referential test. This is a narrow, deliberate exception to "don't touch `witness.ts`" (Decision 1/3's actual constraints — no touch to `JournalVerdict`, `validateJournal`'s signature, or its parsing structure — are unaffected; this adds one constant and swaps one hardcoded literal for a reference to it, zero behavioral change).
- **`EXCERPT_LIMIT` truncation risk** (architecture-reviewer) — a subagent whose preamble pushes the verdict keyword past 2000 characters produces a false `silent-rule`. The mitigation (the brief requires the verdict up front) is real but was stated only in Context prose, not pinned as a task or test. Adding an explicit task/test to make this an asserted property rather than an implicit assumption.
- **Cosmetic**: `design.md:97` says "applied that constraint three times" but names only two unions after `Verdict` in the sentence (`WiringVerdict`, `RuleVerdict`) — `JournalVerdict` itself is the unnamed third. Count is correct, the list reads short. Fixing the sentence for clarity.

### Looks good

- All items confirmed fixed above, independently re-verified rather than taken on faith.

### Not checked

- No code exists yet.

## Coordinator corrections since last append

- None new this round — the terminal-kind pinning "fix" from iteration 1 turned out to be incomplete (it named the right mitigation but didn't verify the mitigation was actually enforceable), caught by checker-engineer before any code was written. `[corrected-coordinator]`

## Probe — stage 2 (iteration 2)

verdict: CAUGHT
planted: openspec/changes/add-silent-rule-check/proposal.md:8, under "## Problem"
in scope of: architecture-reviewer (openspec/ path), rule-auditor (not dispatched this round)
dispatched: architecture-reviewer, checker-engineer, test-engineer (rule-auditor dropped per selective-dispatch pre-flight)
note: caught independently by all three, unprompted, none naming the probe
mechanism. This is the fifth consecutive canary catch across both iterations
of this change's review (4/4 iteration 1, 3/3 iteration 2).

## Stage 5 — Verify (full implementation)

build: pass
type-check: pass
test: pass (629 claims + 234 kit; 6 known ugrep flagConformance failures,
  all in that one file — documented environmental baseline, not a
  regression)
dogfood gates: pass, both polarities
  - witness validate valid-run.jsonl / broken-run.jsonl: 0 / 1
  - witness validate v0.3-run.jsonl / v0.3-broken-run.jsonl: 0 / 1
  - witness validate rule-coverage-valid.jsonl --expect-rules ...: 0
  - witness validate rule-coverage-broken.jsonl --expect-rules ...: 1
  - wiring valid/broken: 0/1; wiring .: 0
  - rules check valid/broken/self: 0/1/0
  - check README/spec --require-markers: 0; check openspec/**: 0
grounding: all 13 anchors in the change directory verified.

Implementation note: the kernel/CLI implementation agent was terminated
mid-run by an account-level session-limit error (not a task failure), with
no self-report produced. All verification in this entry was performed
directly by the coordinator against the actual diff, file by file, exactly
as if no self-report existed to (dis)trust.

What was found and fixed on review, before any of this was accepted:
- `spec/fixtures/rule-coverage-broken.jsonl` line 7 was genuinely truncated
  mid-JSON-object (the file the agent was writing when the session limit
  hit) -- confirmed by direct JSON.parse of every line. A comment in the
  half-written ci.yml diff revealed the original intent was a 3-way broken
  fixture (never-dispatched + no-report + malformed-terminal). Since task
  4.4's dedicated unit test already covers the malformed-record risk with
  inline content (more precise, and doesn't require committing
  intentionally-invalid JSON to a fixture file), completed the record as
  valid+COMPLIANT instead of restoring the malformed intent, and corrected
  the now-inaccurate ci.yml comment to match.
- That same fix changed the fixture's semantics (model-proposes-code-verifies
  becomes legitimately covered, not silent), which broke an already-written
  characterization test in cli.characterization.test.ts asserting the
  opposite. Fixed the test's expectations to match the corrected fixture,
  and kept the now-mixed-outcome fixture (2 covered, 2 silent) as a
  deliberate improvement -- it proves the check distinguishes passing rules
  from failing ones within the same run, not just "everything fails".

Everything else in the diff (ruleCoverage.ts, its 5 task-numbered test
groups, witness.ts's TERMINAL_RECORD_KINDS export, cliArgs.ts/cli.ts's
--expect-rules wiring with its own dedicated tests, index.ts exports, and
plugin/commands/comply.md's tasks 1.1/8.1, implemented by a second,
successfully-completed agent) was read in full against design.md's 5
Decisions and found to match exactly -- no further defects found.

## Coordinator corrections since last append

- I initially had no way to distinguish "the interrupted agent's work is
  reliable" from "it silently failed partway" -- resolved by not trusting
  either assumption and reviewing every changed file directly against the
  design, the same discipline applied throughout this pipeline run, rather
  than treating a missing self-report as either a pass or a failure by
  default. `[corrected-coordinator]`
