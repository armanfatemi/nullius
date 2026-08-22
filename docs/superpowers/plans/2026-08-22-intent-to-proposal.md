# `intent-to-proposal` Port — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the `intent-to-proposal` skill from the pipeline export into this repo, adapted so its grounding machinery points at nullius's real checker rather than the export's fork of it.

**Architecture:** One skill file at `.claude/skills/intent-to-proposal/SKILL.md`. No agents, no scripts, no packages — the skill's only dispatches are a generic Explore agent and a generic fresh agent for the devil's advocate, both of which the harness already provides. The port is subtractive first (cut what does not apply here), then integrative (wire the grounding to the kernel CLI and add a post-generation audit), then a real run.

**Tech Stack:** Markdown skill definition. Verified by `nullius wiring`, `nullius check`, and `openspec validate`.

**Spec:** `docs/adopting-the-pipeline.md` — sections "Decisions" (D1, D2) and "Phase 1a — `intent-to-proposal`".

**Source:** `~/Documents/GitHub/nullius-vendor/openspec-pipeline-export/.claude/skills/intent-to-proposal/SKILL.md` (584 lines). This is a durable copy; the original lived in a session scratchpad under `/private/tmp` and is not to be relied on.

## Global Constraints

- **`nullius wiring` now gates this port, and that is the point.** The moment this file lands at `.claude/skills/intent-to-proposal/SKILL.md` it becomes a scanned artifact. A surviving `{{TOKEN}}` is a hard `UNSUBSTITUTED-TOKEN` failure. A backticked repo-relative path in prose that does not resolve is an advisory `LOOSE-REFERENCE`. Run `node packages/claims/dist/cli.js wiring` after every task.
- **`pnpm build` before any CLI use.** The CLIs run from `dist/`; an unbuilt tree checks the previous version of the code.
- **The skill is a harness artifact, so its frontmatter is read by two consumers**: Claude Code, which registers it as an invocable skill, and `nullius wiring`, which reads declared fields. Do not add `dispatches:` or `reads:` frontmatter keys unless the values genuinely resolve — a declared reference that does not exist is a hard failure, by design.
- **Do not modify** `packages/`, `plugin/`, `spec/`, `.github/`, or any existing skill under `.claude/skills/`.
- Six test failures in `src/flagConformance.test.ts` are environmental on this machine (ugrep installed as `grep`). Not defects, not to be fixed.

## File Structure

| Path | Responsibility |
|---|---|
| `.claude/skills/intent-to-proposal/SKILL.md` | The whole deliverable. Created in Task 1, refined in Tasks 2–4. |

Everything else this plan touches is verification.

---

### Task 1: Port the skill and cut what does not apply here

**Files:**
- Create: `.claude/skills/intent-to-proposal/SKILL.md`

**Interfaces:**
- Consumes: the source file named under **Source** above.
- Produces: a skill file containing no `{{TOKEN}}` and no reference to a tool, tracker or agent that does not exist in this repo.

- [ ] **Step 1: Copy the source verbatim**

```bash
cd /Users/arman/Documents/GitHub/nullius
mkdir -p .claude/skills/intent-to-proposal
cp ~/Documents/GitHub/nullius-vendor/openspec-pipeline-export/.claude/skills/intent-to-proposal/SKILL.md \
   .claude/skills/intent-to-proposal/SKILL.md
wc -l .claude/skills/intent-to-proposal/SKILL.md   # expect 584
```

Copy first, cut second, and commit the copy before cutting if you like — a clean diff of "what the export said" against "what we kept" is worth having.

- [ ] **Step 2: Cut the proposal-metadata machinery**

Delete these sections entirely:

- `## Proposal metadata — every proposal carries an ID, a model, and its dependencies`
- `### Model assignment (one per proposal)` (inside Phase 4)
- `### Dependency graph (decides `depends_on`)` (inside Phase 4)
- `### Assign the stable ID, model, and dependencies (immediately after scaffold)` (inside Phase 5)

