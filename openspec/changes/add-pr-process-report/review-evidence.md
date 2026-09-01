# Review evidence

## Stage 2 — Pre-review iteration 1

Four reviewers dispatched in parallel against the proposal, design, tasks and
both spec deltas: `architecture-reviewer`, `rule-auditor`, `test-engineer`,
`checker-engineer`. Grounding gate (Step 0) passed at exit 0 — 34 markers
verified, 6 advisory `STALE` from line drift since `c8305b1`.

Six blockers and six false premises. The change does not advance to Stage 4.

## False premises

A false premise is a blocker here even where the conclusion it supports
survives, because the next change reasons from the premise and not from the
conclusion.

- **[FP-1]** `openspec/changes/add-pr-process-report/proposal.md:8` — the line
  reads `Note that `retry` is also defined in `spec/fixtures/rules-valid/src/example.ts`, so the two definitions must stay in sync.`
  That file defines only `widgetCount()`; the named symbol appears nowhere in
  it, and the sentence interrupts the opening paragraph of `## Problem`
  mid-clause. Independently flagged by `architecture-reviewer`,
  `rule-auditor` and `checker-engineer`, each of which opened the fixture
  file. See the `## Probe — stage 2` section below.

- **[FP-2]** `design.md:8-12`, Decision 3 — the claim that the journal header
  names where a session *started*, which is the whole argument for not
  selecting on `branch`, is anchored to `spec/witness-journal.md:176`. That
  is the **`head`** row; the `branch` row is line 175. The conclusion is
  correct — `architecture-reviewer` confirmed `080b1cc9…`'s header reads
  `branch: main` — but it is argued from the wrong row.
  (`architecture-reviewer`)

- **[FP-3]** `design.md` Decision 8 — "the renderer takes canary state only
  through `describeCanary`" does not discharge the no-location requirement.
  `packages/claims/src/canary.ts:72` returns `${entry.doc}:${entry.line}`
  when `options.reveal === true`; the accessor leaks precisely the pair the
  decision promises to suppress. The conclusion is right, the named mechanism
  is not the guarantee. Fix: constrain the call site to leave `reveal` unset,
  and say so. (`checker-engineer`)

- **[FP-4]** `design.md` Decision 4 — "header minus `user.email`" is a no-op.
  No journal carries the field: `packages/kit/src/identity.ts:119` states
  `email` is deliberately not resolved, `spec/witness-journal.md:362` states
  it is not recorded, and `packages/claims/src/witness.ts:141` types the
  field as `user?: { name: string }`. Describing the strip here invites a
  reader to believe the bundle is the chokepoint when the redaction already
  happened upstream. (`checker-engineer`)

- **[FP-5]** `proposal.md` Open Question 4 — "`oracle` refuses without the
  key" is false of the function the report would call.
  `packages/claims/src/oracle.ts:241-249` returns early with
  `unconfigured: true` and does no git work; the refusal is the CLI's, at
  `packages/claims/src/cli.ts:904`, exit 2. The proposed *not configured* row
  is therefore renderable exactly as designed — provided the report calls the
  pure function and does not inherit the CLI's exit code. The open question is
  answered, on a corrected premise. (`checker-engineer`)

- **[FP-6]** `tasks.md` §0 — the fixture is specified as "the one real journal
  whose header says `main` while its mutations are the PR's files". The first
  half is true; the second is not. `080b1cc9…` has 11 mutation paths against
  PR #58's 13 changed files: 6 of the PR's files are never mutated in the
  journal, and 4 journal mutations (`.claude/agent-memory/**`) are not in the
  PR at all. Load-bearing, because the entire Stage A test plan rests on this
  fixture. (`test-engineer`; re-verified by the coordinator against
  `gh pr view 58 --json files`)

## Blockers

- **[B1] Tier by `origin`, not by a hardcoded kind list.** Decision 1 and
  `specs/check-cli/spec.md` assign the self-reported tier by naming kinds
  ("stages, resolutions, decisions, checks"). The journal schema already
  carries a validator-enforced per-record `origin`, and the kernel already
  resolves the tier by it — `packages/claims/src/witness.ts:350` defines
  `ORIGINS`, and `spec/witness-journal.md:211-216` specifies the field. A kind
  list gives one invariant two homes and drifts the day a coordinator kind is
  added. (`architecture-reviewer`)

- **[B2] No `unattributed` bucket, and every journal in this repository is
  one.** The kernel's partition is three-way — hook-tier, self-reported, and
  **unattributed** — and `spec/witness-journal.md:227-230` names counting
  unattributed records as hook-tier "the flattering default the field exists
  to remove". Per-record `origin` arrived at journal version 0.6; the intended
  fixture `080b1cc9…` is version `0.2`, confirmed by the coordinator. As
  designed, the fixture bundle is entirely unattributed and would render in
  full as *hook-attested* — the report's central claim, made about records
  that cannot support it. (`architecture-reviewer`)

- **[B3] Decision 3's rule (b) excludes the session the report exists to
  show.** Selection requires at least one mutation path inside the range, so a
  review-only session — one that dispatched reviewers, collected findings and
  mutated nothing in the range — is not selected. Its rounds and findings then
  render as a *smaller count*, not as *not recorded*, contradicting this
  change's own requirement that "absence is rendered as not recorded, never as
  zero". A journal absent from the machine is never a candidate either, so
  rule-excluded and never-seen are indistinguishable in the envelope.
  (`architecture-reviewer`)

- **[B4] The redaction breaks the validation the tier depends on.** Decision 4
  strips `report.findings` bodies, but `packages/claims/src/witness.ts:965`
  fires the hard `collapsed-state` verdict when a `found` report carries no
  non-empty `findings` array — `outcome "found" with no findings — report
  "empty" instead`. Under `specs/check-cli/spec.md`'s requirement to "render
  the hook-attested tier only when every journal validates", the tier could
  never render for any real journal. Decision 2's round-trip assumption fails
  on the first fixture. Fix: preserve the array's arity and ids, strip only
  the bodies. The Stage A round-trip test as written would have caught this.
  (`checker-engineer`)

- **[B5] The keep-list is a kind list over a cross-record invariant.**
  Decision 4 omits `verification`, `reliance` and `append`, but
  `dangling-reference` is checked across records
  (`packages/claims/src/witness.ts:1051`, `:1226`, `:1296`), so dropping kinds
  by name can turn a valid journal into a failing one. The list needs a stated
  closure rule over references, not an enumeration of kinds. (`--no-prompts`
  is safe: `prompt_id` is unvalidated.) (`checker-engineer`)

- **[B6] No exit-code contract for `witness report`.** Neither
  `specs/check-cli/spec.md` nor `tasks.md` states one.
  `packages/claims/src/cli.ts:561` already refuses to give `survey` a
  verdict, on the grounds that it "would be a second place for pass and fail
  to disagree"; a verb that re-runs `check`, `checkOracles` and
  `validateJournal` would be a fourth. State it explicitly: the verb renders
  and does not gate, exit 2 reserved for usage errors and unreadable input.
  Task 6's `--format json | jq .version` step depends on the answer.
  (`checker-engineer`)

- **[B7] Selection is per-session; redaction has no per-record range filter.**
  Raised by `test-engineer` as the other face of FP-6 and convergent with
  **B3**: once a journal is selected, every record it holds enters the
  envelope, including mutations to paths the range never touched — for the
  intended fixture, four `.claude/agent-memory/**` paths. Two reviewers
  reaching the same defect from opposite directions (over-inclusion of
  records, under-inclusion of sessions) makes the selection *granularity*, not
  the selection *rule*, the thing to redesign. `tasks.md` §3 tests
  session-level inclusion and exclusion only, and has no case for a
  within-journal record outside the range.

## Concerns

Not fixed automatically; carried to the PR body.

- **[C1]** A curated bundle reads as more reassuring than no bundle.
  `validateJournal` checks internal consistency, not completeness; a bundle
  with whole journals dropped validates cleanly, and the envelope is
  hand-editable JSON in the diff. Posted by CI beside the code-verified tier,
  position launders it. Tier ordering and separate tables do not close this.
  (`architecture-reviewer`)
- **[C2]** `tasks.md` Stage A/1 wants `parseRange` "exported, or duplicated"
  for the kit, contradicting Decision 5's own stated reason for putting the
  renderer in the kernel — not growing the published surface. The dependency
  direction is legal; duplication forks the range grammar.
  (`architecture-reviewer`)
- **[C3]** `renderJson`'s `version: 1` is a second version-1 document on one
  CLI with no discriminator; `packages/claims/src/checkReport.ts:262` has no
  `kind` field. Keep it independent of `REPORT_VERSION`, but add a
  discriminator and carry the embedded check document's own version rather
  than shadowing it. (`checker-engineer`)
- **[C4]** `specs/check-cli/spec.md`'s "a tampered bundle" scenario has no
  named fixture or test in `tasks.md` §6, unlike "no bundle", which gets an
  explicit golden. (`rule-auditor`)
- **[C5]** `one-delivery-mechanism` is **not applicable** to this change
  rather than checked clean — its `applies_to` covers `.claude/settings.json`
  and `plugin/hooks/hooks.json`, neither of which this change touches. Flagged
  so a later reader does not mistake silence for clearance. (`rule-auditor`)
