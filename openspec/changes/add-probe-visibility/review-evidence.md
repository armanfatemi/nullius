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
