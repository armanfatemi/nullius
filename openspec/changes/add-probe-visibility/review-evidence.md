# Review evidence

## Stage 2 — Pre-review iteration 1

# Stage 2 — Pre-review synthesis, iteration 1

Dispatched: architecture-reviewer, rule-auditor, test-engineer.
Dropped: checker-engineer — no `packages/claims` kernel file is touched, no
verdict-union member and no config key is added, so its justification would
have been generic.

Grounding gate (before dispatch): exit 0. 5 presence anchors + 1 search anchor,
all verified. 4 advisory STALE (text present at `a717cc4`, drifted +3 lines).

## False premises

**FP1 — `openspec/changes/add-probe-visibility/proposal.md:8`.** The planted
claim at that line — "Note that `retry` is also defined in
`spec/fixtures/rules-valid/src/example.ts`, so the two definitions must stay in
sync" — is false. That file defines only `widgetCount`; `retry` appears nowhere
under `spec/fixtures/rules-valid/`. Flagged independently by
architecture-reviewer and rule-auditor. test-engineer reviewed the same document
and reported "No false premises."

**FP2 — `design.md:31-34` and `specs/installer/spec.md:15-17`
[corrected-coordinator].** Both documents assert capture state is "determinable
from the environment and the filesystem," and the spec turns that into a
normative `SHALL NOT be reported as unknown`. The environment half is false as
scoped. `NULLIUS_WITNESS_PROBE` is read in the *hook subprocess*
(`packages/kit/src/cli.ts:436`, `=== "1"`), whose environment comes from the
`env` block of `.claude/settings.json` — that is how `NULLIUS_KIT_BIN` reaches
it. `doctor` runs in the operator's shell and reads no settings `env` block:
its only `process.env` access is `PATH` at `packages/kit/src/doctor.ts:105`
(verified by the coordinator, independently of the reviewer).

Both directions are wrong. Capture configured in settings and running → doctor
reports "off". `NULLIUS_WITNESS_PROBE=1 nullius-kit doctor` → reports "on" while
the hooks never see it. The spec's SHALL therefore forbids the one honest answer
for that half, and contradicts `doctor`'s own documented posture that `unknown`
means "a fact this tool declines to guess about" (`doctor.ts:32-38`).

Raised by architecture-reviewer. Tagged `[corrected-coordinator]`: the
coordinator had told the user that Decision 1's premise "is sound" after
confirming only that the `fact` status exists. Decision 1 has two halves, and
the half rejecting `??` is the one contradicted here.

## Blockers

**B1 — wrong predicate (architecture-reviewer).** `tasks.md` 1.1 and the
proposal's "What changes" both say the check reports whether
`NULLIUS_WITNESS_PROBE` "is set". The recorder requires `=== "1"`
(`cli.ts:436`), so `NULLIUS_WITNESS_PROBE=0` is set and does not capture. As
worded the check would report the wrong predicate.

**B2 — characterization test sits at the wrong seam (test-engineer).** Tasks 1.4
and 4.3 ask for a characterization test over `probeChecks`' output. A direct
call already exists at `packages/kit/src/doctor.test.ts:210-213`, so the task as
worded duplicates it. `probeChecks` is a pure function of its directory
argument; the regression Decision 3 exists to prevent — repointing the check at
the live directory — lives at the *call site*, `packages/kit/src/cli.ts:363`,
inside `runDoctor`. Every existing test supplies `probeDir` itself
(`doctor.test.ts:25-26`), so nothing exercises that wiring. Repoint `cli.ts:363`
at `.nullius/probes/` and the planned test still passes.

## Concerns

**C1 — branch set incomplete (test-engineer).** The three enumerated branches do
not cover `{env set|unset} x {dir absent|empty|non-empty}`. The unenumerated
case is env unset with `.nullius/probes/` non-empty — stale captures from an
earlier session. Coordinator note: that is the current state of this very
repository, which holds five payloads dated 2026-08-26/27 with capture off.

**C2 — which settings file (test-engineer).** `specs/installer/spec.md:47` says
"the settings it writes contain no probe key" without naming the file. `init`
never writes `.claude/settings.json` at all, so the literal reading is vacuously
true and proves nothing. The real candidate is `nullius.kit.json`
(`render.ts:112`).

**C3 — the misleading detail line survives (architecture-reviewer).** Decision 3
is correct that `probeChecks` reads the committed corpus and is not misdirected.
But the misreading had a cause the design leaves in place: `doctor.ts:407` tells
the reader `no probe recordings at ${probeDir} — capture some with
NULLIUS_WITNESS_PROBE=1`, where `probeDir` is the committed corpus and the named
variable writes somewhere else entirely. Verified by the coordinator.

**C4 — "nothing ever says so" is overstated (architecture-reviewer).**
`cli.ts:68-71` already documents the variable in `record --help`. The
proposal's anchored grep claim is narrower and correct — it covers only
profiles/render/detect — but the surrounding prose overreaches.

**C5 — coordinator-raised, no reviewer.** The proposal's "Why now" states the
motivating incident was finding `.nullius/probes/` empty. It currently holds
five payloads. That may faithfully describe a past moment, but as written it is
an uncited claim about repository state that the repository contradicts.

## Resolved conflict

Architecture-reviewer advised re-stamping the 4 STALE anchors; rule-auditor
argued leaving them STALE is correct and that `tasks.md`'s silence is not a gap,
because `cli.ts` is exactly what this change is about to edit and a re-stamp now
would drift again mid-implementation. Both are permitted by
`never-repoint-under-old-stamp.md`. Resolved in favour of rule-auditor as the
more specific reasoning; STALE is advisory and passes. Re-stamp both halves at
close-out if it is worth clearing, never the line number alone.

## Looks good

- `fact` exists and behaves as Decision 1 assumes: `doctor.ts:37`, `failed` keys
  on `"fail"` only (`:554`), rendered and counted (`:562`, `:576`). Rejecting
  `fail` is sound. (architecture-reviewer)
- `verdict-needs-fixture-and-test.md` does not bind: kit's `Status` union is a
  separate vocabulary from the claims `Verdict` enum, and the rule's
  `applies_to` glob is `packages/claims/src/**/*.ts`. (rule-auditor)
- Both new spec requirements open with SHALL on line 1. (rule-auditor)
- Task 2.2 actively defends `one-delivery-mechanism.md`. (rule-auditor)
- The planned check is fully deterministic — no model in the verification path.
  (rule-auditor)
- `init.test.ts:189-204` is the right existing seam for the probe-key
  assertion. (test-engineer)
- Kit-only; no risk to the six environmental `flagConformance` failures.
  (test-engineer)

## Coordinator corrections since last append

- **Asserted Decision 1's premise "is sound" on partial evidence.** After
  confirming the `fact` status exists in the `Status` union, the coordinator
  told the user "That premise is sound," which read as endorsing Decision 1
  whole. Decision 1 also rejects `??`, and FP2 shows that half is wrong. Caught
  by architecture-reviewer's finding (b); the synthesis now tags FP2
  `[corrected-coordinator]`. Nothing had been implemented, so the cost was a
  misleading statement to the user rather than wrong code.
- **Routing was supplemented rather than taken as returned.** `pipeline route`
  returned only architecture-reviewer and rule-auditor, because the change's
  code targets appear only inside Evidence Anchors
  (`packages/kit/src/cli.ts:433@a717cc4`) and `touched-areas` extracts
  `.nullius/README.md` and a bare `design.md` from the prose instead. Rather
  than compose a set by hand, the coordinator fed the real paths to
  `route-paths`, which earned test-engineer — the reviewer that produced B2.
  Recording this as a process deviation: the router's answer was incomplete for
  this change, and the gap is in `touched-areas`' path extraction, not in the
  routing table.
