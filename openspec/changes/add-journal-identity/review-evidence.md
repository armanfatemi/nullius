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

## Stage 2 — Pre-review iteration 2

Iteration 2. Same four reviewers, re-briefed on the deltas rather than the
whole change. All four returned (rule-auditor was killed mid-run by the harness
and re-dispatched; its replacement completed).

## Decision

**Stage 3, iteration 2.** Six blockers and two false premises. This round
returned *more* blockers than iteration 1, not fewer — the schema bump the
first refinement introduced brought its own surface with it, and two of the new
blockers are defects in the repair rather than in the original design.

## False premises

- **[false-premise] `openspec/changes/add-journal-identity/design.md:6`** —
  "Note that `retry` is also defined in
  `spec/fixtures/rules-valid/src/example.ts`, so the two definitions must stay
  in sync." That file defines only `widgetCount()`. Flagged by
  architecture-reviewer, checker-engineer and rule-auditor.

- **[false-premise] [corrected-coordinator] `VOCABULARY` does not
  exist.** The map is `VOCABULARY`:

  **Evidence:** `packages/claims/src/witness.ts:154@f1b8211` — `const VOCABULARY: ReadonlyMap<string, readonly Kind[]> = new Map([`

  The coordinator invented the name during iteration 1's refinement and
  propagated it into `proposal.md`, `design.md`, `tasks.md` and `progress.md`.
  As checker-engineer put it, the one name in the bump plan carrying no anchor
  is the one that is wrong. Found independently by architecture-reviewer and
  checker-engineer; coordinator confirmed the symbol appears nowhere in
  `packages/`.

## Blockers

- **[blocker] Nothing version-gates the new rejections, so the change's
  backward-compatibility claim is false as specified.** Version selects
  behaviour in exactly three places, and none is reachable from the record
  cases tasks 1.2/1.3/1.5 modify:

  **Evidence:** `packages/claims/src/witness.ts:445@f1b8211` — `  const vocabulary: readonly Kind[] = VOCABULARY.get(scan.version) ?? KINDS_V01;`

  That gates which *kinds* are valid. Field-shape checks inside a kind's case
  run for every declared version, so task 1.2's `rev` grammar check would
  reject `rev: "main"` on a `0.3` journal too. Task 1.12 asserts the opposite,
  and the spec says "the new rejections are `0.4` semantics". Either a fourth
  gate is added and named in a task, or 1.12 is false. Raised independently by
  checker-engineer and test-engineer; coordinator confirmed at `:445`.

- **[blocker] Task 1.11 pins one verdict; the gate guards two.** The `0.3`
  ledger gate wraps both the dissent-conservation loop emitting
  `suppressed-finding` and the `silent-reviewer` loop. A test asserting one
  leaves the other exactly as silently ungated on `0.4` as it is today — the
  failure 1.11 exists to prevent, reproduced inside 1.11. test-engineer;
  coordinator had reached the same count independently before the report
  landed, and architecture-reviewer confirmed the two-verdict scope from the
  other direction.

- **[blocker] Task 1.5 collides with how the header already treats empty
  strings.** `session` and `source` run through a helper that maps `""` to
  `null` with no finding:

  **Evidence:** `packages/claims/src/witness.ts:309@f1b8211` — `function optionalString(value: unknown): string | null {`

  So empty strings are silently accepted for two header fields today while 1.5
  makes them `MALFORMED` for three others — an unargued inconsistency inside
  one record. Worse, an implementer reusing `optionalString` for the identity
  fields makes the new verdict unreachable while fixture 1.7 still exits 1 on
  its other two records, so the gap would not show. `nonEmptyString`
  (`witness.ts:275`) is the correct helper and the task must say so.
  checker-engineer.

- **[blocker] The `worktree` salt is not gitignored, and "per-clone" is the
  wrong unit.** `.gitignore` covers `.nullius/runs/` and `.nullius/probes/`
  only; a salt written "beside the runs directory" is committed by default, and
  a committed salt voids the entire preimage argument Decision 6 rests on. No
  task adds the ignore rule. Separately `.nullius/` lives in the working tree,
  so the salt is per-*worktree*, not per-clone — which is precisely wrong for
  the multi-worktree case that motivates the change. architecture-reviewer;
  coordinator confirmed both halves.

- **[blocker] Tasks 3.3 and 3.4 contradict each other.** 3.3 requires identity
  resolved before the lock is acquired; 3.4 requires resolution once per
  session, never per event. But whether a header is needed at all is computed
  under the lock, so "resolve before the lock" forces resolution on every
  event. Neither document names the unsynchronised pre-check that reconciles
  them. architecture-reviewer.

- **[blocker] The normative spec dropped a clause the design keeps.**
  `design.md` states the version-bump rule with four triggers including "a new
  verdict that can fail a record"; the spec requirement lists three and omits
  it, and task 1.9 omits it too — so the omission propagates into
  `spec/witness-journal.md`, which tasks 1.8/1.9 make canonical and which task
  4.5 re-points `add-oracle-conservation` at. Iteration 1's blocker was a
  missing clause in this same rule; the repair reintroduced one.
  architecture-reviewer as `[blocker]`, rule-auditor as `[concern]` —
  convergent, and this pipeline treats convergence as a blocker.

- **[blocker] [coordinator] The change has no producer for the schema it
  defines.** checker-engineer flagged this as a concern and marked the kit out
  of remit; composed with section 3 it is larger than that. The producer stamps
  `0.2`:

  **Evidence:** `packages/kit/src/cli.ts:41@f1b8211` — `const SCHEMA_VERSION = "0.2";`

  So the hook pack writing journals today declares `0.2`. This change teaches
  the kernel to read `0.4` and teaches the kit to *write* `branch`/`head`/
  `worktree` (task 3.4) — into a header still declaring `0.2`, where the
  ignore-unknown-keys rule quietly discards them. No task bumps the producer.
  As specified, the identity fields would be written and never read, and the
  `0.4` gate would fire on no real journal. Note this also means the existing
  `0.3` ledger gate already fires on no journal the kit produces, which is a
  pre-existing condition this change is not obliged to fix but must not
  reproduce.

