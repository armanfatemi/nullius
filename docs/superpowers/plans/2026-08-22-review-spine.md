# Review Spine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the review roster the pipeline's review stages dispatch — a rules tree, two ported reviewer agents, two authored specialists, and the dispatch doctrine that routes to them.

**Architecture:** Six markdown artifacts under `.claude/`, no code. The rules come first because `rule-auditor` reads them; the agents come next because the roster names them; the roster comes last because `nullius wiring`'s `DANGLING-AGENT` verdict fails on a row naming an agent that does not exist. That ordering is not stylistic — it is the only order in which each task can be verified when it lands.

**Tech Stack:** Markdown. Verified by `nullius wiring`, `nullius check`, and a deliberate negative test.

**Spec:** `docs/adopting-the-pipeline.md` — Decisions D1/D2/D3, and the roster and agent-grounding paragraphs of "Phase 1 — the port".

**Source:** `~/Documents/GitHub/nullius-vendor/openspec-pipeline-export/` — the durable copy.

**Why this is its own plan.** `proposal-to-pr` dispatches reviewers by name from a roster. Landing the machine before the roster gives it review stages that dispatch nothing and report success — the precise failure `nullius wiring` was built to catch. The machine gets its own plan once this one lands.

## Global Constraints

- **Everything here becomes a scanned harness artifact on landing.** `nullius wiring` reads `.claude/agents/*.md`, `.claude/skills/**/SKILL.md` and `.claude/rules/*.md`. A surviving `{{TOKEN}}` is a hard failure; a rule's `applies_to` glob matching nothing is a hard `EMPTY-GLOB`; a roster row naming a missing agent is a hard `DANGLING-AGENT`. Run `node packages/claims/dist/cli.js wiring` after every task.
- **`pnpm build` before any CLI use.** The CLIs run from `dist/`.
- **Rules carry the frontmatter `add-rules-compliance` specifies** — `id`, `applies_to`, `severity`, and an Evidence Anchor to the motivating incident — so `rules select` consumes them unchanged when built. This is decision D3 applied: the scaffolding emits product-grade data from the first run.
- **`CLAUDE.md` is not to be edited.** The rules duplicate its content deliberately and temporarily; converting it to pointers belongs with `add-rules-compliance`, when something actually reads the rule files.
- Six `flagConformance` failures are environmental on this machine (ugrep as `grep`). Not defects.
- Source style for markdown: this repo's register — reasoning, not mechanics.

## File Structure

| Path | Responsibility |
|---|---|
| `.claude/rules/*.md` | Eight rules, each with frontmatter and an incident anchor |
| `.claude/agents/rule-auditor.md` | Ported; reads the rules tree |
| `.claude/agents/architecture-reviewer.md` | Ported; regrounded on this repo's invariants |
| `.claude/agents/checker-engineer.md` | Authored |
| `.claude/agents/test-engineer.md` | Authored |
| `.claude/skills/advise-specialized-agents/SKILL.md` | Ported; the roster and routing |

---

### Task 1: Seed `.claude/rules/` from this repo's own scar tissue

**Files:**
- Create: `.claude/rules/` with eight rule files

**Interfaces:**
- Consumes: `CLAUDE.md`, `openspec/changes/add-rules-compliance/proposal.md`
- Produces: rule files whose frontmatter `rules select` will consume unchanged

- [ ] **Step 1: Read what the frontmatter must be**

Read `openspec/changes/add-rules-compliance/proposal.md` — it specifies `id`, `applies_to` globs, `severity`, and an Evidence Anchor to the motivating incident, with closed-key strictness. Read `plugin/skills/evidence-anchors/SKILL.md` for the anchor form, and run `git rev-parse --short HEAD` for the stamp.

Also read the export's `.claude/rules/documentation.md` (32 lines) for the shape a rule file takes. Do **not** port `aggregates.md` (event-sourcing, inapplicable) or `proposal-grounding.md` — this repo's version of that rule is `plugin/skills/evidence-anchors/SKILL.md`, and duplicating it here would be two delivery mechanisms for one artifact.

