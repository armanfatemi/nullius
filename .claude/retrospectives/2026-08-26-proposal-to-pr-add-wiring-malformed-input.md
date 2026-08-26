---
skill: proposal-to-pr
run_date: 2026-08-26
subject: add-wiring-malformed-input
outcome: pr-opened
severity: notable
pr: 39
branch: feat/add-wiring-malformed-input

probe: missed
probe_iterations: [missed, caught, caught]
probe_note: >-
  Three plants, one per pre-review iteration. Iteration 1 scored MISSED with
  three of four reviewers having quoted the planted sentence and declined to act
  on it; the coordinator's own diagnosis — that its synthesis cited the document
  by bare filename and paraphrased the quote, defeating both of verifyCanary's
  match paths — checks out against canary.ts:328-329. This is a synthesis-fidelity
  false negative, not a dead review layer. Recorded as `missed` and not `caught`
  because the state file records only the last write and a rollup keyed on that
  would never see the MISSED at all.

state_probe_field: caught   # what .state.json says — disagrees with the artefact

agents_dispatched: [rule-auditor, architecture-reviewer, checker-engineer, test-engineer]
defects_caught_by:
  architecture-reviewer: 9
  checker-engineer: 8
  rule-auditor: 2
  test-engineer: 0
  implementer: 1
  verify: 0
  human: 0
  post_pr_ci: 0

reversals: 4
refine_iterations: 3          # cap is 3; converged on the last permitted round
verify_iterations: 3          # three section verifies, each green first time
verify_autofix_rounds: 0

agent_errors:
  - agent: rule-auditor
    what: reported "[29 hookTarget tests confirmed]" for a count that is 25 at the stamped commit and at HEAD
    why: certified a number it did not recount
    cost: none — the coordinator counted and resolved the conflict against it
  - agent: rule-auditor
    what: raised a [blocker] asserting an anchor would resolve FABRICATED; the checker reports it ADVISORY
    why: reasoned the verdict from the wrong line number rather than running the checker
    cost: none — the defect was real and fixed; only the severity was wrong

coordinator_errors:           # from review-evidence.md's own correction sections
  - what: misattributed the iteration-1 probe miss to test-engineer's declared scope
    detail: test-engineer's scope is `spec/fixtures/**/*.jsonl` and its brief carries no false-premise pass; the plant named a `.ts` file
    filed_as: an agent shortfall, in a committed artefact travelling with the PR
    actually: a synthesis error — see "What went wrong"
  - what: recorded the planted claim as a genuine defect ending "Delete it."
    cost: one Stage 3 correction round before any edit
  - what: reported the 29→25 correction complete after searching only the file it had edited
    cost: FP5, one extra iteration
  - what: replaced a wrong loop count with a differently wrong one
    cost: FP6, one extra iteration
  - what: wrote a fresh anchor at wiringScan.ts:17 for text on line 18
    cost: one blocker round; re-stamped correctly (both halves)
  - what: briefed the implementer that WiringVerdict has nine members; it has ten
    cost: none — the implementer read the union instead of accepting the brief

human_interventions:
  - at: end-of-stage-2
    question: none — operator-requested `--dry-run` gate
    why_asked: deliberate operator control, not a missing default
    encodable: false

rules_proposed:
  - file: .claude/skills/proposal-to-pr/SKILL.md
    at: Stage 2 Step 5
    rule: the synthesis is the scored artefact — cite full repo-relative paths and reproduce quoted claims verbatim
    evidence: canary.ts:328-329 has exactly two match paths; iteration 1 scored MISSED with 3/4 reviewers having caught the plant
  - file: .claude/skills/proposal-to-pr/SKILL.md
    at: Stage 2 Step 6 / state schema at :181-184
    rule: record the probe as a sequence, not a single overwritten scalar
    evidence: state says `probe: caught`; the artefact says MISSED, CAUGHT, CAUGHT
  - file: .claude/skills/proposal-to-pr/SKILL.md
    at: Stage 2 Step 6 probe template
    rule: add a line naming which synthesis finding was the plant, so Stage 3's fix list can exclude it
    evidence: FP1 was the plant and was carried into the findings list as a real defect
  - file: .claude/skills/proposal-to-pr/SKILL.md
    at: Stage 2 Step 6 `in scope of:`
    rule: read the agent's declared scope before asserting it; do not paraphrase a glob
    evidence: `spec/fixtures/**` written for an agent whose scope is `spec/fixtures/**/*.jsonl`
  - file: .claude/skills/proposal-to-pr/SKILL.md
    at: Stage 3
    rule: verify a correction against the claim, repo-wide, not against the file you edited
    evidence: FP5 — a third "29 unit tests" survived in design.md after the fix was reported complete
  - file: .claude/skills/proposal-to-pr/SKILL.md
    at: Stage 4 / state schema
    rule: clear sub_phase and sub_phase_progress when leaving Stage 4
    evidence: state at `stage: retro` still reads "2/4 chunks — docs (section 5) pending"