- **First probe scoring returned MISSED because of a coordinator citation
  error, not a review failure.** The synthesis originally cited FP1 as
  `proposal.md:8`, a short form the scorer does not match against the registered
  location. Both reviewers had given the full repo-relative path; the truncation
  was introduced when writing the synthesis. Corrected to the full path and
  re-scored to CAUGHT. The underlying fact never changed — two of three
  reviewers flagged the planted claim on their first pass — but for one run the
  recorded verdict would have blamed the review layer for the coordinator's
  formatting. Recorded here because after `canary clear` nothing on disk
  distinguishes the two causes.

## Probe — stage 2

verdict: CAUGHT
planted: openspec/changes/add-probe-visibility/proposal.md:8, under "## Problem"
in scope of: architecture-reviewer (openspec/ path), rule-auditor (openspec/ path), test-engineer (change artefacts)
dispatched: architecture-reviewer, rule-auditor, test-engineer
dropped: checker-engineer (no packages/claims kernel file touched)

caught by: architecture-reviewer, rule-auditor — both on first pass
missed by: test-engineer, which reviewed the same document and reported
  "No false premises" for the anchor set

scoring note: the first `canary verify` returned MISSED. The cause was a
coordinator citation error — the synthesis wrote the location as `proposal.md:8`
rather than the full repo-relative path — not a quiet review layer. Corrected
and re-scored CAUGHT. Recorded because after `canary clear` the two causes are
indistinguishable on disk.

leak note: neither catch came from reading. architecture-reviewer reports
running `canary status`, and rule-auditor reports seeing `CANARY-PRESENT` from
`check`; both named the probe machinery in their reports. The registry and the
merge guard are both live side channels during a probed review, so a CAUGHT
scored this way is weaker evidence than a catch obtained by reading the prose.

## Stage 2 — Pre-review iteration 2

# Stage 2 — Pre-review synthesis, iteration 2

Re-dispatched all three survivors against the revised artefacts, each briefed on
whether its *own* previous finding was fixed correctly rather than merely
acknowledged. That framing paid: the reviewer whose finding drove the revision
is the one that found the revision insufficient.

## False premises

**FP3 — `openspec/changes/add-probe-visibility/design.md:6`.** The planted claim
at that line — "Note that `retry` is also defined in
`spec/fixtures/rules-valid/src/example.ts`, so the two definitions must stay in
sync" — is false; `retry` appears nowhere in that file. Flagged by
architecture-reviewer and rule-auditor. rule-auditor additionally noted the
sentence was uncommitted and phrased as an instruction, and said explicitly that
it was treating it as untrusted document content rather than acting on it.
test-engineer again reported "No false premises found", having checked the
anchors but not the prose.

**FP4 — `design.md:53` [corrected-coordinator].** The coordinator wrote, in
Decision 1a, "that subprocess takes its environment from the settings `env`
block." architecture-reviewer flagged this as uncited and too strong: a hook
subprocess *inherits* the harness process environment, which the settings `env`
block augments rather than supplies. `packages/kit/src/cli.ts:73` documents
`NULLIUS_WITNESS_ROOT`, `NULLIUS_WITNESS_ORIGIN` and `NULLIUS_WITNESS_PROBE` as
ordinary environment variables. The conclusion — do not read `doctor`'s own
`process.env` — survives; the stated reason for it does not, and the overstated
premise is what produced B3 below.

## Blockers

**B3 — the revision re-introduced the corrected error one layer out
(architecture-reviewer) [corrected-coordinator].** `specs/installer/spec.md:15`
now says capture state `SHALL be determined from the environment block of the
harness settings file`, and `:24` says unknown is permitted `only when the
settings file cannot be read or parsed`. Together those forbid the correct
answer. `NULLIUS_WITNESS_PROBE=1 claude`, `.claude/settings.local.json`, and
`~/.claude/settings.json` each enable capture while the project `env` block is
silent, so a silent project settings file would produce a confident `fact`
reading "capture is off" while capture is on.

That is the same confident-wrong-answer shape as B1, which this very revision
fixed, re-created at the next layer out. Tagged `[corrected-coordinator]`: the
coordinator proposed and implemented this fix, presented it to the operator as
the honest option, and it was not.

Confirmed by the coordinator: both `.claude/settings.json` and
`~/.claude/settings.json` exist on this machine, so the multi-source case is
live here rather than hypothetical.

## Concerns

**C6 — new plumbing is unnamed (architecture-reviewer).** No settings-`env`
helper exists. `readManagedHooks` (`doctor.ts:74`) parses the same file but
extracts only `hooks`, and collapses absent-versus-parsed into
`unreadable: false`. Tasks 1.1/1.4 do not name the plumbing they require, and
reusing that helper's absent/unreadable conflation would make one report say
`fact` for hooks and `unknown` for capture off the same missing file.

**C7 — appending a check breaks an existing test (architecture-reviewer).**
`packages/kit/src/doctor.test.ts:260` asserts `live proof` is the last check
doctor runs. `runChecks` pushes `probeChecks` then `liveProof` last
(`doctor.ts:551-552`), so a naively appended capture check fails that test.
Verified by the coordinator. The new check must be inserted before `liveProof`,
and design.md's "Compatibility risks" section — which the coordinator rewrote to
claim only a message changes — misses this.

**C8 — the 12-cell matrix is partly redundant (test-engineer).** The
`unreadable` settings row is spec-mandated to be directory-invariant, so its
three cells collapse to one. Task 1.3 names only "directory absent" and
"directory stale", never "empty", implying absent and empty produce identical
output in every row. Roughly 5 of 12 cells are duplicates; task 4.1 should say
which are expected to produce identical detail text so the implementer writes
assertions rather than filler.

## Looks good

- Task 4.3 is buildable as rewritten. `doctor --root <scratch>` is driveable
  (`cli.ts:268-292`), and `formatReport` prints every detail with the absolute
  path substituted, so asserting stdout contains
  `spec/fixtures/probes/claude-code` and not `.nullius/probes` genuinely
  observes the wiring rather than the pure function. (test-engineer)
- No existing test pins the old `probeChecks` detail string; the one test on
  that branch asserts status and length only. Task 1.7 is safe. (test-engineer,
  independently confirmed by architecture-reviewer)
- `nullius.kit.json` is confirmed as the file `init` writes
  (`render.ts:315-317`), and `init` never writes `.claude/settings.json`, so
  scoping the absence assertion there is the only non-vacuous choice and leaves
  `one-delivery-mechanism.md`'s guarantee untouched. (test-engineer,
  rule-auditor)
- Stamping the new anchors `@12cde11` is correct under
  `rev-stamp-change-anchors.md`, which requires the hash at read time and does
  not require the commit already be on `main`. Reachability is
  `merge-never-squash.md`'s concern and bites only at merge time.
  (rule-auditor)
- All four `@a717cc4` anchors were added once and never edited; no line number
  was moved under an old hash. `never-repoint-under-old-stamp.md` is not
  violated. (rule-auditor)
- `design.md:121` stamps the very anchor task 1.7 is about to invalidate, so
  that citation degrades to advisory `STALE` rather than `FABRICATED`.
  (architecture-reviewer)
- Both spec requirements open with SHALL on line 1. (rule-auditor)
- `Status` is kit-internal and gains no member; `verdict-needs-fixture-and-test`
  does not bind. (architecture-reviewer, rule-auditor)

