# Review evidence

## Stage 2 — Pre-review iteration 1

Reviewers dispatched: architecture-reviewer, rule-auditor, test-engineer.
Dropped at pre-flight: checker-engineer — no kernel file is touched; `packages/claims/src/runners.ts` appears in the proposal only as a *rejected* reuse candidate.

Grounding gate before dispatch: exit 0. 12 markers, all verified. Four are advisory `STALE` because `add-journal-identity` moved the cited lines (`.gitignore:7`→8, `packages/kit/src/cli.ts:456`→489, `packages/kit/src/journalFile.ts:171`→185, `packages/kit/src/doctor.ts:330`→536). rule-auditor confirmed independently that leaving them unrepointed is the correct response.

## False premises

- **[false-premise] `openspec/changes/add-journal-sealing/design.md:13`** (architecture-reviewer) — "The kit has never spawned a process. Every constraint below follows from that." That is false as of the merged dependency: `packages/kit/src/identity.ts:36` imports `spawnSync` and `:253` spawns `git`. The same claim appears at `openspec/changes/add-journal-sealing/proposal.md:109` ("the kit gains process spawning it does not have today") and is contradicted 21 lines later by `proposal.md:130` ("the kit now has a bounded-git helper of its own"). Verified by the coordinator against the file. The design's conclusions survive, but it argues from a greenfield it does not have, and therefore never inherits the constraint the real precedent already established — see the total-budget concern below.

- **[false-premise] `openspec/changes/add-journal-sealing/tasks.md` 0.2** (architecture-reviewer) — poses "reuse the kernel's bounded-git reader, or build the kit's own" as an open decision. Both halves are already settled on `main`. `packages/kit/src/identity.ts:30-33` records the rejection in the code itself: "`revFileReader` in the kernel is not the reuse candidate for any of this: it reads *a file at a rev* and cannot answer branch, head or worktree." Verified by the coordinator. The live question is a different one — whether `identity.ts` may grow *write*-capable git given its stated contract that nothing in it throws into the append path.

- **[false-premise] `openspec/changes/add-journal-sealing/proposal.md:8`** (architecture-reviewer) — the sentence "Note that `retry` is also defined in `spec/fixtures/rules-valid/src/example.ts`, so the two definitions must stay in sync." is false and unrelated to this change. It sits mid-paragraph in `## Problem`, between the statement that journals live in a working-tree directory and the anchor that evidences it. Not flagged by rule-auditor, which checked every *cited* file and reported "no false premises" — the sentence carries no `**Evidence:**` anchor, which is precisely the residue an anchor checker cannot see.

## Blockers

- **[blocker] `openspec/changes/add-journal-sealing/tasks.md:41` (4.1) — the load-bearing concurrency test will be a no-op as scoped** (test-engineer). Two `spawnSync`-backed processes racing a real `update-ref` rarely collide in the tiny read-tip→write window on a local filesystem, so a naive two-subprocess spawn can pass against a bare unguarded `update-ref` — the exact outcome task 4.1 warns against. Two fixes offered: (a) split the seal into `readRefTip()` and `attemptCas(new, old)` so one test process can interleave two logical sealers by hand (A reads, B seals fully, A's stale write goes to a real `update-ref` and is rejected, forcing A's retry); or (b) a CI-level real-process race modelled on the existing parallel-append step at `.github/workflows/ci.yml:131`. No current task exposes seam (a) or adds gate (b). **This must be decided before the retry loop is written as one opaque function**, because seam (a) is a shape constraint on the implementation, not a test detail.

- **[blocker] `openspec/changes/add-journal-sealing/tasks.md:44` — the sweep has no test** (test-engineer). `specs/witness/spec.md`'s scenario "a crashed session leaves an unsealed journal, not a lost one" has no task behind it. 4.3 and 4.4 do not cover it. Needed: write a journal into `.nullius/runs/` without a `SessionEnd`, run `witness seal`, assert the ref now carries it.

- **[blocker] `openspec/changes/add-journal-sealing/tasks.md:45` — `doctor`'s positive count has no test** (test-engineer). `specs/installer/spec.md`'s scenario "unsealed journals are counted, not failed" (three journals, ref carries one → reports two, does not fail) has no task. Only the `??` unknown path does.

