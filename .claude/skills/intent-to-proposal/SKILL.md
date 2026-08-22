---
name: intent-to-proposal
description: Transform a raw idea into one or more well-defined OpenSpec proposals through guided dialogue, codebase survey, feasibility review, and decomposition. Use when the user has an idea they want to develop into a proposal — or when given a problem to solve. Replaces /opsx:propose for this project. The output is a complete, implementation-ready change directory with enriched proposal.md, design.md skeleton, and tasks.md skeleton.
---

# Idea → OpenSpec Proposal

This skill turns a rough idea into a well-scoped, implementation-ready OpenSpec proposal (or set of proposals). It addresses the primary quality gap identified in the process audit: proposals generated without codebase survey produce under-specified artifacts that cost a full refinement iteration in Stage 2.

**Do NOT chain into `/opsx:propose`.** That skill calls the generic openspec CLI template generator. This skill writes richer artifacts directly, using the project's enriched template.

---

## Proposal metadata — every proposal carries an ID, a model, and its dependencies

This skill exists to prepare proposals that **autonomous agents pick up and execute** with minimal human steering. Three pieces of machine-actionable metadata make that safe. They live in the change's `.openspec.yaml` (the machine source of truth) and are mirrored human-readably in `proposal.md`:

- **`id` — a stable, unique proposal ID.** Format `prop-<6 hex>` (e.g. `prop-a3f2c1`), generated once at scaffold time and **never changed**. It is the anchor that dependency references point at, so it must survive a directory rename or a Jira-key change. The kebab change-name stays the operational handle you pass to `/proposal-to-pr`; the `id` is the immutable reference key that `depends_on` edges resolve against.
- **`model` — the single Claude model an agent should use to implement this proposal.** One of `fable`, `opus`, `sonnet` (rubric in Phase 4). **One model per proposal — NOT per-agent** (deliberately kept simple). Lean high: prefer `fable`/`opus`; reserve `sonnet` for genuinely mechanical, fully-specified, low-risk work.
- **`depends_on` — the list of prerequisite proposal `id`s that MUST be merged before this one starts.** These are the HARD, gating dependencies. `/proposal-to-pr` reads this list and **refuses to start implementation until every listed prerequisite is merged/archived**. Soft "assumes X exists but degrades gracefully" relationships stay in the Dependencies prose; only hard prerequisites go in `depends_on`.

Producing these three fields correctly is now a core output of the skill, not a side note.

---

## Entry conditions — adapt when you're not starting cold

The phases below assume a cold start from a raw idea. In practice the skill is often invoked mid-session, after work that already did some of Phase 1–2. Adapt rather than redo:

- **Continuation (already mid-investigation/debug).** If the current session already root-caused a bug or surveyed the touched code, that work _is_ your Phase 1 understanding and part of your Phase 2 survey — don't re-dispatch a redundant Explore over ground you've already covered. But still (a) run the Phase 2 active-changes cross-check (`openspec/changes/`) and the per-change-type red-flag check — both are easy to drop when reusing prior work — and (b) run the Phase 3 devil's advocate as a **fresh** agent. The prior investigation carries the most context bias, so the independent critic matters more, not less.
- **Idea sourced from a detailed Jira task.** Phase 1 may legitimately produce **zero** `AskUserQuestion` questions — if the task already answers them, confirm understanding in prose and proceed. Zero questions is correct here, not a skipped phase.
- **Second idea in the same session.** Each new idea gets its own full Phase 1–5. You MAY reuse a prior devil's advocate ONLY when the new idea is in the same architectural class as one already critiqued this session — and only if you say so and why. Otherwise dispatch a fresh one. Do not silently abbreviate the phases.

---

## Phase 1 — Guided dialogue

**Goal:** understand the problem being solved, not just the solution.

First, confirm what you already understand from the user's message. State it in 2-3 sentences. Then ask only the questions the message did NOT answer. Use `AskUserQuestion` with up to 4 questions — but skip any question whose answer is already clear.

Questions to draw from (ask at most 4, and only unresolved ones):

1. **The problem:** What symptom, failure, or limitation is this solving? Be specific — if users are affected, what do they experience? If it's internal, what breaks or slows down?
2. **Why now:** Is there urgency, a deadline, a dependency that's now unblocked, or a threshold of pain that's been crossed?
3. **Who is affected:** Is this user-facing, internal tooling, infrastructure, or a combination?
4. **Rough shape:** Do you have a preferred approach in mind, or is the shape open? (This is NOT asking for a design — just whether the user has a strong prior.)
5. **Known constraints:** Any changes in flight that this must coordinate with, or any that this might conflict with?