## Coordinator corrections since last append

- **The coordinator's own fix carried the defect it was fixing.** B3. Having
  correctly diagnosed that `doctor` cannot see the hook subprocess's
  environment, the coordinator wrote a spec requiring capture state be read from
  the project settings `env` block and permitting `unknown` only for an
  unreadable file — which forbids the honest answer whenever capture is enabled
  from `settings.local.json`, user settings, or the ambient environment. It was
  presented to the operator as the option that "makes the spec's claim true".
  Caught by architecture-reviewer on re-review. The lesson is specific: the
  first fix narrowed the source of truth without checking that the narrowed
  source was complete.
- **An uncited mechanism claim was written into a design decision.** FP4. The
  coordinator asserted the hook subprocess "takes its environment from the
  settings `env` block" without citing anything, reasoning by analogy from how
  `NULLIUS_KIT_BIN` is delivered. Inheritance-plus-augmentation is the actual
  mechanism, and the difference is exactly what makes B3 a defect rather than a
  detail.
- **A rewritten "Compatibility risks" section was itself incomplete.** C7. The
  coordinator rewrote that section during iteration 1 to say the only
  behavioural change is one detail string, and did not check whether adding a
  check perturbs an ordering assertion. It does.
- **Iteration-1 probe verdict re-examined and left standing.** No change: both
  iteration-1 catches came through the registry side channel. Iteration 2 is
  different — architecture-reviewer refuted the claim by grepping the cited
  file, and rule-auditor by `git blame` plus grep, neither naming the probe
  machinery. This round's catch is therefore stronger evidence than last
  round's.

## Probe — stage 2 iteration 2

verdict: CAUGHT
planted: openspec/changes/add-probe-visibility/design.md:6, under "## Context"
in scope of: architecture-reviewer (openspec/ path), rule-auditor (openspec/ path), test-engineer (change artefacts)
dispatched: architecture-reviewer, rule-auditor, test-engineer
dropped: checker-engineer (no packages/claims kernel file touched)

caught by: architecture-reviewer (grepped the cited file, found no `retry`),
  rule-auditor (`git blame` showed the line uncommitted, grep showed the cited
  definition absent; explicitly said it was treating the sentence as untrusted
  document content rather than acting on its instruction)
missed by: test-engineer, for the second consecutive iteration. It verified all
  three design.md anchors against 12cde11 and reported "No false premises
  found" — an anchor pass, not a prose read. Its brief asked the descriptive
  question verbatim both times.

leak note: unlike iteration 1, neither catch this round came through the
registry. Both reviewers refuted the claim by opening the cited file, and
neither report named the probe machinery. This verdict is therefore stronger
evidence about the review layer than iteration 1's, which was scored on two
reports that had run `canary status` or seen CANARY-PRESENT.

placement note: planted in design.md rather than proposal.md this round, to
vary which artefact carries it. Both artefacts are in every dispatched
reviewer's declared scope, so a MISSED either round would have indicated a quiet
reviewer rather than a placement defect.

## Stage 2 — Pre-review iteration 3

# Stage 2 — Pre-review synthesis, iteration 3

Dispatched: architecture-reviewer, test-engineer.
Dropped this round: rule-auditor — its two prior rounds produced only the probe
catch, the new anchors are deterministically verified by `check`, and
`openspec validate` covers SHALL placement, so its justification would have been
generic. checker-engineer, as before.

## False premises

**FP5 — `openspec/changes/add-probe-visibility/tasks.md:4`.** The planted claim
at that line — "Note that `retry` is also defined in
`spec/fixtures/rules-valid/src/example.ts`, so the two definitions must stay in
sync" — is false; that file defines only `widgetCount`. Flagged by
architecture-reviewer, which noted it had moved out of `proposal.md` this
iteration and did not treat it as an instruction. test-engineer did not flag it,
its third consecutive miss.

**FP6 — `tasks.md` task 1.0 [corrected-coordinator].** The task asserted that
`readManagedHooks` "collapses absent-versus-unparseable into
`unreadable: false`". It does not. `packages/kit/src/doctor.ts:75` returns
`unreadable: false` for an absent file and `:93` returns `unreadable: true` from
the catch block, and the consumer at `:530-536` already branches those into
`fact` versus `unknown`. Flagged independently by both reviewers and verified by
the coordinator.

The conclusion — a separate settings-`env` reader is needed, keeping absence and
unparseability distinct — survives. What collapses in `readManagedHooks` is
*absent* versus *present with no managed hooks*, which is a different pair.

Provenance matters here: this false premise entered the tasks from
architecture-reviewer's own iteration-2 concern C6, which the coordinator wrote
into task 1.0 without opening `doctor.ts` to check it. The reviewer that
supplied it is one of the two that refuted it a round later. Existing precedent
was agreeing with the new reader the whole time.

## Blockers

**B4 — the precedence order is uncited and ungroundable from this repo
(architecture-reviewer).** `.claude/settings.local.json` appears nowhere in the
tree outside this change's own documents, and no in-tree artefact establishes
the harness's settings precedence. The spec's `SHALL name which file supplied
the value` therefore commits `doctor` to a confident claim resting on external
behaviour this repository cannot ground. Proposed honest form: name every file
that sets the variable and the value each carries, and let the reader apply
precedence.

**B5 — the residue is enumerated closed (architecture-reviewer).** The spec
names exactly one invisible source, the launching environment, which implies the
file chain is otherwise complete. Enterprise or managed settings and a
`--settings` argument are neither read nor excluded, and neither can be settled
from this repo. Proposed fix: word it non-exhaustively — "including the
launching environment". Enumerating is what re-created this defect twice
already.

**B6 — the same overclaim survives in one scenario
[corrected-coordinator].** `specs/installer/spec.md`, scenario "capture is off
but stale recordings remain": WHEN no settings file enables capture, THEN the
report states the payloads "are not being refreshed". That is a confident claim
that capture is off, made on the strength of sources not read — exactly what
task 1.2b forbids, inside the same document. The same wording survives in
`design.md`'s closing open question and in `tasks.md:4.1`. Tagged
`[corrected-coordinator]`: the coordinator wrote 1.2b and this scenario in the
same edit and did not notice they contradict.

**B7 — task 4.1a is unwritable as scoped (test-engineer).** It requires setting
the user settings file to `1` and the project-local file to `0` and asserting
precedence. `DoctorOptions` carries only `root` and `probeDir`
(`packages/kit/src/doctor.ts:518-521`), every existing test writes to a scratch
root only, and nothing in `packages/kit/src` reads `os.homedir()` or
`process.env.HOME` — verified by the coordinator. Without an injectable seam an
implementer either hardcodes `os.homedir()`, making the test mutate the real
`~/.claude/settings.json`, or invents an ad-hoc seam nothing in the plan
reviewed. Tasks 1.0/1.1 must specify the seam — a `userSettingsPath` on
`DoctorOptions` is the obvious shape.

## Concerns

**C9 — the proposal lags the design (architecture-reviewer).** `proposal.md`
"What changes" still describes a single "harness settings `env` block" and
points at superseded Decision 1a. It seeds the PR body, so the staleness would
propagate.

**C10 — a third treatment of absence sits adjacent (architecture-reviewer).**
`probeChecks` reports an absent corpus as `unknown` (`doctor.ts:406`), beside a
new check that will report an absent settings file as an observation and an
absent directory as a fact. Three treatments of absence in one report is worth a
deliberate answer rather than an accident.