## Concerns

- **[concern] The floor's comparator is unspecified**, and a string `>=`
  mis-orders `"0.10"` against `"0.3"` — the same silent-ungating defect task
  1.11 exists to prevent. `VERSIONS` is a closed ordered list; compare by index
  into it. Raised by both architecture-reviewer and checker-engineer.
- **[concern] Two lines in `spec/witness-journal.md` go false and no task names
  them** — `:114` ("this build reads `0.1` and `0.2`", already stale) and
  `:228` ("apply only to journals declaring `0.3`", contradicted by the floor).
  Both reviewers.
- **[concern] Task 1.3's asymmetry argument is not actually in the spec
  delta.** The requirement offers only "its hash is the identity of what
  changed", which argues a `mutation` does not *need* `rev` — equally a
  justification for ignoring it, which is what the header rule mandates for
  unknown keys. This is the kernel's only hard failure on a well-formed extra
  key and it is still unargued. checker-engineer.
- **[concern] Only one of the three new `MALFORMED` conditions requires a
  distinguishable detail.** Task 1.5 requires the finding to name the field;
  1.2 and 1.3 do not, so a test cannot assert all three by name as task 1.7
  demands. The spec also has no scenario for "mutation carries `rev`".
  test-engineer.
- **[concern] No CI wiring task for `v0.4-identity-run.jsonl`.** The existing
  v0.3 pair each have dedicated must-pass/must-fail lines; task 4.3's "confirm
  it exits as the table says" can be satisfied by hand. test-engineer.
- **[concern] The proving test for the floor is the lower boundary, not
  `0.3`.** A `0.2` journal with an undischarged blocker must earn *no* ledger
  verdict; a `0.3`-only test would pass against a floor wrongly written as
  `!== "0.1"`. checker-engineer.
- **[concern] The rule remains prose its own author misapplied once**, with no
  mechanical check. architecture-reviewer.

## Looks good

- **The floor conversion was challenged rather than confirmed, and survived.**
  The gate wraps exactly `SUPPRESSED-FINDING` and `SILENT-REVIEWER`, both
  reading only vocabulary `0.4` leaves unchanged; there is no `0.3`-specific
  semantics a floor would wrongly extend. architecture-reviewer.
- `KIND_INTRODUCED` derives from `VOCABULARY`, so mapping `0.4` to the
  unchanged `KINDS_V03` leaves every "arrived in schema X" message correct with
  no edit. checker-engineer.
- `STAMP_SHAPE` is the right constant and is stateless (no `g` flag); exporting
  it does not widen the public surface, since `index.ts` re-exports by explicit
  name list. Add a clause to 1.2: do not add it to `index.ts`. checker-engineer.
- The salt trade costs `add-journal-sealing` nothing — it needs cross-worktree
  ref *visibility*, not identifier comparison. architecture-reviewer.
- Task 2.1 keeps `node:fs` out of `witness.ts`, which has none today.
  architecture-reviewer.
- Task 2.5's chronology clause is sound against the real mechanism: `hashes` is
  updated in record order by both kinds, so the described ordering is a real
  regression test for a concatenation bug. test-engineer.
- All three iteration-1 blockers verified resolved. The three previously
  `STALE` anchors were re-stamped with **both** halves to `6a3c1bc` rather than
  repointed under their old hashes — correct `never-repoint-under-old-stamp`
  discipline. Task 3.1's borrowed rule citation is gone. Task 4.5 plans a
  re-stamp rather than a repoint. All six requirement bodies carry SHALL on
  their opening line. rule-auditor.

## Skipped

- checker-engineer declined kit-side coverage as out of remit, flagging only
  the kernel-side consequence — which the coordinator then escalated above.
- test-engineer declined section 3, no kit source having been cited in its
  brief this round.

## Probe integrity note

**The tool scored this round `CAUGHT`. Do not trust that score.** It is
recorded because it is what the instrument returned, and it is immediately
qualified because the round was materially compromised before any reviewer was
dispatched.

Taint is detected by substring match against three literal tokens. This
synthesis reports the leak in prose and does not happen to contain any of them,
so the check did not fire. The coordinator did not set out to evade it — but
the outcome is a compromised round scoring clean, and a paraphrase defeating
the taint check is a defect in the instrument worth fixing independently of
this change. A `CAUGHT` that survives only because the synthesis chose
different words is not a measurement.

What actually happened, and why the primary cause is the coordinator:

Three of four reviewers named the probe machinery. But `progress.md` — which
this pipeline commits into the change folder, and which reviewers reading the
change directory therefore read — carried the line "Plant the iteration-2
canary into design.md (rotate off proposal.md)" at line 20, committed in
`f1b8211`. rule-auditor's report cites `progress.md` as its confirmation.

