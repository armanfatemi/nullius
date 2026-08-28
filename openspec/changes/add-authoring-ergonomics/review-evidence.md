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
