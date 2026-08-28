# Review evidence

## Stage 2 — Pre-review iteration 0

Dispatched: architecture-reviewer, checker-engineer, rule-auditor, test-engineer (all four router candidates survived pre-flight; each had a change-specific target).
Grounding gate (Step 0): exit 0 — design.md 24/24 OK @87eb675; proposal.md:12 `README.md:306@3f40733` advisory STALE (text now at README.md:414).

## False premises

- FP1 `proposal.md:6` — sentence claiming `retry` is also defined in `spec/fixtures/rules-valid/src/example.ts`. Uncited; the file contains no `retry`. Flagged by rule-auditor, checker-engineer, architecture-reviewer (3 of 4). test-engineer's false-premise pass spot-checked anchors only and did not flag it. Two of the three reports also observed the repository's merge guard / registry firing on that line in this clone.
- FP2 `design.md:40-48` — "Stamped anchors never produce either verdict" (anchored on `checkClaims.ts:427`). **Wrong** [corrected-coordinator]: checker-engineer — the fail-open branch at `checkClaims.ts:399-400` returns the *unstamped* result verbatim when a stamped anchor's rev cannot be read, and `drift`/`wrong-line` are passing, so a stamped anchor CAN carry those verdicts (squash-merge, shallow clone, fork). Line 427 is downstream of that return.
- FP3 `tasks.md:23` and `proposal.md:55` — "Close issue #7", "Subsumes issue #7 entirely; partially #4": #4/#6/#7 are all CLOSED (architecture-reviewer; design Decision 7 already notes it, but the artefacts an implementer reads are still false).

## Blockers

- B1 [checker-engineer] `checkClaims.ts:399-400` — Decision 3's "filter on verdict; both are unstamped by construction" would repoint under an old stamp on the fail-open path, converting advisory STALE to hard FABRICATED — the exact edit `.claude/rules/never-repoint-under-old-stamp.md` forbids. **Fix: `--fix` filters on `claim.rev === undefined`, not on verdict.** [corrected-coordinator]. Converges with rule-auditor's concern that the invariant is unpinned: add a named test "`--fix` never touches a stamped anchor, including one whose rev is unreadable".
- B2 [checker-engineer] Decision 4's HEAD gate is defeated by the same branch: running `{...claim, rev: head}` through `checkPresence` returns `ok`/`weak-anchor` computed from the working tree whenever `readFileAtRev` is undefined or `unavailable` (git timeout), byte-identical to a real HEAD verification; `unverifiable-rev` surfaces only when the fallback fails. A `Verdict` cannot express "actually read at rev". **Fix: the stamp gate must require an explicit `atRev.status === "ok"` read of the cited file at HEAD, then evaluate against those lines** — not a verdict-only test. [corrected-coordinator]. Other cases (modified-uncommitted → `advisory`/`fabricated`) are already outside the filter.
- B3 [test-engineer] `tasks.md` 1.2 — no task names the negative test: an anchor passing in the working tree but not at HEAD must be skipped `not-at-head`, not stamped. Tickable on the happy path alone. Converges with rule-auditor C6.
- B4 [test-engineer] `tasks.md` 1.1 — the re-parse "marker changed since read → skip-and-report" path has no task naming a test; it is the guard Decision 1 leans on to avoid a whole-file diff.

## Conflict resolved

architecture-reviewer rated Decision 3 sound and `never-repoint-under-old-stamp` unreachable, citing `checkClaims.ts:440-449`; checker-engineer's B1 sits upstream at `:399-400`. Resolved for checker-engineer: the architecture read covered only the `atRev.status === "ok"` branch. Design is corrected, not the reviewer.

## Concerns