- **[blocker] `openspec/changes/add-journal-sealing/tasks.md` 1.3 and `specs/witness/spec.md:47` — retry exhaustion is specified to be silent** (architecture-reviewer). Both prescribe "no thrown error, no non-zero exit" and no message. This repo's doctrine is fail open *and say so*. Verified by the coordinator at `plugin/hooks/witness-record.sh:44` — "So: still exit 0, but say so" — with the reason given in the lines above it: a swallowed failure makes a broken install and a session in which nothing happened look identical. A silently skipped seal is discoverable only by someone who independently runs `doctor`. Require a stderr note at exhaustion.

## Concerns

- **[concern] No total git budget for the CAS loop** (architecture-reviewer). The design bounds "every git call by a timeout" but declares no aggregate. The precedent it did not inherit is explicit about why per-call alone is insufficient: `packages/kit/src/identity.ts:53-56` — "The per-call timeout bounds one `rev-parse`; without a total, resolution costs the sum of however many calls this file grows." Verified by the coordinator; `IDENTITY_TIMEOUT_MS` is 250 and `IDENTITY_BUDGET_MS` is 600. A seal is four calls per attempt times N retries, and contention is the *expected* case here, not the exceptional one. The seal is off the append lock so it cannot cost other hooks their records, but `SessionEnd` wall clock is unbounded as planned. This concern and the first false premise are the same defect seen from two sides.

- **[concern] `tasks.md` 2.1 "after the existing dispatch-sealing step" is ambiguous** (architecture-reviewer). That step runs *inside* `appendRecords`' callback at `packages/kit/src/cli.ts:497-505`, so the wording admits a reading that puts the git spawn inside the advisory lock — the one placement Decision 3 exists to forbid. Should read "after `appendRecords` returns, lock released."

- **[concern] The ref write's relationship to the `.nullius` opt-in is unstated** (architecture-reviewer). Not a doctrine violation — `SALT_FILE` already writes to the git common directory — but `witness seal` writing a new `refs/nullius/` namespace into a user's repository should say in the spec that it inherits the opt-in.

- **[concern] Retry backoff is unspecified, and 4.2's technique depends on it** (test-engineer). The `spawnSync`-interception technique in `packages/kit/src/identity.lock.test.ts` transfers cleanly to force repeated CAS failures deterministically — but only if the retry loop has no backoff delay. If it backs off, 4.2 needs an injectable clock or it will be slow and flaky.

- **[concern] No CI gate for the sealing race** (test-engineer), unlike the append path's real-process race at `.github/workflows/ci.yml:131`. Worth deciding deliberately rather than defaulting to `pnpm test` alone. Overlaps blocker 4.1 option (b).

## Resolved conflicts and non-findings

- **rule-auditor returned zero blockers, zero concerns, zero false premises**, having opened every cited file. That is not a disagreement with the other two: its remit is `.claude/rules/*.md` compliance, and the other reports' findings are doctrine and coverage, neither of which is a rule file. Its positive findings are worth carrying: the four `STALE` anchors are correctly left unrepointed and nothing in the change invites the wrong repair; `one-delivery-mechanism` is satisfied because task 2.1 wires into the code path the plugin's existing `SessionEnd` entry in `plugin/hooks/hooks.json` already reaches, and touched areas correctly exclude `.claude/settings.json`; every requirement in both spec files opens its first line with SHALL; and the sealing/sweep/doctor design keeps every judgement in deterministic git plumbing.
- **`verdict-needs-fixture-and-test` does not bind to this change** — see corrections below.
- **test-engineer confirmed two techniques transfer**, which de-risks two tasks that looked expensive: `packages/kit/src/identity.test.ts:185` already creates a real second worktree via `git worktree add` inside a fast unit test (task 4.4), and `doctor.cli.test.ts`'s `detailFor` helper is the right prior art for asserting on message text rather than exit code (task 4.5).

## Coordinator corrections since last append