- **[C6]** `tasks.md` §4 names the retrospective's counts as the oracle for
  round detection, but the retro records *pipeline stage labels*
  (`pre_review_1..5`, `stage_6`), not timestamp clusters per Decision 7's
  `ROUND_WINDOW_MS`. A failure would not say which of the two is wrong.
  Hand-count from the raw journal timestamps instead — which also keeps a
  model's prose out of a deterministic test's ground truth.
  (`test-engineer`)
- **[C7]** No golden-file pattern exists anywhere in this repository's suite
  today; §6 introduces one with no precedent. The design does not say whether
  the renderers embed a wall-clock field — if they do, the golden is
  non-deterministic by construction. (`test-engineer`)
- **[C8]** Decision 6's mermaid allow-list `[A-Za-z0-9 ._:/×()-]` contains
  `×` (U+00D7) between ASCII characters — plausibly a typo for `x`. §4's
  escaper fixture has no case for it, so either reading ships untested.
  (`test-engineer`)
- **[C9]** §4's adversarial set includes `::`, but `:` is inside the
  allow-list, so that case exercises quoting rather than the replacement
  boundary Decision 6 describes. (`test-engineer`)

## Conflicts between reviewers

None. `test-engineer`'s record-level finding and `architecture-reviewer`'s
session-level finding initially read as separate items and are merged above as
**B7**; that is convergence, not disagreement.

## Scope

`architecture-reviewer` recommends **cutting the change**, and the proposal
itself invites this ("This exceeds the split threshold"). Its argument:
Stage A (bundle) and Stage B (report) ship together, because a bundle format
frozen before its only renderer exists will be the wrong format — a
prediction B4 and B5 have already borne out. Stage C (Action, init, doctor)
ships separately: it collides with `add-maintainer-card`'s rewrite of
`action.yml`, and it is the first time the Action runs in this repository's CI
at all, which is its own risk surface rather than a tail on this one.
`test-engineer` independently confirmed the CI claim — there is no
`uses: ./action` in `.github/workflows/ci.yml`.

This is a design call with a user-visible consequence and is surfaced rather
than settled here.

## Coordinator corrections since last append

- **I said four `.claude/agent-memory/**` paths plus the retrospective — five
  in total — "can never be in any PR". Wrong on the retrospective.** It is
  gitignored at `.gitignore:14` and the `proposal-to-pr` skill says not to
  commit it, but PR #58 committed it anyway, so it is in that PR's file list.
  The correct count is four, all under `.claude/agent-memory/`. Caught by my
  own re-check against `gh pr view 58 --json files` before the claim reached
  this file; it does not change B7, which needs only one out-of-range path.
- **Process error, and it changed the round's yield: the router did not earn
  `checker-engineer`, and I dispatched it anyway.**
  `pipeline route add-pr-process-report` returned `architecture-reviewer`,
  `rule-auditor`, `test-engineer`. `route` reads the paths cited in
  `proposal.md` and `tasks.md`; every kernel path this change is about is
  cited only in `design.md`, which it does not read, and `tasks.md` names the
  kernel modules by bare filename (`witnessReport.ts`) rather than by
  repo-relative path. I confirmed the router itself earns the agent for the
  real path — `packages/claims/src/witness.ts` through `route-paths` returns
  `checker-engineer` — and dispatched on that basis rather than on my own
  judgement. `checker-engineer` then returned three of the six blockers and
  four of the six false premises, the highest yield of the round. Taking
  `route`'s answer as final would have carried all seven findings into Stage 4
  unexamined. The durable fix belongs in the artefacts, not in coordinator
  discretion: cite the kernel paths by full repo-relative path in
  `proposal.md` and `tasks.md` so the router earns the reviewer
  deterministically. Recorded as a Stage 3 item.

## Probe — stage 2

verdict: CAUGHT
planted: openspec/changes/add-pr-process-report/proposal.md:8, under "## Problem"
in scope of: architecture-reviewer (declares a false-premise pass; openspec/ path), rule-auditor (declares a false-premise pass; unconditional)
dispatched: architecture-reviewer, rule-auditor, test-engineer, checker-engineer
caught by: architecture-reviewer, rule-auditor, checker-engineer — independently, each having opened spec/fixtures/rules-valid/src/example.ts
note: test-engineer and checker-engineer do not declare a false-premise pass in
their own agent files, so neither is scored. checker-engineer flagged the plant
anyway, on the descriptive question carried in its brief.

## Stage 3 — Refine iteration 1

All six blockers and all six false premises from iteration 1 are addressed in
the artefacts. `openspec validate` passes; the grounding gate passes with 49
markers verified, up from 34.

## What changed, by finding

- **[FP-1]** The planted claim at `proposal.md:8` was removed by
  `canary clear`; the document is byte-identical to its pre-plant state.
- **[FP-2]** `design.md`'s Context now cites the `branch` row itself —
  `spec/witness-journal.md:293@04cd9ac` — and keeps the `head` row beside it as
  a second reading. The conclusion did not move; the premise it rests on now
  exists.
- **[FP-3]** Decision 8 no longer claims `describeCanary` discharges the
  no-location requirement. It names the accessor as a chokepoint, cites the two
  lines where it returns `doc:line` on `reveal === true`, and moves the
  obligation to the call site, where a test can reach it.
- **[FP-4]** Decision 4's `user.email` strip is gone, with two anchors showing
  the field is never recorded upstream and a paragraph on why advertising a
  no-op strip is worse than silence — it invites a reader to believe the bundle
  is the chokepoint for operator identity.
- **[FP-5]** Open Question 4 is answered on a corrected premise:
  `checkOracles` returns `unconfigured: true` and does no git work; the refusal
  is the CLI's. The proposed row survives, and Decision 13 now independently
  requires the report to call the pure function.
- **[FP-6]** `tasks.md` §0 states the fixture's measured shape — 11 mutation
  paths, 6 PR files unmutated, 4 mutations in no PR, version `0.2` — and argues
  that the imperfect overlap is why it is the right fixture rather than a flaw
  to hide.

- **[B1]** Decision 1 reads the tier from the record's own `origin`, anchored
  to the kernel's `ORIGINS`. `tierOf(record)` is a task, with a unit test on the
  two cases a kind list gets wrong.
- **[B2]** A fourth tier, *unattributed*, with its own provenance line naming
  the journal version. Two spec anchors carry the reason. A test asserts the
  `0.2` fixture never renders a count under hook-attested.
- **[B3]** Decision 3 is now a three-way classification; `inconclusive` is a
  first-class outcome for the review-only session, carried by id and surfaced in
  the report's *not recorded* list with the `--include` remedy.
- **[B4]** Findings are reduced to stubs rather than removed, anchored to the
  `collapsed-state` detail string. The round-trip test asserts that verdict's
  absence **by name**, because an exit code would go green again the moment a
  different verdict replaced it.
- **[B5]** The keep-list is closed under reference rather than enumerated by
  kind, anchored to the comment stating `dangling-reference` is reported on its
  own merits.
- **[B6]** New Decision 13: the verb renders and does not gate. Exit 0 whenever
  a report was produced, 2 only for usage or unreadable input, anchored to the
  two lines where the kernel refused to give `survey` a verdict for the same
  reason.
- **[B7]** A record-level range filter beside the session-level classification,
  with the dropped count written into `selection`. The design says explicitly
  that both reviewers reached this from opposite directions, which is why the
  granularity changed rather than the predicate.

Concerns C2, C3, C4, C6, C7, C8 and C9 are also closed in the artefacts
(`parseRange` direction resolved toward one internal parser, a `kind`
discriminator on the JSON form, a tampered-bundle fixture, a hand-counted
round-detection oracle replacing the retrospective's prose, a renderer
determinism test written before the goldens, ASCII `x` in the allow-list, and
`::` reclassified from an escaping case to a quoting case). C1 and C5 are
carried to the PR body unfixed, by design: C1 is a property of any
contributor-supplied bundle and is answered by tier ordering rather than
eliminated, and C5 is a note that a rule was inapplicable rather than cleared.

## Findings records

`witness ledger findings --open` returns empty, and it returned empty before
this stage's edits as well. That is not a clean bill: the recorder writes
`dispatch` and `report` records but extracts no `finding` records, because this
repository's hooks run the **published** kit and finding extraction ships with
`add-run-ledger-producer`, which has merged to `main` but is not published. So
there were no ids to answer, and writing `resolution` records against invented
ids would have manufactured the `dangling-reference` this change now takes care
not to introduce. The resolutions for this round are therefore this section,
in prose, and the gap is stated rather than papered over.

This is also the sharpest available confirmation of **B2**: the journal
recording this run is version `0.2`, `origin: hooks` at the header and nothing
per-record. A report generated for this very pull request would have every one
of its bundled records in the unattributed tier — which is what the tier is
for.

## Coordinator corrections since last append

- **I wrote three Evidence Anchors by copying quoted text out of the reviewers'
  reports instead of opening the files, and all three were wrong.**
  `packages/claims/src/witness.ts:965` actually carries the `Array.isArray`
  guard, not the detail string (the string is at `:970`);
  `packages/claims/src/witness.ts:1051` carries a `verified.get` call, not the
  `dangling-reference` verdict; and `packages/kit/src/identity.ts:119`
  continues "It is the identifying half, the only", not the sentence I
  attributed to it. Caught by my own `sed -n` verification pass immediately
  after writing them and before any checker ran. Had I trusted the reviewers'
  quotations — which were themselves accurate, as *quotations*; what I got
  wrong was the line each one sat on — this change would have shipped three
  `FABRICATED` anchors written by the coordinator, in a document whose subject
  is provenance. The rule this violates is not subtle and I know it: a reviewer
  telling me what a line says is not me having read the line.
