# Idea backlog — epistemic accounting for agent systems

_Private working notes (gitignored). Source thinking: the essay draft
"Nobody Opposed the Delay" (`third-mainverb/essays-drafts/nobody-opposed-the-delay.md`),
which nullius was extracted from. Two tracks below: the article-derived
proposal set (headed to / tracked as GitHub issues), and the creative
extensions beyond the article._

---

# Track 1 — article-derived proposals

## Gap map: essay themes vs. repo coverage (as of 0.4.0)

| Essay theme | In nullius? |
| --- | --- |
| False premises (citations forced at authoring) | ✅ shipped (Evidence Anchors) |
| False mechanisms (binding moments) | ✅ shipped |
| Coverage (anchor density, `[false-premise]` reviewer) | ✅ shipped |
| Bad witness / retros from evidence, not self-report | 🟡 `witness` designed, unreleased |
| Silence made loud ("dispatches: 5, delivered: 0"; "None. is valid; nothing is not") | ❌ |
| Is the objection machinery alive? (no-op vs. real-audit probe) | ❌ |
| Starved devil's advocate (the critic must know *less*) | ❌ |
| Rules audited at plan time, not edit time | ❌ |
| Refuted premises reproducing later in the same run | ❌ |

## P1 — Attestation Ledger: make absence a checkable fact

A third spec alongside anchors and binding moments: a run/review ledger where
expected reviewers are *declared*, and every declared dispatch must end in
either delivered findings or an explicit `None.` — a missing entry is a
failing verdict (`SILENT-REVIEWER`, `MISSING-ATTESTATION`). An explicit
"None." can be disbelieved and checked; an omission is nothing at all.
Plug-and-play half: Claude Code hooks on subagent dispatch/stop write the
ledger automatically, so any dev running subagents gets
"dispatched 5, delivered 0" visibility out of the box.

## P2 — Canary: mutation testing for review machinery

`nullius canary plant` inserts a registered, plausibly-wrong claim into a doc
under review; `canary verify` deterministically checks whether the review
output flagged that doc:line. A pipeline that passes the canary is
demonstrably alive; one that misses it has been *measured* dead instead of
assumed alive. Key design point: the canary must be a **bare-prose** false
claim or a wrong-but-valid binding moment — something only the reviewer layer
(not the deterministic checker) could catch, since it's the reviewer layer
being tested. Registry lives outside the doc (no in-doc marker — a visible
marker tips off the LLM reviewer and invalidates the test); `canary clear`
removes the plant; `check` fails on any unresolved registered canary so it
can never merge.

## P3 — Tombstones: refuted premises must not reproduce

Refuted claims (eager mode already emits `REFUTED` with counter-evidence) get
recorded in a tombstone file; `check` scans documents for normalized
restatements and reports `REVENANT`. Closes the "correction captured in a
proposal did not propagate into code written later in the same run" failure
class.

## P4 — Starved advocate + plan-time rule audit (plugin expansion)

`/advocate` dispatches a *fresh* subagent — Claude Code subagents don't
inherit session context, which is precisely the clean room the essay demands
— with a minimal refute-first brief (the idea, not the survey; the problem,
not the solution). The more prior context the session carries, the more
mandatory the fresh critic. `/rule-audit` reads the repo's rule files against
a plan before approval, pairing with the existing `ExitPlanMode` hook. Ships
as conventions + agent definitions like `reviewers/`, not checker territory.

## P5 — Integrations

- **OpenSpec** (Fission-AI, ~65k stars, MIT): `nullius init --preset openspec`
  targeting `openspec/changes/**/*.md`, a pre-archive check, eventually a
  community schema whose templates require anchors in proposal/design docs.
  Their artifacts are plain markdown at predictable paths
  (`proposal.md`, delta specs with ADDED/MODIFIED Requirements +
  WHEN/THEN scenarios, `design.md`, `tasks.md`); their `/opsx:verify` is
  LLM-driven and non-blocking — nullius is the deterministic complement.