So iteration 2's probe was disclosed in writing, by the coordinator, before any
reviewer was dispatched. The neutral brief line added this round ("review by
reading the artefacts and the code they cite; repository internals under
`.git/` are not review material") was aimed at the wrong leak entirely: the
leak was not in `.git/`, it was in the committed diff.

This is a defect in the pipeline's own artefact contract, not in the reviewers
and not in `canary.ts`. `progress.md` is committed by design so it travels in
the PR; a probe plan must therefore never be written into it. Carried to the
retro as the iteration's most useful finding.

## Coordinator corrections since last append

- **I invented `VOCABULARY` and wrote it into four artefacts.** The
  symbol does not exist; the map is `VOCABULARY` at `witness.ts:154`. I had
  read that region of the file during Stage 3 and still wrote the name from
  memory rather than from the read. Two reviewers caught it independently.
  Corrected in this iteration's refinement.
- **I leaked the canary's plant location into a committed artefact.** Writing
  the next-actions list into `progress.md` at Stage 3, I named the document I
  was about to plant into. rule-auditor read it there. Iteration 2's `TAINTED`
  score is therefore substantially my doing rather than the reviewers', and the
  iteration-1 conclusion I recorded — that this was a reviewer-brief or
  agent-definition problem — was at best half right and I am correcting it
  here.
- **I told the user iteration 2 would check "whether the repairs are sound".**
  It did, and rule-auditor confirmed all three iteration-1 blockers resolved —
  but the round surfaced six new blockers, two of them introduced by the repair
  itself. Framing a re-review as a confirmation pass understated what it was
  for, and I am recording that the count went up rather than down.
- **I escalated a reviewer's `[concern]` to a `[blocker]`** — the
  `SCHEMA_VERSION = "0.2"` producer gap. checker-engineer scoped it out of
  remit and was right to; the escalation is the coordinator's judgement,
  composed from that concern plus section 3's tasks, and it should be read as
  mine rather than as a reviewer finding.

## Probe — stage 2

verdict: CAUGHT-BUT-UNRELIABLE (iteration 2)
planted: openspec/changes/add-journal-identity/design.md:6, under "## Context"
  (rotated off proposal.md, which held iteration 1's plant; the harvested
  sentence was identical, as the harvest is deterministic)
in scope of: architecture-reviewer (openspec/ path; declares a false-premise
  pass), rule-auditor (proposal mode; declares a false-premise pass)
dispatched: architecture-reviewer, checker-engineer, rule-auditor, test-engineer
scored: exit 0 from `canary verify` on the Stage 2 iteration-2 synthesis

Why the score is recorded with a qualifier rather than as CAUGHT:

1. The plant location was disclosed in writing, by the coordinator, in a
   COMMITTED artefact, before any reviewer was dispatched. progress.md line 20
   read "Plant the iteration-2 canary into design.md (rotate off proposal.md)"
   and was committed in f1b8211. rule-auditor's report cites progress.md as its
   confirmation source. A probe whose location is published in the diff under
   review measures nothing.

2. Three of four reviewers named the probe machinery in their own reports.
   Under the taint rule each of those reports is void.

3. The taint check is a substring match against three literal tokens. This
   round's synthesis describes the leak in prose without using them, so the
   check did not fire and the round scored clean. That is an instrument defect,
   not a clean run: paraphrase defeats taint detection, which means TAINTED
   systematically under-reports and CAUGHT is correspondingly inflated.

Substantive signal, separate from the score: all four reviewers flagged the
planted sentence, and checker-engineer again reached it on the merits. But
because of (1) this round cannot distinguish "the review layer is alive" from
"the review layer read the coordinator's notes", which is exactly the
distinction the probe exists to make.

Actions this produces, both for the retro:
- The pipeline must never write a probe plan into progress.md, which is
  committed by design so it travels in the PR. This is a defect in the skill's
  artefact contract, not in the reviewers and not in canary.ts.
- verifyCanary's taint detection should not depend on the synthesis quoting
  specific tokens; a round whose reports were tainted should stay tainted
  regardless of how the synthesis words it.

iteration 1 verdict for comparison: TAINTED (registry leak, no coordinator
disclosure).

## Stage 2 — Pre-review iteration 3

Iteration 3, the final round under the default `--max-refine` cap of 3. Same
four reviewers, briefed on the iteration-2 repairs.

## Decision

**Refinement cap reached with blockers outstanding.** One of them is not a
document defect at all — it is a measured fact about the repository that
invalidates a scope decision taken earlier in this run on incomplete
information. The pipeline pauses rather than looping a fourth time.

## The finding that changes the change

**[blocker] The producer bump (tasks 3.8–3.10) cannot land as specified, and
this is now measured rather than argued.**

The kit emits exactly four record kinds and `finding` is not among them:

**Evidence:** `grep -rn '"finding"' packages/kit/src/ --include='*.ts' --exclude='*.test.ts'` → 0 results

So under any schema at `0.3` or later, the two verdicts behind the ledger gate
behave structurally, not statistically: `SUPPRESSED-FINDING` is unreachable
because the ledger is always empty, and `SILENT-REVIEWER` fires on every
`report` whose outcome is `found`, because none of them can ever carry a
finding to discharge it.

architecture-reviewer ran the measurement task 3.9 asks for. The coordinator
re-ran it independently and got a slightly higher count:

- 18 live journals under `.nullius/runs/`
- 254 reports with `outcome: "found"`, 0 `finding` records
- Header left at its real `0.2`: **0** `SILENT-REVIEWER` findings
- Header rewritten to `0.3`: **255** `SILENT-REVIEWER` findings

That is task 3.9's third outcome — "they fire pervasively on well-formed runs"
— whose written instruction is to pause rather than relax a verdict. The gate
fired on its first use, which is the gate working.

The important part is *why*, because it is not calibration. The version gate is
doing double duty as a **producer-capability claim**: it reads "this journal
declares 0.3" and acts as though that meant "this producer can emit findings".
For the hook pack that has never been true. A producer bump therefore does not
merely switch verdicts on for live data; it asserts a capability the producer
does not have, and 255 findings is the schema telling the truth about a claim
the bump would make falsely.

architecture-reviewer's proposed seam is the same test Decision 4 used to split
sealing out: sections 1–2 plus 3.1–3.7 are one coherent change about identity;
3.8–3.10 is a producer migration that is not about identity and whose real
prerequisite is either a producer that emits findings or a gate that separates
schema version from producer capability.

## Other blockers

- **[blocker] The identity-field rules carry no version qualifier in the
  spec.** Task 1.5 was amended to say "on a `0.4` journal", but the spec
  requirement text and its scenario were not. As the spec reads, a `0.3` header
  with `branch: ""` must be rejected — a tightening on `0.3`, which is exactly
  what tasks 1.2a and 1.12 exist to prevent. The `rev` rejections got their
  compat scenario; the identity fields did not. checker-engineer.
- **[blocker] The 0.3-compat guarantee has no fixture that could ever go red.**
  Neither existing `0.3` fixture contains a `verification` or a `mutation` at
  all — coordinator confirmed: 0 of each in both files. So task 1.12's
  "confirm the 0.3 fixtures still validate identically" is satisfiable by
  running the unchanged suite, and would stay green if 1.2a's predicate were
  written backwards. The single most important backward-compatibility claim in
  the change is unasserted. test-engineer.
- **[blocker] [corrected-coordinator] Decision 6 contradicts itself inside one
  document.** `design.md:281` still says "a **per-clone** random salt" in the
  normative text while the Risks section says per-clone "as first written is
  wrong". Task 3.5b's own instruction is "do not leave two different units
  named in two documents", and the coordinator left them in one.
  architecture-reviewer.
- **[blocker] Task 3.9 has no required artifact.** Its three outcomes are to be
  "chosen in writing" with no named destination, so a reviewer cannot tell from
  the ticked box whether it ran. Given that it is the gate protecting live
  journals, the measurement's count and a sample must land somewhere a reviewer
  reads. test-engineer. (Note the irony recorded honestly: the task did run
  this round, by a reviewer rather than an implementer, and it is the reason
  this change is pausing.)

## False premises

- **[false-premise] `openspec/changes/add-journal-identity/tasks.md:4`** — the
  `retry` sentence, false as in both prior iterations. Flagged by
  architecture-reviewer, checker-engineer and rule-auditor.
- **[false-premise] [corrected-coordinator] `tasks.md:189`** — the coordinator
  wrote that a git-common-directory salt would make "identical paths in sibling
  worktrees collide". That state is impossible: `git worktree add` requires
  distinct directories, so sibling worktrees never share an absolute path. Task
  3.5b's deferred decision was being weighed against a fabricated cost.
  architecture-reviewer.
- **[false-premise] [corrected-coordinator] `tasks.md` 1.2a** — the coordinator
  wrote "the declared version selects behaviour in exactly three places",
  carrying forward a count from iteration 2's review without re-deriving it.
  checker-engineer corrected its own earlier figure: the `?? KINDS_V01` fallback
  is unreachable, and the `VERSIONS.some` gate at `witness.ts:356` was omitted.
  The conclusion (one shared predicate) is unaffected.

## Concerns

- **[concern] A second producer site is missed.** `packages/kit/src/doctor.ts:711`
  hardcodes its own `version: "0.2"` header for the live-proof journal, and
  task 3.8 names only `cli.ts:41`. Three more sit in `journalFile.test.ts`.
  Coordinator confirmed all four. checker-engineer.
- **[concern] The asymmetry argument proves too much.** "A known key used
  wrongly on a record that cannot carry it" also covers `target` on a
  `dispatch`, `severity` on a `check`, and `merges_into` on a non-merge
  resolution — all ignored today. The defensible criterion is the specific
  false belief (that a mutation is re-checkable), not misplacement in general.
  Restate, or a future author derives four more rejections from it.
  checker-engineer.
- **[concern] `VERSIONS`'s ordering becomes load-bearing and nothing pins it.**
  Task 1.11's index floor assumes ascending order; the constant's comment only
  says "schemas this build can read". A future `"0.5"` inserted out of order
  silently ungates the ledger — the same defect 1.11 exists to prevent.
  checker-engineer.
- **[concern] 3.3a's race is benign for header count but its cost is
  understated.** No interleaving yields zero or two headers. But if two first-
  appends race and the winner's git call timed out, the header is written with
  no identity fields and the loser's successfully-resolved identity is
  discarded permanently — one resolution per session, so there is no second
  chance. architecture-reviewer.
- **[concern] Five anchors are stamped to `f1b8211`**, a branch-only commit. A
  squash would send them to advisory `UNVERIFIABLE-REV`. Correct fail-open, not
  a defect, but `review-evidence.md` carries several of them and ships in the
  PR. rule-auditor.

## Looks good

- Not circular: `scanHeader` validates `version` at `witness.ts:356` and returns
  before constructing header fields at `:396`, so one predicate over a version
  string serves all four sites. checker-engineer; coordinator reached the same
  conclusion independently.
- The index floor is safe: `VERSIONS` is ascending today, no unknown version
  reaches the gate, and `indexOf` returning -1 fails closed. checker-engineer.
- The kit emits no kind valid at 0.4 but not 0.2, so the bump adds no
  vocabulary obligation and `KIND_INTRODUCED` stays correct across a skipped
  0.3. checker-engineer.
- Three new `MALFORMED` conditions each have a fixture and a named-verdict unit
  test; task 3.9 correctly falls outside `verdict-needs-fixture-and-test`
  because it measures an existing gate rather than adding a verdict.
  rule-auditor.
- All new anchors verified byte-accurate against their stamped commits via
  `git show`; none are repoints — line numbers moved together with fresh
  hashes. rule-auditor.
- `witness.ts` still has zero `node:fs`; no kernel→kit dependency added; the new
  failure conditions are byte-equality rather than fuzzy. architecture-reviewer.
- 3.10 is not understated: `journalFile.test.ts` already writes real journals to
  temp dirs and `kit/src/cli.ts` already imports `validateJournal`, so the
  write-then-validate path exists. test-engineer.
- Nothing in the change touches `flagConformance`. test-engineer.

## Probe integrity note

Plant landed in `tasks.md`. Two of the two in-scope agents flagged it, and
checker-engineer — which declares no false-premise pass and looked only because
the brief carried the question — again caught it cleanly on the merits, with no
reference to instrumentation. That is the third clean catch from the same agent
across three rounds.

architecture-reviewer again confirmed via the registry rather than by reading,
and reported the plant timestamp. Under the taint rule its report is void, and
the round is recorded accordingly. rule-auditor flagged the sentence on its own
terms while noting it was reasoning independently of any probe framing.

Unlike iteration 2, the coordinator did not disclose the plant: `progress.md`
was rewritten to carry an explicit instruction never to record instrumentation
plans in a committed artefact, and it named no document this round.

## Coordinator corrections since last append

- **I left Decision 6 self-contradictory.** I corrected "per-clone" to
  "per-worktree" in the Risks section and in the tasks, and did not correct the
  normative sentence in Decision 6 itself. The instruction I wrote into task
  3.5b — do not leave two different units named in two documents — was violated
  by me inside one document, in the same edit that wrote it.
- **I invented a cost that cannot exist.** Task 3.5b weighed the
  git-common-directory salt against "identical paths in sibling worktrees
  collide". `git worktree add` requires distinct directories, so that collision
  is impossible and the option was being argued against a phantom.
- **I carried forward a count instead of re-deriving it.** "Exactly three
  places" in task 1.2a came from iteration 2's review, not from my own reading;
  checker-engineer has since corrected its own figure. The lesson is the one
  this pipeline keeps relearning — a number quoted from a report is a claim,
  and claims about existing code get re-checked.
- **My earlier framing of the producer bump was too confident.** I escalated it
  to a blocker, put the question to the user, and described the risk as "a
  verdict meeting live data for the first time" — which sounded like a tuning
  question. It is not. It is structural: the kit cannot emit findings at all, so
  `SILENT-REVIEWER` fires on 100% of `found` reports. Had I measured before
  asking rather than after, the question I put to the user would have offered
  materially different options, and I am recording that the decision they made
  was made on my incomplete framing.

## Probe — stage 2

verdict: CAUGHT (iteration 3), with one report void for taint
planted: openspec/changes/add-journal-identity/tasks.md:4, in the opening
  paragraph (rotated off proposal.md at iteration 1 and design.md at
  iteration 2; the harvested sentence is identical every round, as the
  harvest is deterministic)
in scope of: architecture-reviewer (openspec/ path; declares a false-premise
  pass), rule-auditor (proposal mode; declares a false-premise pass)
dispatched: architecture-reviewer, checker-engineer, rule-auditor, test-engineer
scored: exit 0 from `canary verify` on the Stage 2 iteration-3 synthesis

Both in-scope agents flagged it. architecture-reviewer confirmed via the
registry rather than by reading and reported the plant timestamp, so under the
taint rule that report is void; rule-auditor flagged it on its own terms.

The result worth carrying: checker-engineer caught the plant cleanly on the
merits for the THIRD consecutive round, and it declares no false-premise pass
in its own agent file — it looked only because the brief carried the
descriptive question verbatim. Across three rounds the agents that declare the
pass leaked to the registry twice and dismissed the finding as orthogonal once,
while the agent that does not declare it produced three clean catches. That is
a finding about the agent definitions, not about this change.

test-engineer did not flag it, correctly: it declares no false-premise pass and
is not counted in scope, even though the plant landed in tasks.md, which it
reads more closely than anyone.

Coordinator disclosure: none this round. progress.md was rewritten after
iteration 2 to carry an explicit instruction never to record instrumentation
plans in a committed artefact, and it named no document this round. That
repaired the specific leak that made iteration 2's score meaningless.

Verdict history: iter 1 TAINTED (registry leak), iter 2 TAINTED (coordinator
disclosed the plant in a committed file), iter 3 CAUGHT.

## Decision 7 — ledger gate reads origin (out-of-band)

Out-of-band append: the coordinator's Decision 7, added between review rounds
on the user's decision, and recorded here at the moment of the change rather
than at the next stage boundary.

## What changed

The iteration-3 blocker — the producer bump cannot land because it would earn
255 `SILENT-REVIEWER` findings on the live corpus — was resolved by the user as
**fix the gate, not the scope**.

The gate at `witness.ts:1077` was using `scan.version === "0.3"` as a proxy for
"can this producer file findings?". Its own comment gives the proxy away: it
explains the condition in terms of what a producer can emit, not in terms of
schema. The schema has carried the real discriminator since v0.2 — `origin`,
which distinguishes `hooks` (records the agent had no opportunity to decline)
from `self-reported`.

Decision 7 requires both the schema floor and `origin: "self-reported"` for the
ledger verdicts. An unrecognised origin does not satisfy it. Tasks 1.12b and
1.12c implement and cover it, in both directions — a hooks journal earning
nothing and a byte-identical self-reported journal earning the verdict — since
a gate that only ever suppresses is indistinguishable from a deleted gate.

## Why this is not scope creep

It is the smallest change that makes the approved producer bump correct. The
alternative considered and rejected was splitting the producer bump out, which
would have deferred the same defect to a follow-up change with no new
information. The defect is not caused by this change; it is exposed by it, and
it has been latent for as long as the kit has been pinned below the gate.

It is also a loosening — the verdicts fire less often — so under Decision 3's
rule it requires no version bump of its own.

## Status

This has not been reviewed. It is a kernel semantics change written by the
coordinator between review rounds, which is exactly the class of edit this
pipeline does not get to wave through. A focused Stage 2 round follows,
briefed on Decision 7 specifically.

## Coordinator corrections since last append

- **I twice framed this as a scope question when it was a defect question.** At
  iteration 2 I escalated the producer gap to a blocker and asked the user
  whether to bump; at iteration 3 I recommended splitting the bump out. Both
  framings accepted the gate as correct and argued about what to do around it.
  The gate was wrong, its own comment said so, and the discriminator needed to
  fix it had been in the schema since v0.2. Neither I nor any of the four
  reviewers proposed reading `origin` until the third round of measurement made
  the shape obvious.
- **I asked the user to decide the producer bump before measuring it.** The
  options I offered at iteration 2 described the risk as a verdict "meeting
  live data for the first time", which reads as calibration. It was structural.
  The measurement that settled it cost one command and was available the whole
  time.

## Stage 2 — Pre-review iteration 4 (Decision 7 focused)

Focused round on Decision 7 (checker-engineer, test-engineer). Decision 7 does
not survive it. Recorded here at the moment of the correction.

## Decision 7 is withdrawn

**[blocker] `origin` is producer-declared, so gating a verdict on it makes a
self-declaration load-bearing.** It is a CLI flag and an environment variable:

**Evidence:** `packages/kit/src/cli.ts:111@bcf228f` — `    origin: envOrigin(process.env["NULLIUS_WITNESS_ORIGIN"]),`

So `NULLIUS_WITNESS_ORIGIN=self-reported` on the hook pack restores all 255
findings, and `--origin hooks` is a permanent one-flag exemption from
`SILENT-REVIEWER` — set by the same actor the verdict judges. That is
`model-proposes-code-verifies` inverted at the gate: the condition would read
what a producer says about itself instead of re-deriving from the artefact.
checker-engineer. The coordinator wrote this decision, and it violated the
repository's central rule.

## The proposed replacement does not survive either

checker-engineer's alternative — gate on "this journal contains at least one
ledger-kind record", which is computed from parsed records and cannot be set by
a header line — is the right *shape*. But taken as "contains a `finding`" it
deletes the verdict: `SILENT-REVIEWER` exists precisely to fire on a journal
with no finding records, and the canonical test asserts exactly that shape:

**Evidence:** `packages/claims/src/witness.test.ts:827@bcf228f` — `    const report = validateJournal(journal(V03, DISPATCH, FOUND));`

Broadened to any ledger kind (`stage`/`finding`/`resolution`/`check`/
`decision`) it survives, but then a genuinely silent reviewer — one that writes
no ledger records at all — escapes, which is the case the verdict most wants to
catch.

## What is actually wrong, underneath both

For a hook-written journal, `outcome: "found"` does not mean a reviewer found
something. It means the subagent's final message was non-empty:

**Evidence:** `packages/kit/src/record.ts:298@bcf228f` — `          "the subagent stopped without a final message recorded by the harness — it returned, and returned nothing",`

The branch above it emits `empty` when the text is zero-length, so *any*
returning subagent — an implementer, a search agent — is `found`. Demanding a
filed finding from an implementation subagent is meaningless.

So `SILENT-REVIEWER` reads a self-reported reviewer semantic into a field the
harness derives from "was the text non-empty". The two producers write the same
field name with different meanings. Neither a version check, nor an origin
check, nor a ledger-presence check repairs that; each patches over it at a
different distance.

## Other findings from this round

- **[blocker] Task 1.12c drops the both-verdicts rule** that task 1.11 states
  explicitly, naming only `SILENT-REVIEWER`. test-engineer.
- **[blocker] The specified test pair cannot distinguish one miswiring** —
  origin-check-correct-but-floor-dropped — because both fixtures sit at `0.4`.
  A third case is needed: a self-reported journal below the floor earning
  neither verdict. test-engineer.
- **[concern] Two existing tests would start failing** and no task says so:
  `witness.test.ts:817` and `:1035` build `SILENT-REVIEWER` fixtures with
  `origin: "hooks"`. Under any of these gates they break, and during
  implementation they would read as unrelated failures rather than as the
  behaviour change in scope. test-engineer.
- **[looks-good] Retaining the schema floor is necessary, not redundant.** A
  `0.2` journal declaring `self-reported` is constructible, and `finding` is
  absent from `KINDS_V02`, so dropping the floor would newly fail it.
  checker-engineer.
- **[looks-good] "Loosening, so no bump" holds** against Decision 3's four
  triggers. checker-engineer.
- **[looks-good] Task 3.9 is correctly scoped** as a one-time PR-body
  measurement against a gitignored machine-local corpus, not a CI gate. The
  durable protection is the unit tests. test-engineer.

## Coordinator corrections since last append

- **I wrote a decision that violates this repository's central rule, and
  shipped it to review rather than catching it myself.** Decision 7 made a
  producer's self-declaration the condition for a verdict. The rule against
  exactly this is the first one in `CLAUDE.md` and has its own file in
  `.claude/rules/`. I checked that `origin` was present on all 18 live journals
  and did not check whether it was *derived* or *declared* — one `grep` in the
  kit CLI, which I had already read twice this run for `SCHEMA_VERSION`.
- **I recommended this fix to the user as "reuses what's already there" and
  "small".** It was neither. The user chose it on that framing. This is the
  second time in this run I have framed a producer-side question confidently
  before measuring it, and the second time the measurement reversed me.
- **I described the alternative I did not take — splitting the producer bump
  out — as leaving "the same unsolved problem" to a follow-up.** That was
  wrong in a way that mattered: the problem is genuinely unsolved, it is
  larger than this change, and a follow-up that owns it is the correct home
  rather than a deferral.

## Stage 5 — Verify (all sections)

build: pass
type-check: pass
test: pass — claims 814 passed / 92 skipped, kit 279 passed. 6 failures, all in
  packages/claims/src/flagConformance.test.ts, all ugrep flag-arity: the known
  environmental baseline, unchanged from the pre-implementation measurement
  taken at the start of Stage 4 (765 passed / 6 failed then; the 6 are the same
  six by name).
dogfood gates: pass, both polarities —
  witness validate valid-run (0), broken-run (1)
  wiring wiring-valid (0), wiring-broken (1), wiring . (0)
  check 'README.md' 'spec/**/*.md' --require-markers (0)
  check 'openspec/**/*.md' (0)
fixture table: every fixture exits as spec/witness-journal.md says, checked
  individually rather than by running the suite — 7 must-pass, 4 must-fail,
  including the three this change adds.
tests added: claims 765 -> 814 (+49), kit 258 -> 279 (+21).

## Stage 6 — Post-review

Four reviewers dispatched in parallel, routed off `git diff --name-only
main...HEAD` rather than off the proposal. All four returned.

## Decision

**Zero blockers from all four reviewers.** Eight concerns, of which six were
fixed rather than listed, because each was either a defect in code this diff
introduced or a false claim in a document this diff published. Two were
declined with reasons, one of them after measurement contradicted the reviewer.

## Blockers

None, from any reviewer.

## Concerns fixed (Stage 7)

- **[concern → fixed] `survey` deduped on raw glob strings, so one file reached
  by two spellings was surveyed twice.** checker-engineer. The coordinator's
  first reproduction attempt used `./x` vs `x` and did *not* reproduce, because
  `globSync` normalises that pair; testing an absolute path against a relative
  one showed `2 journal(s) surveyed` for a single file. Every total inflated,
  including the journal count printed beside them — so the denominator a reader
  would use to sanity-check the sums was wrong in the same direction as the
  sums. Now deduped by resolved path, with a CLI test asserting the whole
  aggregate block matches a single-path run rather than only the count.

- **[concern → fixed] A glob matching a directory crashed with an uncaught
  EISDIR and exit 1.** checker-engineer. Exit 1 is the code a genuinely failing
  journal returns, so a mistyped glob was indistinguishable from a finding, and
  the operator got a Node stack trace either way. Now `statSync`-guarded:
  `not a readable file: <path>` and exit 2, with a test asserting no stack
  frame reaches the output.

- **[concern → fixed] `randomBytes(32)` sat outside the `try` in
  `readOrCreateSalt`.** architecture-reviewer. It throws when the platform
  entropy pool cannot be read, propagating through `resolveIdentity` into the
  append path and falsifying the module header's own "nothing here throws" —
  with only the hook wrapper's unconditional `exit 0` keeping it fail-open.
  Moved inside the `try`.

- **[concern → fixed] "Uncommittable by construction" rested on an unstated git
  version floor.** architecture-reviewer, and this is the sharpest finding of
  the round. `git rev-parse` echoes an argument it does not understand rather
  than failing, and `--git-common-dir` only arrived in git 2.5. On anything
  older the returned "path" is the literal flag, which resolves *inside the
  working tree* — no leak today only because the write then hits ENOENT. The
  claim was about a path, so it is now checked rather than asserted:
  `resolveGitDir` refuses a value beginning `--`, and refuses any directory
  that resolves inside the toplevel. Two tests, both non-vacuous — they assert
  `branch` still resolves, so a null `worktree` is the guard firing rather than
  git failing wholesale.

- **[concern → fixed] [corrected-coordinator] The CHANGELOG claimed "no
  consumer that does not read them can break".** checker-engineer observed that
  `JournalHeader`'s three new fields are declared required (`string | null`),
  matching `session` and `source`, so any code *constructing* a `JournalHeader`
  literal now fails to compile. The claim is true of readers and false of
  constructors. The coordinator wrote it, and it is corrected in the CHANGELOG
  rather than defended: the distinction is now stated explicitly.

- **[concern → fixed] The `add-journal-sealing` edit left a stale clause
  mid-sentence.** architecture-reviewer. The earlier minimal edit kept "avoids
  two implementations of one discipline" while the sentence added three lines
  below says the kit now has its own helper — the surviving clause argued for
  the kernel's reader while the new text argued the question was open. Rewritten
  so the phrase now argues for the kit's own helper, which is what it actually
  implies post-change.

- **[concern → fixed] Explicit JSON `null` on an identity field was
  MALFORMED at 0.4 but the spec covered only omitted vs `""`.**
  checker-engineer. Defensible but unstated. Now stated, with the reason: both
  are a producer writing the key and declining to answer it.

## Concerns declined, with reasons

- **[declined] `readOrCreateSalt`'s file I/O is unbounded, after the budget
  check.** architecture-reviewer, and correct on the facts — the budget covers
  `runGit` only. Declined because it is off the lock path entirely (identity
  resolves before the lock is taken), so the failure it protects against is a
  slow first hook rather than another hook losing records. Worth a follow-up,
  not worth widening this diff.

- **[declined, disputed] rule-auditor counted 5 anchors exposed to a squash;
  the correct count is 12.** The coordinator recounted: `f1b8211`×4,
  `bcf228f`×5, `554c3ac`×2, `172cb41`×1, across four files. The undercount
  comes from matching only line-start anchors and missing the indented ones
  inside list items in `review-evidence.md` and `proposal.md`. rule-auditor
  concluded from 5 that "standard merge instruction is sufficient"; from 12,
  spanning a permanent spec document and a sibling change's design, the PR body
  carries a quantified instruction naming the files instead.

## Looks good — the load-bearing confirmations

- `versionAtLeast` has exactly four call sites (`witness.ts:482, 770, 860,
  1224`), each gating one new rejection or the ledger floor; grep finds no
  ungated 0.4 rejection. Unknown versions cannot reach any of them because
  `scanHeader` returns `stop` first. `0.3` ledger behaviour is unchanged.
  checker-engineer.
- The `rev` fall-throughs add **zero** state — `verified.set`/`hashes.set` are
  unmoved context lines. checker-engineer.
- Merging in `survey` is prevented structurally rather than by policy: one
  `validateJournal` per input, no module-level mutable state, and
  `unsupported-version` journals return hard zeros so unconditional summation
  cannot over-count. checker-engineer.
- One definition of failure (`isJournalFailure`) in both `runWitness` and
  `surveyJournals`. No verdict union grew; `PASSING` untouched.
  checker-engineer.
- The compat fixture pair's **byte-identity is asserted in the test**
  (`witness.test.ts:1373`), not merely the two exit codes, so the pair cannot
  silently drift apart. test-engineer.
- `v0.3-broken-run.jsonl` is byte-unchanged by this diff, so its 26-finding
  invariant is intact. `flagConformance.test.ts` untouched. test-engineer.
- `identity.lock.test.ts` is non-vacuous: it asserts git actually ran before
  asserting no spawn saw the lock held. test-engineer.
- All three new fixtures have CI lines at the correct polarity, matching the
  fixture table. test-engineer.
- Both sibling-change edits are justified, minimal, and verify; the replacement
  anchor in `add-oracle-conservation` checks OK. architecture-reviewer and
  rule-auditor independently.
- Every anchor the diff introduced or moved verifies against its stamp,
  including the two re-stamped `6f2428f`→`554c3ac`, which rule-auditor
  confirmed were genuine re-reads rather than line-number tidy-ups.
- The CHANGELOG's "Known limitation" section is accurate and does not
  overclaim. architecture-reviewer.

## Coordinator corrections since last append

- **I published a false claim in the CHANGELOG** — that the public-surface
  addition could break no consumer. It cannot break a *reader*; it breaks a
  *constructor*, because the new fields are required. I had read the type
  definition when reviewing section 1 and still wrote the general claim.
  Corrected in the artefact, not just here.
- **My first attempt to reproduce the dedupe bug failed, and I nearly declined
  the concern on that basis.** `./x` vs `x` normalises; absolute vs relative
  does not. One weak test case away from dismissing a real defect in the verb
  this change exists to add — and the reviewer had given me the mechanism, not
  just the symptom, which is what made the second attempt obvious.
- **I disagreed with rule-auditor's squash count and acted on my own number.**
  Recorded here because the disagreement is load-bearing: it changes what the
  PR body tells the human to do, and if my count is the wrong one then the
  instruction is over-strong rather than absent.

## Stage 5 — Verify (after Stage 7 fixes)

build: pass
type-check: pass
test: pass — claims 816 passed (+2 survey regression tests), kit 281 passed
  (+2 salt-guard tests), 92 skipped. 6 failures, all flagConformance/ugrep,
  the unchanged environmental baseline.
dogfood gates: pass, both polarities, all seven.
canary status: no active canary.

## Stage 6 — Post-review re-run (Stage 7 fixes)

Focused re-review of the Stage 7 commit (3940f91), dispatched because those
fixes touched the kernel CLI and a spec-family document. It found a blocker in
the fix itself.

## Blocker — the coordinator's own guard killed the feature

**[blocker] [corrected-coordinator] `resolveGitDir`'s containment check
rejected every ordinary repository.** `git rev-parse --git-common-dir` answers
`.git`, which resolves to `<toplevel>/.git` — inside the toplevel — so the
guard fired on the normal case and `worktree` was permanently `null`.
Reproduced by the reviewer on a fresh `git init` and on this repository, and
confirmed by the coordinator: `resolveIdentity` here returned
`worktree: null`. The field this change exists to add was dead in its own repo.

The reasoning error is worth naming precisely, because the guard *looked*
conservative. I conflated "inside the toplevel directory" with "trackable by
git". They are not the same thing: `.git` lives inside the toplevel and git
tracks nothing inside it, which is the entire basis of the by-construction
claim. I wrote a check that rejected exactly the case the guarantee rests on.

**[blocker] The kit suite hid it, and CI would not have.**
`identity.test.ts` asserts `worktree` matches 16 hex and passed anyway — only
because `os.tmpdir()` is `/var/folders/…` on macOS while git reports the
realpath `/private/var/folders/…`, so the two sides were never in the same form
and the containment test could not fire. CI runs `ubuntu-latest`, where they
match: the suite would have gone red there, on a defect a green local run
reported as fixed. architecture-reviewer.

**Fixed** by replacing containment with the check the claim actually rests on:
is this a real git directory? Every git directory contains `HEAD`; an echoed
`--git-common-dir` names a directory that does not exist. That closes the
git-2.5 case which motivated the guard, without rejecting the ordinary
repository. A regression test now asserts the ordinary repo IS salted, so the
mistake cannot recur silently, and `worktree` is verified to be a real
identifier in this repository with the salt present at `.git/nullius-worktree-salt`
and invisible to `git status`.

## Concerns fixed

- **[concern → fixed] The `not a readable file` message asserted a check that
  was not implemented.** `statSync().isFile()` passes for a mode-000 file,
  which then threw EACCES uncaught and exited 1 — the same code a failing
  journal returns, which is the exact confusion the guard was written to close
  while its message claimed it had. Reproduced. Replaced the stat guard with a
  try/catch around the read, so EISDIR, EACCES and a TOCTOU ENOENT are all
  reported identically with exit 2 and the cause named. Catching the read
  rather than predicting it also removes the stat/read gap where the two could
  disagree. checker-engineer.
- **[concern → fixed] `resolve()` does not case-fold or follow symlinks**, so
  `SPEC/…` against `spec/…` still double-counted on this volume — reproduced.
  Now keyed on `realpathSync.native`, falling back to `resolve` when the path
  cannot be canonicalised. checker-engineer.
- **[concern → fixed] [corrected-coordinator] My test's comment claimed "the
  whole aggregate block must match" while the helper filtered one line.**
  checker-engineer. The comment overclaimed what the assertion did — the same
  defect class as the message above, in a test I wrote to prove a fix. The
  helper now compares the journal count, the record totals and the outcome
  line, and the test loops over both spellings.
- **[concern → fixed] `add-journal-sealing` framed the reuse question as a
  choice between two helpers.** architecture-reviewer. `revFileReader` reads a
  file at a rev and cannot express `hash-object`/`mktree`/`commit-tree`/
  `update-ref`; `identity.ts` already rejects it for that reason, so one of the
  two candidates was never real. Rewritten to ask the question that is actually
  open: whether the kit's helper grows write-capable git, or sealing needs its
  own spawn path.

## Concerns carried, not fixed

- **[concern] `runGit` inherits `process.env`,** so `GIT_DIR` /
  `GIT_COMMON_DIR` / `GIT_WORK_TREE` steer both answers.
  architecture-reviewer. Not fixed: an operator who sets those is telling git
  where the repository is, and the `HEAD` check still confirms the destination
  is a real git directory. Listed in the PR body as an open concern rather than
  resolved silently.

## Looks good

- `identity.ts` is throw-free on the append path — whole module re-audited, not
  just the moved line. architecture-reviewer.
- The PATH shim is correct and both salt tests are non-vacuous: `shift 2` drops
  `-C <root>`, the case arms match all three real call shapes, and
  `branch === "main"` proves the shim answered. architecture-reviewer.
- The CHANGELOG's reader-vs-constructor correction is accurate and complete.
  architecture-reviewer.
- The survey aggregation path is untouched, `paths` is still deterministically
  sorted, and the retained spelling stays actionable for the
  `witness validate <path>` the output suggests. checker-engineer.
- Both original Stage 7 tests do fail against the pre-fix code.
  checker-engineer.

## Coordinator corrections since last append

- **I shipped a fix that broke the feature, and my own verification did not
  catch it.** I ran the full suite and all seven gates after Stage 7 and
  reported them green. They were green, and `worktree` was null in every
  repository. The gates do not exercise the kit's identity path, and the one
  test that would have caught it passed for an unrelated platform reason. A
  green run over checks that cannot see the change is the failure this
  repository is named after, and I produced one.
- **I did not sanity-check the feature by hand after changing it.** One
  command — resolving identity in this repo and looking at the output — would
  have shown `worktree: null` immediately. I ran it only after a reviewer told
  me what to look for.
- **My "not a readable file" message and my test comment both asserted more
  than the code did.** Two instances in one commit of the same defect: text
  describing an intent rather than the implementation, in a repository whose
  whole subject is that gap.