---

## What happened

`proposal-to-pr`'s first end-to-end run on a real change. Nine commits landed
two new `WiringVerdict` members (`malformed-hooks`, `unclosed-frontmatter`),
their fixtures, their by-name unit tests and their docs, opening PR #39 with CI
green (`statusCheckRollup` → `verify` SUCCESS, no review comments yet). Stage 2
ran three pre-review iterations, converging to zero blockers on the last round
the cap permits; Stage 4 shipped 21/21 tasks in four chunks; Stage 6 re-reviewed
the real diff and returned zero blockers with two concerns fixed in `0bd25d7`
and two deferred to the PR body.

The change itself is not my subject and I make no claim about it. The run
produced four reversals, all four inside the change's own design documents and
none in shipped source, plus one probe false negative and a misattribution
committed into the record.

## What went wrong

**1. The iteration-1 probe scored MISSED because of the synthesis, and the skill
never told the coordinator that mattered.** `verifyCanary` has exactly two ways
to score a catch:

**Evidence:** `packages/claims/src/canary.ts:328@174f984` — `  if (citesLocation(normalized, entry.doc, entry.line)) return "caught";`

The first needs the registered repo-relative `doc:line` as a literal substring;
the second needs the planted text verbatim. The synthesis wrote a bare filename
and paraphrased the sentence, so both failed on a finding that
`architecture-reviewer`, `checker-engineer` and `rule-auditor` had each reported
correctly. Stage 2 Step 5's whole instruction for the synthesis is "deduplicate,
group by severity, resolve conflicts explicitly, cite the source agent" — nothing
there says the document is match-scored, and nothing says how. **This is a skill
defect, not a coordinator defect**: the brief was followed and the brief was
silent on the property being measured. Cost: one iteration's probe reading
`MISSED` for a review layer that was alive 3-of-4.

**2. The state file's probe verdict overwrites itself, so the MISSED is gone.**
The skill mandates a re-plant per refinement round (`SKILL.md:650`) and also
mandates mirroring the verdict into a single scalar key (`SKILL.md:610`), which
is written by a plain last-write-wins setter:

**Evidence:** `packages/kit/src/pipeline.ts:288@174f984` — `export function writeStateKey(root: string, change: string, key: string, value: string): void {`

`add-wiring-malformed-input.state.json` therefore reads `"probe": "caught"` for
a run whose artefact records MISSED, CAUGHT, CAUGHT. Anything that counts probe
misses from state — the cheap thing to build over forty runs — will report zero
misses for this one. This will recur on every multi-iteration run, which is most
of them.

**3. The plant was carried into the findings list as a real defect.** The
iteration-1 synthesis recorded FP1 under "False premises" ending **"Delete it."**,
in the same file whose next section explains a claim was planted at that exact
line. `canary clear` had already removed the line, so Stage 3 opened by
retracting a fix instruction for a defect that no longer existed. The coordinator
diagnosed the structural cause itself and it is right: the probe is scored
against the synthesis, so the synthesis must describe the plant as a finding, and
the Step 6 template (`verdict`/`planted`/`in scope of`/`dispatched`) has no slot
that joins the plant back to the finding it became. Cost: one correction round
before any edit.