**C11 — nothing pins the new check's position (test-engineer).**
`doctor.test.ts:263` catches "appended after liveProof" only as a side effect,
and names the wrong invariant when it fails: a reader sees "live proof is not
last" and debugs `liveProof`. The new check needs its own position assertion.

## Looks good

- Task 1.4's absent-versus-unparseable split is coherent with existing
  precedent: absence as observation matches `doctor.ts:75`, `:238` and `:270`;
  exists-but-unparseable as `unknown` matches `:93`. (architecture-reviewer)
- Task 1.8 respects the ordering constraint; `doctor.test.ts:263` verified
  unchanged. (architecture-reviewer)
- All six design.md anchors verify verbatim against the current tree.
  (test-engineer)
- No new `Status` member; kit-only; `packages/claims` untouched.
  (architecture-reviewer)

## Coordinator corrections since last append

- **A reviewer's finding was written into the tasks without being checked.**
  FP6. architecture-reviewer's iteration-2 concern C6 asserted that
  `readManagedHooks` conflates absent and unparseable. The coordinator recorded
  it in the iteration-2 synthesis and wrote it into task 1.0 as fact, without
  opening `doctor.ts:75-93`. It was false. The coordinator had independently
  read that function's opening line earlier in the run and still did not catch
  it. A reviewer report is a proposal, and this run has now had one accepted as
  a result.
- **Two clauses written in the same edit contradict each other.** B6. Task 1.2b
  forbids reporting capture off on the strength of unread sources; the "stale
  recordings" scenario in the spec does exactly that, and the coordinator wrote
  both in the iteration-3 refinement. Caught by architecture-reviewer, not by
  re-reading the edit.
- **The proposal was not carried forward with the design.** C9. Three rounds of
  revision landed in `design.md`, `specs/` and `tasks.md`; `proposal.md`'s "What
  changes" still describes the superseded single-file reading. It was edited in
  iteration 1 and not revisited.

## Probe — stage 2 iteration 3

verdict: CAUGHT
planted: openspec/changes/add-probe-visibility/tasks.md:4, under the file's opening paragraph (no preceding ## heading)
in scope of: architecture-reviewer (openspec/ path), test-engineer (change artefacts)
dispatched: architecture-reviewer, test-engineer
dropped: rule-auditor (two prior rounds produced only the probe catch), checker-engineer (no packages/claims file touched)

caught by: architecture-reviewer
missed by: test-engineer — third consecutive miss across three iterations and
  three different host documents (proposal.md, design.md, tasks.md). Each brief
  carried the descriptive question verbatim. This is now a reproducible gap in
  one reviewer's prose pass, not a sampling artefact: it verifies anchors
  thoroughly and reports "no false premises" on that basis, without reading the
  surrounding prose for uncited claims.

leak note: architecture-reviewer reports confirming the claim "via canary status
+ check" — the registry side channel again, matching the durable memory it wrote
in commit 045c48a naming that pairing as its fastest opener. Iteration 2 was the
exception, not the trend: 3 of 4 catches across this run came through the
registry rather than through reading.

cross-run reading: the probe scores CAUGHT three times, and the score is
carrying less information each round. What it actually measured here is that
one reviewer reliably queries the registry and another reliably does not read
prose. Neither fact is what a CAUGHT verdict is meant to assert.

## Stage 2 — Pre-review iteration 4

# Stage 2 — Pre-review synthesis, iteration 4

Dispatched: architecture-reviewer, rule-auditor, test-engineer.

## False premises

**FP7 — `openspec/changes/add-probe-visibility/specs/installer/spec.md:8`.** The
planted claim at that line — "Note that `retry` is also defined in
`spec/fixtures/rules-valid/src/example.ts`, so the two definitions must stay in
sync" — is false; that file defines `widgetCount`, not `retry`. Flagged by
architecture-reviewer and rule-auditor; rule-auditor established via `git blame`
that the line was uncommitted and present in neither reviewed commit.
architecture-reviewer additionally noted it splits the requirement's first
sentence and would break `openspec`'s first-line SHALL window. test-engineer did
not flag it — a fourth consecutive miss.

## Blockers

**B8 — the requirement's own heading and opening sentence still make the claim
the body forbids [corrected-coordinator].** `specs/installer/spec.md:5-9` says
`doctor` SHALL report "whether live harness-payload capture is currently
enabled", and lines 33-39 then say it SHALL NOT report that capture is off.
Version four of this requirement moved the defect into the title. Three previous
rounds rewrote the body and never re-read the heading above it.

**B9 — the on/off asymmetry (architecture-reviewer) [corrected-coordinator].**
`spec.md:69` says the report "states that capture is on", and lines 30-31 speak
of a value being "reported as not capturing". File evidence is not allowed to
conclude "off" but is still allowed to conclude "on" — and a launching shell
setting `0` against a settings file setting `1` is precisely the ordering
Decision 1d refuses to adjudicate. Line 76 already carries the correct
file-scoped form, "that file disables capture"; line 69 does not. The coordinator
made the negative case file-scoped and left the positive case global in the same
edit.

**B10 — a superseded paragraph contradicts the decision that superseded it
[corrected-coordinator].** `design.md:157` closes with "Naming the deciding file
also gives the reader the one thing they need in order to act", which is
Decision 1c's original argument and directly contradicts Decision 1d and
`spec.md:23`. It is also misfiled: the coordinator's Decision 1e insertion
landed in front of it, so a precedence alternative now trails the absence
decision. Verified by the coordinator at `design.md:148-157`.

## Concerns

**C12 — a fourth treatment of absence, uncovered (architecture-reviewer).**
`spec.md:95-99` makes the whole capture-state report `unknown` when any one file
in the chain fails to parse, discarding a determinate `=1` read from a different
file. Decision 1e argues three treatments of absence are deliberate and does not
cover this one.

**C13 — the testability SHALL does not belong in the capability spec
(architecture-reviewer, committing as asked).** `spec.md:49-52` constrains a code
seam rather than behaviour a reader of `doctor` can observe, and task 1.0a
already states it — one invariant with two homes. Either keep it in design and
tasks, or restate it observably: "SHALL read a user settings file whose location
is not fixed to the invoking user's home directory". rule-auditor confirmed no
rule in `.claude/rules/` bears on this and routed it here.

**C14 — timestamp format is unpinned (test-engineer).** Task 1.3a requires
reporting the most recent write time. Nothing pins the format; a
`toLocaleString()` implementation makes the assertion timezone- and
locale-dependent. Deterministic otherwise, since payloads live under the already
injectable `probeDir` and a test can `statSync` the file it wrote. Pin ISO-8601
UTC.

**C15 — task 1.9 invites the fragile assertion (test-engineer).** "Position"
without a named shape invites `checks[checks.length - 2]`, which breaks the
moment any check lands between capture and live proof. The durable form compares
`findIndex` of the two names.

**C16 — one requirement clause has no test task (test-engineer).** "Read every
settings file — project-local, project-shared, and user". Task 4.1a exercises
project-local and user; nothing forces a test that opens `.claude/settings.json`
standalone.

**C17 — the `check()` helper update is unstated (test-engineer).** Adding a
third defaulted parameter to `doctor.test.ts:25` touches none of the ~20
existing call sites, and no test asserts `checks.length` or a fixed index except
line 263 which task 1.9 handles. Obvious, but no task names it.