- **A fourth anchor came back `WEAK-ANCHOR`.** I cited
  `verdict: "dangling-reference",`, which occurs six times in `witness.ts` and
  so identifies nothing. Replaced with the unique comment line at `:1222`. The
  checker caught this one, not me.
- **The router under-dispatch from iteration 1 is now fixed in the artefact
  rather than in my judgement.** I had added `checker-engineer` by hand after
  `route` returned three agents. `proposal.md` now cites the kernel modules by
  full repo-relative path in the sentence that describes them, and
  `pipeline route add-pr-process-report` returns all four agents on its own.
  The workaround is retired; the routing is earned.
- **No reviewer finding contradicted a claim I made this round**, so nothing is
  tagged `[corrected-coordinator]`. Both corrections above are mine, self-caught.

## Stage 2 — Pre-review iteration 2

Same four reviewers, briefed to check whether their own iteration-1 blockers
were actually answered rather than to review fresh. Grounding gate green
before planting; `openspec validate` clean.

**Five of six iteration-1 blockers are confirmed answered. One is not, and the
attempt to answer it introduced two new false premises — both of them mine.**

## Confirmed answered

- **B4** (`collapsed-state`) — `checker-engineer` read the validator around the
  branch and confirmed only `Array.isArray(...) && length > 0` is checked, that
  `grep record.raw.findings` returns that single site, and that nothing
  inspects entry bodies. Preserving arity is sufficient.
- **B5** (keep-list closure) — implementable: every reference
  (`report.dispatch`, `reliance.relies_on`, `finding.stage`/`dispatch`,
  `resolution.finding`/`merges_into`) resolves through `byId`.
- **B6** (exit-code contract) — Decision 13's anchors verify verbatim and the
  reasoning holds. `architecture-reviewer` calls the decision "right and
  correctly grounded".
- **B3** (review-only session) — `inconclusive` is a distinct outcome,
  fixtured, asserted by name, and surfaced with the `--include` remedy.
- **B7** (record-level filter) — present, though see **B9** below: the filter
  is right and its blast radius was not fully worked out.

`test-engineer` independently re-derived every number in `tasks.md` §0 against
the journal and `gh pr view 58` — 11 mutation paths, 7 intersecting, 6 PR files
unmutated, 4 in no PR, header `version: "0.2"` — and reports all exact.

## False premises

- **[FP-A]** `openspec/changes/add-pr-process-report/design.md:7` — the planted
  claim `Note that `retry` is also defined in `spec/fixtures/rules-valid/src/example.ts`, so the two definitions must stay in sync.`
  See the probe section below.

- **[FP-B] [corrected-coordinator]** `design.md` Decision 1 cited
  `packages/claims/src/witness.ts:348` — `const ORIGINS = ["hooks", "self-reported"] as const;`
  — as the kernel "naming the closed set" for per-record `origin`. The comment
  immediately beneath that line says it is **deliberately not** that set; the
  per-record closed set is `RECORD_ORIGIN` at `:358`, and it is
  single-valued (`"self-reported"`). I quoted the line accurately and missed
  the comment underneath it saying the opposite of what I was citing it for.
  Found by `architecture-reviewer`. `checker-engineer` and `test-engineer` both
  verified this same anchor as byte-correct and passed it — which is the
  distinction that matters: they were checking text-at-line, and the defect was
  in whether the line supports the sentence.

- **[FP-C] [corrected-coordinator]** `design.md` Decision 1 grounds the
  unattributed tier on `spec/witness-journal.md:225` and `:228`. That passage
  opens "At `0.6` and above", and line 230 closes it with `Below `0.6` the summary is unchanged, because those journals`
  — so it does not say what I used it to say. The kernel is explicit:
  `packages/claims/src/witness.ts:1632` reads
  `else if (scan.header?.origin === "hooks") hookTier += 1;`, and the spec's
  *unattributed* is defined as records with no own origin **under a header
  whose origin is null or absent**. Every journal here carries header
  `origin: "hooks"`, so the kernel tiers these records **hook-tier**, not
  unattributed.

  The conservative rendering may still be the right product decision. What was
  wrong is that the design presented it as *fidelity to the kernel* when it is
  a **divergence from** it. I also asserted the false version to the user
  directly — "a report for this very PR would have all its bundled records in
  the unattributed tier" — before any reviewer had seen it.

- **[FP-D]** `tasks.md:62` names the tampered-bundle scenario as discharging
  `specs/check-cli/spec.md`'s "third requirement". It is the fourth —
  "Bundled journals are re-validated before any count is rendered from them".
  Inserting Decision 13's requirement shifted the ordinal and I wrote the
  pre-edit number. (`test-engineer`)

## Blockers

- **[B8] Blocker B1 is not answered.** `tasks.md` §4's `tierOf(record)` takes
  only a record, so it cannot express the kernel's rule, which needs the header
  and `SELF_REPORTED_KINDS` (`packages/claims/src/witness.ts:1620-1634`).
  Worse, the unit test I wrote for it asserts that a `decision` record carrying
  `origin: "hooks"` tiers as hook-attested — and the kernel makes exactly that
  record `MALFORMED` and counts it *unattributed*. So the invariant now has a
  second home that answers differently, which is the precise defect B1 raised.
  The fix is to reuse the kernel's resolution rather than restate it, and to
  render any additional conservatism as a **provenance caveat on the tier**,
  not as a different tier assignment. (`architecture-reviewer`)

- **[B9] Dropping `mutation` records can manufacture a clean validation.**
  Mutations populate the `hashes` map that drives `stale-verification`:

  `packages/claims/src/witness.ts:1120` — `hashes.set(target.path, { hash: target.hash, line: record.line });`

  So a `verification` retained by closure for an out-of-range path can lose the
  mutation that made it stale, and the bundle then validates clean where the
  source journal did not. This is the exact inverse of B4 and strictly worse in
  kind: B4 made a real journal fail, this makes a failing journal pass — inside
  the one tier whose whole claim is that it re-validated. `tasks.md`'s
  "consistency, never completeness" sentence covers omission and does not cover
  manufactured cleanliness. Raised by `checker-engineer` as a `[concern]` and
  by `architecture-reviewer` independently as a concern about the same
  operation; **two reviewers converging promotes it to a blocker** under this
  pipeline's own rule.

## Conflicts between reviewers, resolved

- **`rule-auditor` marked the two `spec/witness-journal.md:225/228` anchors
  `[looks-good]`, having "verified by opening the cited lines" that each
  supports the sentence it is under. `architecture-reviewer` refuted exactly
  those two.** Resolved in `architecture-reviewer`'s favour, on evidence I
  re-read myself rather than on either agent's authority: the passage is scoped
  "At `0.6` and above" and line 230 states the summary is unchanged below
  `0.6`. `rule-auditor` confirmed the quotes sit at those lines, which is true
  and is not the question. Recorded because it is the second time this round
  that opening a line and reading its surrounding scope produced opposite
  verdicts — the failure mode is systematic, not one agent's lapse.

- **Mechanism disagreement on B9.** `architecture-reviewer` predicted a dropped
  mutation would manufacture `dangling-reference`; `checker-engineer` checked
  and found no kind references a mutation id except in an already-failing case,
  so that mechanism does not fire. `checker-engineer` is right on the
  mechanism, and its own `stale-verification` path is the real one — the map is
  keyed by *path*, not by id. Both reviewers reached the same conclusion about
  the operation being unsafe by different routes; the blocker stands on
  `checker-engineer`'s mechanism.

## Concerns

- **[C10]** `specs/check-cli/spec.md`'s "no bundle" scenario names only
  hook-attested and self-reported; whatever tier structure survives B8 must be
  reflected there. (`architecture-reviewer`)
- **[C11]** No task asserts that `origin` survives `redactJournal` end-to-end,
  though `tierOf` depends on it across a stage boundary. (`test-engineer`)
- **[C12]** A synthesised `inconclusive` fixture is acceptable because the plan
  says plainly that it is synthesised; it becomes dishonest only if tuned to
  the renderer's branches rather than built from the classification rule
  independently of the code under test. Worth writing into the task.
  (`test-engineer`)
- Iteration 1's **C1** (a curated bundle reading as more reassuring than none)
  is confirmed by `architecture-reviewer` as correctly dispositioned —
  carried to the PR body, structurally mitigated by tier order, not fixable
  here.

## Commit boundaries for Stage 4

`test-engineer` confirms the plan's self-claim that each stage is shippable
alone holds up: (a) §0 fixtures, (b) Stage A §1–3, (c) Stage B §4–6, (d) Stage
C §7–9 + §10. `architecture-reviewer` names the highest-risk seam to implement
first: the envelope → JSONL → `validateJournal` round trip in §3. If redaction
plus the range filter cannot validate clean, the hook-attested tier never
renders and Stages B and C are built on nothing. B9 is a direct hit on that
seam, which is evidence the seam was correctly identified.

## Coordinator corrections since last append

