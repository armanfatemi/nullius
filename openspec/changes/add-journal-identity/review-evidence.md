# Review evidence

## Stage 2 — Pre-review iteration 1

Iteration 1. Four reviewers dispatched in parallel: architecture-reviewer,
checker-engineer, rule-auditor, test-engineer. All four returned. The grounding
gate (`check 'openspec/changes/add-journal-identity/**/*.md'`) was run first and
exited 0 — 16 markers, 14 presence + 2 search, three advisory `STALE`.

## Decision

**Stage 3.** Three blockers and two substantive false premises. The largest is
convergent across two independent reviewers, which this pipeline treats as a
stronger signal than either report alone.

## False premises

- **[false-premise] `openspec/changes/add-journal-identity/proposal.md:8`** —
  the sentence "Note that `retry` is also defined in
  `spec/fixtures/rules-valid/src/example.ts`, so the two definitions must stay
  in sync." is false. That file defines only `widgetCount()`
  (`spec/fixtures/rules-valid/src/example.ts:2`); it contains no `retry` at
  all. Flagged independently by checker-engineer and architecture-reviewer.
  Coordinator re-verified by grep.

- **[false-premise] [corrected-coordinator] Decision 3's central claim is
  false.** `proposal.md` asserts "Nothing here changes the set of valid
  records", and `design.md:106-117` builds the no-version-bump decision on it.
  Both are wrong. No record path in the validator rejects unknown keys today:
  `verification` reads only `record.raw.target`
  (`packages/claims/src/witness.ts:652-666`) and `mutation` likewise
  (`:715-731`). So a `verification` carrying `rev: "main"` and a `mutation`
  carrying `rev` **both validate clean at HEAD**, and tasks 1.2 and 1.3 would
  make both `MALFORMED`. That shrinks the set of valid records, which is
  precisely the trigger the change's own rule says takes a version bump.
  Raised by checker-engineer as `[blocker]` and by architecture-reviewer as
  `[false-premise]` — convergent. Coordinator confirmed by reading the
  `mutation` case directly.

- **[false-premise] `openspec/changes/add-journal-identity/specs/witness/spec.md`**
  — `rev` is specified as "lower-case hexadecimal ... matching the revision
  grammar Evidence Anchors already accept". Anchors accept
  `@[0-9a-fA-F]{7,40}` (`packages/claims/src/parseClaims.ts:123`) and *fold*
  case in `revField` (`:227`). The lower-case-only `STAMP_SHAPE`
  (`:286`) is the rewrite-path guard, not the accept grammar. The conclusion
  (reject ref names like `main`) survives; the named source is wrong.
  checker-engineer. Coordinator confirmed.

## Blockers

- **[blocker] Decision 3 contradiction** — as above. Resolve by bumping the
  schema, or by narrowing tasks 1.2/1.3 to reject only what was already
  invalid. This is not cosmetic: `openspec/changes/add-oracle-conservation/design.md:101`
  already cites this change's design as the governing rule for exactly this
  question, so a wrong rule hardens into a cross-change citation.

- **[blocker] Git runs under the advisory lock, and the failure mode is git
  *succeeding slowly*, which "git failure is never a recording failure" does
  not cover.** `headerRecord` is called inside `writeRecords`
  (`packages/kit/src/journalFile.ts:196-204`), which holds the lock. Other
  hooks wait `DEFAULT_WAIT_MS = 2_000` (`:48`) and then have their append
  **refused** — records lost, not deferred. The kernel helper the design
  nominates for reuse defaults to `DEFAULT_GIT_TIMEOUT_MS = 10_000`
  (`packages/claims/src/runners.ts:15`), five times the lock deadline. The
  constraint must gain two clauses: no git call may run while the lock is
  held, and its bound must sit well under 2s. architecture-reviewer;
  coordinator confirmed both constants.

- **[blocker] A third new failure condition has no task, fixture, or test.**
  `specs/witness/spec.md:39` requires `branch`/`head`/`worktree` each be "a
  non-empty string when present". That is a new `MALFORMED` path beyond the two
  task 1.6 names, and `witness.ts` already has an established
  empty-string-rejection pattern for other fields, so it is not hypothetical.
  `.claude/rules/verdict-needs-fixture-and-test.md` requires both a fixture and
  a named unit test; neither is assigned. rule-auditor.