After collecting answers, synthesize understanding in one paragraph before proceeding to Phase 2. Do not generate any proposal content yet.

---

## Phase 2 — Codebase survey

**Goal:** understand what already exists before proposing anything. This is the step that prevents the "assumed only AdminLayout existed" class of failure.

Dispatch a **single Explore agent** with scope "thorough". Brief it with:

- The idea (2-3 sentence summary from Phase 1)
- The touched areas (derived from the user's answers — e.g., `src/domain/order/`, `src/read/`, `src/api/`)
- Specific questions to answer:
  1. What files/patterns already exist in the touched areas that this change will need to integrate with, modify, or replace? List them with brief descriptions.
  2. Are there active OpenSpec changes (in `openspec/changes/`, not `openspec/changes/archive/`) whose scope overlaps or conflicts with this idea? Name them.
  3. Are there any active changes that this idea depends on — i.e., infrastructure or data that must exist before this makes sense? For each hard prerequisite, capture its stable `id` from its `.openspec.yaml` (`grep '^id:' openspec/changes/<dep-name>/.openspec.yaml`) — that id is what goes into this proposal's `depends_on`. If a prerequisite change predates the id system and has none, note it so Phase 5 can backfill one.
  4. What architectural patterns are already in use for the closest analogous feature? (e.g., if the idea involves a new aggregate, find the most similar existing one)
  5. **Red-flag check — pick the row matching the change type.** Every change type has a characteristic show-stopper the survey must detect early:
     - **Backend / domain:** does the idea require data another service owns at query/mutation time? If so, name the owning service + the events it emits → the design must use a **local event-sourced projection**, NOT federation `@requires` or a cross-subgraph read. (This is the original "federation red flag".)
     - **Infra / DevOps:** does the change recreate or migrate infrastructure in a way that could break external-dependency continuity? Enumerate what must survive: NAT egress IPs, datastore IP-allowlists, managed-service endpoints, out-of-band bootstrap steps.
     - **Infra Terraform specifically:** enumerate **every** required (no-default) variable AND every placeholder-default variable in the touched config, and state how CI supplies each. Placeholder defaults (`192.0.2.0/24`, `""`, `CHANGE_ME`) silently plan **destructive** against live state.
     - **Frontend:** does it cross the server/client boundary or touch the Apollo cache in a way that risks an SSR/suspense break or a stale-merge? Name the query and cache shape.

While the Explore agent runs, read `openspec/changes/` directory listing yourself to cross-check active changes.

After the agent returns: synthesize the survey findings in a brief internal summary (not shown to user yet). Specifically flag:

- Integration points the proposal must respect
- Existing patterns to follow
- Active changes that are hard dependencies or soft dependencies
- Whether the federation red flag was raised

### The survey discovers; the coordinator verifies

`Explore` is a **discovery** instrument, not a verification one — its own contract says it "reads
excerpts rather than whole files… it locates code; it doesn't review or audit it." Between the code
and your `design.md` prose sit three lossy steps: Explore's excerpting, your internal summary, then
writing from memory of that summary. Nothing rounds back to the source.

So: **any survey finding that will become a load-bearing claim in an artifact must be re-read at
the source by you, with the file open, before you assert it.** Capture the anchor as you read it —
`path:line` plus the actual text, or the search command plus its result count. Those anchors go
straight into the `**Evidence:**` lines in Phase 5, so this costs one read now and nothing later.

If you cannot get an anchor, the finding is not a fact yet — it belongs in `## Open questions`, not
in a `Rationale`. See `.claude/rules/proposal-grounding.md`.

---

## Phase 3 — Feasibility + devil's advocate

**Goal:** challenge the idea before any artifacts are generated, using independent agents whose context is NOT contaminated by the dialogue and survey work done so far.

The coordinator has spent Phases 1–2 reading the user's pitch, building enthusiasm for the codebase connections, and surveying what makes the idea feasible. That context biases any inline critique — the coordinator will unconsciously steelman the idea while pretending to challenge it. The devil's advocate must run in a fresh agent with minimal context.

### Step 1 — Architectural feasibility (coordinator, inline)

Do this yourself before dispatching anything, because it requires the survey results the coordinator already holds:

- Does the survey reveal any pattern that makes this idea significantly harder than it appears? (e.g., the "data from another service" situation — if raised, explicitly state: "The design cannot use federation `@requires` or cross-subgraph reads; it will need a local event-sourced projection. See `.claude/rules/backend-graphql.md §Cross-Service Data Access`.")
- Does this conflict with any CQRS boundary, projection isolation rule, or event-sourcing constraint?
- Does the survey reveal any in-flight change that this MUST land after? Or that landing this before X would break X?

Write a 2-3 sentence architectural feasibility note. This feeds into Step 3 synthesis but does NOT go into the devil's advocate brief.

### Step 2 — Devil's advocate (fresh agent, always)

Dispatch a **fresh general-purpose agent** with only a stripped-down brief. Do NOT give it the survey findings, the dialogue transcript, the architectural feasibility note, or any framing that signals "we are heading toward building this."

The brief must contain only:

1. The idea in 2-3 sentences (neutral framing — no enthusiasm, no "we decided to", no survey context)
2. The problem it claims to solve (one sentence)
3. The task: **"Your job is to find the strongest reasons NOT to do this, or to do it a fundamentally different way. Argue like a skeptical senior engineer who has seen similar ideas fail. Do not try to be balanced — be a critic. Under 200 words."**

After the agent returns, the coordinator synthesizes its output into a structured finding:

> **Devil's advocate (independent):** [Strongest objection, verbatim or paraphrased from the agent]. [Why this matters.] [The counter-argument / how this should shape the design — this part is the coordinator's own assessment.]