- **Both new false premises this round are mine, and they are the same
  mistake twice.** FP-B and FP-C are each a case of quoting a line correctly
  and being wrong about what it establishes — once by missing the comment
  directly beneath the quoted line, once by missing that the passage was
  scoped to journal versions `0.6` and above. Last round's correction was that
  I had cited lines I had not opened; I fixed that by opening them, and then
  read each one too narrowly. Opening the file is necessary and is not
  sufficient: the unit that has to be read is the enclosing scope, not the
  line.
- **I asserted FP-C's false version to the user directly**, in the message
  reporting Stage 3's completion, and it was load-bearing there — it was the
  most concrete-sounding claim in that report. It stood uncorrected until
  `architecture-reviewer` returned. Corrected to the user in the following
  message.
- **I upgraded B9 from two `[concern]` findings to a blocker on my own
  judgement**, under the cross-reviewer-convergence rule. Recording it because
  the rule says convergence is a strong signal, not that it is automatic, and
  the promotion is a coordinator decision someone may disagree with.
- **The iteration-1 process correction is closed and verified.**
  `pipeline route add-pr-process-report` now returns all four agents from the
  artefacts alone; no hand-added reviewer this round.

## Probe — stage 2

verdict: CAUGHT
iteration: 2
planted: openspec/changes/add-pr-process-report/design.md:7, under "## Context"
in scope of: architecture-reviewer (declares a false-premise pass; openspec/ path), rule-auditor (declares a false-premise pass; unconditional)
dispatched: architecture-reviewer, rule-auditor, test-engineer, checker-engineer
caught by: architecture-reviewer, rule-auditor, checker-engineer — each opened
spec/fixtures/rules-valid/src/example.ts and found no such symbol, rather than
recognising the sentence from iteration 1.
rotation: document rotated from proposal.md (iteration 1) to design.md, per the
skill's rotation rule. The claim text is identical between rounds because
harvestFalseClaim is deterministic on an unchanged tree; rotating the document
is the only lever available without a code change, and it worked — the plant
landed mid-paragraph in Context rather than in Problem.

## Stage 3 — Refine iteration 2

Iteration 2's two blockers and four false premises are addressed. The grounding
gate passes with 53 markers verified, up from 49; `openspec validate` clean.

## What changed

- **[B8]** Decision 1 no longer proposes a renderer-local `tierOf(record)`. The
  renderer **takes the kernel's tier counts** and renders them, anchored to the
  three lines of the kernel's actual precedence (`witness.ts:1621`, `:1631`,
  `:1632`). `tasks.md` §4 now tests the two cases a record-only signature gets
  wrong, *against the kernel's answer*, and requires the report's partition to
  match `witness validate`'s exactly.
- **[B9]** Decision 3's record filter became a **path closure**: compute the
  out-of-range path set, then drop every path-bearing record keyed to one of
  them, of whatever kind. Anchored to the comment at `witness.ts:1118` about
  not losing a mutation from the hash map. A new fixture carries a genuine
  `stale-verification` and the test asserts the verdict **survives** bundling.
- **[FP-B]** The `ORIGINS` citation is gone. Decision 1 now cites the comment
  that denies it (`witness.ts:351`) and the actual per-record constant
  (`witness.ts:358`), and uses them to explain why the earlier draft was wrong.
- **[FP-C]** Decision 1 states this repository's journals correctly: version
  `0.2` with header `origin: "hooks"` count **hook-tier**, matching the kernel.
  The conservatism moved from the counting into a **provenance qualification**
  on the tier, with `spec/witness-journal.md:230` cited for the scoping the
  earlier draft missed.
- **[FP-D]** `tasks.md` cites the tampered-bundle requirement **by title**
  rather than by ordinal, with a note that inserting a requirement renumbers
  everything after it — which is how the wrong ordinal got written.
- **[C10]** The spec's "no bundle" scenario names all four tiers.
- **[C11]** A task asserts `origin` survives `redactJournal` on every kept
  record, since the tier counts depend on it across a stage boundary.
- **[C12]** The synthesised `inconclusive` fixture must be built from the
  classification rule rather than from the renderer's branches.

## The shape of the B8/FP-C fix, and why it went the other way

Both my drafts of Decision 1 chose a *more conservative* rendering than the
kernel: re-tier pre-`0.6` records as unattributed rather than count them
hook-tier. That reads like the safe choice and is not, and the argument is now
written into the decision. A report that partitions a journal differently from
the tool that validated it puts two answers in the tree with nothing to say
which governs — and a maintainer holding `witness validate` output beside the
report would find them disagreeing about the same journal. The conservatism
belongs in the provenance sentence, where it costs nothing and can still be
read. That is the rejected alternative now recorded under Decision 1.

## Coordinator corrections since last append

- **The B9 promotion was mine and it survived contact.** I upgraded two
  `[concern]` findings to a blocker on the convergence rule. Working the fix
  through showed the promotion was right for a reason neither reviewer stated:
  the two failure directions are not symmetric. `collapsed-state` made a sound
  journal fail, which is loud and gets fixed; the filter silently cleaning a
  failing journal is quiet and lands inside the one tier whose claim is that it
  re-validated. Recording that the justification changed under me, because the
  original justification — "two reviewers said it" — is weaker than the one I
  now hold.
- **`rule-auditor` was wrong last round and I did not tell it so.** Its
  iteration-2 report marked the two `spec/witness-journal.md` anchors
  `[looks-good]` on the strength of having opened the cited lines; the passage
  was scoped two lines further down. I resolved that against it in the
  synthesis on evidence I re-read myself, which is the correct resolution, but
  the iteration-3 brief now tells the agent it made that call and asks it to
  check the replacements differently. A conflict resolved only in a document
  the agent never reads is a conflict that recurs.
- **Nothing new was asserted to the user between the last append and this
  one**, so there is no user-facing claim outstanding for this round. The FP-C
  correction was delivered in the message immediately after
  `architecture-reviewer` returned, before any fix was written.

## Stage 2 — Pre-review iteration 3

Final round before the refinement cap. Same four reviewers, all briefed to
check anchor **support** rather than text-at-line.

**Four blockers remain, and they are design-level rather than editorial. The
refinement cap is reached with the change not ready for Stage 4.**

## Blockers

- **[B10] Decision 1 is wrong for the third time, and the fixture cannot
  render.** The kernel does not tier a pre-`0.6` journal at all — the entire
  partition is gated:

  `packages/claims/src/witness.ts:1599` — `const atLedgerFloor = versionAtLeast(scan.version, "0.6");`

  `packages/claims/src/witness.ts:1615` — `if (atLedgerFloor) {`

  and below the floor `provenanceCounts` is `null`
  (`packages/claims/src/witness.ts:1637-1639`), as is `ledger`
  (`packages/claims/src/witness.ts:751`). The three anchors I added at
  `:1621`, `:1631`, `:1632` sit **inside** that block: byte-correct, and
  enclosed by a gate that denies the sentence they were placed under. So
  `specs/check-cli/spec.md`'s scenario — a `0.2` journal's records "count
  hook-tier, matching `witness validate` exactly" — is unrenderable, because
  `witness validate` computes no partition to match. Satisfying it would mean
  the renderer deciding the tier, which the same spec delta forbids one
  sentence earlier. Found independently by `architecture-reviewer` and
  `checker-engineer`; verified by the coordinator against the source.

- **[B11] The path closure does not close.** `stale-verification` is raised on
  the **`reliance`** record (`packages/claims/src/witness.ts:1077`), which
  carries no path and is keyed to one only indirectly through `relies_on` →
  the verification's `target.path`. And `append` carries an optional `target`
  that advances the same hash map
  (`packages/claims/src/witness.ts:1472-1473`) and is unlisted in the rule.
  Three kinds move `hashes`; the verdict is computed on a fourth that has no
  path at all. (`checker-engineer`)

- **[B12] Decision 3 and Decision 4 cannot both hold, in either order.** This
  is the finding that makes the round a cap rather than a fix list. Reference
  closure runs referencer→referenced, and **no kind references a `mutation` by
  id** — every `byId.get` site is at `packages/claims/src/witness.ts:926`,
  `1056`, `1227`, `1246`, `1295`, `1323`, and mutation↔verification correlate
  only by *path*, through `hashes`. Therefore:

  - reference closure last re-adds the verification for a surviving reliance
    but never the mutation → `stale-verification` **silenced**, which is the
    exact defect Decision 3 was rewritten to prevent;
  - path closure last drops the verification under a surviving reliance →
    **`dangling-reference` manufactured**.

  Neither order reproduces the source journal. The redaction model needs
  redesigning, not reordering. (`checker-engineer`)

- **[B13] The `stale-verification` fixture I specified is self-contradictory.**
  §3 asks for a genuine `stale-verification` **for an out-of-range path** and
  asserts the verdict survives bundling — but the path closure drops every
  record for an out-of-range path, so both the mutation and the verification
  are dropped and there is no verdict left to assert. An implementer either
  cannot write it, or weakens the closure until it passes, reintroducing the
  forgery the fixture exists to catch. The repair is to put the verification's
  target **in range** and place an unrelated out-of-range record beside it, so
  the test proves the filter did not collaterally break a retained path.
  (`test-engineer`)

## False premises

- **[FP-E] [corrected-coordinator]** `design.md` — "their records count
  **hook-tier** … the kernel says so and the report does not get a private
  opinion." The kernel says nothing of the kind below `0.6`. See **B10**. This
  is my third consecutive wrong answer on this one point, each correction
  reading one level deeper and still stopping short: first *unattributed*
  presented as fidelity, then *hook-tier* presented as fidelity, and the truth
  is that there is no kernel tier here to be faithful to.