- **Entire** (entire.io Checkpoints CLI, Go, MIT, git-native): every
  checkpoint links to a commit SHA (`Entire-Checkpoint:` trailer) and stores
  session transcripts/metadata in git refs
  (`refs/entire/checkpoints/...` with `metadata.json`, `full.jsonl`,
  `prompt.txt`). Solves two open nullius problems: `check --rev` (verify
  anchors against the checkpoint's exact tree, killing drift) and
  `witness harvest` (checkpoint metadata is the mechanical evidence witness
  wants to read instead of foraging). Their plugin model is any
  `entire-<name>` executable on `$PATH` → `entire-nullius` is a natural
  artifact. Also a data source for the P1 ledger.

## Recommended sequence

1. **P1 + P2 as one "silence" release** — the essay's central untapped
   claim, fully deterministic, genuinely novel. (Being drafted as an
   OpenSpec change proposal: `openspec/changes/`.)
2. **OpenSpec preset** in parallel — mostly config and docs, large adoption
   leverage.
3. **P4** next plugin release; **P3** folds into the checker anytime;
   **Entire integration** slots into `witness` when it ships.

---

# Track 2 — extensions beyond the article

## The frame

What nullius already is, underneath the citations: **epistemic accounting**.
Claims, questions, findings, corrections, and verifications are objects with
lifecycles, and the recurring failure mode is one of them silently
disappearing or silently changing state. Double-entry bookkeeping for agent
systems: **nothing epistemic may vanish without a transaction.** Every idea
below is an instance of that rule.

## 1. Conservation laws — nothing disappears silently

### Open-question conservation
Across a handoff chain (proposal → design → tasks → PR), every open question
must be *resolved with a reason* or *carried forward*. A question present in
artifact N−1 and absent in artifact N with no resolution entry →
`DROPPED-QUESTION` verdict. Deterministic: diff question IDs across
artifacts. Generalizes the "correction didn't propagate into later work"
incident into a law: corrections, questions, and caveats are conserved
quantities.

- Needs: stable question IDs (slug or hash of the question text), a manifest
  of which artifacts form a chain.
- Natural fit with OpenSpec: proposal.md → design.md → tasks.md is already a
  declared artifact chain with predictable paths.

### Dissent conservation — **the checker half shipped in schema v0.3**
Multi-reviewer synthesis is where findings die: the orchestrator merges N
reports and inconvenient findings just don't appear. Consensus manufactured by
omission becomes mechanically visible.

`SUPPRESSED-FINDING` now exists: a `finding` of severity `blocker` that no
`resolution` record answers, in a journal declaring schema `0.3`. See
[spec/witness-journal.md](spec/witness-journal.md).

Two things this entry guessed wrong, corrected by deriving the vocabulary from
a 91-file corpus of hand-written evidence files rather than reasoning about it
(`openspec/changes/add-run-ledger/corpus-derivation.md`):

- **The outcome vocabulary is not accepted / rejected-with-reason / escalated.**
  Those were three guesses; `escalated` turned out to be among the *rarest*
  terms the corpus actually uses (12 occurrences). The shipped enum is
  `resolved`, `fixed`, `dropped`, `duplicate`, `deferred`, `folded-in`,
  `accepted`, `rejected`, `out-of-scope`, `deviation-accepted` — and
  `duplicate`/`folded-in` must name the finding they merge into, or a merge is
  indistinguishable from a disappearance.
- **It cannot apply to every finding.** In the corpus, 59 of 97 identified
  findings (60.8%) are never mentioned again — so an ungated verdict fires on
  three findings in five and gets learned as noise. It is gated to `blocker`.

Still open: the producer that emits these records, below.

## 2. Provenance and tense — claims know where they came from and when they were true

### Confidence laundering
In agent chains, "probably X" (agent A) becomes "X" (agent B quoting A)
becomes load-bearing fact (agent C). Give claims a closed provenance
vocabulary — `measured | cited | inferred | assumed | inherited:<artifact>` —
with one rule: **downgrades are free, upgrades require new evidence.** An
inherited claim whose upstream source was `assumed` but which now reads as
fact → `LAUNDERED-CONFIDENCE`. Type-checking for certainty. Closed-vocabulary
design mirrors binding moments exactly.

### Verification tense
"Verified once" quietly becomes "verified." Make tense explicit: verification
claims pin a rev (`tests pass @ abc123`); the checker compares against what
changed since and reports `STALE-VERIFICATION` when files under test moved
after the claim. Fully deterministic via git. A green check gets an expiry
condition, not a timestamp. Entire's commit-linked checkpoints hand over the
rev for free; overlaps with the existing `check --rev` issue.

## 3. Custody and recovery — failure states must be explicit, not inferred

### Exit attestations
Dead, silent, and withheld agents look alike from the orchestrator's seat.
Protocol fix: an agent's final obligated act is writing a terminal state —
`done | blocked:<why> | partial:<what remains>`. Completion can then never be
inferred from file state: **no exit attestation means incomplete,
mechanically.** Silence stops being ambiguous because the convention makes it
impossible to end successfully without saying so. Pairs with the attestation
ledger (the ledger counts dispatches vs. deliveries; exit attestations type
the deliveries).

### Reversal manifests
For the destructive-probe failure class: any action mutating shared state
pre-declares what it will touch and how it restores it; the checker verifies
restoration by before/after hash. `UNREVERTED-PROBE` verdict. "Leave no
trace" as a contract, not an ethic. Entire's shadow-branch snapshots could
supply the before-state.

## 4. Machinery health — monitor the objection system itself

### Wiring check (`nullius wiring`)
Every path referenced in agent definitions, skills, hooks, and rule files
must exist; every glob must match at least one file. Trivially deterministic.
Directly targets the dead-auditor failure class (instructions chasing files
that a refactor renamed) — the cheapest, highest-value item in this file.
A liveness pre-flight for the objection machinery's reading lists.

### The Geiger-counter alarm
A run producing *zero* objections across all gates is not evidence of clean
work — it is evidence the detector may be broken. Track objections-per-gate
as a base rate; a whole-run zero yields advisory `SUSPICIOUS-SILENCE`.
Detectors that never click get inspected, not trusted. Statistical/advisory,
not a hard verdict.

### Clean-room certification
The starved advocate depends on the critic *not* inheriting the
coordinator's enthusiasm — but nothing verifies the starvation. Dispatch
briefs declare what was withheld; the checker verifies the advocate's brief
textually contains none of the withheld sections. Information asymmetry
becomes an auditable artifact rather than a hope.

### Cold review
The objection a fresh session would have raised "had no second chance to
fire" — so schedule one. Decisions made deep in a crowded context get queued
for a later fresh-context re-read: the decision and the diff only, no
history. Sleep-on-it, institutionalized as a pipeline stage. Convention kit,
not checker territory.

### Failure drills
Beyond planting canary claims: chaos engineering for the pipeline —
deliberately kill a subagent, withhold a report, corrupt a delivery, and
verify recovery matches the declared protocol. Recovery paths are code that
never runs until the worst day; drills make them run on a cheap day.

## The run ledger's second half — deferred, and why

Schema v0.3 (`add-run-ledger`) shipped the **kinds and the verdicts** and
deliberately stopped there. Two named pieces were split out rather than
dropped:

- **The self-reported producer** — a skill instructing pipeline agents to emit
  `stage` / `finding` / `resolution` / `check` / `decision`, plus a
  `witness record` mode accepting a structured record rather than a hook
  payload. Hooks cannot do this: no tool call states that something was
  *checked*, *relied upon*, or *corrected*.
- **`witness harvest`** — renders `review-evidence.md` and
  `implementation-log.md` into the change folder deterministically, no model in
  the path. Success is when those files are generated output nobody hand-edits.

The split was decided *by* the corpus, not before it. The schema turned out to
be the tractable half: five kinds, three severities, one derived enum. The
projections are the hard half — 91 files produced roughly 40 heading variants
for the same handful of concepts, only 19% carry identified findings, and only
11% have a decision section. There is no house style to render back to, so
"reads no worse than a hand-written one" has no fixed target yet. Rendering is
far easier to design against real v0.3 records than against 91 files that
disagree with each other.

**The standing risk of stopping here:** v0.2 added `verification` and
`reliance` and they still have no producer. A schema nobody emits is a schema
nobody has stress-tested, and v0.3 is now the second unproduced tier. The
producer is what turns that from a pattern into a plan.

Also deferred with it: whether `check` subsumes `verification` and `finding`
subsumes `reliance`. Neither pair can be compared until one of them has a
producer.

## Priority picks (after the silence release)

1. **The run-ledger producer** — v0.3's kinds exist and nothing emits them.
   Highest-value next step, and the only way the two tiers become the
   cross-check they were designed to be.
2. **Wiring check** — smallest effort, prevents the most embarrassing
   failure class, pure filesystem determinism.
3. **Open-question conservation** — extends the existing spec family most
   naturally: anchors keep claims *true*, conservation keeps them *alive*.

## Fit classification

| Deterministic checker DNA | Convention / agent-definition kits |
| --- | --- |
| Open-question conservation | Clean-room certification |
| Dissent conservation | Cold review |
| Confidence laundering | Failure drills |
| Verification tense | Geiger-counter alarm (advisory) |
| Exit attestations | |
| Reversal manifests | |
| Wiring check | |