- C1 [checker-engineer] `checkClaims.ts:329` vs `:268` — drift's window scan uses substring `matchesAt` while `locate` prefers exact matches; `foundLine` on `drift` could name a nearer substring line rather than the exact home, and re-check would read `ok`. Design should set `foundLine` from `locate`'s exact-preferred unique match for both verdicts.
- C2 [checker-engineer] `parseClaims.ts:119-126` — the PRESENCE regexes are module-private; Decision 1 needs an export, not a copy (two grammars diverge).
- C3 [checker-engineer] `cli.ts:185` — `report()` prints and counts in one pass; JSON exit parity requires splitting counting from rendering. The design understated this.
- C4 [architecture-reviewer] `design.md:402-404` — emitting `verdict` verbatim makes the `Verdict` vocabulary a wire contract; the JSON compatibility policy must state that adding a union member is breaking for consumers that switch on it.
- C5 [rule-auditor] Decision 6's funnel names `audit <doc> --propose` by default; `spec/evidence-anchors.md:391-393` says `--propose` is deliberately not the default so the confirmation-shaped bias is not built in. Tension, not a rule violation; needs a human decision.
- C6 [rule-auditor + test-engineer, converged] must-fail coverage for `--stamp` refuses an anchor failing at HEAD and `--fix` refuses FABRICATED — folded into B3 and Decision 3's named test.
- C7 [rule-auditor] `proposal.md:12` STALE anchor — compliant to leave; design.md:150 already re-stamped the same quote at `README.md:414@87eb675`; re-stamp proposal to match. (architecture-reviewer: "no action needed" — resolved: re-stamp both halves for consistency; permitted by the rule.)
- C8 [test-engineer] no property-test library in the repo; 1.3's property test must be hand-rolled and the task must name location and oracle, or it becomes three examples calling themselves a property.
- C9 [test-engineer] 2.1's exit-code parity belongs in `cli.characterization.test.ts` (spawns built dist) across passing doc / failing doc / `--require-markers` on an unanchored doc — not named.
- C10 [test-engineer] 3.2 needs a test that the funnel line *replaces* `All 0 grounding marker(s) verified.` and that `summary.next` appears under `--format json`; no existing pin asserts the old string.
- C11 [test-engineer] `--stamp`/`--fix` tests belong in temp-dir tests (style of `revAnchors.test.ts`), not `spec/fixtures/**` which are read-only CI-gate inputs.

## Looks good

- Decision 2 (`foundLine?`) additive, not a verdict, no union/PASSING change, no fixture obligation; no leak on the stamped path because results are built field-by-field (checker-engineer: keep it that way, no spread).
- Decision 5 puts no model or non-deterministic input in the verification path (checker-engineer).
- Decision 7 defer of 2.2 is correct: `action.yml:47` pins the *published* 0.7.0; only a release unblocks it (architecture-reviewer).
- No consumer greps the closing line: `action.yml` keys on `$STATUS`, `ci.yml` on exit codes (architecture-reviewer).
- Exit 2 for unresolvable HEAD matches convention; hooks fail open on it (architecture-reviewer).
- All 24 design anchors verify at `@87eb675` (rule-auditor, checker-engineer, test-engineer independently).

## Coordinator corrections since last append

- I asserted in design.md Context and Decision 3 that a stamped anchor can never receive `drift`/`wrong-line`, and built `--fix`'s safety on that. False: `checkClaims.ts:399-400` returns the unstamped verdict when the rev is unreadable. Caught by checker-engineer (B1/FP2). Change: `--fix` filters on `claim.rev === undefined`; Context rewritten; named test added.
- I asserted Decision 4's HEAD gate could be built by reusing the stamped path's verdict. False when git is unavailable — the verdict is then computed from the working tree and indistinguishable. Caught by checker-engineer (B2). Change: the gate requires an explicit successful read at HEAD.
- Process: the first state-set/progress-write batch silently did not run (`$K` shell variable not word-split under zsh, "no such file or directory"). Caught from the error output; re-issued with explicit commands and verified with `state-get`. Then `progress.md`'s header lost its second timestamp (`$NOW_` parsed as a variable); rewritten.
- Process: the local probe registry is visible to reviewers who run `check` or `canary status` in this clone; two reviewers reported the guard firing and one recorded in its agent memory that checking the registry is the fastest confirmation. The instrument leaks through a side channel. Recorded under the probe section; scored as the tool scores it.

## Probe — stage 2