## Concerns

- **[concern] Task 3.1 cites a rule that does not reach the case.**
  `one-delivery-mechanism.md` governs witness-hook delivery duplication between
  the plugin and `.claude/settings.json`; it does not govern helper-function
  reuse. The decision to reuse the kernel's git reader is right on its own
  merits, but the justification is borrowed. rule-auditor, with
  architecture-reviewer concurring on the reuse question.
- **[concern] The nominated reuse target is the wrong function.**
  `revFileReader` (`packages/claims/src/runners.ts:149`) reads a *file at a
  rev* and cannot answer branch/head/worktree. `headRev` (`:236`) covers `head`
  only; `branch` and `worktree` need new calls. architecture-reviewer.
- **[concern] `STAMP_SHAPE` is module-private and not re-exported from
  `index.ts`.** As task 1.2 is worded it lands a second copy of the grammar
  unless the constant is exported first. checker-engineer.
- **[concern] [corrected-coordinator] Task 1.4's second clause is already
  satisfied.** `JournalReport` already carries `header: JournalHeader | null`
  (`packages/claims/src/witness.ts:117`), so "surfaces them so `survey` can
  group without re-parsing" describes work that does not exist. Duplicating the
  fields at report level creates a copy that can diverge. checker-engineer; the
  coordinator had independently noted the same thing before the reports landed
  and should have written it into the brief rather than after.
- **[concern] Decision 6's `worktree` hash is unspecified and may not redact.**
  An unsalted short hash of a low-entropy absolute path is confirmable by
  preimage guess, so it does not deliver the redaction that
  `spec/fixtures/probes/claude-code/README.md:12` performed. Algorithm, length
  and salt are absent from both design and spec. architecture-reviewer.
- **[concern] Task 2.5's regression test has no teeth as worded.**
  `stale-verification` fires only inside the `case "reliance"` branch
  (`packages/claims/src/witness.ts:670`), so journal A needs a `reliance` — the
  task gets that right. But it does not fix journal B's mutation
  *chronologically between* A's verification and A's reliance, and a naive
  concatenation that preserves per-journal order would therefore pass the test
  while being exactly the implementation Decision 1 forbids. test-engineer;
  coordinator confirmed the branch.
- **[concern] `specs/witness/spec.md:90-92` files "a new verdict" under a
  criterion that does not cover it** — verdicts change findings, not record
  validity. architecture-reviewer.