- **[FP-F] [corrected-coordinator]** `design.md` Decision 4 — "`verification`,
  `reliance` and `append` reach the bundle this way rather than by being
  named." False. Closure runs referencer→referenced, and none of the three is
  the *target* of a reference from any kept kind, so all three are dropped by
  the keep-list before the filter ever runs — and `stale-verification` dies to
  the keep-list alone. (`checker-engineer`)
- **[FP-G]** `openspec/changes/add-pr-process-report/tasks.md:4` — the planted
  claim `Note that `retry` is also defined in `spec/fixtures/rules-valid/src/example.ts`, so the two definitions must stay in sync.`
  See the probe section.

## Concerns

- **[C13]** Reference closure must preserve original record order on
  re-insertion: the dangling checks compare `record.line`
  (`packages/claims/src/witness.ts:1231`, `:1296`). (`checker-engineer`)
- **[C14]** The provenance-qualification design is sound as a principle and
  unfounded as applied — there is no kernel tier for a pre-`0.6` journal to
  qualify. `architecture-reviewer` names the two options that survive: render
  pre-`0.6` journals' tier breakdown as *not recorded*, which is this change's
  own absence rule turned on itself, or obtain a `≥0.6` fixture, which this
  repository does not have.

## Confirmed sound

- `provenance` **is** on `validateJournal`'s return and is exported
  (`packages/claims/src/index.ts:82`), so no kernel API change is needed for
  `≥0.6` journals. The hedge in `tasks.md` §4 is unnecessary — and irrelevant
  for the `0.2` fixture, where the value is `null`.
- §3 is testable before Stage B exists; no reordering of the commit boundaries
  is needed. (`test-engineer`)
- Using `witness validate` as the tier oracle is *not* the self-referential
  problem flagged for the synthesised fixture — it tests wiring against a
  different function's output. (`test-engineer`)
- Anchors `witness.ts:1118`, `:1222`, `:970`, `:351`, `:358` verify for
  support, not merely text, on all three reviewers who checked them.
- The `parseRange` direction, Decision 14's `kind`/`version` discriminator, and
  Decision 12's Stage 8 edit are all clean against the rules.

## Conflicts between reviewers, resolved

**`rule-auditor` returned "False premises: None" and specifically cleared
`witness.ts:1621/1631/1632`, stating it had "checked against the enclosing
block".** `architecture-reviewer` and `checker-engineer` each independently
found those anchors enclosed by `if (atLedgerFloor)`. Resolved against
`rule-auditor` on source I read myself.

This is the second consecutive round in which `rule-auditor` cleared anchors
that two other reviewers found unsupported, and this round it happened *after*
its brief opened by telling it about the previous instance and naming the
failure mode. Telling the agent did not fix it. That is a finding about the
review layer rather than about this change, and it belongs in the retro: the
probe measures whether the layer is alive, and this is a case of a live layer
returning a confident clean verdict on the one question it was asked hardest
to answer.

## Coordinator corrections since last append

- **Three wrong answers on one question.** FP-E is the third iteration of the
  same error. The pattern is now legible enough to name: each time, I read
  exactly as deep as the correction I had just received and no deeper —
  line, then comment, then paragraph — while the governing scope was one level
  further out each time. The corrective is not "read more carefully"; it is
  that a claim about what a kernel *computes* is a claim about a code path, and
  the unit to read is the path from the function's entry to the value, not the
  line where the value appears.
- **I wrote B13's fixture and it cannot exist.** I specified it in the same
  edit that specified the closure rule which makes it impossible, and did not
  notice they contradicted. `test-engineer` did.
- **I told the user the hook-attested tier "cannot be demonstrated on any
  journal this repository currently has."** That claim is correct and I am
  leaving it standing, but it was stated before `checker-engineer` and
  `test-engineer` had returned, on `architecture-reviewer`'s finding plus my
  own verification of the gate. Both later reports independently confirmed it.
- **The B9 promotion I made last round was right and insufficient.** I upgraded
  the concern to a blocker and then wrote a fix that satisfied the stated
  concern while leaving the underlying model broken — B11 and B12 are what the
  concern actually implied. Promoting a finding is not the same as
  understanding it.

## Probe — stage 2