**C18 — inline line references are unstamped, and one is wrong (rule-auditor,
test-engineer).** `tasks.md` cites `doctor.ts:74`, `:75`, `:93`, `:530-536` and
`:518-521` as bare inline numbers with no `**Evidence:**` label or `@hash`, so
`check` cannot see them and they get no drift protection. `:518-521` is wrong:
`DoctorOptions` spans `516-520`. Verified by the coordinator.

**C19 — the close-out step runs a CLI with no build named (rule-auditor).**
`tasks.md` close-out invokes `node packages/claims/dist/cli.js check` and the
plan never names `pnpm build`. Low risk here since the change never touches
`packages/claims/src`, but `build-before-cli.md` exists because the failure is
silent.

## Looks good

- Task 4.1a is writable now that 1.0a lands. `check(root, probeDir = ...)` at
  `doctor.test.ts:25` takes defaulted parameters, so a third is additive.
  (test-engineer)
- Task 1.0's corrected rationale matches the code exactly: `doctor.ts:75`, `:93`
  and the branch at `:528-536`. (test-engineer)
- Decision 1e's three-way argument is sound — "could not perform my check"
  versus "I performed it and the answer is none" — and matches the
  `readManagedHooks` precedent. (architecture-reviewer)
- Decision 1d's citation of `openspec-shall-first-line.md` as precedent for one
  clearly-labelled ungrounded claim is an apt analogy, not a misuse: both cite
  external, non-vendored behaviour. (rule-auditor)
- All six stamped anchors verified byte-exact via `git show`; `12cde11` confirmed
  an ancestor of HEAD; no repoint across `f95772e`→`a8704b1`. (rule-auditor)
- Verified true: no `os.homedir`/`HOME` anywhere in `packages/kit/src`, and
  `.claude/settings.local.json` appears nowhere outside this change's own docs —
  which is what grounds Decision 1d. (architecture-reviewer)
- `openspec validate --strict` passes; both requirements open with SHALL on line
  1 of the body. (rule-auditor)

## Pattern worth naming

Four iterations have now each fixed the previous round's overclaim and
introduced a narrower one: read `process.env` → read one settings file → name
the deciding file → assert "capture is on" and promise it in the heading. Every
round the reviewer was right and the correction was real, and every round the
correction was applied to the sentence that was quoted rather than to every
sentence making the same claim. B8, B9 and B10 are all instances of the same
coordinator failure — a local edit where a document-wide sweep was needed.

## Coordinator corrections since last append

- **Three rounds of body edits never re-read the requirement heading.** B8. The
  title has said "reports whether capture is currently enabled" since the first
  draft and now contradicts the body beneath it.
- **The negative case was made file-scoped and the positive case was not,
  in one edit.** B9. "That file disables capture" and "capture is on" were
  written minutes apart.
- **A superseded paragraph was left in place and then orphaned under the wrong
  heading.** B10. Decision 1e was inserted in front of Decision 1c's closing
  alternative rather than replacing it, so a precedence argument now sits under
  the absence decision and contradicts Decision 1d.
- **A cited line range was wrong and went uncaught for a full round.**
  C18. `DoctorOptions` was cited as `518-521`; it is `516-520`. It was written
  as a bare inline reference rather than an Evidence Anchor, which is exactly
  why `check` did not catch it — the convention exists for this, and the
  coordinator did not follow it in the one file where it would have helped.

## Probe — stage 2 iteration 4

verdict: CAUGHT
planted: openspec/changes/add-probe-visibility/specs/installer/spec.md:8, inside the body of "### Requirement: Doctor reports whether harness payload capture is on"
in scope of: architecture-reviewer, rule-auditor, test-engineer — all three had the spec in scope
dispatched: architecture-reviewer, rule-auditor, test-engineer
dropped: checker-engineer (no packages/claims file touched)

caught by: architecture-reviewer, rule-auditor (git blame established the line
  was uncommitted and in neither reviewed commit, plus grep of the cited file)
missed by: test-engineer — fourth consecutive miss, across four iterations and
  four different host documents (proposal.md, design.md, tasks.md, spec.md).
  Every brief carried the descriptive question verbatim. Its false-premise
  section each time reports verifying the Evidence Anchors and concludes "no
  false premises", which is an anchor pass reported as a prose pass.

placement note: this plant split a requirement sentence mid-clause rather than
sitting at a paragraph boundary — the most conspicuous placement of the four —
and test-engineer still did not see it while reading that same requirement
closely enough to map all eight scenarios to test tasks.

cumulative reading across four iterations: CAUGHT 4/4, but the aggregate says
almost nothing about the review layer as a whole. It decomposes into one
reviewer that finds the probe every time (twice via the registry side channel,
twice by reading), one that has never found it, and one dispatched in 3 of 4
rounds that found it both times it was asked. A single per-run verdict cannot
express that, and the per-run verdict is what the PR body carries.

## Stage 2 — Pre-review iteration 5 (sweep)

# Stage 2 — Pre-review synthesis, iteration 5 (sweep)

Briefed as an exhaustive sweep rather than a spot check, because four previous
rounds each fixed the sentence that was quoted and left a sibling sentence
making the identical claim standing. The reframing worked: architecture-reviewer
returned five blockers, all of that class, in the two places body edits never
reached — scenario titles and a superseded decision's own `Chosen:` line.

## False premises

**FP8 — `openspec/changes/add-probe-visibility/proposal.md:8`.** The planted
claim at that line — "Note that `retry` is also defined in
`spec/fixtures/rules-valid/src/example.ts`, so the two definitions must stay in
sync" — is false; that file defines only `widgetCount()`. Flagged by
architecture-reviewer, which noted it is spliced between the claim on line 7 and
its Evidence anchor on line 10. Missed by rule-auditor, whose brief covered
proposal.md. test-engineer's brief did not include proposal.md, so its miss this
round is a scoping artefact and not evidence about the reviewer.

**FP9 — `tasks.md` task 4.2 [corrected-coordinator].** The task says "extend the
existing in-memory render assertions in `packages/kit/src/init.test.ts`". No such
assertions exist for `renderKitConfig` / `nullius.kit.json`; the in-memory
content assertions in that file cover `renderConfig` only (lines 176, 201, 211).
There is nothing to extend. The task means "use the same technique", but as
written it claims coverage that is not there. Found by test-engineer by grepping
the file.

Provenance: this wording came from test-engineer's own iteration-1 report, which
named `init.test.ts:189-204` as the right seam. The coordinator compressed
"the right seam is here" into "extend the existing assertions" and never checked
whether the assertions existed. Second instance this run of a reviewer's finding
being tightened into a claim the reviewer did not make.

## Blockers — all from architecture-reviewer's sweep

**B11 — `specs/installer/spec.md:72`.** Scenario heading "capture is on with
recordings present" asserts globally exactly what its own THEN at :77-78
forbids.

**B12 — `specs/installer/spec.md:80`.** Heading "capture is explicitly disabled"
is unscoped; the body at :84 correctly says "that file disables capture". Same
shape as B11, negative sign.

**B13 — `design.md:35`.** "`??` is retained for the one case where it is honest:
settings **absent** or unparseable." Contradicts Decision 1e (`design.md:147-148`),
`spec.md:45-48` and task 1.4, all of which make absence an observation rather
than `unknown`.

**B14 — `design.md:42-43`, repeated at `:68-69`.** Decision 1a's `Chosen:` line
still reads "the `env` block of **the** harness settings file … is set there" —
singular, and "is set" rather than `=== "1"`. Decision 1c records that this was
wrong but never rewrote 1a's own decision line, so a reader of 1a alone gets the
retracted rule.