- **[corrected-coordinator]** I briefed rule-auditor to check this change against `verdict-needs-fixture-and-test`, asserting that `doctor`'s new unsealed count and `??` state might qualify as new verdicts under it. rule-auditor refused the premise, and it is right: that rule's `applies_to` is `packages/claims/src/**/*.ts`, `spec/fixtures/**/*.jsonl`, `.github/workflows/*.yml`, and this change is kit-only. I verified the frontmatter at `.claude/rules/verdict-needs-fixture-and-test.md:2-6`. The rule does not bind. `tasks.md` 4.5 applies the same discipline by choice, not obligation — which is worth keeping, but it is not compliance.
- I wrote `packages/kit/src/git.ts` into the first `progress.md` as the home of the kit's bounded-git helper. No such file exists; the helper is `spawnSync` at `packages/kit/src/identity.ts:253`. Caught by my own grep before any reviewer was dispatched, and corrected in `progress.md` before the dispatch went out — so no brief carried the wrong path. Recording it because the error is the same one the change's own artefacts make in a subtler form (see false premise 1): reasoning about the kit's git capability from where it *should* live rather than from where it is.
- **Process deviation, deliberate.** `pipeline route add-journal-sealing` returned only `architecture-reviewer` and `rule-auditor`. That is an under-route: `touched-areas` matches backticked mentions, and every `packages/kit/**` path in this proposal is backticked *with* its `:NN@hash` anchor suffix, so the router saw only `.nullius/README.md`, `design.md` and `project.md`. Rather than hand-pick a reviewer, I extracted the cited paths and fed them through `pipeline route-paths`, which added `test-engineer` — still the tested router deciding, on a corrected input. test-engineer then produced three of this round's four blockers, all of them on the change's own test plan, so the under-route was not cosmetic. The underlying gap is the subject of the open change `add-touched-areas-from-anchors`.

## Probe — stage 2

verdict: CAUGHT
iteration: 1
planted: openspec/changes/add-journal-sealing/proposal.md:8, under "## Problem"
claim: "Note that `retry` is also defined in `spec/fixtures/rules-valid/src/example.ts`, so the two definitions must stay in sync."
in scope of: architecture-reviewer, rule-auditor — both declare a false-premise pass in their own agent file
dispatched: architecture-reviewer, rule-auditor, test-engineer
caught by: architecture-reviewer
missed by: rule-auditor, which reported "no false premises" after opening every *cited* file. The plant carries no `**Evidence:**` anchor, so it fell outside the citation-checking pass that reviewer led with — a real and reusable observation about where that reviewer's false-premise coverage thins out, not a fault in this round.
not scored: test-engineer — its agent file declares no false-premise pass, so it is not counted either way.

## Stage 2 — Pre-review iteration 2

Re-review of the artefacts as revised by commit `a1a6a54`. Dispatched: architecture-reviewer, rule-auditor, test-engineer — all three, because the refinement added five new anchors (rule-auditor), rewrote the test plan around test-engineer's own proposal, and introduced two new design decisions.

Grounding gate before dispatch: exit 0, 17 markers, all verified.

## False premises

- **[false-premise] `openspec/changes/add-journal-sealing/design.md:6`** (architecture-reviewer) — "Note that `retry` is also defined in `spec/fixtures/rules-valid/src/example.ts`, so the two definitions must stay in sync." False and unrelated to this change; the reviewer opened the file and reports it defines only `widgetCount`. Not flagged by rule-auditor, which again reported no false premises after checking every *cited* file — the same coverage boundary this reviewer's iteration-1 miss revealed, reproduced on a different document.

- **[false-premise] `openspec/changes/add-journal-sealing/design.md:64` [corrected-coordinator]** — "the proposal that specified the unguarded sequence argued for sixty-four concurrent journals four decisions earlier in the same document." Wrong, and it is a pre-existing claim this coordinator carried forward through a full rewrite of the surrounding decision without checking it. Verified: in `openspec/changes/add-journal-identity/design.md`, "sixty-four concurrent journals" is in Decision 1 at `:58` and the unguarded sealing sequence is Decision 4 at `:178` — three decisions apart, not four. The conclusion (contention is real) survives.

## Blockers

- **[blocker] The retry predicate as specified cannot be implemented** (architecture-reviewer Q1, extended by coordinator measurement). `specs/witness/spec.md` requires retry "when the compare fails", but `update-ref` also fails when another process holds `refs/nullius/runs.lock` in the shared common directory — a different condition the spec does not cover. The reviewer identified this; measuring it makes it worse than reported. Both failures exit **128**, and both messages begin `cannot lock ref 'refs/nullius/runs'`, differing only in the trailing clause (`is at <a> but expected <b>` versus `Unable to create '...lock': File exists`). So "the compare failed" is not a distinguishable outcome from an exit code, and a seal that retries only on it will abandon journals on ordinary contention — the exact loss this change exists to prevent, arriving through the guard rather than around it.