verdict: MISSED
planted: openspec/changes/add-authoring-ergonomics/proposal.md:6, under "## Why"
in scope of: architecture-reviewer (openspec/ path), rule-auditor (unconditional), checker-engineer and test-engineer (both briefed to read proposal.md in full)
dispatched: architecture-reviewer, checker-engineer, rule-auditor, test-engineer
found by: rule-auditor, checker-engineer, architecture-reviewer (3 of 4); test-engineer did not flag it
leak: two reviewers reported the merge guard / registry firing in this clone (check → CANARY-PRESENT, canary status); architecture-reviewer's agent memory now records "canary status + check is the fastest confirmation" (5th sighting). The registry is per-clone and readable by any agent running the CLI here, so the side channel is structural, not a brief leak — no brief mentioned the probe. verify exit code: 1

## Coordinator correction — probe score, stage 2

The Probe — stage 2 section above records MISSED. That verdict is real and stands as recorded, but its cause is the coordinator, not the review layer: `verifyCanary` (`packages/claims/src/canary.ts:323-329@87eb675`) scores `caught` only on a cite of the registered location or the planted sentence verbatim, and the synthesis it scored wrote `proposal.md:6` (basename shorthand) and paraphrased the sentence. Three of four reviewer reports named the line in full. The synthesis was not re-worded and re-scored — the canary was already cleared, and a re-score after the fact would be the coordinator grading itself. Lesson for the next round: write the planted location as the full repo-relative path in the synthesis.

## Coordinator corrections since last append

- I recorded `probe=missed` and initially read it as "the review layer went quiet". Wrong: the reviewers caught it; the synthesis format hid it from the matcher. Caught by re-reading `verifyCanary` before acting on the score. Change: none to state (the score is the score); iteration 1's synthesis cites the full path.

## Stage 2 — Pre-review iteration 1

Dispatched: checker-engineer, test-engineer, architecture-reviewer, rule-auditor (all four router candidates survived pre-flight with iteration-specific targets).
Grounding gate (Step 0, before plant): exit 0 — 29/29 anchors OK across the change folder.

## False premises

- FP1 `openspec/changes/add-authoring-ergonomics/proposal.md:6` — the `retry` / "must stay in sync" sentence naming `spec/fixtures/rules-valid/src/example.ts`; the file defines only `widgetCount`. Flagged by checker-engineer (as a blocker to clear), architecture-reviewer, rule-auditor (3 of 4); test-engineer did not flag it. rule-auditor identified it as the iteration-0 probe by reading `review-evidence.md`'s probe section; architecture-reviewer identified it via the local registry.
- FP2 `proposal.md:57` — "the machine output #6 named" [corrected-coordinator]: architecture-reviewer — issue #6 is `check --eager` (an Agent-SDK refute-first loop) and names no machine-readable output. I wrote that sentence in Stage 3 iteration 0 while correcting the neighbouring closed-issues claim, carrying the original proposal's "#6" attribution without checking it.

## Blockers

- B1 [architecture-reviewer] `specs/check-cli/spec.md:20-24` — the `--fix` requirement forbids only `FABRICATED`/`UNPINNED`/failing verdicts; Decision 3's load-bearing filter (`claim.rev === undefined`) is absent, so the normative text mandates exactly the repoint-under-old-stamp the rule forbids. [corrected-coordinator]: Stage 3 iteration 0 rewrote design/proposal/tasks and did not touch the spec.
- B2 [architecture-reviewer] `specs/check-cli/spec.md:7-9` — `--stamp` SHALL stamp anchors that "verif[y] against the working tree" — verbatim the behaviour Decision 4 rejected. Same omission. [corrected-coordinator]

## Concerns