Then remove the `id` / `model` / `depends_on` references that survive in Phase 2's survey question 3, in Phase 4's decision rule, and in the "Completing the skill" summary and its multi-proposal table.

**Why this goes:** those three fields exist so autonomous agents can pick proposals up in dependency order, and the only thing that reads them is `proposal-to-pr`'s dependency gate, which this repo does not have. The design doc records the reasoning; adopting the convention is a separate decision from adopting the skill, and adopting it before its consumer exists would make it the repo's second unproduced schema.

Leave Phase 2's survey question about *overlapping and conflicting active changes* in place — that is useful without the metadata. Only the `.openspec.yaml` id-harvesting half goes.

- [ ] **Step 3: Cut the tracker integration**

In `## Completing the skill`, delete item **6** (the Jira create-or-reuse block) in full, and drop the `Metadata:` item that reports id/model/depends_on. Keep items 1, 2, 3 and 5, renumbering. Keep the **"Before handing off — branch hygiene"** paragraph verbatim — it is repo-agnostic and its warning is real.

This removes `{{TRACKER_PROJECT_KEY}}` and `{{TRACKER_TRANSITION_PROPOSAL_READY}}`.

- [ ] **Step 4: Cut the product skeptic and the retro**

Delete `### Step 3 — Product skeptic (dispatch `pragmatist-pm` in parallel with devil's advocate, conditionally)` and renumber Step 4 to Step 3. In the new Step 3, drop "all three inputs" to the two that remain.

Delete `## Final step — Retro` in full.

**Why:** `pragmatist-pm` and `retro-writer` are both agents this repo does not have. A dispatch naming an agent with no definition file does not error — it no-ops, and the run reports a completed step having done nothing. That is the exact failure `nullius wiring` was built to catch, and shipping one into the repo that just built it would be absurd. The retro comes back with the retro spine, which is a later phase and brings `retro-writer` with it.

- [ ] **Step 5: Substitute or remove the last two tokens**

`{{CODEGEN_CMD}}` — this repo has no codegen step. Delete the surrounding instruction rather than substituting an empty string.

`{{CLAIMS_CHECKER_CMD}}` — **delete the whole claims-check block it sits in**, including the sentence introducing it and the verdict table beneath it. Task 2 writes that block fresh against the real checker.

Do not leave the token in place for Task 2 to substitute. This file becomes a scanned harness artifact the moment it lands, and a surviving `{{TOKEN}}` is a hard `UNSUBSTITUTED-TOKEN` failure — so leaving it would mean committing a state where this repo's own gate is red. Verified: `nullius wiring` exits 1 on exactly that shape.

- [ ] **Step 6: Verify no token survives except the one Task 2 owns**

```bash
grep -n '{{' .claude/skills/intent-to-proposal/SKILL.md
pnpm build && node packages/claims/dist/cli.js wiring
```

Expected: **no output from the grep**, and `wiring` exits 0. Every token must be gone by the end of this task, because the gate runs on the committed state and a surviving placeholder fails it.

- [ ] **Step 7: Confirm no dangling agent survives**

```bash
grep -nE 'pragmatist-pm|retro-writer|jira|Jira|JQL' .claude/skills/intent-to-proposal/SKILL.md
```

Expected: no output.

- [ ] **Step 8: Commit**

```bash
git add .claude/skills/intent-to-proposal/SKILL.md
git commit -m "feat(skills): port intent-to-proposal, minus tracker, metadata and missing agents"
```

---

### Task 2: Wire the grounding to this repo's real machinery

**Files:**
- Modify: `.claude/skills/intent-to-proposal/SKILL.md`

**Interfaces:**
- Consumes: Task 1's output.
- Produces: a skill whose every grounding reference resolves to a file or command that exists here.

- [ ] **Step 1: Find every foreign reference**