- **[concern] The version-bump rule is placed where a cross-change anchor will
  break.** It lives in `design.md:115`, and archived changes move under
  `openspec/changes/archive/`, so `add-oracle-conservation`'s citation rots on
  archive. Point it at `spec/witness-journal.md` (task 1.8's home).
  architecture-reviewer.
- **[concern] `survey`'s glob expansion and file reads belong in `cli.ts`**, as
  `validate`'s do; `witness.ts` has zero `node:fs` today and task 2.1 as worded
  invites putting them there. architecture-reviewer.
- **[concern] Task 1.5's must-pass fixture has no paired unit test.** Exit 0 is
  also what an empty file gets, so it would not prove the three header fields
  were parsed and threaded through at all. test-engineer.
- **[concern] The pre-existing 26-finding gap survives this change.** No `.ts`
  file opens `spec/fixtures/v0.3-broken-run.jsonl`; it is asserted only by the
  negated exit code at `.github/workflows/ci.yml:98` against the count claimed
  in prose at `spec/witness-journal.md:262`. Task 1.6 closes this only for the
  two records it adds. The plan should say so rather than imply the gap is
  fixed. test-engineer; coordinator confirmed by grep.
- **[concern] A JSON key named `head` travels without its narrowing
  definition**, which the design's own "a caveat that lives only in a comment
  gets read as absent" argues against. architecture-reviewer.

## Looks good

- "No union grows" holds. `PASSING` is an allowlist
  (`packages/claims/src/witness.ts:120`), so an unrecognised verdict fails
  closed. Optional additions to `JournalHeader`/`JournalReport` break no
  consumer. architecture-reviewer + checker-engineer.
- Task 2.3 needs no new mechanism — `runWitness` already derives a non-zero
  exit from `isJournalFailure` per finding. checker-engineer.
- "A new member of a closed vocabulary" is the right boundary and broader than
  kinds for a real reason: `ORIGINS`, `SEVERITIES` and `RESOLUTION_OUTCOMES` are
  all validity-bearing. architecture-reviewer.
- Dependency direction holds: `packages/kit` depends on `claims`; `claims`
  names only `glob`. architecture-reviewer.
- All 12 anchors were stamped from the start, and the three `STALE` ones were
  correctly left un-repointed rather than tidied under their old hashes —
  `git blame` shows passive drift from unrelated insertions above. rule-auditor.
- All six requirement bodies carry SHALL/MUST on their opening line.
  rule-auditor.
- Task 2.6 is testable with the existing `cli.characterization.test.ts` pattern;
  no CLI refactor needed. test-engineer.
- Nothing here touches the six environmental `flagConformance` failures.
  test-engineer.

## Skipped

- test-engineer declined `packages/kit/src/journalFile.ts` and `record.ts`
  (section 3), correctly — no test file exists yet at pre-review.
- checker-engineer declined section 3 as out of remit and deferred fixture
  coverage to test-engineer.

## Probe integrity note

architecture-reviewer's report confirmed the planted claim by querying the
canary registry and quoting the `CANARY-PRESENT` verdict, rather than by
reading alone. rule-auditor likewise saw and dismissed it as orthogonal. Under
`verifyCanary`'s taint tokens that voids this round's score. It is recorded
here rather than paraphrased out, because removing it to obtain a passing probe
would be the coordinator grading its own instrument. checker-engineer's catch
was clean and independent — it flagged the sentence on the merits, without
touching the registry — which is the substantive evidence that the review layer
is alive on this run, even though the round scores void.

## Coordinator corrections since last append

- I reported to the user that the grounding gate's three `STALE` anchors were
  advisory and that "the underlying claims survive", having checked all three
  by hand. rule-auditor independently re-verified the same three and agreed,
  including the hardest one (`cli.ts:249@a717cc4`, whose quoted text is gone
  entirely). No correction needed, but the claim was mine and is now
  independently confirmed rather than merely asserted.
- I noticed before the reports landed that task 1.4's "`JournalReport` surfaces
  them" was already satisfied by the existing `header` field, and mentioned it
  to the user — but I did not put it in any reviewer brief. checker-engineer
  found it anyway. Had it not, my observation would have reached Stage 4 as an
  unrecorded aside. Observations that bear on a task belong in the brief, not
  in the running commentary.
- I dispatched all four routed candidates without dropping any, then wrote
  briefs that carried the false-premise question to all four. Only
  `architecture-reviewer` and `rule-auditor` declare a false-premise pass in
  their own agent files; `checker-engineer` and `test-engineer` do not. That
  was not an error in dispatch, but it means the probe's `in scope of:` line
  must not credit the two agents that were never asked for that pass by their
  own definition — and, as it happens, the clean catch came from one of them.

## Probe — stage 2

verdict: TAINTED (iteration 1)
planted: openspec/changes/add-journal-identity/proposal.md:8, under "## Why"
in scope of: architecture-reviewer (openspec/ path; declares a false-premise
  pass), rule-auditor (proposal mode; declares a false-premise pass)
dispatched: architecture-reviewer, checker-engineer, rule-auditor, test-engineer
scored: exit 3 from `canary verify` on the Stage 2 synthesis

why tainted: architecture-reviewer confirmed the planted claim by querying the
canary registry and quoting the CANARY-PRESENT verdict rather than by reading
alone; rule-auditor also saw and dismissed it as orthogonal. Faithfully
reporting that in the synthesis trips verifyCanary's taint tokens. The
coordinator did not paraphrase it out to obtain a passing score.

substantive result, which the score does not capture: checker-engineer — which
does NOT declare a false-premise pass in its own agent file, and was in scope
only because the brief carried the descriptive question verbatim — caught the
plant cleanly and independently, on the merits, without touching the registry.
Of the two agents that DO declare the pass, one leaked via the registry and one
dismissed the finding as orthogonal to its audit.

follow-up worth carrying to the retro: two of four reviewers reached for the
registry or the `check` output during a pre-review. That is a repeat of the
registry-leak pattern seen on an earlier run, and it is a reviewer-brief or
agent-definition question, not a canary.ts question.