- [ ] **Step 2: Write the eight rules**

Each is a real incident this repo has been bitten by, all recorded in `CLAUDE.md`. Derive the text from there rather than inventing:

| `id` | The rule |
|---|---|
| `build-before-cli` | `dist/` is what the CLIs run; an unbuilt tree validates the previous version |
| `rev-stamp-change-anchors` | Anchors in `openspec/changes/**` are stamped from the start |
| `never-repoint-under-old-stamp` | Repointing a line while keeping the stamp turns advisory `STALE` into hard `FABRICATED` |
| `merge-never-squash` | A squash orphans every stamped anchor; the checker then fails open |
| `one-delivery-mechanism` | Never write witness hook entries into `.claude/settings.json` |
| `verdict-needs-fixture-and-test` | CI checks only a fixture's exit code, which stays 1 when a verdict goes quiet |
| `openspec-shall-first-line` | The requirement check reads only line one |
| `model-proposes-code-verifies` | A change putting a model in the verification path is the wrong change |

**Each `applies_to` glob must match at least one real file**, or `wiring` reports `EMPTY-GLOB` and the task fails. Check each one before you write it.

**Each incident anchor must verify.** Anchor to the code or history that makes the rule real — the checker's `FABRICATED` path, the CI step, the `Verdict` union, whatever the rule is actually about. If you cannot find an anchor for a rule, say so in your report rather than inventing one: `add-rules-compliance` has an `UNGROUNDED-RULE` verdict for exactly that case, and a rule without an incident is folklore with a severity label.

- [ ] **Step 3: Verify**

```bash
pnpm build
node packages/claims/dist/cli.js check '.claude/rules/*.md'
node packages/claims/dist/cli.js wiring
```

Every anchor `OK`; `wiring` exits 0 with no `EMPTY-GLOB`.

- [ ] **Step 4: Commit**

```bash
git add .claude/rules
git commit -m "feat(rules): seed the rules tree from this repo's own scar tissue"
```

---

### Task 2: Port `rule-auditor`

**Files:**
- Create: `.claude/agents/rule-auditor.md`

**Interfaces:**
- Consumes: Task 1's rules tree.
- Produces: an agent the roster in Task 5 will name.

- [ ] **Step 1: Copy and read**

Source: `~/Documents/GitHub/nullius-vendor/openspec-pipeline-export/.claude/agents/rule-auditor.md` (159 lines). Read it before cutting — its three dispatch modes (diff / planned / proposal) are all applicable here and should survive.

- [ ] **Step 2: Reshape "How rules map to files"**

It carries an orientation listing of the export's three rules. Replace with this repo's eight. Keep its own warning verbatim — that the listing is a convenience and the directory is truth — because that is what stops the agent trusting a stale list.

- [ ] **Step 3: Cut what does not apply**

The external-invariant-docs section points at a docs tree this repo does not have; its equivalent here is `spec/*.md` and `CLAUDE.md`. Repoint or cut. Any reference to aggregates, event-sourcing or the tracker goes.

Its `[false-premise]` severity is **not** foreign — `plugin/reviewers/false-premise.md` is this repo's own. Keep it and cite the real file.

- [ ] **Step 4: Check the frontmatter**

`name`, `description`, `model`, `tools`, `color`, `memory` are harness fields. Keep them. **Do not add `dispatches:` or `reads:`** — those are `wiring`'s hard-verdict fields, and this agent dispatches nothing.

The `model:` field says `sonnet`. Leave it unless you have a reason.

- [ ] **Step 5: Verify and commit**

```bash
pnpm build && node packages/claims/dist/cli.js wiring
grep -nE '\{\{|aggregate|jira|Jira|CQRS' .claude/agents/rule-auditor.md
```

`wiring` exits 0; the grep returns nothing. Then commit.

---

### Task 3: Port `architecture-reviewer`, regrounded

**Files:**
- Create: `.claude/agents/architecture-reviewer.md`