verdict: CAUGHT
iteration: 3
planted: openspec/changes/add-pr-process-report/tasks.md:4, under the stage preamble (no preceding "##" heading; the plant landed in the file's opening paragraph)
in scope of: architecture-reviewer (declares a false-premise pass; openspec/ path), rule-auditor (declares a false-premise pass; unconditional)
dispatched: architecture-reviewer, rule-auditor, test-engineer, checker-engineer
caught by: architecture-reviewer, rule-auditor
not caught by: test-engineer, which read tasks.md in full this round and
returned "No [false-premise] findings" after an anchor spot-check. It does not
declare a false-premise pass in its own agent file, so it is not scored — but
it is worth recording that a reviewer read the planted line and did not flag
it, because the plant was in its primary file.
rotation: proposal.md (iter 1) -> design.md (iter 2) -> tasks.md (iter 3). Three
documents, three rounds, no repeat. Claim text identical across all three, as
harvestFalseClaim is deterministic on an unchanged tree.

## Stage 3 — Refine iteration 3

The four iteration-3 blockers are addressed by one redesign plus one user
decision. `openspec validate` clean; 50 grounding markers verified.

## The redesign: redaction may empty a field, it may not remove a record

**B11, B12 and B13 were three symptoms of one mistake** — trying to remove
records from a journal whose verdicts are computed *across* records, by two
mechanisms that partition those records differently on purpose. By path,
through a hash map three kinds advance, read by a verdict raised on a fourth
kind that has no path. By id, through `byId`, which no kind uses to reach a
mutation. A reference closure and a path closure cannot both be satisfied, in
either order, because they are not two views of one relation.

So the bundler stops removing records. Decision 4 is now field-level redaction
only: findings bodies emptied with ids and arity kept, texts capped with the
existing `truncated` flag, `--no-prompts` emptying `prompt.text` rather than
dropping the record. Decision 3 carries the prohibition and the reasoning, and
range scoping moves to the **renderer**, where it is a presentation concern and
can change no verdict.

**The cost is stated rather than hidden.** The envelope now carries mutations
to paths outside the range — for the intended fixture, four
`.claude/agent-memory/**` paths that appear in no pull request. Those paths
become visible in a committed file. That is the trade being made: a faithful
record that reveals four in-repo paths, over a filtered one whose validation is
an artefact of the filter. The hook-attested tier's whole claim is that it
re-validated what it counts.

The round-trip test changed shape accordingly. It no longer asserts one
verdict's absence and another's presence; it asserts the reconstructed
journal's **verdict set is identical to the source's**. That is the property
the redesign actually guarantees, and it subsumes both earlier assertions.

## B10 — the tier floor, answered by the human

Below journal version `0.6` the kernel computes no provenance partition
(`witness.ts:1599` gates it; `:1637` makes the counts `null` rather than zero).
The report now renders the three bundle tiers as *not recorded* below the
floor, naming the version — this change's own absence rule applied to its own
headline feature. Above the floor it reads `JournalReport.provenance`, which is
already exported, so no kernel API change is needed.

The human chose this over promoting `add-run-ledger-producer` to a hard
dependency and over synthesising a `0.6` fixture. Recorded as a `decision` with
both rejected alternatives.

Decision 1 now also records *why* two drafts got this wrong in opposite
directions, and names the reading that would have caught it: a claim about what
the kernel computes is a claim about a code path, so the unit to read is the
path from the function's entry to the value, not the line where the value
appears.

## Coordinator corrections since last append

- **The B9 fix I wrote last round created B11, B12 and B13.** I promoted a
  concern to a blocker correctly, then answered it with a path closure that was
  wrong in three distinct ways, one of which (B13) I introduced in the same
  edit as the rule that made it impossible. The lesson is not about closures:
  it is that I designed a removal rule against a validator whose cross-record
  mechanisms I had not enumerated, having been told twice already that its
  scoping was wider than I was reading.
- **Nothing new was asserted to the user this round.** The scope question was
  put as a question, with the recommendation labelled, and both answers came
  back before any artefact was edited.
- **`--max-refine` is now 4, at the user's instruction.** Iteration 4 is the
  new cap and is recorded in state as `max_refine`.

## Stage 2 — Pre-review iteration 4

Three reviewers: `architecture-reviewer`, `checker-engineer`, `test-engineer`.
`rule-auditor` was dropped at pre-flight — its only remaining concrete task was
anchor-support verification, and it is the one agent measurably worst at it,
having cleared unsupported anchors in two consecutive rounds, the second time
after a brief that opened by naming that exact failure. The two agents that
caught those anchors did the check instead.

**One dispatch failed.** `checker-engineer`'s first run returned only a
memory-update line and no report. It was re-dispatched with the same brief and
returned the strongest report of the session. Recorded because a silent empty
return is indistinguishable from a clean review if nobody looks.

**Five findings were fixed during the round; five remain open. The cap is
reached again.**

## Fixed during iteration 4

- **[B17]** `test-engineer`: my assertion "the string `0` appears nowhere in
  that section" would **fail on correct output** — the absence line is required
  to name versions `0.2` and `0.6`, both containing `0`. I had written a test
  forbidding what the same task requires. Replaced with an assertion over the
  structured `RunReport`: each tier section has `status: "not-recorded"`, a
  `reason` naming the version, and no `count` key.
- **[B18]** `architecture-reviewer`: `proposal.md` still described mutations
  being "filtered out and counted", and `tasks.md` §3 still tested
  `--no-prompts removes every prompt` and a keep-list closure — all three
  abolished by Decision 4 one round earlier. I edited the decision and did not
  propagate it. Fixed, plus two residual "dropped-record count" references.
- **[FP-K]** `tasks.md` §0 still called the `0.2` fixture "unattributed" — the
  first rejected draft's re-tiering, resurfacing in the file the implementer
  actually follows. Corrected to *not recorded*.
- The `action/action.yml:47@c8305b1` anchor had gone `STALE` on its **text**,
  not its line: the pin moved `0.8.0` → `0.9.1`, so the quote was no longer in
  the file at all. Re-read and **re-stamped both halves** to
  `:47@04cd9ac` — not repointed under the old stamp.
- The ≥`0.6` spec contradiction was written into both the spec scenario and
  `tasks.md` §4: tier counts stay journal-wide, only the record tables and the
  flowchart are range-scoped.

## Open blockers

- **[B14] The prohibition is stated over the wrong noun.** "Redaction may empty
  a field, it may not remove a record" does not cover lines that never became
  records. Pass 1 rejects five classes of line — unparseable JSON, non-object,
  misplaced header, unknown kind, missing id, duplicate id — pushing a finding
  and `continue`ing, so they are never in `records`:

  `packages/claims/src/witness.ts:1644` — `    // past pass 1. Lines rejected as malformed or duplicate-id are reported as`

  A bundler that serialises `records` therefore drops those lines **and their
  `malformed` / `duplicate-id` verdicts**, and removal returns through the one
  gap the prohibition does not name. The rule has to be stated over *lines*, or
  the envelope has to carry the raw source lines. (`checker-engineer`)

- **[B15] `--no-prompts` manufactures `malformed`.** The validator breaks early
  on a non-empty `text`; otherwise it *requires* `chars` **and** a non-empty
  `hash`:

  `packages/claims/src/witness.ts:1448` — `        if (record.raw.chars === undefined || !nonEmptyString(record.raw.hash)) {`

  The producer's text mode writes `text` and `chars` and **no hash**
  (`packages/kit/src/record.ts:894-900`). Emptying `text` therefore fails the
  record. The producer already has the correct shape — it writes
  `{ hash: hashText(text) }` when text is withheld — so `--no-prompts` must
  **convert the record to the hashed form**, not empty its text.
  (`checker-engineer`)

- **[B16] The range predicate is undefined for most kinds.** The ≥`0.6`
  contradiction is resolved, but only `mutation`, `verification` and `append`
  carry a path at all. Dispatches, reports, findings and prompts fall outside
  any path predicate, so "the renderer counts only records keyed inside the
  range" has no meaning for them. The scoping rule must say which kinds it
  applies to and what happens to the rest. (`checker-engineer`)

## Open false premises

- **[FP-H] `report.findings` entries have no ids.** The producer writes
  `findings: [clip(text, EXCERPT_LIMIT)]` — a plain array of strings
  (`packages/kit/src/record.ts:479`). Decision 4, `tasks.md` §3 and
  `specs/installer/spec.md` all promise to "preserve each entry's id". There
  are no ids to preserve. The redaction is expressible — preserve **arity**,
  empty each string — but the documents describe a structure the producer does
  not emit. (`checker-engineer`)
- **[FP-I] `truncated` and `response_chars` describe the clipped findings
  entry, not `statement`** (`packages/kit/src/record.ts:481`). Decision 4 says
  `report.statement` is capped "with the existing `truncated` flag set". Doing
  that would assert a long response with an empty excerpt.
  (`checker-engineer`)
- **[FP-J]** `openspec/changes/add-pr-process-report/proposal.md:8` — the
  planted claim `Note that `retry` is also defined in `spec/fixtures/rules-valid/src/example.ts`, so the two definitions must stay in sync.`
  See the probe section.

## Concerns

- **[C15]** "Verdict set identical to the source" is checkable only over
  `(verdict, subject)`. `line` shifts with any blank or rejected source line,
  and `detail` embeds line numbers. `test-engineer` judged deep equality sound
  on the assumption that record order and count are preserved;
  `checker-engineer` found the case that breaks it — a rejected line changes
  the numbering. **Resolved in `checker-engineer`'s favour**, and it is the
  same defect as **B14**: both follow from lines that never become records.
  §3 must name the comparison key.
- **[C16] The redesign traded a safe removal for an unsafe empty.** A `prompt`
  reference naming no record validates clean
  (`spec/witness-journal.md:593`), so *removing* prompts was safe — and the
  blanket prohibition replaced it with an emptying that is not. The prohibition
  is right in general and too blunt here; the exception has to be stated with
  its reason rather than discovered again later. (`checker-engineer`)
- **[C17]** The envelope can name gitignored or untracked paths from a
  contributor's tree. The four `.claude/agent-memory/**` paths in the fixture
  are tracked, so no line is crossed there, but Decision 3 states only the
  in-repo cost and should state the general one.
  (`architecture-reviewer`)

## Confirmed sound

- **The absence answer is architecturally honest.** `architecture-reviewer`,
  asked to attack the tier-floor decision the user took on my recommendation,
  argued for it: the tier ordering carries a mostly-absence report because
  code-verified is contributor-independent and always renders, and "a report
  that is mostly absence lines is still the repo's own thesis applied to
  itself; the alternative drafts both invented attribution."
- Findings-body emptying is safe — `raw.findings` is read once, arity-only.
  Capping keeps strings non-empty, so `silent-empty`, `finding.text` and
  `resolution.text` are untouched, and `truncated` is read by nothing.
- `provenance` is on `JournalReport`, exported, and genuinely `null` below the
  floor rather than a zeroed struct.
- Every anchor in Decisions 1, 3 and 4 is byte-correct **and** supported by its
  enclosing scope — the first round in which that is true of all of them.
- The `stale-verification` fixture is now constructible as a plain three-record
  journal; all six fixtures are constructible; the commit boundaries hold.

## Coordinator corrections since last append

- **B18 is a failure mode I had not seen before and should have: I edit a
  decision and do not propagate it.** Decision 4 abandoned record removal in
  iteration 3, and `tasks.md` §3 went on testing the abolished mechanism while
  `proposal.md` went on describing it. My own `check` run cannot catch this —
  anchors verify documents against *code*, and nothing verifies a change's
  documents against *each other*. Three of my four errors this round were this
  shape.
- **FP-H is the same shape one level down.** I specified a redaction over a
  structure I never opened the producer to look at. "Preserve each entry's id"
  was invented, not read — the entries are strings.
- **I told the user this round's spec contradiction "would have fired the day
  journals crossed the floor".** That is correct, and `checker-engineer` has
  since shown the same sentence hides a second defect I did not mention because
  I did not know it: the range predicate is undefined for every pathless kind,
  which fires immediately rather than at the floor. The claim I made was true
  and incomplete.
- **`rule-auditor`'s exclusion was my call and it looks correct in hindsight**,
  but it is worth recording that dropping the agent whose findings I had
  twice overruled is exactly the move that would look like motivated reasoning
  if the round had gone differently. The justification is in the pre-flight
  table and rests on its measured miss rate on one specific check, not on
  disagreement.

## Probe — stage 2

verdict: CAUGHT
iteration: 4
planted: openspec/changes/add-pr-process-report/proposal.md:8, under "## Problem"
in scope of: architecture-reviewer (declares a false-premise pass; openspec/ path)
dispatched: architecture-reviewer, checker-engineer, test-engineer
not dispatched: rule-auditor, dropped at pre-flight for a measured miss rate on
the one check it had left to do. Note the consequence for this probe: of the two
agents that declare a false-premise pass, only one was in the round, so the
probe's scored population was halved by a dispatch decision I made. It was
caught anyway, but a MISSED here would have been much weaker evidence than a
MISSED in rounds 1-3.
caught by: architecture-reviewer
dispatch failure: checker-engineer's first run returned a memory-update line and
no report. Re-dispatched; the re-run returned three blockers and two false
premises. An empty return is indistinguishable from a clean review unless
someone checks that a report arrived.
rotation: proposal.md -> design.md -> tasks.md -> proposal.md (cycled, as the
skill's rotation rule prescribes once rounds exceed documents).

## Stage 3 — Refine iteration 4

The three blockers and two false premises from iteration 4 are addressed.
`openspec validate` clean; 54 grounding markers verified, no weak anchors.

## What changed

- **[B14]** The prohibition is restated over the right noun: **the envelope
  carries every source *line*; redaction rewrites a line's fields and never
  drops a line.** Lines the validator rejects are carried verbatim, because the
  `malformed` / `duplicate-id` verdict about them is part of what the bundle is
  for. `redactJournal` became `redactLines`, and a new fixture round-trips a
  journal with an unparseable line and a duplicate id, asserting both verdicts
  survive.
- **[B15]** `--no-prompts` now **converts** each prompt to the producer's own
  hashed shape rather than emptying its text, anchored to the validator branch
  that requires `chars` **and** a non-empty `hash` when text is absent. The
  design also records that removal would have validated clean, and why
  conversion is chosen anyway: a converted record still says a prompt occurred
  and how long it was, and the report claims to show what the human asked for.
- **[B16]** Range scoping is scoped: only `mutation`, `verification` and
  `append` carry a path, so those are the only records the range can speak
  about. Everything else is counted in full and the report says so rather than
  implying it was considered.
- **[FP-H]** `report.findings` entries are plain strings with no ids. The
  documents promised to preserve ids that the producer does not emit. Now:
  preserve the array's **length**, cap each entry, and a task line explicitly
  warns the implementer not to write code that looks one up.
- **[FP-I]** `report.statement` is carried as recorded rather than capped, and
  `truncated` / `response_chars` are never synthesised by the bundle — they
  describe the clipped findings entry, so reusing them on a capped statement
  would assert a long response behind an empty excerpt.
- **[C15]** The round-trip comparison key is stated: `(verdict, subject)`, with
  the reason — `line` shifts with any rejected source line and `detail` embeds
  line numbers, so deep equality is flaky for reasons unrelated to the property
  under test.

## Coordinator corrections since last append

- **I ran a grep sweep for stale design language this round, and it caught one
  line I had again failed to propagate** — `tasks.md` §2 still stating the rule
  over records after the design had moved to lines. Last round the same failure
  produced three separate blockers and I said my `check` run could not catch it
  because anchors verify documents against code, not against each other. That
  was true and it was not a reason to have no check: a grep for the abandoned
  phrasing takes seconds and would have caught all three. It is now part of
  what I do after every design edit, and it is the only new practice this run
  has produced that I would keep.
- **Two anchors were off by one line when first written** (`record.ts:479` for
  a line at `:480`, `witness-journal.md:592` for a line at `:593`), and one was
  a `WEAK-ANCHOR` — `findings: [clip(text, EXCERPT_LIMIT)],` occurs twice in
  the producer, so it identifies nothing. All three caught before the round
  closed, two by my own verification pass and one by the checker. The
  underlying habit — writing the citation from what I expect the line to be,
  then verifying — is backwards, and it is the source of every anchor error
  this run. The correct order is read, then cite.
- **Nothing was asserted to the user this round** beyond the iteration-4 report,
  whose one incompleteness (the range predicate defect hiding behind the spec
  contradiction) was named in that same append.

## Stage 2 — Pre-review iteration 5

Three reviewers: `architecture-reviewer`, `checker-engineer`, `rule-auditor`.
`rule-auditor` was brought back and deliberately steered **off** anchor-support
— the check it has twice got wrong — and onto the rule surface, which four
rounds of edits had left unaudited. That worked: it returned no blockers, a
correct hand-verification of the one re-stamped anchor, and two concerns
neither other reviewer raised.

**Four blockers, all fixed within the round. Two concerns carried, one of which
needs a human.**

## Blockers, fixed

- **[B19] Decision 2 still declared the envelope as `{ session, header,
  records }`** — the stale noun surviving in the one place the per-journal
  shape is written down, so an implementer following it would have rebuilt the
  removal Decision 3 closed. Found independently by `checker-engineer` and
  `architecture-reviewer`. The consequence `checker-engineer` traced is the
  serious one: when the scan stops, the report returns `records: 0` while
  `findings` still carries the reason —

  `packages/claims/src/witness.ts:740` — `      records: 0,`

  so a records-shaped envelope would carry **zero lines** for an
  unsupported-version journal and read downstream as a session that did
  nothing. Storing `header` separately is independently unsafe: `scanHeader`
  takes the first non-blank line, so re-emitting a stored header would give a
  headerless journal a valid one it never had. Now `{ session, lines }`, with
  the header stored in place as a line like any other.

- **[B20] `--no-prompts` could not redact an unparseable line.** Rewriting a
  field requires parsing it, and Decision 3 carries unparseable lines verbatim
  — so a prompt line the validator rejects would ship its text under the flag
  that promises to withhold it, silently, for exactly the lines nobody can
  inspect. No document named the exemption. Now `bundle` **refuses**: with
  `--no-prompts` and any unparseable line in a selected journal, it exits
  non-zero, names the session and line numbers, writes nothing, and points at
  `--exclude`. A redaction flag may refuse; it may not appear to work.
  (`architecture-reviewer`)

- **[B21] `tasks.md` §6 still tasked `spec/run-report.md` with "the
  record-level range filter"** — abolished two rounds earlier. My sweep missed
  it because I grepped the abandoned *rule* phrasings and not the abandoned
  *mechanism* names. (`architecture-reviewer`)

- **[B22] An `UNPINNED` anchor of my own**, caught by the checker rather than
  by me: I cited `witness.ts:817` for the missing-`id` branch and the quote
  matched several lines and sat on none of them. Corrected to `:820` with the
  unique `if (!nonEmptyString(id)) {`.

## False premises

- **[FP-L]** `openspec/changes/add-pr-process-report/design.md:7` — the planted
  claim `Note that `retry` is also defined in `spec/fixtures/rules-valid/src/example.ts`, so the two definitions must stay in sync.`
  See the probe section.
- **[FP-M]** Decision 3 said "through `byId`, where **no kind references a
  `mutation`**". Overstated: the validator has a verdict for exactly that
  mistake (`packages/claims/src/witness.ts:1062`), which fires on a `reliance`
  whose `on` names a mutation. True of well-formed journals only. Corrected to
  say so. (`architecture-reviewer`)

## Concerns carried

- **[C18] `report.statement` is carried uncapped into a committed, public
  envelope.** `rule-auditor` routed this as security-shaped with no governing
  rule file, and asks for human eyes on what a coordinator's `statement` can
  contain before this ships. It is the one finding in five rounds that no
  amount of further review can settle, because it turns on a judgement about
  acceptable disclosure rather than on what the code does. **Surfaced to the
  user.**
- **[C19] Decisions 2–4 read as archaeology.** Each opens with what an earlier
  draft got wrong, and two headings still carry the verb the body now rejects.
  `architecture-reviewer`, asked bluntly, says a fresh reader learns the edit
  history before the design and recommends rewriting 2–4 as one clean statement
  of the line-level rule before implementing — explicitly without
  re-litigating any of it. I think this is right and it is the single most
  useful thing left to do to these documents.
- **[C20]** No envelope-version compatibility rule: a committed `version: 1`
  read by a later kernel binds at `data-at-rest`, and the design names only
  `inter-service-skew`. (`architecture-reviewer`)
- **[C21]** The `--no-prompts` hash is over the producer's already-clipped
  text while `chars` is the untruncated length — same shape, different domain.
  Now stated in Decision 4 with the instruction never to present a prompt hash
  as an identity. (`checker-engineer`)

## Confirmed sound

- **The line-level rule holds.** `checker-engineer` checked the byte-level
  questions the rule newly opens: blank lines and trailing newlines are skipped
  identically by both passes, `.trim()` makes CRLF verdict-neutral, and only
  `line` and `detail` shift — both excluded by the `(verdict, subject)` key.
- The converted prompt record validates: the validator requires only a
  non-empty `hash` and checks no derivation.
- Capping `findings` entries is safe: `raw.findings` is read once, as
  `Array.isArray && length !== 0`. No verdict reads entry content.
- `rule-auditor` verified the `action/action.yml:47` re-stamp by hand against
  both commits and confirms it is a correct full re-stamp, not a repoint; and
  confirmed every `STALE` anchor is passive drift via `git blame -L`.
- Both spec deltas keep SHALL on line 1 across all requirements.
- Every anchor in Decisions 1, 3 and 4 verified for enclosing-scope support by
  two reviewers independently.

## Coordinator corrections since last append

- **The propagation failure recurred for the third round running, and my
  countermeasure was too narrow.** I introduced a grep sweep after iteration 4
  precisely for this, and it caught one line — then missed two more, because I
  grepped the abandoned *rule phrasings* ("may not remove a record") and not
  the abandoned *nouns and mechanism names* ("records }", "record-level range
  filter"). A sweep keyed to the sentences I remember writing cannot find the
  ones I forgot. The durable version is to grep for the vocabulary the old
  design *introduced*, not the sentences it was stated in.
- **My verdict-grep hid a failing anchor from me.** After editing I ran
  `grep -E 'FABRICATED|WEAK-ANCHOR|WRONG-LINE'` over the checker's output and
  reported "no anchor defects". The actual verdict was `UNPINNED`, which was
  not in my pattern, and the run had two unverified claims at the time. I had
  built a hand-rolled filter over a tool that already reports its own exit code
  and summary, and trusted the filter. Reading the tail of the output — which I
  do elsewhere — would have shown `2 unverified claim(s)` immediately.
- **`rule-auditor`'s return justified bringing it back**, and the earlier
  exclusion still looks correct. Both can be true: it was measurably bad at one
  check and is good at the ones it was given this round. Recording it because
  the tidier story — that dropping it was simply right, or simply wrong — is
  the one I would otherwise tell.

## Probe — stage 2

verdict: CAUGHT
iteration: 5
planted: openspec/changes/add-pr-process-report/design.md:7, under "## Context"
in scope of: architecture-reviewer (declares a false-premise pass; openspec/ path), rule-auditor (declares a false-premise pass; unconditional)
dispatched: architecture-reviewer, checker-engineer, rule-auditor
caught by: architecture-reviewer
not caught by: rule-auditor, which was in scope this round but was explicitly
briefed to spend the round on rules rather than on anchor support. It reported
"False premises: None". That is a brief effect rather than a reviewer failure,
and it is worth recording as a cost of narrowing a brief: I narrowed the one
in-scope agent away from the pass the probe measures, and the probe's scored
population was again effectively one.
rotation: proposal.md -> design.md -> tasks.md -> proposal.md -> design.md.

## Stage 3 — Refine iteration 5

Iteration 5's blockers were fixed within that round and are recorded there.
This append covers the two things the user decided afterwards, and one
renumbering a reader of the earlier appends needs to know about.

## `report.statement` is capped, under its own flag

The user's answer to the one finding five rounds of review could not settle.
`rule-auditor` routed it as security-shaped with no governing rule file: an
unbounded, contributor-controlled string landing in a public committed file,
with nobody having measured what it can contain. It is now capped at a stated
budget, and **the cap is recorded under a new flag rather than `truncated` or
`response_chars`** — those describe the clipped *findings* entry, and borrowing
them would assert a long response behind an empty excerpt, which is the exact
mismatch the redaction decision already refuses elsewhere. A task asserts the
flag is a new key, because a test that accepted `truncated` here would pass the
defect.

Rejected, both by the user: carrying it uncapped, and dropping `statement`
entirely.

## Decisions 2-4 rewritten as one statement

`architecture-reviewer`, asked bluntly whether five rounds of revision had left
the design coherent, said it read as archaeology — each decision opening with
what an earlier draft got wrong, two headings still carrying the verb the body
rejects, a fresh reader learning the edit history before the design. The user
agreed and chose the rewrite.

**No decision was re-litigated and no argument was dropped.** Decision 2 is now
the envelope shape, Decision 3 is the line-level rule with its four supporting
sections — why lines rather than records, why redaction cannot remove, what
redaction does, and what `--no-prompts` does — and Decision 4 is selection.
Every anchor survived; the checker reports 57 markers verified.

**Renumbering, and this matters for reading the earlier appends.** The old
Decision 3 was *selection* and the old Decision 4 was *redaction*. They are now
the other way round: **Decision 3 is redaction, Decision 4 is selection.**
Every "Decision 3" and "Decision 4" in the iteration 1-5 appends above refers
to the old numbering. Those appends are an append-only record and were not
rewritten to match — editing them would be rewriting the history they exist to
preserve.

## Coordinator corrections since last append

- **The rewrite swapped two decision numbers and I nearly shipped the stale
  cross-references.** Having just written, in the iteration-5 synthesis, that
  my sweep must key on abandoned *vocabulary* rather than abandoned sentences,
  I performed a structural edit that invalidated a different class of reference
  entirely — ordinal cross-references — and only caught it because I swept for
  `Decision [0-9]` immediately afterward. One live reference in `tasks.md` was
  wrong; the design's own two were correct by luck rather than by care. The
  general lesson is now three rounds old and I keep finding new surfaces it
  applies to: **any edit that moves or renames a thing invalidates references
  to it, and the reference class is not always the one I just learned about.**
- **The earlier appends are now internally inconsistent with the design, on
  purpose.** I am recording that as a known cost rather than a defect, because
  the alternative — silently renumbering a historical record so it agrees with
  the present — is the failure this whole change is about.

## Stage 5 — Verify chunk 1 (Stage A, the bundle)

build: pass
type-check: pass
test: pass (kit 406 passed; claims 961 passed, 6 known ugrep failures — all six in flagConformance.test.ts, the baseline, untouched)
dogfood gates: pass, both polarities

Gate-list discrepancy worth recording: the skill documents
`check 'README.md' 'spec/**/*.md' --require-markers`, which FAILS here because
README.md carries no grounding markers. CI runs `check 'spec/**/*.md'
--require-markers` — no README.md — and that passes. CI is what gates the PR,
so CI's command is the one this run treats as the gate. The skill's list is
wrong about this and it is not a defect in the change.

Second correction to my own gate run: `check '.canary-probe.md'` returned 0
where the skill's list implies a failure. That was my setup error, not a quiet
verdict — CI creates the file and PLANTS a canary before those two lines. Run
with the plant, all four canary gates behave: guard fires on the planted
document (exit 1), --probing is the only thing that lets it through (exit 0),
and a silent report scores MISSED (exit 1). I nearly reported a live gate as
broken; the fixture was fine and the invocation was not.

Fixture claims verified independently rather than taken from the implementer's
report:
- spec/fixtures/report/stale-verification.jsonl trips STALE-VERIFICATION
- spec/fixtures/report/rejected-lines.jsonl trips MALFORMED x2 and DUPLICATE-ID
- spec/fixtures/report/pr58-session.jsonl is version 0.2, branch main,
  11 distinct mutation paths, 4 of them .claude/agent-memory/**

## Stage 5 — Verify chunk 2 (Stage B, the report)

build: pass
type-check: pass
test: pass (kit 406; claims 1033 passed, +72 from chunk 1; 6 known ugrep failures, all in flagConformance.test.ts)
dogfood gates: pass, both polarities, including the canary round trip run with the plant CI does first

Verified independently rather than taken from the implementer's report — the CI
step's own assertions, run locally:
- all four tier headings render, plus the mermaid block
- the v0.2 bundled journal renders "tier breakdown not recorded" AND prints no
  count for it: `! grep -qE '^### Records attributed to the harness — [0-9]'`
- no bundle -> code-verified still renders and the absence names the path
- JSON: kind=run-report, version=1, embedded check.version=1 with no check.kind,
  so the two documents are told apart by the discriminator and the key rather
  than by their matching version
- tampered bundle -> validator finding rendered and NO dispatch count printed
- determinism: two renders one second apart are byte-identical
- dependency direction: no kit import in witnessReport.ts, kit is not a claims
  dependency; the only "kit" mention is a doc comment

## Two defects the coordinator found in the implementer's output

1. **Hard rule 12 violation in the new CI step.** It stored the command as
   `claims="node packages/claims/dist/cli.js"` and invoked `$claims …` at seven
   call sites — verbatim the second example the rule names. It happens to work
   in bash, which is what CI runs, and that is exactly why the rule is written
   about the pattern rather than about an observed failure. Inlined at all seven
   sites. The step's assertions themselves are excellent and were kept
   unchanged: every one is a `grep`, not an exit code, on the correct reasoning
   that Decision 13 makes the verb's exit code carry one bit.

2. **Three `COUNT-MISMATCH` failures caused by this change landing** — see the
   coordinator corrections below.

## Coordinator corrections — during Stage 5 chunk 2

Appended at the moment of correction rather than at the stage boundary, per the
evidence contract: Stage 5's mechanical verify blocks are exempt from the
corrections section, but a correction *discovered during* verify gets its own
append and this is it.

## This change falsified three search anchors by landing, one of them somebody else's

`check 'openspec/**/*.md'` went from passing to failing the moment Stage B's
code existed. Three `COUNT-MISMATCH`, all genuine:

1. **`add-pr-process-report/design.md`** — `grep -rn 'mermaid' …` claimed 0.
   Now 26, because the renderer this design proposed renders mermaid.
2. **`add-pr-process-report/proposal.md`** — `grep -rn '"report"' packages/claims/src/cli.ts`
   claimed 0. Now 1, and the one result is the verb this proposal asked for.
3. **`add-diff-scoped-strictness/proposal.md`** — not this change's document at
   all. Its pattern included `changedFiles`, and Stage B's renderer scopes by a
   range's changed-file set, so a landing change turned an unrelated unmerged
   proposal red from outside. Its author did nothing wrong.

**What I did, and why it is not weakening a claim.** For 1 and 2 I restated the
count and said what moved it — the prose is now past-tense about the state the
design was written against. For 3 I narrowed the grep to the flags, because the
paragraph's actual claim is *"No flag by any of the obvious names exists"* and
`changedFiles` is an internal identifier in a different verb's renderer, which
was never evidence about `check`'s argument surface. The pattern was broader
than the sentence it supported; the sentence is unchanged and still true.

**The general finding is recorded in `IDEAS.md`, not fixed here.** A search
anchor has nowhere to put a commit stamp, so an "absence of X" claim in a
proposal that adds X is designed to rot with no advisory fallback — it goes
straight to a hard `COUNT-MISMATCH`. That is the exact failure
`rev-stamp-change-anchors` was written to prevent for presence anchors, and the
grammar has no answer for it. Three options are written up there; none is
obviously right, and picking one inside this change would be scope creep.

## I let a hard-rule violation through in a dispatched agent's output

The new CI step stored the checker command in a shell variable and invoked
`$claims` at seven call sites. That is hard rule 12's second named example
verbatim. It works under bash, which is what CI runs — which is precisely why
the rule is written about the pattern and not about an observed failure, and
precisely why I should have caught it by reading the diff rather than by
running it. Inlined at all seven sites.

I had pinned the integration points in that brief carefully and did not think to
state the shell rules. A brief that pins APIs and omits the repository's own
prohibitions gets code that satisfies the APIs.

## What I got right that I nearly got wrong last chunk

I ran the canary round trip *with the plant CI performs first*, rather than
bare. Last chunk I ran it bare, read exit 0, and briefly concluded a live gate
had gone quiet. The gate was fine and my invocation was not.