```bash
grep -nE '\.claude/rules/|CLAIMS_CHECKER|proposal-grounding|backend-graphql' \
  .claude/skills/intent-to-proposal/SKILL.md
```

You should find two kinds: citations of `.claude/rules/proposal-grounding.md` and one citation of `.claude/rules/backend-graphql.md`. The claims-check block is gone — Task 1 deleted it rather than leaving a token behind, so Step 4 below writes it fresh rather than substituting into it.

- [ ] **Step 2: Repoint the grounding rule**

Every `.claude/rules/proposal-grounding.md` citation becomes a citation of `plugin/skills/evidence-anchors/SKILL.md` — this repo's authoring rule for Evidence Anchors, which is the same convention the export forked. Read that file before you rewrite the sentences around the citations, so the wording matches what it actually says rather than what the export's fork said.

The one that needs the most care is in Phase 2's "The survey discovers; the coordinator verifies" — that paragraph is the reason this skill is worth porting at all, and it must still read correctly when it points at a different document.

- [ ] **Step 3: Cut the GraphQL rule citation**

Phase 3 Step 1 cites `.claude/rules/backend-graphql.md §Cross-Service Data Access` and the federation red flag. This repo has no GraphQL, no federation and no services. Delete that clause and the "data from another service" example around it.

Phase 2's red-flag table has the same problem — see Task 3, which owns it.

- [ ] **Step 4: Write the claims-checker block**

Task 1 deleted the export's version along with its token. Write this one against the real command. From the repo root the checker runs from `dist/`, and the glob for one change is its folder:

```bash
node packages/claims/dist/cli.js check "openspec/changes/<name>/**/*.md"
```

Keep the surrounding sentence — "`openspec validate` checks structure, not truth" — it is exactly right and it is why the two commands are both here.

Then reconcile the verdict table beneath it against what this checker actually emits. The export's table lists `FABRICATED` / `COUNT-MISMATCH` / `MISSING-FILE`. Run the real thing and read its verdicts rather than trusting that list:

```bash
node packages/claims/dist/cli.js check --help
```

and consult `spec/evidence-anchors.md` for the full verdict set and which are hard versus advisory. A table naming verdicts the tool does not emit is a false claim about the codebase in a file this repo's own checker will read.

- [ ] **Step 5: Verify every referenced path resolves**

```bash
grep -oE '`[A-Za-z0-9_./-]+\.(md|ts|json|sh)`' .claude/skills/intent-to-proposal/SKILL.md \
  | tr -d '`' | sort -u | while read -r p; do
      [ -e "$p" ] || echo "UNRESOLVED: $p"
    done