**Interfaces:**
- Consumes: this repo's invariants, which are already written down.
- Produces: an agent the roster will name.

- [ ] **Step 1: Understand what this agent is**

Source is 179 lines. Its own PORTME says it is **a pointer with no built-in opinions** — aimed at an empty docs tree it produces fluent, confident, ungrounded review, which is worse than no review because it looks like a gate. So the grounding is the task.

- [ ] **Step 2: Point its reading list at this repo**

There is no `docs/architecture/`. This repo's invariants live in `CLAUDE.md`, `spec/evidence-anchors.md`, `spec/binding-moments.md`, `spec/witness-journal.md`, `spec/wiring.md`, and `openspec/project.md`. Read them, then write the reading list.

- [ ] **Step 3: Replace invariants 8–11**

They are marked PORTME and are event-sourcing shaped (API boundary, write-availability, operational surface). The export says items 1–7 and 12–14 are stack-independent and should survive as written — **check that claim against the text rather than accepting it**, and report if any of those is foreign too.

Replace 8–11 with this repo's real invariants, each stated as something a reviewer can hold a change against:

- the model only proposes; verification is always code
- one delivery mechanism per artifact
- anchors in change folders are rev-stamped from the start, and never repointed under an old stamp
- merge commits, never squash
- hooks fail open; a hook that cannot run must never break a session
- the exported `Verdict` union is public API and growing it is breaking
- a new verdict requires both a fixture and a unit test
- build before any CLI use

That list is eight and the slots are four. Choose the four that a *reviewer* can actually check against a diff, and put the rest where they belong — several are already rules in Task 1, and duplicating them here would give the same invariant two homes.

**Delete any invariant you cannot ground.** The export's own warning: an invariant nobody adopted produces blockers nobody accepts, and the first time that happens people stop reading the reviewer.

- [ ] **Step 4: Verify and commit** — same two commands as Task 2.

---

### Task 4: Author `checker-engineer` and `test-engineer`

**Files:**
- Create: `.claude/agents/checker-engineer.md`, `.claude/agents/test-engineer.md`

**Interfaces:**
- Consumes: nothing ported — these are written from this repo.
- Produces: the two specialists the roster names.

- [ ] **Step 1: Copy the frontmatter shape**

From `.claude/agents/rule-auditor.md` as it now stands. Same fields; no `dispatches:`/`reads:`.

- [ ] **Step 2: Write `checker-engineer`**

It owns kernel semantics. Derive its remit by reading `packages/claims/src/checkClaims.ts`, `witness.ts`, `wiring.ts` and `config.ts`. What it must know:

- the exported `Verdict` union is public API; growth is breaking, which is why `WiringVerdict` and `JournalVerdict` are separate unions
- the hard/advisory split, and that `isFailure` is an allowlist so a new verdict fails closed
- config parsing is closed-key because a typo'd key silently checking less is the failure the module exists to prevent
- hooks fail open by design, which is why `doctor` exists
- the proposes-versus-verifies boundary

- [ ] **Step 3: Write `test-engineer`**

It owns fixtures and the dogfood gates. Read `.github/workflows/ci.yml` and `CLAUDE.md`. What it must know:

- a fixture that stops failing is a checker that went quiet
- a new verdict needs both a fixture that trips it and a unit test asserting it, because CI checks only the exit code
- the six `flagConformance` failures are environmental and are not to be chased or "fixed" by editing the flag table
- "it passes now" and "it would have failed then" are different claims — a test written for a fix should be checked against the pre-fix code

- [ ] **Step 4: Verify and commit.**

---

### Task 5: Port `advise-specialized-agents` with an honest roster

**Files:**
- Create: `.claude/skills/advise-specialized-agents/SKILL.md`

**Interfaces:**
- Consumes: all four agents from Tasks 2–4.
- Produces: the dispatch doctrine the machine's review stages will follow.

- [ ] **Step 1: Copy and read**

