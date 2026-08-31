# Idea backlog — epistemic accounting for agent systems

_Working notes, committed. Source thinking: the essay
["Nobody Opposed the Delay"](https://armanfatemi.substack.com/p/nobody-opposed-the-delay),
which nullius was extracted from. Two tracks below: the article-derived
proposal set (headed to / tracked as GitHub issues), and the creative
extensions beyond the article._

---

# Track 1 — article-derived proposals

## Gap map: essay themes vs. repo coverage

_Claims 0.7.0, kit 0.2.0 — restated 2026-08. The previous version of this table
said `witness` was unreleased and silence-made-loud was missing; both had
shipped. A gap map is a table of load-bearing claims about existing code, which
is the one kind of table this repo does not let rot by hand — so the rows that
can change now carry anchors. The rule for which: **anchor a row whose status
is expected to move.** The three that have been ✅ since the first release are
left bare; every 🟡 and ❌ carries an absence anchor, so the row goes loud on
its own the moment somebody builds the thing._

| Essay theme | In nullius? |
| --- | --- |
| False premises (citations forced at authoring) | ✅ shipped (Evidence Anchors) |
| False mechanisms (binding moments) | ✅ shipped |
| Coverage (anchor density, `[false-premise]` reviewer) | ✅ shipped |
| Bad witness — a run's record judged, not its summary | ✅ shipped (`witness validate`) |
| Retros rendered from evidence rather than self-report | 🟡 `witness harvest` unbuilt |
| Silence made loud ("dispatches: 5, delivered: 0"; "None. is valid; nothing is not") | ✅ shipped |
| Is the objection machinery alive? (no-op vs. real-audit probe) | ❌ |
| Starved devil's advocate (the critic must know *less*) | 🟡 shipped for claims; no `/advocate` for ideas |
| Rules audited at plan time, not edit time | ❌ proposed as `add-rules-compliance` |
| Refuted premises reproducing later in the same run | ❌ |

### The rows that can move, anchored

`witness validate` ships as a kernel command:

**Evidence:** `packages/claims/src/cli.ts:236@80e16ae` — `    console.error("usage: nullius witness validate <journal.jsonl>");`

Its three terminal outcomes are printed as three numbers, which is
silence-made-loud in the only form that survives being skimmed:

**Evidence:** `packages/claims/src/cli.ts:279@80e16ae`

```
    `Outcomes: ${report.outcomes.found} found, ${report.outcomes.empty} explicitly empty, ${report.outcomes.noReport} never reported.`,
```

The starved brief ships, one claim per dispatch, refute-first — that is the
devil's advocate for a *claim*:

**Evidence:** `packages/claims/src/audit.ts:127@80e16ae` — `export function buildAuditBrief(`

What has not shipped, stated so the checker says when that stops being true:

**Evidence:** `grep -rn 'harvest' packages/claims/src/ packages/kit/src/` → 0 results

**Evidence:** `grep -rn 'canary' packages/claims/src/ packages/kit/src/` → 0 results

**Evidence:** `grep -rn 'advocate' plugin/commands/ plugin/skills/` → 0 results

**Evidence:** `grep -rni 'rules select' packages/claims/src/` → 0 results

**Evidence:** `grep -rn 'REVENANT' packages/claims/src/` → 0 results

Each of those is a `COUNT-MISMATCH` the day someone lands the feature, which is
the correction this table failed to make on its own last time.

## P1 — Attestation Ledger: make absence a checkable fact

A third spec alongside anchors and binding moments: a run/review ledger where
expected reviewers are *declared*, and every declared dispatch must end in
either delivered findings or an explicit `None.` — a missing entry is a
failing verdict (`SILENT-REVIEWER`, `MISSING-ATTESTATION`). An explicit
"None." can be disbelieved and checked; an omission is nothing at all.
Plug-and-play half: Claude Code hooks on subagent dispatch/stop write the
ledger automatically, so any dev running subagents gets
"dispatched 5, delivered 0" visibility out of the box.

**Mostly shipped.** The hooks half landed as `add-witness-recording`, and
`SILENT-REVIEWER` landed with schema v0.3. What did not land is
`MISSING-ATTESTATION`, and the reason is that it needs something this entry did
not have: a *declared* list of expected dispatches to count against. `witness`
can only see dispatches that were recorded, so it catches one that never
returned and is blind to one that was never made. Track 3's P7 finally proposes
a source for that denominator.

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

1. ~~**P1 + P2 as one "silence" release**~~ — split in the end. P1's
   attested half shipped (`add-witness-recording`, archived); P2 has not been
   started, and is the ❌ row in the gap map most worth closing next.
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


---

# Track 3 — derived from the Bun-in-Rust rewrite (2026-08)

Source: Jarred Sumner, "Rewriting Bun in Rust" (2026-07-08) — 64 concurrent
agents across 4 worktrees for 11 days, 1 implementer + 2 adversarial reviewers
+ 1 fixer per loop, 6,502 commits. Read as a field report of the run shape
nullius is built for, at a scale nothing here has been tested at.

The three things that workflow trusted, in the author's own ordering: a
language-independent test suite; adversarial split-context review; and **11
days of a human reading workflow output**. The third is the one that does not
scale and the one `witness` exists to replace.

Scoped as `add-journal-identity`: ref-backed journals, `witness survey`, header
identity fields. Everything below is not.

## P6 — Probe the dynamic-workflow harness — **SETTLED 2026-08-22, and badly**

Recorded, not reasoned:
[`spec/fixtures/probes/claude-code-workflow/`](spec/fixtures/probes/claude-code-workflow/README.md).

**Workflow-spawned agents emit `SubagentStop` and nothing else.** No
`PreToolUse:Agent`, so no `dispatch`, so the correlation chain has nothing to
join a terminal to. Replaying a real capture through the shipped recorder — one
control dispatch plus a two-agent workflow — produces a journal with **one**
dispatch, and `witness validate` says `Journal valid.`

Two agents ran, returned, and left no trace, and the validator certified the
result. That is this project's own founding failure, reproduced by its own
producer: a run that dispatched three agents summarising identically to one
that dispatched one.

**So `witness` does not cover the workflow shape today, and the README should
not be read as claiming it does.** Fixing that is now the highest-value item
here — it is the difference between the tool covering the orchestration
pattern the Bun rewrite actually used and covering only the one it does not.

## P7 — The declared denominator

A workflow script *is* the dispatch plan, in code, before the run:
`parallel(DIMENSIONS.map(...))` states exactly how many reviewers were
intended.

This is the thing witness has never had. Today the validator catches a dispatch
that was **recorded and never terminated**. It cannot catch a dispatch that was
**never made** — the second adversarial reviewer that silently was not spawned.
There is no denominator, so `MISSING-ATTESTATION` (P1) has never had a source.

A workflow script is a better source than `rules select`, because it covers
every dispatch in a run rather than only rule audits.

**Unblocked by P6, with two sources rather than one.** `PreToolUse` *does* fire
for the `Workflow` tool, and `tool_input.script` carries the whole script — so
the plan is visible even though the executions are not. And the harness writes
its own per-workflow journal: `started` / `result` per agent, keyed by the same
`agentId` that `SubagentStop` carries, which is a `dispatch`/`report` pair in
all but name and correlates by a key the harness supplied.

A workflow producer therefore does not have to guess at either half. The plan
comes from the script; the executions come from the journal or from the
`SubagentStop` stream keyed against it.

## P8 — Replay is a laundering hazard

`resumeFromRunId` returns cached agent results without re-running them. If the
recorder emits records for cached agents, the journal asserts work that did not
happen in this run — the producer committing the exact laundering the journal
exists to catch, which is verbatim the mistake the probe corpus caught in the
`PostToolUse` path.

**Settled with P6, and the record layer is innocent.** A resume with an
unchanged script returned in 7ms with zero subagent tokens, emitted no
`SubagentStop`, and appended nothing to the workflow journal. A cached agent
leaves no evidence of work it did not do, so no `cached` marker is needed.

The summary layer is the one that launders. That run's usage block reported
`agent_count: 1, agents_done: 1` for a run in which no agent ran — the
mechanical record honest, the human-readable account of it not. Which is the
distinction this whole repo turns on, arriving unprompted in the harness's own
output. No action beyond knowing it.

## P9 — Silent caps

The workflow tool's own documentation says: *"if a workflow bounds coverage
(top-N, no-retry, sampling), `log()` what was dropped — silent truncation reads
as 'covered everything' when it didn't."* That is this repo's doctrine, written
in another tool's manual, enforced by nothing. A record for "the plan had N,
K ran" is the mechanical form of that advisory.

## P10 — Port invariants as a documented convention *(docs only, ships now)*

The Bun merge rested on **"0 tests skipped or deleted"**, and the author
verified it by hand. The absence lane does it deterministically today — no code
needed, only a convention page and a fixture:

```markdown
**Evidence:** `grep -rn 'test.skip' test/` → 0 results
**Evidence:** `grep -rn 'todo!()' crates/` → 0 results
```

Generalises past ports: any migration has a small set of "this must stay zero"
facts, and they are exactly what an agent under pressure erodes first. Cheapest
item in this file after the wiring check.

## P11 — The oracle stays an oracle

The generalisation behind P10, and worth writing down as doctrine rather than a
feature. A test suite is a **verification** about behaviour and a **proposal**
about coverage. It stays a verification only while the agents being graded
cannot edit it. 100% green on six platforms shipped 19 regressions — every one
a hole in the oracle, and the green could not tell them from real green.

Nothing here should imply nullius substitutes for a test suite. What it can do
is prove the suite was not quietly narrowed by the thing it was grading.

## P12 — `audit --diff`

`audit`'s unit is a claim in a document; the Bun reviewers' unit was a diff,
and their brief was *only* the diff. There is no lane that extracts claims from
a commit range and starves a refuter on each. The `[false-premise]` reviewer
severity is a prompt block, not a mechanism.

Related and smaller: `check --commits <range>`. The Action already checks PR
bodies, so the model is proven — but in a run where the PR is +1M lines, the
commit is the reviewable unit and its message goes unchecked.

## P13 — Correspondence anchors and per-unit coverage

A port makes one claim 1,448 times: *this Rust span corresponds to that Zig
span at rev X*. Expressible today as two anchors under one statement — `audit`
already groups them — but nothing checks they are a **pair**, and
`--require-markers` sets a floor of one anchor per *document*. "Which of 1,448
ported files carry a correspondence anchor?" is unanswerable.

## P14 — Oracle conservation *(now an OpenSpec change)*

Scoped as
[`openspec/changes/add-oracle-conservation/`](openspec/changes/add-oracle-conservation/proposal.md).

The work is graded by an artifact the work can edit. When a change makes a test
fail there are two routes back to green — fix the code, or fix the test — and
they produce identical output. Sometimes editing the test is right, which is
why the blunt form (P10's "count must stay zero") is a port-time invariant
rather than a development rule.

The tractable question is not whether the oracle changed but whether the change
was **accounted for**. Three findings shaped the proposal:

- **The journal cannot source it.** The mutation record comes from tool hooks,
  and nothing in the pack watches `Bash` — so `rm`, `git rm`, and any
  script-driven deletion leave no trace, and deletion is the highest-risk edit.
  For this one question the hooks tier, normally the *stronger* attestation, is
  the weaker one. Git is the witness.
- **The justification belongs on `decision`**, joined by a derived
  `(path, change)` pair rather than a record id — precisely because the changes
  worth catching emit no record to point at.
- **A rationale is a claim**, so the convention is that it carries an Evidence
  Anchor into the implementation that made the edit necessary. Then a later
  revert turns the anchor `STALE` and resurfaces a test edit that has quietly
  lost its reason.

## P15 — The local report

A read-only view over accumulated runs. Worth building, and **not yet** — for a
statable reason rather than a feeling: *the value of the view is a function of
how many record kinds have producers.* Today `verification` and `reliance` have
none, the five v0.3 ledger kinds have none, and workflow dispatches do not reach
the recorder at all. A view over what exists would be a bar chart of dispatch
counts.

**Gate:** build it when two or more producers are emitting, and after
`add-journal-identity` lands — "navigate past runs" is a query over the ref that
change creates.

**The trap, named first.** A dashboard *is* a summary, and this project's thesis
is that a summary and a record are different objects. A wall of green that
people trust instead of the verdicts would be the tool manufacturing the
confidence it exists to destroy. A panel with no data looks exactly like a panel
with nothing wrong — `SILENT-EMPTY`, rendered in CSS.

Three constraints, above any feature:

- **Absence renders louder than presence.** "No journal for this run" as text,
  never an empty chart.
- **Every number links to the raw record.** If you cannot click through to the
  JSONL line, it does not belong on screen.
- **The view computes nothing the CLI cannot.** A number no command reproduces
  is a bug, not a feature.

**Read-only, and say so.** Not a control plane: the moment it can re-run,
approve, or dispatch it becomes a much larger trust surface and starts making
decisions that currently leave a record in a PR.

**A static file before a server.** `nullius report --out report.html`, one
self-contained page: no port, no process, works over SSH and in remote
containers, and the output is an artifact — committable, attachable to a PR,
diffable. It also forces the discipline of a view over a fixed record. A server
earns its place only when live-during-run matters, and renders the same view.

**Kit, not kernel** — the boundary already decides it. The kernel is no network,
no model, minimal dependencies; an HTTP server is network I/O.

**The panel that justifies the surface** is the Geiger counter: objections per
gate as a base rate, with a whole-run zero flagged. Not "here is what we found"
but "here is whether the detectors are still clicking." Rates are the thing a
CLI answers badly and `project.md` already says the projections are for.

## Ranked, with what blocks what

| # | Item | Effort | Blocked on |
| --- | --- | --- | --- |
| — | ~~P6 workflow probe~~ | done | settled 2026-08-22 |
| — | ~~P8 replay marker~~ | dropped | not a hazard; see P8 |
| 1 | **A workflow producer** (P7's other half) | medium | — |
| 2 | `add-journal-identity` | scoped | — |
| 3 | The v0.3 self-reported producer (Track 2) | large | — |
| 4 | P10 port invariants | docs only | — |
| 4= | P14 oracle conservation | scoped | — |
| 5 | Wiring check (Track 2) | small | — |
| 6 | `add-rules-compliance` | in flight | recording |
| 7 | P7 declared denominator (`MISSING-ATTESTATION`) | medium | a producer |
| 8 | P12 `audit --diff` | medium | — |
| 9 | P13 correspondence anchors | medium | — |
| 10 | P15 the local report | large | two producers + the ref |

Items 3 and 5 are already Track 2's own priority picks. This track does not
reorder them; it adds evidence that they are the right two.