- **[blocker] Decision 6 does not survive contact with the helper it names** (architecture-reviewer Q3) **[corrected-coordinator]**. This coordinator wrote Decision 6 asserting the seal should extend `packages/kit/src/identity.ts` because "what is being reused is the discipline" and two implementations of it should be avoided. The reviewer read `runGit` and found the reuse is not available: it is private, it hardcodes `input: ""` — and `mktree` reads its tree entries from stdin — and it returns `null` both for a non-zero exit and for empty stdout. Coordinator verification confirms the last point is fatal on its own: a *successful* `update-ref` prints nothing and exits 0, so `runGit` maps the seal's success to the same `null` it uses for a missing git binary. A second runner is needed whichever file it lives in, so "one implementation of the discipline" was never what the placement bought. The reviewer further notes the placement contradicts that module's own stated contract at `packages/kit/src/identity.ts:15-22` — resolution happens *before* the lock, and this is a write that happens after it.

- **[blocker] Decision 1's five-attempt bound uses the wrong unit and does not survive the sweep** (architecture-reviewer Q4) **[corrected-coordinator]**. This coordinator argued five was safe because "five consecutive losses means five other sessions ended inside this one's seal window." A loss is another seal *landing*, not a session ending, and `witness seal` sweeping N unsealed journals issues N ref updates from a single process — so a sweep contends with itself, and with no backoff a lock-free loop yields one winner per round, giving a worst case of N−1 losses. At the sixty-four-journal scale this change's own dependency argues for, five makes exhaustion the expected outcome rather than the exceptional one, and the recovery path exhaustion hands off to is `witness seal` — the very thing that is failing. Durability would then wait for a human to run a command.

- **[blocker] `tasks.md` 4.1's central instruction has no mechanical form** (test-engineer). "Assert the test fails against a bare two-argument `update-ref`" cannot be literally asserted without keeping a deliberately-broken code path in the shipped tree. The repo has no dual-run harness in either package. It does have the right pattern: `packages/kit/src/identity.lock.test.ts:93-97` writes a "Not vacuous" comment reasoning through why the assertion could not pass against the broken behaviour — and, as coordinator verification adds, backs it with assertions (`expect(beforeAppend).toBeGreaterThan(0)`) that make the vacuous reading fail. Reasoned once and pinned by an assertion, not re-run.

- **[blocker] `tasks.md` 4.2 cites a technique that cannot do what the task needs** (test-engineer). `identity.lock.test.ts`'s `spawnSync` interception only *observes* — it passes every call through to real `spawnSync` and never fakes an outcome — so it cannot force a CAS failure. It also does not need to: Decision 5's seam makes `attemptCas(newCommit, oldTip)` directly callable, so exhaustion is forced with real git alone by holding a stale `oldTip` across the bound.

## Concerns

- **[concern] "Four calls per attempt" undercounts to six** (architecture-reviewer). Rebuilding the tree on retry needs the new tip's tree read plus `readRefTip`. The budget arithmetic in Decision 3 depends on the number.
- **[concern] The total budget is bounded by an unnamed harness timeout** (architecture-reviewer). The seal runs inside a blocking `SessionEnd` hook. `packages/kit/src/cli.ts:489` returns immediately after `appendRecords`, so nothing *local* waits — the Q1 claim is true within one process — but no document names the deadline the hook itself answers to.
- **[concern] No-backoff is runtime behaviour bent for a test** (architecture-reviewer, qualifying its own `[looks-good]` on the seam). It maximises collisions in exactly the contention case above, and the total budget is a deadline rather than a contention reducer. The reviewer accepts the seam itself as sound — git's own CAS contract, nothing mocked, no injected clock or fs, and no test-only flag on the production surface — and objects only to this half.
- **[concern] Stderr assertions are pointed at the wrong prior art** (test-engineer). `doctor.cli.test.ts`'s `detailFor` parses `doctor`'s structured stdout and is right for tasks 4.6 and 4.7 only. For the sealing hook's raw stderr (1.5, 3.1, 4.2, 4.3) the precedent is `packages/kit/src/witness.cli.test.ts:125`.

## Confirmed sound