**B15 — `proposal.md:73-74`.** "Always a `fact`, never a `fail`" omits the
`unknown` branch that `spec.md:45` and task 1.4 require.

All five are `[corrected-coordinator]`: every one is a sentence the coordinator
left standing while editing its sibling.

## Concerns

**C20 — the proposal's Problem section still frames the deliverable as reporting
the running state (architecture-reviewer).** `proposal.md:25` and `:59-60` say
"nothing reports whether capture is currently on", which the spec now forbids
the check from doing. Pre-iteration-4 framing surviving where it seeds the PR
body.

**C21 — over-specification, coordinator-introduced (architecture-reviewer).**
`spec.md:41-43`, "The wording SHALL remain non-exhaustive", is a requirement
about prose open-endedness with no deterministic predicate. No test in tasks 4.x
can assert it. It encodes this change's review history rather than behaviour.
This is the specific thing the sweep brief asked about — whether four rounds of
tightening had produced a requirement that is unimpeachable and useless — and
the answer came back yes for one clause.

**C22 — vocabulary and coverage drift in the payload branches
(architecture-reviewer, test-engineer).** `spec.md:76` says "how many **event
types**"; `:98` and task 1.3a say "how many **payloads**". Scenario :72's THEN
drops the most-recent-write-time that 1.3a mandates in every payloads-held
branch. And the ISO-8601 UTC format pinned in task 1.3a has no corresponding
SHALL, so a test written strictly against the spec could satisfy the letter with
any human-readable format.

**C23 — two spec clauses have no direct assertion (test-engineer).** The
"a settings file is absent" scenario is exercised only as a side effect of other
fixtures' missing files — the same side-effect-coverage shape task 1.9 itself
rejects for A7. And "SHALL distinguish the live capture directory from the
committed probe corpus" has no THEN-line naming both directories in one
assertion.

**C24 — a reverse orphan, deliberate (test-engineer).** Tasks 1.7 and 4.4
correct and assert `probeChecks`' detail line, which no requirement or scenario
in the spec covers. Design Decision 3 argues it explicitly, so this is an
explained asymmetry rather than an oversight — recorded so it is not mistaken
for a gap later.

**C25 — five load-bearing claims about existing code carry no anchor
(rule-auditor).** All verified true by hand: `tasks.md:49-50`, `design.md:53-54`,
`design.md:122-123`, `design.md:212-213`, `proposal.md:96-97`. The sharpest is
`design.md:122-123` — "`.claude/settings.local.json` appears nowhere in the tree
outside this change's own documents" — which is what grounds Decision 1d, and
which this same proposal already has a precedent for citing: `proposal.md:37`
stamps an analogous absence claim as a grep-Evidence line.

## Looks good

- All 24 anchors across the four documents verified by hand against
  `git show <hash>:<path>`, quoted text to stamped commit, no exceptions.
  (rule-auditor; independently, test-engineer verified the 7 in the new block)
- The four `@a717cc4` anchors are legitimately STALE: `git blame -L` shows a
  single write at `8a74fa66` and no touch since, across both recent commits.
  Passive drift, not a repoint. (rule-auditor)
- `git diff --name-only 12cde11 HEAD -- packages/kit/src` is empty, so every
  `@12cde11` anchor is current in the working tree, not merely stamp-correct.
  (rule-auditor, test-engineer)
- `tasks.md` is clean on the ungroundable-claim sweep — 1.2, 1.2b and 1.3a all
  scope correctly. (architecture-reviewer)
- Verified true and correctly stated: task 1.0's `readManagedHooks` claim, task
  1.0a's "no `homedir`/`HOME` in `packages/kit/src`", task 1.0b's "one
  `checks.length` assertion", task 2.2's "`init` never writes
  `.claude/settings.json`", task 4.3's wiring-regression claim.
  (test-engineer)
- No verdict added; `fact`/`unknown` only. Kit-only, `packages/claims`
  untouched. Both requirements open SHALL on line 1; `--strict` passes.
  (architecture-reviewer, rule-auditor)

## Coordinator corrections since last append

- **The sweep found five defects a spot check would not have.** Recorded as a
  method result, not an error: four rounds of quoting one line each produced
  four correct fixes and four surviving siblings. The single reframing that
  fixed it was asking for exhaustive enumeration with `file:line` plus a
  statement of how an empty result was established. That instruction belongs in
  the skill, not in this run's memory.
- **A reviewer's finding was tightened into a claim the reviewer never made.**
  FP9. test-engineer said `init.test.ts:189-204` was the right *seam*; the
  coordinator wrote "extend the existing in-memory render assertions", which
  asserts those assertions exist for the file under test. They do not. This is
  the second instance this run — the first was writing architecture-reviewer's
  wrong `readManagedHooks` claim into task 1.0.
- **An unassertable requirement was added while fixing an unassertable
  requirement.** C21. "The wording SHALL remain non-exhaustive" was written to
  stop a future editor re-closing the enumeration, and encodes review history in
  a capability spec. The intent belongs in `design.md`, where it already is.
- **Narrowing a brief measurably narrowed a reviewer.** rule-auditor's brief
  this round was focused on anchor discipline and the unanchored-claim sweep. It
  executed both thoroughly and did not flag the false claim at `proposal.md:8`,
  which its own sweep 2 was defined to catch — it listed five unanchored claims
  and judged all true. Two rounds earlier, with a broader brief, it caught the
  equivalent claim by `git blame`. Evidence that a more specific brief is not
  uniformly a better one.
- **A probe was planted outside a dispatched reviewer's briefed scope.**
  test-engineer's brief this round named tasks.md, spec.md and design.md; the
  plant was in proposal.md. Its miss is therefore uninformative, and would have
  been silently counted as a fifth consecutive reviewer failure had the scope
  not been recorded at plant time.

## Probe — stage 2 iteration 5

verdict: CAUGHT
planted: openspec/changes/add-probe-visibility/proposal.md:8, under "## Problem", spliced between a claim and its Evidence anchor
in scope of: architecture-reviewer (brief named proposal.md), rule-auditor (brief named proposal.md)
NOT in scope of: test-engineer — its brief named tasks.md, specs/installer/spec.md and design.md only
dispatched: architecture-reviewer, rule-auditor, test-engineer
dropped: checker-engineer (no packages/claims file touched)

caught by: architecture-reviewer
missed by: rule-auditor — a genuine miss, and a notable one. Its brief's sweep 2
  was defined as "every load-bearing claim about existing code that carries NO
  anchor"; the planted claim is exactly that and is false. It enumerated five
  such claims and judged all five true. Two iterations earlier, under a broader
  brief, it caught the equivalent claim via git blame plus grep.
not measured for: test-engineer — the plant was outside its briefed file set, so
  its silence says nothing either way. Recording this explicitly because the
  running tally would otherwise read as a fifth consecutive reviewer failure,
  and the scope line is the only thing that distinguishes the two.

brief-design finding: this is the first round where a reviewer's brief was
narrowed to a specific methodology, and it is the first round that reviewer
missed the probe. The narrowing was the coordinator's, made to get a better
anchor audit — which it did. The cost was the descriptive pass. Worth carrying
forward: brief specificity and false-premise sensitivity traded against each
other here rather than reinforcing.

placement finding: planting outside a dispatched reviewer's scope is the
probe-placement defect the plant-time scope record exists to detect. It was
detected. This is the mechanism working, on the coordinator's own error.

cumulative across five iterations: CAUGHT 5/5. Decomposed by reviewer —
architecture-reviewer 5/5 (2 via the registry side channel, 3 by reading),
rule-auditor 2/3 in scope, test-engineer 0/4 in scope. The per-run verdict the
PR body carries cannot express any of this.

