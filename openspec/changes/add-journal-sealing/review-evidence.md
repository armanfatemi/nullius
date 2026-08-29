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