If the devil's advocate raised something the coordinator hadn't considered from the survey, that is a signal worth surfacing to the user before proceeding.

### Step 3 — Product skeptic (dispatch `pragmatist-pm` in parallel with devil's advocate, conditionally)

The bar: there is a real choice between approaches where one serves near-term execution and another serves long-term product positioning, AND the user hasn't already decided. Concrete bug fixes and clear features don't need this. When in doubt, skip.

If dispatching: run it in parallel with the devil's advocate agent (both in a single `Agent` call message). Brief `pragmatist-pm` with the problem statement only — not the survey, not the solution. Ask: "Is this the right problem to solve right now? Is this scope appropriate? Under 150 words."

### Step 4 — Feasibility summary (coordinator, after agents return)

Synthesize all three inputs (architectural feasibility note + devil's advocate + optional pragmatist-pm) into a paragraph:

- Is the idea sound? (yes / yes with caveats / no — and why)
- What are the load-bearing constraints the design must respect?
- Any open questions that must be resolved before or during proposal generation?

**Surface this to the user.** If the devil's advocate raised a genuine show-stopper or the pragmatist-pm pushed back hard, discuss before continuing — a pivot here is cheaper than mid-proposal-generation. If everything looks clear, proceed directly to Phase 4.

---

## Phase 4 — Decomposition decision

**Goal:** decide whether this is one proposal or several, and if several, in what order.

### Step 0 — Triviality off-ramp (is a proposal even warranted?)

**Skip this entire off-ramp if you were invoked by `implement-task` with an "already-triaged as proposal-worthy" signal** — that skill is the single triage brain and has already decided this warrants a proposal. Re-triaging here would just bounce the work back. Proceed straight to the size estimate.

Otherwise (a direct invocation), check whether the change is too small to deserve the OpenSpec ceremony. If the survey shows it is trivial — roughly **≤2 files, no new aggregate/event/command/GraphQL-schema, and already fully specified** (e.g. a Jira task that reads like a finished spec) — a proposal directory is overhead the user may not want.

In that case, **ask via `AskUserQuestion`** whether to:

- **Generate an OpenSpec proposal anyway** (they want the paper trail / hard review), or
- **Skip OpenSpec and hand to `implement-task`** — the triage front-door that owns small-task implementation (direct-implement / bug-fix / trivial lanes). Pass it a "`intent-to-proposal` already determined this is NOT proposal-worthy" note so it does not escalate the work back here.

If they choose to skip, STOP this skill cleanly: state that you're following their choice (user instruction overrides the proposal path) and hand off to `implement-task`. Do NOT generate empty artifacts. (Real example: a ~2-line CSP fix where the user chose to fix directly → shipped as a PR with no proposal.)

If the change is non-trivial, skip this step and continue.

### Size estimate

Based on the survey, estimate:

- Rough task count (each distinct file-level change is roughly one task; each test file is one task)
- Services touched (count distinct service directories + lib directories that need changes)
- Risk level (see template below for the definition)

### Decision rule

| Condition                                                                  | Decision                                      |
| -------------------------------------------------------------------------- | --------------------------------------------- |
| Estimated tasks ≤ 60 AND services touched ≤ 4                              | Single proposal                               |
| Estimated tasks > 60 OR services touched > 4                               | Split into multiple proposals                 |
| Change has phases where each phase is independently valuable and shippable | Split by phase                                |
| Change has hard prerequisites that don't exist yet                         | Separate the prerequisite as its own proposal |

### Model assignment (one per proposal)

Assign exactly one implementation model to each proposal, based on its complexity and risk. **Lean high** — when a proposal sits between two tiers, pick the higher one. The goal is reliable autonomous execution, so under-powering a proposal is the expensive mistake.

| Model    | Assign when…                                                                                                                                                                                                                                                  |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fable`  | HIGH risk or high-judgment: novel architecture, event-schema changes, security-sensitive paths, cross-cutting (4+ services), CQRS / event-sourcing design calls, anything where a subtle wrong decision is costly. The hardest tier — the most capable model. |
| `opus`   | **Default.** MEDIUM risk: modifies existing behavior, 2–3 services, a standard aggregate / projection / GraphQL feature following established patterns. Most proposals land here.                                                                             |
| `sonnet` | LOW risk only: pure-mechanical, single-file or parity / rename / config, fully specified with zero design judgment (e.g. an infra-parity task list, a doc update, a codemod). If you can't call it trivial without hedging, it's `opus`.                      |

Do NOT assign `haiku` to an implementation proposal. Do NOT split the model per-agent — the whole proposal runs at one tier, and `/proposal-to-pr` passes it to every specialist subagent it dispatches for that change. Record the chosen tier in the announcement and write it to `.openspec.yaml` in Phase 5.

### Dependency graph (decides `depends_on`)

Decide the hard-prerequisite edges now: for each proposal, which _other proposals in this decomposition_ — and which _already-existing active or archived changes_ — must be merged before it can start. Express the graph by human name for now (e.g. "`ne-refactor-2` depends on `ne-refactor-1`"); Phase 5 generates the stable `id`s and rewrites these edges into each proposal's `depends_on` id-list.

Only HARD, gating prerequisites become `depends_on` edges. A soft "assumes X exists but degrades gracefully" relationship stays in the Dependencies prose, not in `depends_on`. Keep the graph acyclic — if two proposals seem to depend on each other, the split is wrong; merge them or move the shared prerequisite into its own proposal.

### Autonomous decision — announce, do not gate

**This skill no longer stops to ask the user how many proposals to create or what to name them.** Make the decomposition call yourself from the size estimate and the decision rule above, assign each proposal its model and its dependency edges, then **announce the decision and proceed directly to Phase 5 in the same turn.** Whatever the survey + rules produce is accepted — the point is to let agents prepare proposals without a human gate here.

Announce (do NOT wait for a reply):

- **Single proposal:** state the kebab-case name, a one-line scope, and the assigned model tier.
- **Splitting:** state the ordered set of change names, each with a one-sentence scope, its model tier, and which change(s) it depends on. Present it as a short ordered list so the sequencing is legible.

The one thing still worth surfacing before you spend generation effort is a genuine **Phase 3 feasibility show-stopper** (a devil's-advocate objection that a pivot would be cheaper to make now). A clean feasibility pass flows straight into Phase 5 with no confirmation turn. Naming, count, model, and dependency order are the skill's call now — not the user's.

---

## Phase 5 — Proposal generation

**Goal:** generate well-structured proposal artifacts for each change (one generation loop per proposal if multiple).

### Directory scaffolding

**Run this FIRST, before writing any artifact file:**

```bash
openspec new change "<name>"
```

This registers the change in the openspec system. **Do NOT hand-write `.openspec.yaml` or skip this step** — an unregistered change won't validate and won't flow into `/proposal-to-pr`. (Two real runs skipped it and hand-wrote `.openspec.yaml`; both only caught the risk because they validated afterward.)

Note that `openspec new change` scaffolds **only** `.openspec.yaml` — it does NOT create `proposal.md` / `design.md` / `tasks.md` / `specs/`. Before writing those, read a recent sibling change in `openspec/changes/` (e.g. `canonicalize-production-host/`) to match the exact on-disk format, then write the artifacts using the templates below.

### Assign the stable ID, model, and dependencies (immediately after scaffold)

`openspec new change` writes only `schema:` and `created:` into `.openspec.yaml`. Immediately append the stable `id`, the `model` tier from Phase 4, and the `depends_on` list:

```bash
# Generate a stable, unique proposal id — never changes after this.
# `openssl rand -hex 3` draws from a 16^6 space, so a collision is unlikely but
# not impossible; regenerate until the id is unused across active AND archived
# changes, because a duplicate id would break depends_on resolution and gating.
PROP_ID="prop-$(openssl rand -hex 3)"
while grep -Rqs "^id: ${PROP_ID}$" openspec/changes/*/.openspec.yaml openspec/changes/archive/*/.openspec.yaml; do
  PROP_ID="prop-$(openssl rand -hex 3)"
done
{
  echo "id: ${PROP_ID}"
  echo "model: <fable|opus|sonnet from Phase 4>"
  echo "depends_on: [<space-separated prerequisite ids — leave the brackets empty for none: []>]"
} >> "openspec/changes/<name>/.openspec.yaml"
```

- `depends_on` is an inline YAML flow list: `depends_on: [prop-a3f2c1, prop-9b0e77]`, or **exactly** `depends_on: []` when there are no hard prerequisites (never omit the key). Keep it single-line — this matches the "one more scalar line is safe" precedent that `jira_issue_key` established, and stays safe for the openspec CLI's parser.
- **For a decomposition, scaffold ALL proposals and generate ALL their ids FIRST**, building a `name → id` map, before writing any `proposal.md`. Otherwise proposal B can't reference proposal A's id in its `depends_on` or its Dependencies section. Resolve every hard-prerequisite edge from the Phase 4 dependency graph into ids using that map.
- To depend on an **already-existing** active or archived change, read its id: `grep '^id:' openspec/changes/<dep-name>/.openspec.yaml` (also check `openspec/changes/archive/<dep-name>/`). If a legacy change predates this system and has no `id:`, backfill one the same way (a stable id is safe to add) and reference that.

Re-run `openspec validate "<name>" --strict` after editing `.openspec.yaml` and confirm it still exits 0 — the live test that these extra keys don't break the openspec CLI's parsing.

### For each proposal:

> **Skeleton vs. filled — let survey confidence decide.** The templates below show _minimum_ structure, not a ceiling. When the Phase 2 survey gave you high confidence in the approach, fill in design decisions (with alternatives + rationale) and concrete tasks now rather than leaving `TBD` — every good real run did this, and it makes Stage 2 review sharper. Reserve skeletons / `TBD` for questions the survey genuinely did not resolve. The one firm rule: never invent a decision the survey didn't support just to avoid a placeholder.
>
> ⚠️ **Confidence licenses detail, not assertion.** "High survey confidence" is a feeling about a
> lossy summary, and filling in more prose is exactly when fabricated premises get written. A
> filled-in decision must carry its `**Evidence:**` anchors (below); a confident-sounding claim with
> no anchor is worse than a `TBD`, because `TBD` is honest and reviewers can see it.

#### Write `proposal.md`

Use this exact template. Fill every section — do not leave section headers empty. "None" is an acceptable value only for Dependencies and Open questions.

```markdown
# Proposal — <name>

> **ID:** `prop-a3f2c1` · **Model:** `opus` · **Depends on:** `prop-9b0e77` (change-name-a), `prop-1c4d90` (change-name-b)
>
> <!-- ID and Model mirror `.openspec.yaml` (the machine source of truth). "Depends on" lists the HARD prerequisite proposals by id + human name; write "none" if there are no hard prerequisites. Every id here MUST also appear in `.openspec.yaml`'s `depends_on`. `/proposal-to-pr` will not start implementation until every dependency listed here is merged. -->

## Problem

<!-- Concrete description of what is broken, missing, or suboptimal. Describe the symptom, not the fix.
     One paragraph. If there are multiple symptoms, list them as bullets. -->

## Why now

<!-- What makes this the right time? Urgency, a dependency that just unblocked, a product milestone,
     or a technical debt ceiling being hit. One or two sentences. -->

## What changes

<!-- High-level description of what this change does. Not implementation details — those belong in
     design.md and tasks.md. Aim for 3-7 bullets covering the key capabilities added or changed. -->

## Non-goals

<!-- Explicitly list what this change does NOT do. This prevents scope creep and sets reviewer
     expectations. If truly nothing is excluded, write "None — full scope is captured above." -->

## Dependencies

### Hard (must be merged before this starts) — these become `.openspec.yaml` `depends_on`

<!-- Format: `prop-<id>` (`change-name`) — one-line reason why it's required -->
<!-- Every id listed here MUST also appear in `.openspec.yaml`'s `depends_on` list — that list is what /proposal-to-pr gates on. -->
<!-- Write "None" if there are no hard dependencies -->

### Soft (design assumes these exist; graceful degradation if absent)

<!-- Format: `change-name` — what breaks or degrades if this hasn't landed yet -->
<!-- Write "None" if there are no soft dependencies -->

### Enables (future changes that will depend on this)

<!-- Format: `change-name` — what becomes possible -->
<!-- This is forward-looking — it's OK to be tentative ("probably enables X") -->
<!-- Write "None known" if unclear -->

## Size estimate

|                                |                                        |
| ------------------------------ | -------------------------------------- |
| Estimated tasks                | ~N                                     |
| Services touched               | N (list: service-a, service-b) |
| Risk                           | LOW / MEDIUM / HIGH                    |
| Expected sessions to implement | 1 / 2                                  |

<!-- LOW: pure addition, no existing behavior changed, single service.
     MEDIUM: modifies existing behavior, 2-3 services, or a complex aggregate.
     HIGH: cross-cutting, 4+ services, event schema changes, or security-sensitive. -->

## Open questions

<!-- Questions that must be resolved before or during implementation. If resolved during this skill
     session, answer them here and note they were resolved. If none remain, write "None." -->
```

#### Write `design.md` skeleton

```markdown
# Design — <name>

## Context

<!-- Summary of codebase survey findings relevant to this change. What patterns exist that this
     must follow? What integration points must be respected? Keep this as a reference for the
     implementer — not a repeat of the proposal. -->

## Decisions

<!-- Each significant design choice gets a numbered entry. Fill these in during Stage 3 (Refine)
     or before implementation if the approach is already clear. Leave as placeholders if unknown.

     Format per decision:
     ### N. [Decision title]
     **Chosen:** ...
     **Alternatives considered:**
     - Option A: ... — rejected because ...
     - Option B: ... — rejected because ...
     **Rationale:** ...
     **Evidence:** `path/to/file.ext:LINE` — `exact text on that line`
     **Evidence:** `grep -rn --include='*.ext' 'pattern' src/` → N results

     Every claim about what the EXISTING code does — in a Rationale, in a
     "rejected because", in a constraint — needs an **Evidence:** line. Judgment
     ("Option B is simpler") does not. If you cannot cite it, move it to Open
     questions. Rule: `.claude/rules/proposal-grounding.md`.
-->

### 1. [First key decision — e.g., data shape, storage, synchrony, error handling]

TBD — to be resolved in Stage 3 pre-review.

## Compatibility risks

<!-- ONLY include this section if the change can break across versions (schema/enum/event-payload
     shape, projection shape, stored-value vocabulary, API contract).

     FIRST ask: is this caught at build time? If `{{CODEGEN_CMD}}`, `tsc`, or
     `rover supergraph compose` fails on it, CI catches it and nothing ships — DELETE the risk.

     If it survives, name the mechanism. `Binds at:` must be one of exactly:
     build-time | rollout-window | inter-service-skew | event-consumption | replay-migration | data-at-rest

     **Risk:** <one line>
     **Binds at:** `rollout-window`
     **Skew path:** <producer @ver> → <medium> → <consumer @ver>
     **Symptom:** <what observably fails, and where you would see it>
     **Mitigation closes it because:** <ties explicitly to the named moment>
     **Evidence:** <the citation that makes the moment real — e.g. the replicas/strategy config>

     A wrong moment produces a mitigation that does not work, so this is not paperwork.
     See `.claude/rules/proposal-grounding.md` § Class 2 for the table and a worked example.

     If the change cannot break across versions: remove this section. -->

## Cross-service data access

<!-- ONLY include this section if the survey raised the federation red flag.
     If it did: -->

> ⚠️ **Federation constraint:** This change involves data from `<other-service>`. The correct pattern is a **local event-sourced projection** that subscribes to `<OtherServiceEvent>` events — NOT federation `@requires`, NOT a cross-subgraph read at resolver time. See `.claude/rules/backend-graphql.md §Cross-Service Data Access`. All task reviewers should verify this constraint is respected before marking Stage 4 complete.

<!-- If no cross-service data access: remove this section. -->

## Open questions

<!-- Mirror the open questions from proposal.md. Delete as they are resolved during implementation. -->
```

#### Write `tasks.md` skeleton

Derive the section headings from the survey findings and proposal scope. Use the appropriate set for the change type:

**Backend change sections:**

```
## 0. Prerequisites / setup
## 1. Domain model (aggregate, commands, events)
## 2. Command handlers
## 3. Projections
## 4. GraphQL schema
## 5. GraphQL resolvers + mappers
## 6. Tests
## 7. Documentation
```

**Frontend change sections:**

```
## 0. Prerequisites / setup
## 1. Backend additions (if any)
## 2. GraphQL queries / mutations
## 3. Component implementation
## 4. Integration + data fetching
## 5. Tests
## 6. Documentation
```

**Infrastructure / DevOps sections:**

```
## 0. Prerequisites
## 1. Terraform / k8s changes
## 2. CI / CD workflow
## 3. Secrets / config
## 4. Verification / smoke test
## 5. Documentation / runbook
```

Mix and match as needed. Each section starts empty with a note: `<!-- Tasks to be filled during Stage 2 refinement or before Stage 4 implementation -->`.

#### Create `specs/` directory — ALWAYS at least one delta

⚠️ **`openspec validate` (this project's `spec-driven` schema) HARD-FAILS with "Change must have at least one delta" if `specs/` is empty.** Do NOT skip `specs/` — every change needs at least one delta file. (In practice every skill-generated change ended up with a delta anyway, after a wasted validate→diagnose→fix→re-validate cycle. Create it up front.)

Create `specs/<capability>/spec.md` with at least one `## ADDED Requirements` block. If the proposal spans more than one conceptually distinct sub-area (e.g. "domain model" and "frontend"), stub one file per area; otherwise one file is enough.

Two parser rules cause a **second** validation failure if missed:

1. **Each requirement's first line MUST contain SHALL or MUST** — the parser checks the opening line of the requirement, not just anywhere inside it.
2. **Each requirement MUST include at least one `#### Scenario:` block.**

Known-good minimal template:

```markdown
# <capability> spec delta

## ADDED Requirements

### Requirement: <short title>

The system SHALL <the behavior this change introduces>.

#### Scenario: <happy-path scenario name>

- **WHEN** <trigger / precondition>
- **THEN** <expected outcome>
```

#### Validate before completing

After writing all artifacts, run:

```bash
openspec validate "<name>" --strict
```

Fix any errors (the two parser rules above are the usual culprits) and re-run until it passes. A change that doesn't validate is not done.

#### Verify the grounding — REQUIRED

`openspec validate` checks structure, not truth. Then run:

```bash
{{CLAIMS_CHECKER_CMD}} "<name>"
```

It re-reads every `**Evidence:**` anchor against the actual file and re-runs every absence command,
and rejects any `**Binds at:**` value outside the closed list. Verdicts:

| Verdict                                          | What to do                                                                                                                                       |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `FABRICATED` / `COUNT-MISMATCH` / `MISSING-FILE` | The claim is false. Open the file, fix the claim **and re-examine the decision it was supporting** — a false premise may have been load-bearing. |
| `WRONG-LINE` / `DRIFT`                           | Citation points at the wrong line; the corrected line is in the output.                                                                          |
| `UNKNOWN-MOMENT`                                 | The named mechanism isn't real in this stack. Pick from the closed list.                                                                         |
| `MALFORMED` / `UNSAFE`                           | Rewrite the citation in the documented form.                                                                                                     |

**A non-zero exit is a hard gate — do not present the proposal as complete.** The checker only sees
claims written in the structured form; a load-bearing claim asserted in bare prose with no
`**Evidence:**` line passes silently here and is caught later by the reviewers' `[false-premise]`
severity. Green is a floor, not a ceiling.

---

## Completing the skill

After generating all artifacts, present the user with:

1. **Summary:** Change name(s), what was generated, where to find them.
2. **Survey findings that shaped this:** 2-3 key things the survey found that influenced the proposal shape (integration points, dependencies discovered, pattern to follow).
3. **Load-bearing constraints:** The 1-3 things the implementer must NOT violate (e.g., "must use local projection, not federation @requires", "must land after X").
4. **Metadata:** the proposal's `id`, assigned `model` tier, and `depends_on` ids (or "no hard dependencies").
5. **Next step:** "Run `/proposal-to-pr <name>` to start the review + implementation pipeline. It runs at the proposal's `model` tier and will block until every `depends_on` prerequisite is merged."

**6. Create or reuse the Jira tracking issue.** For each proposal generated:

- **If this skill was invoked by `implement-task`'s escalate lane** (i.e. you were handed an originating Jira issue key), REUSE that key for the **first / primary** proposal rather than creating a duplicate: following `jira-task-management`'s Cross-cutting mechanics (dynamic transition-ID lookup + idempotency guard), transition the originating issue to **Proposal Ready**, and use that key below. This keeps one ticket per work item — the task the user escalated becomes the proposal's tracker, instead of being orphaned while a brand-new ticket appears.
- **Otherwise** (direct invocation from a raw idea), or for the **2nd..Nth** proposal in a decomposition, create a net-new issue: first check via JQL (`project = {{TRACKER_PROJECT_KEY}} AND labels = "openspec:<name>"`) that one doesn't already exist (so a re-run doesn't duplicate); if none, call `createJiraIssue` (see `jira-task-management/SKILL.md` for the tool shape): `projectKey: "{{TRACKER_PROJECT_KEY}}"`, `issueTypeName: "Task"`, `summary` = a de-slugified change name, `description` = the proposal's problem/why section plus a pointer to `openspec/changes/<name>/proposal.md`, `additional_fields.labels` = `["openspec:<name>"]` (the traceability + dedup key), and `transition: { id: "{{TRACKER_TRANSITION_PROPOSAL_READY}}" }` (Proposal Ready — a creation-time param; if the target status doesn't stick, fall back to create-then-dynamic-`transitionJiraIssue` via `jira-task-management`, same as the Phase 1 migration plan's Task 1 Step 4 mechanic).