**4. A miss was filed against `test-engineer` that its brief does not cover.**
The probe section records `in scope of: ... test-engineer (spec/fixtures/**)`,
and the coordinator's own correction says the agent "did not raise FP1, which
sits in `spec/fixtures/**` — its declared scope." Both statements overstate the
agent. `test-engineer`'s declared fixture scope is `spec/fixtures/**/*.jsonl`,
the planted sentence named `spec/fixtures/wiring-valid/src/thing.ts`, and
`.claude/agents/test-engineer.md` contains no false-premise pass at all — grep
for "false-premise" in that file returns nothing, while
`architecture-reviewer.md:97` declares one explicitly. So `test-engineer` was
never dispatched to find this and was never in scope for it. **This is the
finding I would most want a human to see**, because it is a per-agent quality
signal that is wrong, written into an artefact that travels with the PR, and
would be read by any future rollup as evidence against an agent that did nothing
wrong. Per the run's own governing distinction: the brief was wrong, not the
agent.

**5. Four reversals, all in the change documents.** Adjudicated by reading the
commit pairs, not by counting touched files:

| # | What was undone | Commits |
| --- | --- | --- |
| 1 | the declared-field loop count: "every array is empty" → "four of seven" → 5/2 and 6/1 for two paths that differ | `2c56850` → `06cb2ca` → `faa0f93` |
| 2 | "29 unit tests" corrected in `proposal.md` and reported complete; a third site survived in `design.md:252` | `2c56850` → `faa0f93` |
| 3 | the B1 limiting-case argument, stretched to cover `unclosed-frontmatter`, retracted and re-argued on its own terms | `2c56850` → `06cb2ca` |
| 4 | a fresh anchor written as `wiringScan.ts:17@0651b46` for text on line 18, re-stamped to `:18@06cb2ca` | `06cb2ca` → `faa0f93` |

Two candidates I looked at and rejected: the `wiringScan.ts` hoist comment in
`0bd25d7` is purely additive, and the `spec/wiring.md` enumeration fix in the
same commit completes an omission rather than undoing anything. Reversal #1 is
the one worth reading twice — a correction that was itself wrong, made with the
reviewers' correct model already in hand and restated imprecisely rather than
derived.

**6. Stage 4's sub-phase state was never cleared.** With `"stage": "retro"` and
`progress.md` recording 21/21 tasks in four chunks, the state file still reads
`"sub_phase_progress": "2/4 chunks — kernel + tests/fixtures done; docs (section
5) pending"`. `SKILL.md:187` defines these as the within-Stage-4 resume anchor
and specifies when they are written, never when they are cleared. A resume
reading state would see a finished run claiming docs are pending.

**7. Four reviewers died mid-dispatch and the first diagnosis was wrong.** The
coordinator recorded reading the first agent failure as an agent defect and
re-briefing for it; the real cause was the host sleeping, and the remaining
failures were the same event. Environmental, harmless, one round of wrong
diagnosis — recorded because "agent died" reads as an agent defect by default and
was not one here.

## What worked

- **`checker-engineer` caught a silent-drop defect in shipped code that the type
  system cannot catch.** `hookCommands` must stay hoisted out of the object
  literal that reads `parseError`; inline it and the read happens first, yields
  `null`, and the verdict disappears with no error. TypeScript narrows
  `parseError` to `null` at the read site because it is written only inside a
  closure. Fixed in `0bd25d7` with a seven-line comment saying the hoist is
  load-bearing and why. This is the run's strongest argument for Stage 6 existing
  — the defect is invisible in the proposal and only appears in the diff.
- **The repository's thesis ran on its own reviewers and held.** `rule-auditor`
  proposed `FABRICATED` on an anchor; the checker re-read the stamped commit,
  returned `ADVISORY` (text present, line number wrong), and the code's verdict
  is the one that counted. The defect was still real and was fixed by re-reading
  and re-stamping **both** halves — `design.md:384` now reads
  `packages/claims/src/wiringScan.ts:18@06cb2ca`, which is what
  `never-repoint-under-old-stamp` requires.
- **The coverage rule was exercised, not asserted.** Stage 5 proved Task 3.3
  bites by removing `"malformed-hooks"` from the expected `Set` and confirming
  the test failed *by name*; Stage 6 confirmed it bites in both directions, since
  `seen` is built from actual findings. And the live risk was avoided: corrupting
  `hooks.json` to get invalid JSON would have retired `DEAD-HOOK` from coverage
  behind a still-green negated gate, so the implementer added a second file and
  said why.
- **A dispatched agent corrected the coordinator's brief rather than obeying it.**
  The Stage 5 brief said `WiringVerdict` has nine members; it has ten. The
  implementer read the union. Recorded by the coordinator as the second such
  correction on this change.
