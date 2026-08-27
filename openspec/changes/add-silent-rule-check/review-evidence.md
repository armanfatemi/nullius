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
