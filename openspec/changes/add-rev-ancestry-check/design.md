# Design — add-rev-ancestry-check

## Context

`checkStamped`'s fail-open branch already distinguishes "cannot resolve" from
"resolved but the content doesn't match," and only the first case is
fail-open:

**Evidence:** `packages/claims/src/checkClaims.ts:404@2792fa1` — `  if (atRev.status !== "ok") {`

When `atRev.status === "ok"`, execution falls through to the real content
check with no ancestry awareness at all:

**Evidence:** `packages/claims/src/checkClaims.ts:429@2792fa1` — `  const gate = evaluateAgainst(atRev.lines, claim, driftWindow, minAnchorChars);`

`headRev` is the existing precedent for a git query implemented as an
injected dependency rather than an inline shell call — no shell, an argv
array, a bounded timeout, `null` on any failure:

**Evidence:** `packages/claims/src/runners.ts:236@2792fa1` — `export function headRev(root?: string, timeoutMs = DEFAULT_GIT_TIMEOUT_MS): string | null {`

`CheckDeps.readFileAtRev` is the existing precedent for making a git-backed
capability optional on the dependency interface, with a documented fail-open
default:

**Evidence:** `packages/claims/src/checkClaims.ts:120@2792fa1` — `  readFileAtRev?: (path: string, rev: string) => RevRead;`

## Decisions

### 1. The new verdict is advisory, never a failure

**Chosen:** When `rev` resolves (`atRev.status === "ok"`) and the content
check at that commit passes, additionally check
`git merge-base --is-ancestor <rev> HEAD`. If that check runs and reports
"not an ancestor," relabel the verdict from `ok` (or whichever passing
content-verdict it was) to a new member, `unreachable-rev`, added to
`PASSING`. If the ancestry check cannot run at all (git missing, timeout, no
`HEAD`), leave the original verdict untouched — this axis fails open exactly
like the resolvability axis already does.

**Alternatives considered:**
- **A hard-failing verdict** — rejected. This is the devil's-advocate
  objection this proposal has to answer directly, not argue around:
  `.claude/rules/merge-never-squash.md` exists specifically because "a
  missing commit is not evidence about the author... the clone may be
  shallow, the PR may have come from a fork, the history may have been
  rewritten by someone else entirely." A rebase is the sharpest concrete
  case: the original stamped commit can remain resolvable (via reflog, or a
  stale local ref) while being content-identical to a new commit that IS an
  ancestor — a hard-failing ancestry check would accuse an author of
  fabrication for a citation that is, in every sense that matters, still
  true. Advisory sidesteps this entirely: the information reaches a human
  (or a future, separately-justified stricter mode), and nobody is accused
  of anything on the strength of a signal this noisy.
- **Only warn, never touch `Verdict` at all** (e.g. a stderr-only note) —
  rejected. This repository's whole convention is that a checker's findings
  live in the verdict, not in a side-channel a caller can ignore by not
  reading stderr; `check --format json` consumers in particular would never
  see a stderr-only warning. See `spec/evidence-anchors.md`'s verdict table
  for the existing convention this proposal extends rather than works around.

**Rationale:** The failure mode `unreachable-rev` exists to name is
"technically still true today, unverifiable that it will stay true" — the
same epistemic status `stale`, `weak-anchor`, and `unverifiable-rev` already
have, all three advisory. This is not a new category of concern; it is the
same category applied to a case none of the three existing members cover.

### 2. Grow the exported `Verdict` union; do not create a separate one

**Chosen:** `unreachable-rev` becomes a new member of the kernel's exported
`Verdict` union, in `PASSING` alongside `unverifiable-rev`.

**Why this is not the `WiringVerdict`/`RuleVerdict`/canary's `VerifyOutcome`
precedent:** Those are separate unions because they report on an entirely
different KIND of artifact through an entirely different command and report
shape — `wiring` never returns a `ClaimResult`, `rules check` never returns a
`ClaimResult`. This proposal's new verdict is produced by `checkStamped`,
which is one branch inside `checkClaims`'s own per-claim evaluation and MUST
return a `ClaimResult` whose `verdict` field is typed `Verdict` directly:

**Evidence:** `packages/claims/src/checkClaims.ts:79@2792fa1` — `  verdict: Verdict;`

There is no separate report format for this to live in — `unreachable-rev`
answers the exact same question every other stamped-anchor verdict already
answers ("how trustworthy is this specific citation"), just on a third axis
(ancestry) alongside the two `checkStamped` already has (resolvability,
content match). `unverifiable-rev` itself was added to this same union for
the same structural reason when the stamped path was introduced — this
proposal follows that precedent, not the wiring/rules one.

**Consequence, stated so it is not missed in implementation:** growing
`Verdict` is a breaking change to `check --format json`'s wire contract by
that schema's own documented policy, independent of this design's
correctness:

**Evidence:** `packages/claims/src/checkReport.ts:236@2792fa1` — `` * - Adding a member to the `Verdict` union is ALSO breaking — for any consumer``

`REPORT_VERSION` (currently `1`) must bump to `2` alongside this change (see
`tasks.md`).

**Alternatives considered:**
- **A separate union**, e.g. `RevAncestryVerdict`, surfaced as an additional
  field on `ClaimResult` rather than replacing `verdict` — rejected. This
  would mean two verdicts per stamped claim, and every consumer of `check`'s
  human or JSON output would need to learn to read both to get a complete
  picture of one citation's status, when today one `verdict` field is a
  complete picture. It also does not remove the underlying breaking-change
  cost, since `ClaimResult` gaining a new field a JSON consumer must know to
  read has the same wire-contract consequence the JSON schema note already
  flags for field changes generally — it trades one documented breaking
  change for a less legible two-field result shape, for no offsetting
  benefit.

## Open questions

None — `checker-engineer` should treat Decision 2 as the load-bearing claim
to scrutinize hardest in review; the reasoning is laid out in full above
specifically so that review can be a check of the argument, not a rediscovery
of it.