214 lines. Its own PORTME calls the roster **"the single most repo-specific thing in the whole export"** and warns that every agent named must exist or the dispatch silently no-ops. The pre-flight doctrine above the roster is universal and should survive.

- [ ] **Step 2: Cut the roster to what exists**

The export's table has ten rows: three shipped, seven to-author, all event-sourcing or frontend shaped. **Delete every row you have no agent for.** After Tasks 2–4 that leaves four: `rule-auditor`, `architecture-reviewer`, `checker-engineer`, `test-engineer`.

`retro-writer` is a fifth name in the export's table. It is **not** in this plan — it arrives with the machine, which dispatches it. Do not add a row for it. A short honest roster beats a long aspirational one, and here the aspirational half is a hard build failure.

- [ ] **Step 3: Rewrite the routing table**

Its left column maps change types to agents. The export's is event-sourced. Rewrite for this repo's real change types — a kernel checker change, a kit or CLI change, a plugin or hook change, a spec-family document, an OpenSpec proposal — and name only agents that exist.

- [ ] **Step 4: Cut the build-gate and security-path PORTMEs**

Both are Next.js and service shaped. This repo's equivalent of "mocked tests structurally cannot catch this" is the composition surface — the CLI wiring, the hook delivery boundary, the published export surface. Write that, or cut the section and say you did.

- [ ] **Step 5: The negative test — this is the point of the whole plan**

Before committing, prove the check works. Add a row to the roster naming an agent that does not exist, then:

```bash
pnpm build && node packages/claims/dist/cli.js wiring
```

**It must report `DANGLING-AGENT` and exit 1.** If it exits 0, the roster is not in a form `wiring` reads — either the row is not a declared field or the skill's frontmatter is missing the key — and that is a finding worth more than this task, because it means the machine could later ship a roster nobody checks.

Record the verbatim output. Then remove the fake row and confirm it exits 0 again.

- [ ] **Step 6: Verify and commit.**

---

### Task 6: Verify the spine end to end

**Files:** none — this task only checks.

- [ ] **Step 1: Full sweep**

```bash
cd /Users/arman/Documents/GitHub/nullius
pnpm build && pnpm type-check
node packages/claims/dist/cli.js wiring
node packages/claims/dist/cli.js check '.claude/rules/*.md'
node packages/claims/dist/cli.js check 'README.md' 'spec/**/*.md' --require-markers
node packages/claims/dist/cli.js check 'openspec/**/*.md'
```

All exit 0. Record verbatim.

- [ ] **Step 2: Confirm the harness registered what it should**

`rule-auditor`, `architecture-reviewer`, `checker-engineer` and `test-engineer` should appear as available agent types; `advise-specialized-agents` as a skill. An agent file the harness never read is a file, not an agent.

- [ ] **Step 3: Dispatch one reviewer for real**

Dispatch `rule-auditor` in proposal mode against `openspec/changes/add-wiring-malformed-input/`. It is a real proposal with real anchors, and this repo's rules now exist for it to audit against.

Judge the output, not the proposal: did it cite specific rules by `id`? Did it find anything true? Did it return the `[blocker]/[concern]/[looks-good]` shape? An auditor that returns "looks good" on everything is indistinguishable from one that read nothing — say which you think you got.

- [ ] **Step 4: Report and commit any fix the dispatch exposed.**

---

## Notes for the executor

**The ordering is load-bearing.** Rules before `rule-auditor` because it reads them; agents before the roster because `wiring` fails on a row naming a missing agent. Do not reorder to parallelise.

**The riskiest task is 1, not 5.** Eight rules, each needing a glob that matches something real and an anchor that verifies. A rule whose anchor cannot be found is not a rule to invent an anchor for — report it and let it ship as `UNGROUNDED-RULE`, which is a verdict that already exists for that case.

**Read for survivors, do not only grep.** The previous port on this repo had three consecutive reviews each find foreign content the last one missed, because every verification was a grep for a string someone had already named. At least one task here should end with reading a file end to end as someone who has never seen the repo it came from.