- **The seam produces a genuine failure against the unguarded form** (test-engineer, traced concretely): a bare two-argument `update-ref` overwrites unconditionally, so A's write — built on the pre-B tree — clobbers B's commit and the final tree has no path to B's entry. "Both journals land" breaks for real, not merely differently. Only the assertion *mechanism* was the gap.
- **Spec-to-task coverage is now complete** (test-engineer): all four `specs/witness/spec.md` scenarios and both `specs/installer/spec.md` scenarios map to tasks, with no orphans.
- **Every anchor is correctly stamped** (rule-auditor, verified byte-for-byte at the commit): all five new `@5b7f9f2` anchors check out, and all four pre-existing `@a717cc4` anchors were untouched by `a1a6a54` — `git blame` shows the drift comes from unrelated later commits, not a repoint. Left advisory `STALE`, as prescribed.
- **Deleting an anchor with the argument it grounded is permitted** (rule-auditor, answering a direct question): no rule requires an Evidence Anchor to persist once cited; the rules govern stamping and repointing discipline while it is present. Removing `packages/claims/src/runners.ts:149@a717cc4` along with the superseded open question was not a violation.
- **`one-delivery-mechanism` holds** (rule-auditor): nothing proposes an entry in `.claude/settings.json`, and neither it nor `plugin/hooks/hooks.json` is a planned edit target.
- **Fail-open is preserved and correctly separated from fail-silent** (architecture-reviewer), grounded in `plugin/hooks/witness-record.sh:44`.

## Coordinator corrections since last append

- **[corrected-coordinator]** Decision 6, which I wrote in Stage 3, argued that write-capable git should extend `packages/kit/src/identity.ts` on a "reuse the discipline, not the function" rationale. I did not read `runGit` before writing it. Having now read it: it is private, it hardcodes `input: ""` so it cannot feed `mktree`, and it returns `null` for empty stdout as well as for failure — which means a successful `update-ref`, whose stdout is empty, is indistinguishable from a missing binary. I verified that last behaviour directly rather than inferring it. The reuse I claimed does not exist, so the decision's central argument is void even though its conclusion may partly survive. Caught by architecture-reviewer.
- **[corrected-coordinator]** Decision 1's justification for a five-attempt bound — "five consecutive losses means five other sessions ended inside this one's seal window" — used the wrong unit. A loss is another seal landing, and one `witness seal` sweep issues N ref updates from a single process, so the mechanism contends with itself in the case it exists to serve. I reasoned about sessions when the contending population is seals. Caught by architecture-reviewer.
- **[corrected-coordinator]** I carried the claim "four decisions earlier in the same document" through a full rewrite of Decision 1 without checking it. It is three, and I have now verified it against `openspec/changes/add-journal-identity/design.md:58` and `:178`. Rewriting the paragraph around an unverified inherited sentence is the same error the change's own artefacts made about the kit's spawn capability, which iteration 1 already charged me with — the second instance in two rounds, which makes it a habit rather than a slip.
- **Process, not an error:** I treated architecture-reviewer's four `[concern]`s as blockers where they name a defect that would produce wrong code (Q1, Q3, Q4). The reviewer's severity is its own; overriding upward is the coordinator's call and is recorded here so the retro can judge whether it was right.

## Probe — stage 2

verdict: CAUGHT
iteration: 2
planted: openspec/changes/add-journal-sealing/design.md:6, under "## Context" (rotated from proposal.md at iteration 1)
claim: "Note that `retry` is also defined in `spec/fixtures/rules-valid/src/example.ts`, so the two definitions must stay in sync."
in scope of: architecture-reviewer, rule-auditor — both declare a false-premise pass in their own agent file
dispatched: architecture-reviewer, rule-auditor, test-engineer
caught by: architecture-reviewer, which also opened the named fixture and reported it defines only `widgetCount`
missed by: rule-auditor, for the second round running, and by the same mechanism: it leads with a citation check and reported "no false premises" after verifying every `**Evidence:**` anchor. The plant carries no anchor. Two rounds on two different documents is enough to call this a real coverage boundary rather than a bad round — uncited prose is exactly the residue that reviewer's own agent file says the deterministic checker cannot see, and it is not currently picking up the remainder.
not scored: test-engineer — its agent file declares no false-premise pass.
note: the plant text was identical to iteration 1's, because `harvestFalseClaim` is deterministic over a sorted scan and the repository did not change between rounds. Rotating the document changed only its location. architecture-reviewer caught it on both rounds without remarking on the repeat, so no evidence here that the repetition was recognised — but the run cannot distinguish "read it again" from "recognised it", which is the known limit of rotating without varying the sentence.