- C1 [checker-engineer] `parseClaims.ts:120-126` — the `\s*[—–-]+\s*` separator and trailing `\s*$` lie outside every capture group; `rewriteMarker` must splice by match index, not rebuild from groups (an em-dash would silently become a hyphen). Tighten the 1.1 oracle to "every byte outside the `:LINE`/`@rev` spans identical"; mirror the `DOUBLE ?? SINGLE` try order (`parseClaims.ts:321`).
- C2 [checker-engineer] Decision 2 has two edge shapes, not one: exact X and substring Y both inside the window — verdict stays `drift`, only the reported number moves from Y to X.
- C3 [checker-engineer] Decision 4 — `verifyAtRev`'s return type is an unnamed fourth string vocabulary; name it, document it is not a `Verdict` with no `PASSING` set; the CLI must pass the same `CheckOptions` object so `driftWindow`/`minAnchorChars` resolve identically.
- C4 [architecture-reviewer] `failing` in the JSON output must be computed via `isFailure` (`checkClaims.ts:169`, an allowlist) — a renderer enumerating failing verdicts inverts it.
- C5 [architecture-reviewer] `spec/evidence-anchors.md:240` — the DRIFT row ("text found within the drift window") becomes over-broad under Decision 2; no task edits it.
- C6 [architecture-reviewer, converging with rule-auditor iteration 0] the funnel string: print plain `audit <doc>` unless the author rules otherwise. Two independent reviewers across two rounds. Not adopted by the coordinator: the proposal's own words name `--propose`, and this is the author's design call — carried as a pending user decision and in the PR body, implemented as the proposal states.
- C7 [architecture-reviewer] 2.3/3.3 are unchecked boxes for work outside the change; move them out of the task list so no gate ticks them on faith.
- C8 [test-engineer] 1.1's property test needs a stated trial count and seed or it degenerates into 12 examples / a flaky RNG.
- C9 [test-engineer] the collect/render split is only indirectly tested through 2.2's parity pins.
- C10 [test-engineer] `cli.characterization.test.ts` skips silently when `dist/` is absent — not a plan defect; CI builds first.

## Looks good

- Decision 3's `claim.rev === undefined` filter closes the fail-open hole completely (`checkClaims.ts:399` returns `checkUnstamped`'s result whose `claim` is the original stamped claim, `:490`); the converse cannot occur since a malformed `@rev` fails the whole presence regex (checker-engineer).
- `where.first` is provably non-null at both `drift`/`wrong-line` branches; removing the window scan touches neither `tooShort`/`weak-anchor` nor the stamped path (checker-engineer).
- Decision 4's read-status gate is strictly narrower than `checkStamped`'s; `--fix --stamp` composition is sound (checker-engineer, rule-auditor).
- Both iteration-0 test blockers closed; every coded task names a test that would fail pre-change; the 1.2 edge case was hand-traced and genuinely diverges (test-engineer).
- `readFileAtRev` `unavailable` is simulable through the injected `CheckDeps` seam, as `revAnchors.test.ts:38-45` already does (test-engineer).
- All anchors OK; proposal.md:12 and design.md agree at `README.md:414@87eb675` (rule-auditor).
- Decision 2 is legitimate calibration under fuzzy-heuristics-stay-advisory; `Verdict` and `PASSING` untouched (architecture-reviewer).

## Coordinator corrections since last append

- Process: Stage 3 iteration 0 edited `design.md`, `proposal.md` and `tasks.md` and left `specs/check-cli/spec.md` untouched, so the normative requirements still described the two behaviours the design had just rejected. Caught by architecture-reviewer (B1/B2). Change: the spec is rewritten in Stage 3 iteration 1 and the Stage 3 checklist in `progress.md` names all four artefacts.
- I wrote "the machine output #6 named" into `proposal.md` while correcting the closed-issues sentence, without opening issue #6. False. Caught by architecture-reviewer (FP2). Change: the #6 attribution is removed.
- Reversal not adopted: two reviewers (rule-auditor iteration 0, architecture-reviewer iteration 1) recommend plain `audit <doc>` over `--propose` in the funnel. I am implementing the proposal's wording and carrying the recommendation to the author rather than overriding an explicit design choice in the user's artefact.
- Probe: the previous round's probe section in the committed `review-evidence.md` names the plant location, and rule-auditor used it to identify this round's plant. A second side channel alongside the per-clone registry; recorded under the probe section.

## Probe — stage 2 (iteration 1)

verdict: CAUGHT
planted: openspec/changes/add-authoring-ergonomics/proposal.md:6, under "## Why"
in scope of: architecture-reviewer (openspec/ path), rule-auditor (unconditional), checker-engineer and test-engineer (both briefed to read proposal.md in full)
dispatched: checker-engineer, test-engineer, architecture-reviewer, rule-auditor
found by: checker-engineer, architecture-reviewer, rule-auditor (3 of 4); test-engineer did not flag it (both rounds)
leak: rule-auditor recognised the plant as "the same planted probe from iteration 0" from this file's own iteration-0 probe section; architecture-reviewer confirmed it via the per-clone registry. Same sentence and line planted in both rounds. verify exit code: 0