Then write the resulting key (reused or new) into `openspec/changes/<name>/.openspec.yaml` as a new line: `jira_issue_key: PROJ-<N>` (that file today holds just `schema:` and `created:` — freeform YAML, one more scalar line is safe). Re-run `openspec validate "<name>" --strict` after the edit and confirm it still exits 0 — this is the live test that an extra key doesn't break the openspec CLI's parsing, not just an assumption.

If multiple proposals were generated, also show a table so the pickup order is unambiguous:

| id            | change-name         | model | depends on (ids) |
| ------------- | ------------------- | ----- | ---------------- |
| `prop-a3f2c1` | `ne-refactor-1-...` | opus  | none             |
| `prop-9b0e77` | `ne-refactor-2-...` | fable | `prop-a3f2c1`    |

- The dependency order they must be implemented in (topologically sorted by `depends_on`)
- Which one to start with (the proposal whose `depends_on` is empty or already satisfied)

**Before handing off — branch hygiene.** The artifacts are uncommitted files, and `/proposal-to-pr` expects a clean feature branch. If the working tree is on `main` (or another shared branch), create/switch to an `openspec/<name>` branch and commit the artifacts before pointing the user at the pipeline — one real run had the proposal accidentally swept into `main`. If the session is already long and full of deliberation, recommend running `/proposal-to-pr` in a **fresh session** to avoid context bloat.