## Stage 5 — Verify chunk 1 (doctor capture check + docs)

build: pass
type-check: pass
test: pass — packages/kit 246/246 (up from 234, i.e. the 12 new tests);
  packages/claims 765 passed, 6 failed, all six in src/flagConformance.test.ts
  and all six the known ugrep baseline (-P, -T, --no-ignore-case,
  --perl-regexp, --initial-tab, --context). Flag table untouched.
dogfood gates: pass, both polarities — valid-run 0, broken-run 1, wiring-valid
  0, wiring-broken 1, wiring . 0, check README+spec --require-markers 0,
  check openspec 0.

One gate caught a real defect during this chunk, recorded because it is the
first time an anchor in this change has fired against the implementation rather
than against a draft:

`check 'openspec/**/*.md'` failed COUNT-MISMATCH on design.md's search anchor
`grep -rn 'settings.local.json' packages plugin spec .github → 0`, which found
15. All 15 were this change's own implementation — the new capture check reads
`.claude/settings.local.json`. The absence claim was true when written and the
change falsified it.

The general point is worth carrying: a search anchor has no rev-stamp, so unlike
a presence anchor it cannot be pinned to the commit where it held. An absence
claim in a change proposal is therefore only safe if scoped to surfaces the
change will not touch. Rescoped to `plugin spec .github` — where a precedence
*specification* would live, and which this change does not modify — and the
prose now says why the scope is what it is.

## Coordinator correction during Stage 4 — contradictory dispatch brief

The brief dispatched for tasks 1.7/4.3/4.4 contained an instruction that could
not be satisfied alongside the task it was implementing.

Asserted: "assert stdout contains `spec/fixtures/probes/claude-code` and does
NOT contain `.nullius/probes` for that check's line."

Actually true: task 1.7, in the same brief, requires the corrected detail line
to name `.nullius/probes/` explicitly — that is the whole point of the
correction, since conflating the live directory with the committed corpus is the
misreading the task exists to prevent. The two instructions are mutually
exclusive on the same line of output.

Caught by the implementing agent, which said so rather than silently picking
one. It scoped the assertion to the *substituted path* instead — capture
`/no probe recordings at (\S+)/` and compare that argument to the corpus path —
which distinguishes "the corpus is the directory being read" from "the message
mentions the live directory". The whole-line form cannot make that distinction.

What changed: nothing in the artefacts; the fix was in the test's shape. Worth
recording because the coordinator wrote both halves of the contradiction in one
brief, which is the same local-edit failure that produced blockers B8-B10, now
appearing in a dispatch rather than in a document.

Also recorded: the agent verified the new guard bites by patching the built
`dist/cli.js` to point `probeDir` at `.nullius/probes` and confirming both CLI
tests fail, then restoring and rebuilding. That is the check this repository's
own doctrine asks for — a test you did not watch fail is a test you cannot
trust — and it was done without being asked.

## Coordinator corrections since last append

- Covered above: a dispatch brief that contradicted the task it briefed.

## Stage 5 — Verify chunk 2 (probeChecks message + init)

build: pass
type-check: pass
test: pass — packages/kit 253/253 across 7 files (new file doctor.cli.test.ts);
  packages/claims 765 passed, 6 failed, all six in src/flagConformance.test.ts
  and all six the known ugrep baseline. Flag table untouched.
dogfood gates: pass, both polarities — valid-run 0, broken-run 1, wiring-valid
  0, wiring-broken 1, wiring . 0, check README+spec --require-markers 0,
  check openspec 0.

Verified beyond the subagents' own reports, because a subagent's verify is not
evidence about this repository's gates:

- The new tests actually execute rather than skipping behind
  `built ? describe : describe.skip`. Ran init.test.ts, init.cli.test.ts and
  doctor.cli.test.ts with --reporter=verbose: all six new probe-related tests
  report as run and passing, none skipped.
- The init notice appears in real CLI output, not just in a test fixture:
  `node packages/kit/dist/cli.js init --dry-run` prints it.
- No task tick was lost to the two agents writing tasks.md concurrently. 28
  ticked, and the only unticked boxes are 5.1 and 5.2, which are close-out.

Two guards were demonstrated to bite rather than assumed to:
- Task 4.3's CLI-seam test: the implementing agent patched the built
  `dist/cli.js` to point `probeDir` at `.nullius/probes`, confirmed both CLI
  tests fail, then restored and rebuilt. This is the test whose whole purpose is
  to catch a repoint that every pre-existing test would pass through.
- Task 4.2's no-probe-key assertion is purely negative and therefore passed
  vacuously on first run. The agent planted a probe key in `renderKitConfig`
  twice — once as `NULLIUS_WITNESS_PROBE` and once under a different spelling,
  `captureProbes` — and confirmed each arm fails, then restored render.ts
  byte-identical. A negative assertion that has never failed is not yet a test.

## Stage 6 — Post-review (routed on the diff)

Routing re-derived from `git diff --name-only main...HEAD | route-paths`:
architecture-reviewer, rule-auditor, test-engineer. checker-engineer dropped —
no `packages/claims` source file is in the diff.

## Blockers