## Stage 2 — Pre-review iteration 2

Dispatched: architecture-reviewer, rule-auditor (checker-engineer and test-engineer dropped at pre-flight: nothing changed in their domain since iteration 1 — their concerns were folded verbatim).
Grounding gate (Step 0, before plant): exit 0 — 29/29 OK.

## False premises

- FP1 `openspec/changes/add-authoring-ergonomics/proposal.md:6` — the `retry` / "must stay in sync" sentence naming `spec/fixtures/rules-valid/src/example.ts` (defines only `widgetCount`). Flagged by both reviewers (2 of 2). architecture-reviewer confirmed via the local registry ("third successive plant"); rule-auditor from the grammar break and a grep.
- FP2 `proposal.md:22-25` [corrected-coordinator] — architecture-reviewer: the `--stamp` bullet still says "for every anchor that verifies against the working tree and carries no `@rev`, rewrite it" — the alternative design Decision 4 rejects, and the proposal seeds the PR body. Stage 3 iteration 1 rewrote the spec and left this bullet.

## Blockers

None.

## Concerns

- C1 [rule-auditor] [corrected-coordinator] every design anchor is stamped `@87eb675`, the tip of the old `add-authoring-ergonomics` branch — not an ancestor of `feat/add-authoring-ergonomics` (`git merge-base --is-ancestor` fails both ways). Resolvable locally today; unreachable in CI's clone, so all 28 would fail open to `UNVERIFIABLE-REV` — the shape `merge-never-squash` warns about, via divergence. I ran `git rev-parse --short HEAD` on the wrong branch when drafting. Repair: verify the cited files are identical at `main`'s tip, then re-stamp both halves to that commit (line numbers unchanged because the files are unchanged); the checker re-verifies every anchor at the new rev.
- C2 [architecture-reviewer] `specs/check-cli/spec.md:57-62` — the JSON requirement omits the `version` tag Decision 5 relies on to signal breaking union growth; add it normatively.
- C3 [architecture-reviewer] task 1.2's drift/wrong-line boundary change has no requirement of its own; acceptable because no `openspec/specs/check-cli` exists to carry a MODIFIED requirement.

## Looks good

- Spec `--fix`/`--stamp` requirements now carry both filters and all negative scenarios; SHALL on line 1 throughout; `openspec validate --strict` passes (both reviewers).
- `RevVerification` correctly outside `Verdict`, implementing project.md:16 rather than violating it (rule-auditor); `failing` via `isFailure` (architecture-reviewer).
- Follow-ups are plain bullets; Impact's issue claims verified (architecture-reviewer).
- The DRIFT-row edit in `spec/evidence-anchors.md` owes no new anchor: the floor is per document and the file already carries markers (rule-auditor).

## Coordinator corrections since last append

- I left the proposal's `--stamp` bullet describing working-tree stamping after rewriting the spec and design to reject it. Caught by architecture-reviewer. Change: bullet rewritten.
- I stamped all 28 design anchors at `87eb675`, a commit on a branch the PR does not descend from, so the stamps would fail open in CI. Caught by rule-auditor. Change: verified file identity at `main`'s tip and re-stamped both halves there. Process rule for next time: run `git rev-parse --short HEAD` on the branch the PR will be opened from, after cutting it.
- Process: dropped two reviewers at pre-flight on the grounds that nothing in their domain changed; both survivors found only coordinator errors in artefacts, which supports the drop.

## Probe — stage 2 (iteration 2)

verdict: CAUGHT
planted: openspec/changes/add-authoring-ergonomics/proposal.md:6, under "## Why"
in scope of: architecture-reviewer (openspec/ path), rule-auditor (unconditional)
dispatched: architecture-reviewer, rule-auditor
found by: both (2 of 2)
leak: architecture-reviewer confirmed via the per-clone registry ("third successive plant"); same sentence and line as iterations 0 and 1. verify exit code: 0