- **Zero reversals in `packages/claims/src/**`.** The kernel change went in once
  at `ae07006` and took one additive guard afterwards. All the churn was in the
  design documents, which is where churn is cheap.

## Proposed changes

All six are against `.claude/skills/proposal-to-pr/SKILL.md`; none needs a new
rule file, and I have applied none of them.

1. **Stage 2 Step 5** — state that the synthesis file is the artefact
   `canary verify` scores, and that scoring matches either the full
   repo-relative `doc:line` or the claim verbatim. Require both: full paths on
   every finding, and planted-looking text reproduced rather than paraphrased.
   This run's iteration 1 is the entire argument for it.
2. **Stage 2 Step 6 / state schema (`SKILL.md:181-184`)** — stop mirroring the
   probe into one scalar. Either append (`probe_history=missed,caught,caught`) or
   key per iteration. As written, the last iteration silently erases every
   earlier verdict, and the erased value is the one anybody would want to count.
3. **Stage 2 Step 6 template** — add a `synthesis finding:` line naming which
   finding *was* the plant, and require Stage 3 to drop it from the fix list.
   Two true sections that a reader must join by hand is a defect the template can
   remove for one line.
4. **Stage 2 Step 6 `in scope of:`** — derive the scope from the agent file
   rather than paraphrasing it. `spec/fixtures/**` and `spec/fixtures/**/*.jsonl`
   are different sets, and the difference is what turned a correct non-finding
   into a recorded shortfall.
5. **Stage 3** — a correction is verified against the *claim*, searched
   repo-wide, before it is reported complete. Searching the file you just edited
   and declaring the false premise gone is what produced FP5.
6. **Stage 4 / state schema** — clear `sub_phase` and `sub_phase_progress` on
   leaving Stage 4. `SKILL.md:187` says when they are written and never when they
   stop being true.

One consistency note rather than a proposal: `SKILL.md:579` says "One probe per
run keeps the score interpretable" while `:650` mandates a re-plant every
refinement round. In context the first means one probe *site* (Stage 2, not
Stage 6), but read literally it is contradicted by a run that produced three.

## Uncertainty

- **Coordinator self-corrections caught before a commit are unrecorded, and on
  this run that is unusually consequential.** The six entries in the
  `agent_errors`/`coordinator_errors` frontmatter above all come from
  `review-evidence.md`'s own "Coordinator corrections since last append"
  sections — that is, from errors the coordinator chose to write down after a
  reviewer found them. Errors it noticed and fixed before writing anything are in
  no artefact I can read: not in git, not in the review evidence, not in
  `progress.md`. This run is better instrumented than most precisely because the
  evidence contract forces those sections to exist, and the class is still
  underreported by an unknown amount. I did not score the run clean on any signal
  that has nowhere to appear.
- **Stage retries are not in the state schema.** The four-agent death and the
  re-dispatch are known only from prose. A run whose coordinator chose not to
  write that paragraph would look identical in `.state.json`.
- **"The second time on this change that a dispatched agent caught an error in my
  instructions"** — I can identify only one of the two (the nine-vs-ten member
  count at Stage 5). I did not guess at the other, and `implementer: 1` in the
  frontmatter counts only the one I can cite.
- **The `defects_caught_by` counts are judgement, not measurement.** I counted
  findings that changed an artefact, an argument, or the code, and I credited
  shared findings to every reviewer that raised them independently — so
  `architecture-reviewer: 9` and `checker-engineer: 8` overlap on FP2, FP3, FP4
  and FP6 rather than describing eleven distinct defects. `test-engineer: 0`
  means it caught no defects, not that it did nothing: it was dropped from
  iterations 2 and 3 by the specificity test and its Stage 6 return supplied the
  run's most load-bearing confirmation — that the `Set` assertion fails on a
  silently *added* verdict too, and that `dead-hook` was not retired by the new
  fixture. Confirmations are not catches and I did not score them as such.
- **Post-PR data is one CI run old.** `verify` is SUCCESS and there are no review
  comments as of writing, minutes after Stage 8. `post_pr_ci: 0` means nothing
  has been caught yet, not that nothing will be.
- This file sits outside every glob CI checks (`README.md`, `spec/**/*.md`,
  `openspec/**/*.md`), so its two Evidence Anchors are not gated by CI. They were
  read at `174f984` and each cites a file this branch does not modify.