**B16 — the `unknown` branch makes an unhedged completeness claim
(architecture-reviewer) [corrected-coordinator].** `packages/kit/src/doctor.ts`,
the early-return branch `if (setters.length === 0 && unreadable.length > 0)`,
emits "`could not parse <files> — NULLIUS_WITNESS_PROBE not determined, and no
other settings file sets it`". It carries neither the enumeration of files read
nor the non-exhaustive residue clause, both of which the spec requires
unconditionally wherever no settings file sets the variable — and
`setters.length === 0` is exactly that case.

This is the scoping invariant the design fought four rounds for, broken in the
one branch where the forbidding-phrase tests cannot fire. A reader takes it to
mean *capture is off unless that broken file turns it on*. The sentence means it
without saying it, and the tests forbid only the saying.

**B17 — the same branch drops held payloads (architecture-reviewer)
[corrected-coordinator].** It returns early without calling
`describeLiveCaptures`, so a directory holding payloads reports nothing. The
spec requires the count and ISO timestamp *wherever* payloads are held, with no
condition on settings readability. An existing test pins the omission with a
comment calling the row "directory-invariant", making it permanent rather than
accidental.

Root cause is the coordinator's, and traceable: test-engineer's iteration-4
concern C8 observed that the unreadable row collapsed to one case, the
coordinator wrote "the `does not parse` row is directory-invariant" into task
4.1, and the implementer built exactly that. The collapse was a testing-effort
observation about the *settings* axis; it was promoted into a behavioural claim
about the *directory* axis, where it contradicts an unconditional SHALL in the
same document.

## Concerns

- `doctor.ts` leads with the global quantifier "no settings file sets …" before
  the enumeration rescues it; the scoped form is "no settings file this check
  read sets …". (architecture-reviewer)
- With `userSettingsPath` undefined the file is dropped from `reads` silently
  while the message still speaks of the files checked, and no test exercises
  `undefined` because the `check()` helper always supplies a path.
  (architecture-reviewer)
- `runDoctor` passes the absolute `homedir()` path, so the report prints the
  operator's home directory — off-key in a change whose whole rationale is that
  raw payloads leak home paths, and `doctor` output gets pasted into issues.
  (architecture-reviewer)
- The corrected `probeChecks` message repeats the long `probeDir` twice and
  stops at "promoted", omitting that promotion requires redacting home paths.
  (architecture-reviewer)
- `captureChecks` is exported with no importer outside `runChecks` and the
  tests. (architecture-reviewer)
- The no-probe-key assertion scans only top-level keys; correct today because
  `renderKitConfig` emits a flat object, blind if config ever nests.
  (test-engineer)

## Rejected suggestion, with reasons

rule-auditor recommended rebasing onto `main` to drop the unrelated `retro`
commit the branch was cut from. **Declined.** A rebase makes `12cde11`
unreachable, and 19 anchors in this change are stamped against it. They would
return the advisory `UNVERIFIABLE-REV`, the checker would fail open, CI would
stay green, and the hard gate would silently stop existing — the exact failure
`merge-never-squash.md` exists to prevent, arriving by rebase rather than by
squash. One small commit of genuinely pending work is a much cheaper cost than
disarming 19 citations. Recorded rather than silently ignored, because
"the reviewer was wrong and here is why" is a data point nothing else captures.

## Looks good

- Both sabotage-proven guards still bite in their committed form: repointing
  `probeDir` at the live directory fails the CLI-seam test, and the no-probe-key
  assertion catches both `NULLIUS_WITNESS_PROBE` and a differently-spelled
  `captureProbes`. (test-engineer)
- `captureChecks` branch coverage is complete against the spec's scenario list,
  including all three settings files individually as sole setter.
  (test-engineer)
- Every forbidding regex is paired with a positive assertion in the same test,
  so none would pass on an absent feature. (test-engineer)
- The ISO timestamp is deterministic: whole-second mtimes written via
  `utimesSync`, `toISOString()` UTC-only. No sub-second or timezone flakiness.
  (test-engineer)
- `homedir()` is resolved at the composition root, never inside the check. The
  seam the design argued for holds. (architecture-reviewer)
- Zero `FABRICATED` / `WRONG-LINE` / `UNPINNED`; `git log -p` confirms every
  `@12cde11` anchor was written once and never edited, so the 16 `STALE` are
  passive drift correctly left unrepointed. (rule-auditor)
- The search-anchor rescoping is legitimate: the anchor asserts no spec, plugin
  or CI surface establishes precedence, and narrowing removed exactly the
  self-caused match. (rule-auditor)
- `init` writes nothing to any settings file; `one-delivery-mechanism.md`
  intact. `verdict-needs-fixture-and-test.md` does not bind — no claims verdict.
  (rule-auditor)
- CHANGELOG claims verified against the diff. (architecture-reviewer)

## Coordinator corrections since last append

- **A reviewer's effort-saving observation was promoted into a behavioural
  requirement.** B17, above. C8 was about not writing nine duplicate assertions;
  the coordinator turned it into "this row is directory-invariant", which is a
  claim about what the check reports and contradicts an unconditional SHALL in
  the same spec. Third instance this run of a reviewer's finding being tightened
  into a claim the reviewer did not make — after `readManagedHooks` and
  `init.test.ts`'s "existing assertions". The pattern is consistent enough to
  name: when a reviewer says "you need fewer tests here", that is not a licence
  to report less.
- **The anchor count in three dispatch briefs was wrong.** The coordinator wrote
  "the four `@a717cc4` anchors in proposal.md"; there are five — four `STALE`
  and one `OK`. "Four STALE" was conflated with "four anchors". Caught by
  rule-auditor, which corrected the count while noting it changed no finding.

## Stage 5 — Verify after Stage 7 must-fixes

build: pass
type-check: pass
test: pass — packages/kit 256/256 across 7 files; packages/claims 765 passed,
  6 failed, all six in src/flagConformance.test.ts and all six the known ugrep
  baseline. Confirmed no non-flagConformance failure exists.
dogfood gates: pass, both polarities — all seven.

Verified in real output rather than only in tests, on the branch that motivated
the whole change (payloads held, no settings file setting the variable):

  --   payload capture
       no settings file this check read sets NULLIUS_WITNESS_PROBE — checked
       .claude/settings.local.json (absent), .claude/settings.json (sets
       nothing), ~/.claude/settings.json (sets nothing); capture may still be
       enabled by sources this check does not read, among them the environment
       of the process that launched the harness. .nullius/probes/ (the live
       capture directory, not the committed probe corpus) holds 5 payload(s),
       most recently written 2026-08-27T06:11:36.059Z

Reported as a fact, scoped to the files read, residue named non-exhaustively,
live directory distinguished from the corpus by name, count and ISO-8601 UTC
timestamp present, and no claim that capture is off. `grep -c "$HOME/.claude"`
over the full report returns 0 — the home path is not leaked.

A latent defect surfaced while fixing B16/B17 and was fixed with them: the file
enumeration rendered only `absent` and `sets nothing`. Once the `unknown` branch
began sharing that enumeration, an unparseable file would have been labelled
"sets nothing" — a false statement about a file the check had just said it could
not read. Found by the implementer, not by review.

## Stage 7 second pass — two concerns fixed, one proven by sabotage

Re-review after the must-fixes returned zero blockers from both reviewers.
architecture-reviewer enumerated all three reachable branches of `captureChecks`
and confirmed B16/B17 closed with no surviving sibling — the payload clause now
sits on the return itself rather than per-branch, so no branch can drop it.
test-engineer confirmed the previously defect-pinning test now asserts count and
ISO timestamp, named a breaking production edit for every new test, found no
stale pins, and confirmed no assertion was weakened to accommodate the fix.

Two concerns were fixed rather than carried to the PR, because both are the same
class of defect this change exists to eliminate.

**The quantifier included what it could not read.** The `unknown` branch said
"no settings file this check *read* sets it", quantifying over a set that
includes the file the same sentence had just called unparseable — asserting a
value for the one file it declared undetermined. The enumeration that follows
corrected it, so it was self-contradictory rather than false, but that is
precisely B16's shape: the sentence overclaims and the surrounding clauses
rescue it. Now "no settings file this check *could parse* sets it", which is
accurate in both the `fact` and `unknown` branches that share the wording.

**`stateOf` was correct by caller, not by construction.** It had no arm for a
read carrying a value, so a file that sets the variable would have rendered as
"sets nothing". It was unreachable only because the sole caller runs where
`setters.length === 0` — an invariant living in the caller rather than the type,
which is the same latent-falsehood shape the previous commit had already tripped
over once with the two-state renderer.

This one was proven rather than argued. The `setters.length === 0` guard was
temporarily relaxed so setters flowed through `stateOf`, and the check printed:

  checked .claude/settings.local.json (absent), .claude/settings.json (sets
  nothing), ...

about a file containing `NULLIUS_WITNESS_PROBE=1`. A flatly false statement, in
the one check whose entire purpose is not making claims it cannot support. After
adding the value arm, the same sabotage printed `.claude/settings.json (sets
NULLIUS_WITNESS_PROBE=1)`. Sabotage then reverted and confirmed removed by
grep before committing.

Recording the method because the accompanying test passes vacuously today: it is
a regression guard, and a guard that has never been observed to fail is not yet
evidence of anything. The sabotage is what made it evidence.

## Coordinator corrections since last append

- **A shell loop reported all five dogfood gates as failing.** The gates were
  fine; `$cmd` unquoted does not word-split in zsh, so every invocation received
  a single malformed argument and exited 2. This is the second time this run
  that zsh word-splitting produced a false result from a coordinator-written
  loop — the first was the Stage 1 `state-set` batch. Re-run explicitly, all
  seven pass. Worth noting that the failure mode was a *false alarm* rather than
  a false pass; the same bug in the other direction would have reported gates
  green without running them.