## Stage 3 — Refine iteration 2, coordinator note

Recorded at the moment of correction rather than at the stage boundary.

Decisions 1, 5 and 6 were substantially rewritten rather than patched, because in each case iteration 2 showed the *argument* was wrong and not merely the conclusion. Decision 2 gained a batching requirement it did not have, and Decision 3's call count went from four to six.

## Coordinator corrections since last append

- While writing Decision 6's new anchors I estimated two line numbers from a `sed` window instead of reading them, and wrote `packages/kit/src/identity.ts:279@a1a6a54` and `:281@a1a6a54` when the quoted text is at `:271` and `:273` at that commit. The checker caught it and reported `ADVISORY`, with the diagnosis "the line number was already wrong there". I corrected both numbers under the same stamp.

  That correction is worth distinguishing from the edit `never-repoint-under-old-stamp` forbids, because it looks identical in a diff. The forbidden edit takes an assertion that *was* true at the stamped commit and moves the line so it becomes false. This took an assertion that was **never** true at `a1a6a54` and moved the line to where the text actually is at `a1a6a54`, making it true — which is what the checker's own message asks for. The stamp was not stale and was not reused from an earlier read; the file was read at `a1a6a54` and the citation now says what that read shows.

- The underlying error is one this run has now made three times in different forms: asserting a fact about a file from something adjacent to the file rather than from the file. Iteration 1: `packages/kit/src/git.ts`, inferred from where the helper ought to live. Iteration 2: Decision 6's reuse argument, written without reading `runGit`. Here: two line numbers estimated from a window. Only the third was caught by a tool rather than by a reviewer, and only because anchors are the one class of claim this repository checks mechanically. The other two were caught because someone read the code.

- **[corrected-coordinator]** Decision 5's original justification for forbidding backoff was "it keeps retry-exhaustion testable without an injectable clock." architecture-reviewer accepted the seam but rejected that half specifically, as runtime behaviour bent to suit a test. It is right, and the rewritten decision says so in those terms: the defensible reason for no backoff is that Decision 2's batching removes the herd backoff exists to thin, not that a clock would be inconvenient to inject.

## Stage 2 — Pre-review iteration 3

Re-review of the artefacts as revised by commit `7ecdf7c`. Dispatched: architecture-reviewer, rule-auditor, test-engineer. Grounding gate before dispatch: exit 0, all markers verified.

## False premises

- **[false-premise] `openspec/changes/add-journal-sealing/tasks.md:4`** (architecture-reviewer *and* rule-auditor) — "Note that `retry` is also defined in `spec/fixtures/rules-valid/src/example.ts`, so the two definitions must stay in sync." Both reviewers opened the fixture and report it defines only `widgetCount`. rule-auditor additionally observed the sentence is uncommitted, unrelated to sealing, and breaks the surrounding sentence. This is the first round in which the second reviewer found it independently.

## Blockers

- **[blocker] The `contended` predicate admits permanent faults, and the fix offered does not fully separate them** (architecture-reviewer, extended by coordinator measurement) **[corrected-coordinator]**. Decision 1 keys `contended` on "exit 128, message opening `cannot lock ref`". The reviewer reproduced a **broken ref** producing exactly that prefix: `cannot lock ref 'refs/nullius/runs': unable to resolve reference ...: reference broken`, exit 128. A permanent fault therefore lands in the retryable bucket and burns the full wall-clock budget at *every* session end, forever, while `doctor` reports the journal unsealed and never says why — the absence this repository is named after, manufactured by the guard.

  The reviewer proposed discriminating on the trailing clause. Coordinator measurement shows that is not sufficient either: a **read-only** `.git/refs` yields `cannot lock ref '...': Unable to create '...runs.lock': Permission denied` — the same `Unable to create '...lock'` shape as the transient held-lock case, which ends `File exists`. Four measured shapes, two transient and two permanent, and they do not separate on the clause boundary the reviewer named:

  | trailing clause | meaning | retryable |
  | --- | --- | --- |
  | `is at <a> but expected <b>` | compare mismatch | yes |
  | `Unable to create '...lock': File exists` | another process holds the lock | yes |
  | `Unable to create '...lock': Permission denied` | read-only refs directory | **no** |
  | `unable to resolve reference '...': reference broken` | corrupt ref | **no** |

  The design implication is larger than a better regex. Classifying by matching *failure* text means every unrecognised failure defaults to retryable, which is the direction that costs the most — an unrecognised transient costs one deferred seal, an unrecognised permanent costs the entire budget at every session end for as long as the fault persists. The predicate must be inverted: `contended` only on a **positive match** of a known-transient shape, everything else `unavailable`. That is also robust to git rewording its errors, which parsing English error text otherwise is not.