---

## Final step — Retro

After the artifacts are committed and the handoff is printed, dispatch the **`retro-writer`**
agent. It writes one file to `.claude/retrospectives/` and nothing else.

```
Dispatch retro-writer with:
  skill:    intent-to-proposal
  subject:  <primary change name>
  branch:   <the openspec/<name> branch, if one was created>
  outcome:  handed-off
  pointers: openspec/changes/<name>/proposal.md
            openspec/changes/<name>/.openspec.yaml
            Jira <key>, if one was created or reused
```

The findings worth capturing here are **proposal-shaped**, not implementation-shaped, and
they are the ones that cost the most downstream:

- The survey missed an integration point that Stage 2 pre-review later caught.
- The decomposition was wrong — proposals that should have been one, or one that should
  have been three.
- A `depends_on` edge discovered late, after the ordering was already presented.
- A feasibility call that turned out wrong.
- The user redirected the scope during dialogue — record what shape of question triggered it.

A proposal defect is the most expensive kind in this pipeline, because `proposal-to-pr`
inherits it and pays for it across every downstream stage. **This is the highest-leverage
retro of the five.**

Do not summarize the dialogue for the agent — hand it the pointers and let it read.

---

## What this skill does NOT do

- It does not implement. The implementation pipeline is `proposal-to-pr`.
- It does not replace human judgment on whether to build something. Phase 3 surfaces the question; the user decides.
- It does not _require_ complete `tasks.md` content — when the design is still open, skeleton headings are enough to prime Stage 4 and tasks get refined collaboratively in Stage 2/3. But when the survey makes the task list concrete and mechanical (infra parity, a runbook, a rename), populating real tasks now is encouraged (see "Skeleton vs. filled" in Phase 5).
- It does not guarantee zero blockers in Stage 2 — but a good survey + feasibility pass significantly reduces the probability.