```

Every line it prints is either a path to fix or a genuinely illustrative example. Illustrative examples are fine — they become advisory `LOOSE-REFERENCE` findings, not failures — but decide deliberately for each, and prefer an example that does resolve where one exists.

- [ ] **Step 6: Build and run the checker over the repo's own tree**

```bash
pnpm build
node packages/claims/dist/cli.js wiring
```

Expected: exit 0. The advisory count will have risen from 12 by however many illustrative paths you kept — that is expected. **A hard verdict is not**: it means a token survived or a declared reference does not resolve.

- [ ] **Step 7: Commit**

```bash
git add .claude/skills/intent-to-proposal/SKILL.md
git commit -m "feat(skills): point intent-to-proposal's grounding at the kernel checker"
```

---

### Task 3: Reshape the templates and the red-flag table for this repo

**Files:**
- Modify: `.claude/skills/intent-to-proposal/SKILL.md`

**Interfaces:**
- Consumes: Task 2's output.
- Produces: generation templates that describe work this repo actually does.

- [ ] **Step 1: Replace the three `tasks.md` templates**

Phase 5 carries three skeletons — backend/domain, frontend, and infra — shaped for aggregates, commands, events, projections, GraphQL schema and resolvers, Terraform and k8s. None of that exists here.

Replace them with skeletons for the shapes this repo actually ships. Derive them from real evidence rather than from imagination: read `openspec/changes/archive/2026-08-22-add-wiring-check/tasks.md`, and one or two other archived changes, and write skeletons that match how work here is genuinely decomposed.

The shapes to cover, based on what the archive shows:

- **A kernel checker change** — a verdict added to a checker in `packages/claims`: spec delta, the verdict and its predicate, unit tests per verdict, valid and broken fixtures, a CI gate, exports and changelog.
- **A kit or CLI change** — a command or harness integration in `packages/kit` or `plugin/`: the command, its arg parsing, hook wiring where relevant, and its fail-open behaviour.
- **A spec-family or convention change** — a document under `spec/` plus whatever enforces it, remembering that `spec/**/*.md` is checked with `--require-markers`, so such a document must carry an Evidence Anchor.

Keep the export's "Skeleton vs. filled" guidance verbatim — the judgement it encodes, that a skeleton is enough when the design is still open and real tasks are better when the survey made the work mechanical, is not stack-specific.

- [ ] **Step 2: Replace the red-flag table in Phase 2**

Phase 2's survey question 5 lists characteristic show-stoppers per change type: a federation red flag, Terraform placeholder defaults, an Apollo cache break. All are foreign.

Write the equivalents for this repo — the show-stoppers a survey here should detect early. Draw them from what this project has actually been bitten by, which is written down: read `CLAUDE.md` and the "Failure modes" section of `docs/adopting-the-pipeline.md`, and consider at minimum:

- **A checker change:** does it grow an exported union that is public API? `Verdict` in `packages/claims/src/checkClaims.ts` is the known case, and growing it is breaking.
- **A change that adds a verdict:** is there both a fixture that trips it and a unit test asserting it? CI checks only a fixture's exit code, which stays 1 when a verdict goes quiet.
- **A document change:** does it assert something about existing code without an anchor? Prose beside an anchor inherits none of its authority.
- **A harness-artifact change:** does it put a `.claude/` file somewhere the harness will register as live configuration? Committing fixtures under `spec/fixtures/` did exactly that once.

Write them as the export wrote its own — one row per change type, each naming a concrete detectable condition, not a category.

- [ ] **Step 3: Verify**

```bash
pnpm build && node packages/claims/dist/cli.js wiring
```

Expected exit 0, no hard verdicts.

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/intent-to-proposal/SKILL.md
git commit -m "feat(skills): reshape intent-to-proposal's templates and red flags for this repo"
```

---

### Task 4: Add the post-generation audit, and the boundary with `openspec-propose`

**Files:**
- Modify: `.claude/skills/intent-to-proposal/SKILL.md`

**Interfaces:**
- Consumes: Task 3's output.
- Produces: the two additions that are this repo's own, rather than the export's.

- [ ] **Step 1: Add the audit pass**

The skill already runs a claims check after generation, which verifies that each anchor's quoted text is where the anchor says it is. That is not the same question as whether the line supports the sentence above it.

This repo ships a command for the second question. Read `plugin/commands/audit.md` before writing this step, and add a subsection to `## Completing the skill`, after the claims check, that dispatches it against the generated proposal.

State plainly in that subsection what the two passes do differently, because a reader who thinks they are redundant will drop one: `check` proves the citation is real; `/audit` sends each claim to its own agent, starved of the surrounding document and told to refute it, and refutations come back as anchors the checker then re-verifies.

Note also — the design doc records this and it is worth repeating in the skill — that this is a *different* pass from Phase 3's devil's advocate, which critiques the idea before any artifact exists. Same doctrine, different input, different moment.

- [ ] **Step 2: Add the boundary with `openspec-propose`**

This repo already has `.claude/skills/openspec-propose/SKILL.md`, and the export's skill declares itself a replacement for the command that skill wraps. Two skills cannot own the same moment without both being ignored.