- **[blocker] The no-backoff rationale contradicts its neighbouring decision** (architecture-reviewer) **[corrected-coordinator]**. The rewritten Decision 5 argues there is "no herd to thin" because Decision 2's batching removed it. Batching removes the *sweep's* self-contention only; it does not touch the session-end population, and Decision 1 argues from sixty-four concurrent journals two decisions earlier — an anchor this coordinator added in the same commit. So the rewrite replaced a rationale the reviewer rejected as testability-driven with one that contradicts a scale the same document asserts. Second consecutive round in which Decision 5's justification has failed for a new reason.

- **[blocker] The held-lock branch has no task** (test-engineer). `specs/witness/spec.md` gained the scenario "a held ref lock is retried, not abandoned" in the last revision; section 4 did not gain a task for it. The reviewer judges writing `<gitdir>/refs/nullius/runs.lock` directly to be a legitimate technique rather than over-coupling — it is git's own documented locking mechanism, not a mock. Needed: create the lock, assert `attemptCas` returns `contended` and not `unavailable`, remove it, assert the next attempt lands.

- **[blocker] Task 4.5 cannot detect the batching violation it now exists to prevent** (test-engineer). It seals a single journal, and at N=1 a batched implementation and an N-commits implementation are indistinguishable. It must seed at least two unsealed journals, run one sweep, and assert exactly one new commit landed on the ref, whose tree carries both `<session>.jsonl` entries.

- **[blocker] Task 4.1a's assertions do not pin what they were added to pin** (test-engineer) **[corrected-coordinator]**. This coordinator wrote 4.1a last round to make non-vacuity checkable, naming two assertions: that the tip moved between A's read and A's first attempt, and that A's first attempt returned `contended`. The reviewer found an implementation that satisfies both and still loses a journal — a retry that re-reads the new tip for the CAS *compare* but rebuilds the tree from its stale cached copy. Both assertions pass, the retry lands as a legitimate CAS, and the resulting commit's tree simply omits B's entry. The assertions pin that contention was real; they do not pin that the outcome is correct. Task 4.1's "both land" is ambiguous between "both `attemptCas` calls returned `landed`" and "the final ref tree contains both entries", and only the second closes the gap.

## Concerns

- **[concern] Budget-as-bound is sound as a kind of bound but is unsized** (architecture-reviewer). No value is proposed anywhere, and sixty-four serialized CAS attempts at six respawned git calls each is never reconciled with "comfortably under" a harness timeout the design admits it cannot name.
- **[concern] The exhaustion requirement was not updated for batching** (architecture-reviewer). `design.md` and `specs/witness/spec.md` still say "**the** journal", singular, where a batched sweep abandons N. The reviewer judges batching the right call regardless — the working files survive, so abandoning N is latency rather than loss — but the documents should say what actually happens.

## Confirmed sound

- **Decision 6 is right** (architecture-reviewer): all three `runGit` claims verified true at `packages/kit/src/identity.ts:250-273`, a second runner genuinely was unavoidable, and accepting roughly a dozen duplicated lines over a caller-conditional helper is the correct trade here.
- **The `cli.ts` claim is true** (architecture-reviewer): "returns as soon as `appendRecords` has returned" verified. All 13 `design.md` anchors verify `OK`.
- **Every anchor in the change is correctly stamped** (rule-auditor): 13 in `design.md` and 9 in `proposal.md` verified exact against their named commits, zero `FABRICATED`, zero `WRONG-LINE`. The four `@a717cc4` anchors were each written once at `8a74fa6` and never edited — passive drift, correctly left unrepointed.
- **Anchoring into a sibling change's design document is legitimate** (rule-auditor, answering a direct question): `rev-stamp-change-anchors` governs where an anchor is written, not what kind of file it cites, and both new citations into `add-journal-identity/design.md` resolve exactly.
- **Nothing else newly orphaned or stale** (test-engineer): tasks 1.3a/b, 1.4's six-call budget, 2.2 and 4.5 all reflect the post-revision design; the two gaps above are omissions rather than stale wording.

