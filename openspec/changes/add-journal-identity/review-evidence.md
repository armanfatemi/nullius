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