Add a short section near the top stating the split: `openspec-propose` scaffolds a change whose shape is already decided; `intent-to-proposal` owns the case where the idea is still raw and the survey, the refutation and the decomposition are the point. Read `.claude/skills/openspec-propose/SKILL.md` first so the description of it is accurate rather than assumed.

Delete the export's own line about replacing `/opsx:propose` — that was true of its repo, and here it would be a false claim about a skill that keeps its job.

- [ ] **Step 3: Verify**

```bash
pnpm build && node packages/claims/dist/cli.js wiring
```

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/intent-to-proposal/SKILL.md
git commit -m "feat(skills): add the audit pass and the openspec-propose boundary"
```

---

### Task 5: Run it, on a real idea

**Files:**
- Creates: one change folder under `openspec/changes/`, as output of the run.

**Interfaces:**
- Consumes: everything above.
- Produces: evidence that the skill works, or a list of what is wrong with it.

A port that is never run is a port nobody has checked. This task is the only one that tests the thing rather than its references.

- [ ] **Step 1: Full verification sweep first**

```bash
cd /Users/arman/Documents/GitHub/nullius
pnpm build && pnpm type-check
node packages/claims/dist/cli.js wiring
node packages/claims/dist/cli.js check 'README.md' 'spec/**/*.md' --require-markers
node packages/claims/dist/cli.js check 'openspec/**/*.md'
```

All exit 0.

- [ ] **Step 2: Confirm the harness registered the skill**

The skill only works if Claude Code discovered it. Confirm it appears in the available-skills listing before invoking it — a skill file the harness never read is a file, not a skill.

- [ ] **Step 3: Run it on this idea**

> Several inputs make this checker go silent rather than report: a hooks or settings JSON file that fails to parse, a markdown artifact whose frontmatter fence is never closed, and a hook command the resolver declines. Each is individually documented as a limitation. Together they are a coherent gap in a checker whose product is loudness, and closing them needs verdict vocabulary the command does not have.

That idea is real, small, and already written down as the natural follow-up in `spec/wiring.md` and in the Phase 0 ledger — so the survey has something true to find, and you can judge the output against what you already know is there.

- [ ] **Step 4: Judge the run, not the idea**

Record, in the report:

- Did Phase 2's survey find the three silent inputs, and did it produce **anchors** for them rather than prose?
- Did Phase 3's devil's advocate return something the survey had not already said? An advocate that echoes the survey is a starved brief that was not actually starved.
- Did Phase 4 reach a decomposition decision, and was it defensible?
- Did the generated proposal pass `check` and `/audit` without hand-editing?
- What did you have to do by hand that the skill should have done?

- [ ] **Step 5: Decide what to do with the output**

The change folder is a real artifact. Either keep it — it is genuine work this repo wants — or delete it and say so. Do not leave it uncommitted and unmentioned.

- [ ] **Step 6: Commit the skill fixes the run exposed**

A first run always exposes something. Fix what it found in the skill file, and commit that separately from the run's output so the two are reviewable apart.

---

## Notes for the executor

**The one thing most likely to go wrong** is Task 2 Step 4's verdict table. The export's list of verdicts came from its own fork of the checker, and this repo's kernel has a different and larger set. Writing that table from the export's version, or from memory, puts a false claim about this codebase into a file this codebase's checker reads. Run the tool and read `spec/evidence-anchors.md`.

**Do not add frontmatter `dispatches:` or `reads:` keys** to make the skill look well-declared. Those are hard-verdict fields: a declared reference that does not resolve fails the build. The skill dispatches generic agents, which have no definition file to point at, and declaring them would break the very check this repo just shipped.

**If a cut turns out to be load-bearing** — if removing the metadata machinery leaves Phase 4's decomposition decision incoherent, for instance — stop and report it rather than reinstating a convention this repo has no consumer for. The decomposition decision surviving without ids is an assumption in the design doc, and it is allowed to be wrong.