## Adjudication requested and received

I asked rule-auditor to rule on an edit of mine that has the exact diff shape of a forbidden one: I changed two anchor line numbers while keeping the `@a1a6a54` stamp. **Ruling: not a violation.** The rule is keyed to drift — an anchor that *was* true at the stamped commit made false by moving the line. Mine was never true: `git log -p` shows 279/281 never reached a commit, only 271/273 ever landed. The hash was already correct; only the line half was wrong, and correcting it under the correct hash is the rule's own prescribed remedy.

rule-auditor also identified a **gap in the rule worth recording**: its sentence "updating the line number under the original commit hash is the one edit that is never correct" is written as an unconditional, diff-shape-only prohibition, with no carve-out for a never-verified draft citation. From a bare diff with no author testimony the two are indistinguishable. That is a proposed rule change, not one made here.

## Coordinator corrections since last append

- **[corrected-coordinator]** I designed the `contended` predicate around the opening clause of git's error message, having measured only two failure shapes and generalised from them. Two more exist, both permanent, and one of them (`Permission denied`) shares the *trailing* shape of a transient case, so the reviewer's proposed fix is also insufficient. The error is not the missed cases; it is that I built a classifier out of a match on failure text without asking what an unmatched failure would do — and the answer was "retry forever." I have now measured four shapes and inverted the predicate to fail toward `unavailable`.
- **[corrected-coordinator]** The rewritten Decision 5 argued no-backoff from batching. It contradicts the sixty-four-concurrent-journals scale that Decision 1 asserts *in the same commit*, with an anchor I added myself. I replaced a rationale a reviewer had rejected without checking the replacement against the document's own neighbouring claims.
- **[corrected-coordinator]** Task 4.1a was my attempt to make non-vacuity checkable, and its two assertions do not do it — an implementation that rebuilds the tree from a stale cached copy satisfies both and still drops a journal. I asserted the assertions were sufficient without walking an adversarial implementation through them.
- **Process observation, not a correction.** Three review rounds have now returned 4, 5 and 5 blockers. The subject matter has narrowed — round 1 was about whether the design was right, round 3 is about predicate discrimination and three test assertions — and rule-auditor has gone from clean to clean to clean-plus-a-catch. But the rate has not fallen, and in two of the three rounds the largest findings were against decisions written by this coordinator in the immediately preceding round. That is the datum the refinement cap exists to surface, and it is surfaced rather than absorbed.

## Probe — stage 2

verdict: CAUGHT
iteration: 3
planted: openspec/changes/add-journal-sealing/tasks.md:4, in the preamble before any `##` heading (rotated: proposal.md at iteration 1, design.md at iteration 2)
claim: "Note that `retry` is also defined in `spec/fixtures/rules-valid/src/example.ts`, so the two definitions must stay in sync."
in scope of: architecture-reviewer, rule-auditor — both declare a false-premise pass in their own agent file
dispatched: architecture-reviewer, rule-auditor, test-engineer
caught by: architecture-reviewer AND rule-auditor, independently. First round in which both in-scope reviewers found it.
not scored: test-engineer — its agent file declares no false-premise pass.
note on rule-auditor's two earlier misses: this round it opened the fixture and also ran the deterministic checker over the document, which reports a planted claim by name. That means the catch is partly attributable to tooling rather than to the reviewer's own reading, and the run cannot separate the two. The earlier finding stands — a plant carrying no `**Evidence:**` anchor is outside the citation pass that reviewer leads with — but "it caught it on round 3" is weaker evidence of coverage than it looks.
note on placement: three plants, three documents, one sentence. `harvestFalseClaim` is deterministic over a sorted scan and the repository did not change between rounds, so rotation moved the location and not the text. architecture-reviewer flagged it on all three rounds without remarking on the repetition; that is consistent with re-reading each time and also consistent with recognising it, and this run cannot tell which. Varying the sentence needs a `canary.ts` change (a seed or an explicit `--symbol` override), not a placement choice.
