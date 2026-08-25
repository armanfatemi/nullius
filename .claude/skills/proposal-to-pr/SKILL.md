---
name: proposal-to-pr
description: Drive an OpenSpec change from proposal to merge-ready PR. Reads `openspec/changes/<name>/`, blocks at Stage 1 until every prerequisite named in the proposal's `> **Depends on:**` blockquote has reached `main`, plants a canary and runs parallel reviews on the proposal, refines until zero blockers, implements each task, verifies with an auto-fix loop that knows the ugrep baseline, re-reviews the diff, and opens a PR seeded with review evidence. Never merges. Resumable — state persists in `.git/nullius/pipeline/<name>.state.json`.
dispatches:
  - rule-auditor
  - architecture-reviewer
  - checker-engineer
  - test-engineer
  - retro-writer
---

# OpenSpec → PR pipeline

The umbrella orchestrator for taking an OpenSpec change from proposal to
merge-ready PR. It is a skill rather than a shell script because a handful of
its steps need judgement — which reviewers have something concrete to look at,
whether a blocker has actually been addressed, whether a failing test is a
wrong expectation or a real bug.

Everything else is not judgement, and does not live here. Every decision that
can be settled by re-reading an artefact belongs to `nullius-kit pipeline`,
which is TypeScript under `pnpm test`: what a change touches, which reviewers
those paths earn, whether a pause box is unchecked, whether a command is
human-only, what the resume state is. **That split is the point.** A routing
row decided by a model is a review stage that dispatches nothing and reports
success, which is the one failure this repository exists to make impossible.

## First-run note — verify, do not assume

Older harnesses loaded the agent registry once at session start, so an agent
file added mid-session was not dispatchable and the call failed with
`Agent type 'retro-writer' not found`. Measured here, that is no longer true:
`retro-writer.md` landed and was dispatchable in the same session.

Treat the restart advice as a claim about a harness version, not a law. The
durable instruction is the check: **ping the agent with a one-word dispatch
before relying on it.** If the ping returns, proceed; if it fails, start a
fresh session.

## Inputs

Required: a change name that resolves to `openspec/changes/<name>/` containing
at least `proposal.md`, `design.md`, and `tasks.md`.

Optional flags surfaced in the invocation:

- `--from-stage <stage>` — resume from a specific stage (defaults to the stored stage, or 1)
- `--no-auto-fix` — disable the Stage 5 auto-fix loop (single attempt only)
- `--dry-run` — run reviews and report blockers; do not edit code or open a PR
- `--max-refine 3` — cap pre-review refinement iterations (default 3)

## The two command lines

Every deterministic step is one of two binaries. Both run from **the repository
root**, and both run out of `dist/`:

```
node packages/kit/dist/cli.js pipeline <subcommand> [<change>]
node packages/claims/dist/cli.js <check|witness|wiring|canary> ...
```

Shell state does not survive between tool calls, so do not stash these in a
variable and expect it to be there next call — write them out each time, or
re-export in the same call.

**`pnpm build` before the first invocation of either.** This is Stage 1's first
step and it is not a formality: the CLIs execute compiled output, so an unbuilt
tree runs the *previous* build of the checker against the *current* repository
and reports success. That is this repository's cardinal failure — a green result
standing in for a check that never happened — reproduced inside the orchestrator
whose whole job is to prevent it.

The kit's subcommands:

```
list-changes                  every openspec/changes/<name>/
show <change>                 the change's artefacts; exit 1 if incomplete
state-get <change> [key]      read resume state
state-set <change> <k> <v>    write one key
state-reset <change>          wipe state for this change
pause-check <change>          exit 1 on an unchecked Human Approval box
blocked-commands <change>     exit 1 and print HUMAN: <cmd> for each
touched-areas <change>        repo-relative paths the change names
depends-on <change>           the > **Depends on:** blockquote, one per line
route <change>                the agents this change earns: cited paths
                              unioned with its own artefacts
route-paths                   the agents these paths earn — exactly the ones
                              given on stdin, nothing injected
dep-status <change>           exit 0 only if provably archived
classify-compare <status>     landed | orphaned | unknown; exit 0 on landed
evidence-append <change> <h>  read a section from stdin
evidence-print <change>       print accumulated review evidence
progress-write <change>       overwrite progress.md from stdin
```

**Exit codes are the contract.** `pause-check`, `blocked-commands` and
`dep-status` return 1 when they find something. Read the code, not the prose on
stdout.

## Hard rules (do not violate)

1. **Never merge.** The terminal state is *PR open and retro written*. Merge is
   the human's decision, and every anchor stamp in the change depends on how it
   is made — a squash orphans the commits those stamps name.
2. **Never bypass a pause gate.** An unchecked `## Human Approval Required`
   block halts the pipeline. Save state, surface the gate, stop.
3. **Never run a blocked command.** `blocked-commands` names them; they are
   human-only for reasons written down in `.claude/rules/`.
4. **Never archive.** Stage 1 treats a directory under
   `openspec/changes/archive/` as proof its change merged. A run that could
   archive its own change could satisfy its own dependents with nothing landed.
5. **Never write hook entries into `.claude/settings.json`.** One delivery
   mechanism per artefact — the plugin owns the hooks.
6. **Never repoint a line number under an old stamp.** Re-read and re-stamp both
   halves, or leave the citation alone.
7. **Never delete a state file.** Use `state-reset` only at the user's explicit
   request.
8. **Never push to `main`, force-push, or disable hooks** (`--no-verify`).
9. **Never skip Stage 5 verification.** Even with `--no-auto-fix` the checks
   still run; you simply do not iterate on failures.
10. **Never start implementation while a dependency is unsatisfied.** Stage 1's
    gate is not advisory.

## Stage machine

State lives at `.git/nullius/pipeline/<change>.state.json` — machine-local, so
it needs no `.gitignore` entry and introduces no second convention:

**Evidence:** `packages/kit/src/pipeline.ts:251@437aeb6` — `join(root, ".git", "nullius", "pipeline",`

```
Stage 1: Load        (pnpm build, artefacts, dependency gate)
Stage 2: Pre-review  (grounding gate, canary, parallel agents)
Stage 3: Refine      (loops back to Stage 2 if blockers remain, bounded)
Stage 4: Implement   (per-task)
Stage 5: Verify      (build + type-check + test + dogfood gates, auto-fix loop)
Stage 6: Post-review (parallel agents, routed on the diff)
Stage 7: Address-must-fixes (loops back to Stage 5 once)
Stage 8: PR          (open with synthesized evidence)
Stage 9: Retro       (dispatch retro-writer; never blocks or gates the PR)
```

**State keys** — written on every stage transition, one `state-set` per key:

```
change                 the change name
stage                  load | pre-review | refine | implement | verify |
                       post-review | address-must-fixes | pr | retro | done
iteration              refinement round counter
paused                 true | false
pause_reason           see Resume semantics
created_at/updated_at  ISO timestamps
touched_areas          comma-joined repo-relative paths
depends_on             comma-joined change names
feature_branch         feat/<change>
pr_base_branch         main
stacked_on             a base branch other than main, or unset
pr_url                 set at Stage 8
sub_phase              the current task-section, e.g. "routing-table"
sub_phase_progress     "4/7 tasks — table + tests done; CLI adapter pending"
human_commands         from blocked-commands, if any
probe                  caught | missed | tainted | not-planted
```

`sub_phase` and `sub_phase_progress` are written after every task-section commit
in Stage 4. They are the resume anchor for a within-Stage-4 handoff: a fresh
session reads them alongside `progress.md` and knows exactly where to pick up.

On a fresh invocation with no stage argument, resume from the stored stage,
defaulting to Stage 1 when no state exists.

### Evidence-append contract — every narrative append ends with corrections

`review-evidence.md` is committed into the change folder, so it travels with the
PR and is still there when the Stage 9 retro arrives. Unlike the state file it
is not a resume aid — it is the permanent record.

Its failure mode is specific and was observed in the pipeline this one was
ported from: **every append is shaped as "what the reviewers said," so there is
no heading under which "what the coordinator got wrong" would land, and it lands
nowhere.** A coordinator error then reaches the file only when an external
system forces it into the narrative — CI going red, or a reviewer contradicting
it in a report pasted in verbatim. Errors the coordinator notices and corrects
on its own leave no trace at all, and that is precisely the class the retro
exists to surface.

**The rule.** Every **narrative** `evidence-append` — the Stage 2 and Stage 6
syntheses, and any ad-hoc append — MUST end with:

```markdown
## Coordinator corrections since last append

- <what you asserted, what was actually true, how it was caught, what changed>
```

**Writing `None.` is a valid answer. Writing nothing is not.** The point is to
convert a silent omission into an explicit claim someone can disbelieve.

Record all three classes, not just the first:

1. **Claims that proved wrong** — including ones a reviewer caught. Say what you
   had asserted, not merely what turned out to be true.
2. **Reversals you caught yourself** — reasoning that would have produced a
   regression, abandoned before acting. A rejected reviewer suggestion belongs
   here too: "the reviewer was wrong and here is why" is a data point the retro
   cannot obtain anywhere else.
3. **Process errors** — a verify scoped too narrowly, a skipped step, a stage
   run out of order.

**When a reviewer finding contradicts something you asserted, tag it inline in
the synthesis** as `[corrected-coordinator]`. Without the tag it reads as a
routine catch, and nothing downstream can distinguish "the reviewer found a
latent defect" from "the reviewer stopped the coordinator shipping a wrong
claim."

**Stage 5 verify blocks are exempt.** They are mechanical pass/fail records that
fire once per chunk; appending `None.` to each would bury the signal under
repetition, and the section is only worth reading because it is rare. Nothing is
lost: a correction discovered *during* verify is governed by the rule below,
which requires its own ad-hoc append, and that append is subject to this
contract.

**Append at the moment of correction, not at the stage boundary.** Whenever you
tell the user "I was wrong" or reverse a position, append it *then*.
End-of-stage recall is exactly when compaction has already eaten the detail —
which is the same reason Stage 9 is told not to trust your summary.

### Two resume artifacts, both maintained

- **`.git/nullius/pipeline/<change>.state.json`** — machine-readable, owned by
  this skill, never committed. Written with `state-set`.
- **`openspec/changes/<change>/progress.md`** — the human-readable companion,
  **committed**, so it travels in the PR diff and is archived with the change.
  Write it with `progress-write` (markdown on stdin), never with the Write tool
  — the helper is the same write path used for state and evidence, and it
  avoids a per-write permission prompt.

Update **both** at every stage transition. Structure for `progress.md`:

```markdown
# Progress — proposal-to-pr: <change>

_Started <ISO date>; last updated <ISO date>_

## Phases completed

- [x] Stage 1: Load — done <date>

## Current phase

**Stage 3 (Refine)**, sub-step: addressing blocker #2 from architecture-reviewer

## Next 3 actions

1. Edit design.md to argue the new verdict's PASSING placement
2. Re-dispatch architecture-reviewer + checker-engineer for iteration 2
3. If zero blockers, advance to Stage 4

## Integration points the next session needs to read on resume

_At most five files whose shape the resuming session must understand before
touching anything. Update at every commit._

- packages/claims/src/checkClaims.ts — the verdict union and the PASSING set
- packages/kit/src/pipeline.ts — the routing table; one test per row

## Pending user decisions

- Whether the new verdict hard-fails or joins PASSING (asked at iteration 1)
```

## Coordinator context budget and session handoff

The orchestrator's own conversation is the scarce resource. Subagents isolate
their *reading*, but their returns and your re-reads accumulate in *your*
context for the whole run. Stage 4 is the longest stage; without discipline the
coordinator fills up and the run degrades into lossy compressed context.

**Compress on every advance:**

- After synthesizing a review round, write the FULL synthesis to
  `review-evidence.md` with `evidence-append`, then keep only a **one-line
  recap** in the conversation. Do not retain the long synthesis inline.
- Reference files by `path:line`; never re-quote their contents.
- Capture verify output to a file and read only the failing lines. Never paste a
  full passing log into the conversation.
- Push concrete work through a subagent in Stage 4 so file-reading and edit churn
  stay out of the coordinator's context. Reserve inline work for one-liners.

**Session handoff is first-class, not a failure.** A deliberate re-invoke
re-reads state plus `progress.md` and restarts from a known-good point;
automatic mid-run compaction is lossy and can drop which task you were on. Past
roughly half the context budget, **hand off at a clean boundary — never
mid-task:**

1. Finish the current task-section: committed, Stage 5 green, `tasks.md` ticked.
2. Update BOTH the state file and `progress.md`.
3. Tell the user exactly where it resumes, and stop. Do not start the next chunk
   in degraded context.

---

## Stage 1 — Load

**Step 0, before anything else: `pnpm build`.** The pipeline is about to run
nullius CLIs to check its own work. See "The two command lines" above for why
this is a gate rather than a courtesy.

1. Confirm the change exists and is complete:
   `node packages/kit/dist/cli.js pipeline show <change>`. Exit 1 means an
   artefact is missing — bail with the message it printed.
2. Read `proposal.md`, `design.md`, `tasks.md`, and anything under `specs/`.
3. `openspec validate <change>` — confirm the OpenSpec CLI agrees the artefacts
   are well-formed. Note: its requirement check reads **only the first line** of
   a requirement body when looking for SHALL/MUST, so a modal verb that wrapped
   to line 2 fails with a misleading "must contain SHALL or MUST". The fix is a
   moved line break, never a second SHALL.
4. Derive the touched-areas set:
   `node packages/kit/dist/cli.js pipeline touched-areas <change>`. Save it to
   state under `touched_areas`.
5. `node packages/kit/dist/cli.js pipeline pause-check <change>`. Exit 1 → save
   `paused=true`, `pause_reason=human_approval_required`, surface the unchecked
   items, **stop**.
6. `node packages/kit/dist/cli.js pipeline blocked-commands <change>`. Exit 1 →
   save the list under `human_commands`. Do **not** stop here — these are noted
   now so the relevant tasks can be flagged in Stage 4. The pipeline pauses only
   when one of those commands actually needs to run.
7. Record `feature_branch` as `feat/<change>` and `pr_base_branch` as `main`
   unless the user says otherwise.

### The dependency gate

`node packages/kit/dist/cli.js pipeline depends-on <change>` parses the
proposal's `> **Depends on:**` blockquote and prints one prerequisite per line.
Each name **is a change directory name** — there is no id indirection to
resolve. "None" yields no lines.

For each dependency name, decide whether it is **satisfied**:

**(a) Archived.** `node packages/kit/dist/cli.js pipeline dep-status <dep>`
exits 0 only when `openspec/changes/archive/<dep>/` exists. That is the whole
filesystem-answerable half, and exit 0 ends the question.

**(b) Merged and provably on `main`.** Exit 1 from `dep-status` means "not
provably satisfied", not "unsatisfied" — the PR half needs a network call the
kit deliberately does not make. Read the dependency's own state file for a
`pr_url`:

```bash
node packages/kit/dist/cli.js pipeline state-get <dep> pr_url
```

If there is one, `MERGED` alone is **not** proof it reached `main`. A PR based
on a feature branch merges into *that branch*; if the base merged to `main`
first, the commits never reach `main` while `gh` still reports `MERGED`. Check
via the compare API — **not** a local `git merge-base`, because in the orphaned
case the merge commit is frequently absent from the local object store
(reachable only from a branch never fetched, or since deleted), making
`git merge-base --is-ancestor` exit `fatal: Not a valid object name` instead of
a clean false:

```bash
gh pr view <pr_url> --json state,baseRefName,mergeCommit
STATUS=$(gh api "repos/armanfatemi/nullius/compare/main...<mergeCommit.oid>" --jq '.status')
node packages/kit/dist/cli.js pipeline classify-compare "$STATUS"
```

`classify-compare` prints `landed` / `orphaned` / `unknown` and exits 0 only on
`landed`. The model performs the I/O; tested code interprets the result.

This matters more here than in the pipeline it was ported from. A PR that merges
into a feature branch and never reaches `main` leaves every anchor it stamped
pointing at a commit the clone cannot resolve — and the checker's response is to
*fail open* with the advisory `UNVERIFIABLE-REV`. The gate goes quiet and the
build stays green.

**Both non-`landed` verdicts count UNSATISFIED, with distinct messages:**

- `orphaned` — the fix is a cherry-pick, not re-implementation:
  > `<dep>` merged into `<baseRefName>` but never reached `main` (orphaned
  > stacked PR). Recover it first: branch off `main`, cherry-pick its content
  > commits, re-PR.
- `unknown` — an inconclusive check is never treated as satisfied:
  > Could not determine whether `<dep>` reached `main` (compare status
  > `<STATUS>`). Resolve this by hand before starting.

**If any prerequisite is unsatisfied — or names a change that does not exist —
the pipeline MUST NOT proceed.** Save `paused=true`,
`pause_reason=unsatisfied_dependency:<dep>`, record the unmet names, and
surface: "This change depends on `<dep>`, which has not reached `main`. Land it
first, then re-invoke." **Stop here** — the whole pipeline halts, so no review
or code effort is spent on a change that cannot legally start.

State transition: `stage: load` → `stage: pre-review`.

---

## Stage 2 — Pre-review and probe

Goal: catch architectural drift, rule violations and false premises **before**
writing code. The cheapest place to fix a design problem is in the proposal.

### Step 0 — grounding gate (before dispatching anyone, and before planting)

```bash
node packages/claims/dist/cli.js check 'openspec/changes/<change>/**/*.md'
```

This re-reads every `**Evidence:**` anchor in the change's docs against the
actual file. It is deterministic and costs seconds.

- **Non-zero exit → go straight to Stage 3** without dispatching anyone. Fixing
  a false premise changes the design the reviewers would be reading, so
  reviewing first wastes a full parallel round. Note in the evidence file which
  claims failed.
- **A `FABRICATED` verdict is not a citation typo.** Re-examine the decision
  that claim was supporting; it was load-bearing enough to be written down.
- **A change with no grounding markers at all is not a pass.** It means the
  design asserted things about the codebase without citing any of them. Carry
  that into the reviewer briefs below.

Run this **before** the canary is planted. A planted document fails `check` with
`CANARY-PRESENT` by design, and that merge guard firing here would tell you
nothing about the proposal.

### Step 1 — the reviewer set

Routing is not yours to decide. Ask the router:

```bash
node packages/kit/dist/cli.js pipeline route <change>
```

One call, and it is the whole answer. `route` unions two things: the paths the
proposal and tasks *cite*, and the change's own three artefacts. The second half
matters because a change's artefacts are part of what is under review at Stage 2
and are `openspec/` paths, so they earn `architecture-reviewer` whether or not
the proposal happens to cite one. A proposal that names no `openspec/` path
would otherwise silently lose the reviewer whose subject is the prose invariants
— a review that reports success and did not happen — and on this repository's
own corpus that is not hypothetical.

Do not compose that union yourself, and do not reach for `route-paths` here.
`route-paths` routes exactly the paths it is given and injects nothing, which is
what Stage 6 needs from a diff.

`rule-auditor` is unconditional and that is deliberate, not a shortcut: deciding
whether a rule applies means matching its `applies_to` globs, which is the
kernel's job. The pipeline does not grow a second copy; it dispatches the agent,
which globs for itself.

### Step 2 — selective-dispatch pre-flight (required before any Agent call)

The router produces a **candidate** list, not a dispatch list. Before any
`Agent` call:

- Build a `| candidate | one-line justification SPECIFIC to this change | keep/drop |` table.
- **Specificity test:** a justification naming the concrete file, pattern or risk
  this agent will look at survives. A generic one ("reviews the kernel", "checks
  the tests") is dropped — that agent has nothing change-specific to do.
- Drop any candidate whose justification duplicates a more specific survivor's.
- Dispatch only the survivors, in a single parallel message.

Value comes from agents with a concrete piece to examine, not from agent count.
Full doctrine lives in the `advise-specialized-agents` skill under
"Pre-flight before dispatch (required)"; read it only if the summary above is
insufficient.

State which agents survived and which were dropped, and why, in your stage
banner before the `Agent` calls fire.

### Step 3 — plant the canary

The review layer is **measured** on every run rather than assumed alive. The
window is serial, because the registry holds exactly one canary:

```bash
node packages/claims/dist/cli.js canary plant openspec/changes/<change>/proposal.md
```

It prints `planted <doc>:<line>`. **Record where.** Open the document, find the
nearest preceding `##` heading, and note both — you will write them into the
evidence file in Step 6, and once `canary clear` has run the information is
unrecoverable.

This is not bookkeeping. `MISSED` has two causes that propose opposite fixes: a
review layer that has gone quiet, or a claim planted outside every dispatched
reviewer's declared scope, which is a probe-placement defect. After `clear`,
nothing on disk distinguishes them. One line at plant time; unrecoverable
afterwards.

**If `plant` fails, note it and run unprobed.** Instrumentation must never be
able to block shipping. Set `probe=not-planted` in state and record the reason
in Step 6 — that is a legitimate outcome, not a finding.

### Step 4 — dispatch, in parallel, in one message

Brief each survivor with:

- Phase: `pre-review (plan)`
- The change directory path
- The rule files and docs relevant to that agent
- A specific focused question (the brief template lives in
  `advise-specialized-agents`)
- "Report in under 400 words. Mark findings as `[false-premise]`, `[blocker]`,
  `[concern]`, or `[looks-good]`."
- **The descriptive question, verbatim, in every pre-review brief:** _"Separately
  from whether the plan is correct: is what this document says about the
  **existing** codebase actually true? Open the cited files. Flag any
  load-bearing claim that is uncited, contradicted by the code, or whose named
  binding moment is wrong, as `[false-premise]` — including when the conclusion
  it supports still looks right."_

  Every other instruction in this pipeline is normative, and a false premise
  supporting a correct conclusion is invisible to a normative reviewer. Do not
  paraphrase it away.

**Never tell a reviewer a canary was planted.** A brief that mentions the probe
produces a report that names the probe machinery, which scores `TAINTED` — void,
not passed.

Dispatch in the background where the harness supports it and use the wait
productively: read integration-point files, draft the `progress.md` update,
sketch the synthesis structure.

### Step 5 — synthesize, then score the probe

Synthesize the returns: deduplicate, group by severity, resolve conflicts
explicitly, cite the source agent. Write the synthesis to a file and score it:

```bash
node packages/claims/dist/cli.js canary verify /tmp/stage2-synthesis.md
node packages/claims/dist/cli.js canary clear
```

**Evidence:** `packages/claims/src/cli.ts:81@437aeb6` — `exit 0 CANARY-CAUGHT, 1 CANARY-MISSED, 3 CANARY-TAINTED`

- exit 0 → `caught`. The review layer was measured alive **on this run**. That
  is all it establishes; it is not evidence the review was thorough.
- exit 1 → `missed`. Record it and keep going.
- exit 3 → `tainted`. A report named the probe machinery, so the result is void.
  **Never record a tainted run as caught.**

**`canary clear` is mandatory before Stage 3**, and it runs whatever the verdict
was. A canary left planted fails `check` at Stage 8 with `CANARY-PRESENT` — the
merge guard doing its job at exactly the wrong moment.

Stage 6 stays unprobed. One probe per run keeps the score interpretable and the
single-slot registry uncontended.

### Step 6 — record both

Two appends. The synthesis:

```bash
node packages/kit/dist/cli.js pipeline evidence-append <change> "Stage 2 — Pre-review iteration N" < /tmp/stage2-synthesis.md
```

It MUST end with `## Coordinator corrections since last append` (`None.` is
valid; silence is not), and any finding contradicting something you asserted MUST
be tagged `[corrected-coordinator]`.

Then the probe, under its own heading, which `retro-writer` reads by name:

```bash
node packages/kit/dist/cli.js pipeline evidence-append <change> "Probe — stage 2" <<'EOF'
verdict: CAUGHT
planted: openspec/changes/<change>/proposal.md:14, under "## Why"
in scope of: architecture-reviewer (openspec/ path), rule-auditor
dispatched: architecture-reviewer, checker-engineer, rule-auditor, test-engineer
EOF
```

The `planted:` and `in scope of:` lines are what make a `MISSED` diagnosable.
When `plant` itself failed, write the same section with `verdict: not-planted`
and the plant error in place of the location — an absent section and a passing
probe are indistinguishable to anything reading in bulk, so say so explicitly.

Also mirror the verdict into state: `state-set <change> probe caught`.

### Decision

- Zero `[blocker]` **and** zero `[false-premise]`, with a green Step 0 → advance
  to Stage 4, skipping Stage 3.
- Any `[blocker]` **or any `[false-premise]`** → Stage 3. A `[false-premise]`
  must be fixed in the artefact even when the decision it supported survives the
  correction, so the next change does not reason from it.

The probe verdict **never** affects this decision. It is recorded, carried into
the PR body, and read by the retro. Gating on it is the natural ratchet once
there is a false-positive rate to reason about; gating before that data exists
would make a young instrument the thing that stops every run.

State transition: `stage: pre-review` → `stage: refine` | `stage: implement`.

---

## Stage 3 — Refine

Goal: edit the proposal, design or tasks until reviewers return zero blockers.

For each blocker:

1. Decide whether it is a proposal-level issue (wrong approach, wrong boundary)
   or a tasks-level issue (a task as worded would produce bad code).
2. Edit the appropriate file. Quote the blocker in the commit message body.
3. Some blockers need user judgement. Surface the question with options and
   pause. **Do not silently pick a side on a design call.**

Re-run `openspec validate <change>` after editing — a requirement whose SHALL
wrapped to line 2 fails there, not here.

After edits, increment `iteration` and loop back to Stage 2. Note that Stage 2
re-plants a canary each round; that is intended, and each round's probe is
recorded under its own iteration.

**Iteration cap: 3.** If hit, surface "3 refinement iterations completed; N
blockers remain" with the list, and save `paused=true`,
`pause_reason=refinement_cap`.

State transition: `stage: refine` → `stage: pre-review`.

---

## Stage 4 — Implement

Goal: walk `tasks.md` and produce code, one task at a time.

**Testing doctrine is not carried here.** Use the `superpowers:test-driven-development`
skill for the write-a-failing-test-first discipline; this stage owns sequencing,
dispatch and commit boundaries, nothing more. Two copies of testing doctrine is
two things to keep in sync, and the pipeline is not where that copy belongs.

Pre-flight:

1. Be on `feat/<change>`. Create it from `main` if needed; never work on `main`.
2. Cross-reference `human_commands` from Stage 1 against the task list and flag
   the tasks that will hit one, so the pause is expected rather than a surprise.

For each unchecked task:

1. Read the task line.
2. Route it with the same table Stage 2 used.
3. **If the task is single-domain and concrete**, dispatch a subagent: task text,
   the relevant files, the design context, and "Implement only this task; do not
   exceed scope. Cite the paths you touched."
   - **Pin the integration point's actual API in the brief.** Read the file the
     task integrates against and quote the real signature. A dispatch that says
     "wire X into Y" without quoting Y's contract frequently produces an
     intermediate that turns out to be dead code.
4. **If the task is trivial** (one line in a config file), do it inline.
5. **If the task needs a human-only command**, pause: save `paused=true`,
   `pause_reason=human_command:<task_id>`, surface the command, and **do not run
   it yourself.**
6. Tick the task `- [x]` in `tasks.md` once the work is done.
7. **Run Stage 5 yourself before committing the chunk** — do not delegate the
   verify to the dispatched agent. Subagents run tests on their own work
   reliably and run the repository's dogfood gates almost never.

### Anchors written during implementation

Any Evidence Anchor written into `openspec/changes/**` is **rev-stamped from the
start**, with `git rev-parse --short HEAD` taken at the moment the cited file
was read — not added later, not added at review time. A change proposal cites
code it is *about to modify*, so an unstamped anchor there is designed to rot:
it becomes `FABRICATED` the instant the change lands, and the honest author is
called a fabricator by their own merge. With a stamp, the immutable half stays a
hard gate and only the line number degrades to the advisory `STALE`.

Commit at meaningful boundaries — typically per task section. After every
task-section commit, write `sub_phase` and `sub_phase_progress` to state and
update `progress.md`. Each committed section is a clean handoff boundary; apply
the context-budget discipline above rather than starting the next chunk degraded.

### Spec-vs-code drift branch

You may discover that the spec calls for behaviour that does not exist in the
code — the test meant to verify it cannot be written honestly. Three legitimate
resolutions, in order of preference:

1. **Implement the missing behaviour**, then write the test against the real
   implementation. Best when the gap is small and clearly in scope.
2. **Update the spec to match reality** — edit the change's artefacts to remove
   or defer the behaviour, with a brief explanation. Re-run Stage 2 if this is a
   substantive change of scope.
3. **Defer with an explicit follow-up.** Only when the gap is genuinely out of
   scope: write the test against the closest existing behaviour, add a follow-up
   to `tasks.md`, **and** surface the gap in the PR body.

The wrong move is the silent path: writing a test against a different surface and
ticking the task complete. That accumulates drift and lies to the next reader.

State transition: `stage: implement` → `stage: verify`.

---

## Stage 5 — Verify (with auto-fix)

Goal: the repository's own gates pass after every chunk.

```bash
pnpm build && pnpm type-check && pnpm test
```

There is no lint step. This repository has no lint script, and inventing one
would be a check nobody else runs.

`pnpm build` is unconditional here, not a conditional extra. It is both the
compile gate and the precondition for every CLI invocation below — the dogfood
gates run out of `dist/`, so a verify that skipped the build would score the
previous build of the checkers.

### The ugrep baseline — read this before "fixing" a test failure

`packages/claims/src/flagConformance.test.ts` fails **exactly six tests** on
machines where `grep` is ugrep, which is common on macOS. That is a real
difference between the declared flag table and the local binary, not a
regression, and CI runs real GNU grep and ripgrep.

**The loop recognises the baseline as: exactly six failures, all in that one
file.** Any other count — five, seven, or six spread across two files — is a
real failure and gets fixed.

**Never edit the flag table to make them pass.** That is the auto-fix loop's most
available move and it is always wrong: it makes a local binary the specification
and breaks CI, where the declared table is correct.

### The dogfood gates — both polarities

A fixture that stops failing is a checker that went quiet, and the pipeline
should notice before the PR does. Run all of these; the negated ones must fail:

```bash
node packages/claims/dist/cli.js witness validate spec/fixtures/valid-run.jsonl
! node packages/claims/dist/cli.js witness validate spec/fixtures/broken-run.jsonl
node packages/claims/dist/cli.js wiring spec/fixtures/wiring-valid
! node packages/claims/dist/cli.js wiring spec/fixtures/wiring-broken
node packages/claims/dist/cli.js wiring .
node packages/claims/dist/cli.js check 'README.md' 'spec/**/*.md' --require-markers
node packages/claims/dist/cli.js check 'openspec/**/*.md'
```

`wiring .` is the one that fires on this stage's own output: `.claude/**` is
scanned harness surface from the moment a file lands, so a `dispatches:` entry
naming a missing agent, or a surviving unsubstituted template token, is a hard
failure here rather than a runtime no-op.

### On failure

1. **Type-check failure** — usually mechanical. Dispatch the task's specialist
   with the output; fix only those errors; re-run.
2. **Test failure** — dispatch `test-engineer`, because a broken test sometimes
   reflects an outdated expectation rather than a new bug. It decides whether the
   test or the code is wrong.
3. **A dogfood gate that stopped failing** — this is never a fixture to relax. A
   must-fail fixture that exits 0 means a verdict went quiet; find which one.
   Adding a verdict requires **both** a fixture that trips it and a unit test
   asserting it fires by name, because CI only checks the fixture's exit code,
   which stays 1 while any other verdict still fires.

**Auto-fix cap: 3 attempts per chunk per check.** If exhausted, save
`paused=true`, `pause_reason=verify_failed:<chunk>:<check>`, attach the log, and
surface. With `--no-auto-fix`, still run every check but stop on the first
failure instead of dispatching a fixer.

When the chunk is green:

```bash
node packages/kit/dist/cli.js pipeline evidence-append <change> "Stage 5 — Verify <chunk>" <<'EOF'
build: pass
type-check: pass
test: pass (N files, 6 known ugrep failures in flagConformance)
dogfood gates: pass, both polarities
EOF
```

State transition: back to Stage 4 if tasks remain; else `stage: post-review`.

---

## Stage 6 — Post-review (parallel, routed on the diff)

Re-derive the reviewer set from **the actual diff**, never from the proposal:

```bash
git diff --name-only main...HEAD | node packages/kit/dist/cli.js pipeline route-paths
```

This is the one place the routing input changes, and the reason is measured:
`route` can only route what a proposal *says*, and three of this repository's
seven live proposals name no source files at all. Proposal-derived routing
under-dispatches for those however good the table is. A diff's changed files are
facts from `git`.

**Evidence:** `packages/kit/src/pipeline.ts:158@437aeb6` — `Those paths must NOT go through`

Those paths must not be fed through `touched-areas`, which only finds backticked
mentions; a real `git diff --name-only` line carries no backticks and would be
dropped entirely. `route-paths` takes them raw on stdin, which is why it exists.

Run the same selective-dispatch pre-flight as Stage 2 — candidates, specific
per-file justification, drop the generics, dispatch the survivors in one parallel
message. **Do not just re-use Stage 2's set:** a file that was planned but turned
out trivial drops a specialist, and a file that grew unexpectedly adds one.

Brief each agent with:

- Phase: `post-review (diff)`
- The diff, or instructions to read it with `git diff main...HEAD -- <subset>`
  when it is large
- "Find anything the pre-review missed: subtle bugs, regressions, missed edge
  cases. Mark `[blocker]`, `[concern]`, `[looks-good]`."
- For any anchor the diff introduced or moved: "check the citation against the
  file, and say whether the stamp matches."

**Cross-reviewer convergence is a strong fix-it signal.** Two independent
reviewers raising the same finding is higher signal than either report alone —
treat it as `[blocker]` even when both labelled it `[concern]`.

Append the synthesis under "Stage 6 — Post-review", under the same contract as
Stage 2: it ends with `## Coordinator corrections since last append`, and
anything contradicting a claim you made is tagged `[corrected-coordinator]`.
This stage is where that tag matters most, because post-review is where reviewers
most often catch the coordinator rather than the code.

**Decision:** zero `[blocker]` → Stage 8. Any `[blocker]` → Stage 7.

State transition: `stage: post-review` → `stage: address-must-fixes` | `stage: pr`.

---

## Stage 7 — Address must-fixes

For each `[blocker]` from Stage 6:

1. Dispatch the agent that flagged it, or the right specialist, with the blocker
   text, the affected lines, and "Fix only this; do not refactor adjacent code."
2. Re-run Stage 5 in full on the touched files — including the dogfood gates. A
   targeted fix is exactly the shape of change that gets verified narrowly.
3. Re-run Stage 6 when the fix touched anything the reviewers reason about
   globally: the checker kernel, the routing table, a CI workflow, a rule file, or
   a spec-family document. **When in doubt, re-run** — a needless re-run costs
   minutes; a skipped one costs a defect the human reviewer will not catch either.
4. If new blockers emerge from the second pass, **surface to the user rather than
   looping a third time**. Save `paused=true`,
   `pause_reason=post_review_unstable`.

### When a reviewer flags a drifted anchor

Re-read the file and **re-stamp both halves** — the line number *and* the
`@hash`. Or leave the citation exactly as written and let it report `STALE`,
which passes.

**Updating the line number while keeping the old hash is the one edit that is
never correct**, and it is the one an automated fixer reaches for first. A
stamped anchor asserts something about an immutable commit: *this text was at
this line, at this hash*. Repointing the line under the old hash rewrites that
into an assertion that was never true, and the checker settles it against the
snapshot and says so — an advisory `STALE`, which merely asks you to re-read,
becomes a hard `FABRICATED`, which accuses. `FABRICATED` is the verdict meaning
*the author did not open the file*; spending it on a line-number tidy-up is how
the verdict gets reclassified as noise.

`[concern]` findings from Stage 6 are **not** fixed automatically. They are
listed in the PR body so the human reviewer sees them.

State transition: `stage: address-must-fixes` → `stage: pr`.

---

## Stage 8 — Open the PR

### Step 1 — check the change folder before anyone reads it

```bash
node packages/claims/dist/cli.js canary status    # must print "no active canary"
node packages/claims/dist/cli.js check 'openspec/changes/<change>/**/*.md'
```

A proposal whose anchors already rotted must never reach review. This is the
same gate CI runs, so failing it here costs seconds and failing it there costs a
round trip:

**Evidence:** `.github/workflows/ci.yml:149@437aeb6` — `node packages/claims/dist/cli.js check 'openspec/**/*.md'`

### Step 2 — resolve the base branch before pushing

Read `pr_base_branch` from state. Unset → `main`. Set to a branch that exists on
origin (`git ls-remote --heads origin <branch>` returns a SHA) → use it. Set to a
branch that does **not** exist on origin → **stop and ask.** Pushing a sibling
feature branch triggers CI and may publish work the user did not intend to
publish. Save `paused=true`, `pause_reason=base_branch_not_on_remote`.

**If the resolved base is anything other than `main`, this is a stacked PR.** A
stacked PR merges into its base, not into `main`. If the base merges to `main`
first, the stacked commits land on a dead branch and never reach `main` — and
GitHub still reports the stacked PR as `MERGED`. That is the orphaned case Stage
1's dependency gate has to detect, and here it also silently orphans every
Evidence Anchor the change stamped. Record `stacked_on` in state, prefer `main`
unless the change genuinely builds on unmerged commits, and if stacking is
confirmed carry this block verbatim under `## Summary`:

```
> **STACKED PR** — base is `<base>`, not `main`.
> Merge order matters: this PR must merge BEFORE `<base>` merges to `main`,
> or be retargeted to `main` afterwards. Merging `<base>` first orphans these
> commits on a dead branch while GitHub reports this PR as merged.
> Verify after merge: gh api repos/armanfatemi/nullius/compare/main...<sha> --jq .status
> (behind/identical = landed; ahead/diverged = orphaned)
```

### Step 3 — body, then open

Seed the review evidence from the file rather than from memory:

```bash
node packages/kit/dist/cli.js pipeline evidence-print <change>
```

Template:

```
## Summary
<1-3 bullets from proposal.md "## Why" and "## What changes">

## OpenSpec change
- openspec/changes/<change>/proposal.md
- openspec/changes/<change>/design.md
- openspec/changes/<change>/tasks.md

## Review evidence
<the synthesized output from evidence-print>

## Probe
<the "Probe — stage 2" section verbatim: verdict, plant location, scope>

## Open concerns (from post-review, not blockers)
- [agent] <concern>

## Verification
- build: pass
- type-check: pass
- test: pass (N files; 6 known ugrep failures in flagConformance, if applicable)
- dogfood gates: pass, both polarities

## Human-required commands
<from state.human_commands, with the file:line where each appears>

## Merge instruction
Merge with a **merge commit**. A squash leaves every anchor this change stamped
pointing at a commit unreachable from `main`, and the checker then fails open
with the advisory UNVERIFIABLE-REV — CI stays green while the hard gate silently
stops existing.

Generated with [Claude Code](https://claude.com/claude-code)
```

**The PR description is itself a document asserting things about existing code,
so the Evidence Anchor convention applies to it.** Any load-bearing claim the
body makes about code carries an anchor in the same grammar, rev-stamped, so a
reviewer can re-check it with the same tool that checks everything else. A claim
you cannot cite goes under open concerns instead.

```bash
gh pr create --base <resolved-base> --head feat/<change> \
  --title "<change>: <one-line summary>" --body "$(cat /tmp/pr-body.md)"
```

Keep the title under 70 characters. **Always pass `--base` explicitly** — `gh`'s
default-base inference uses the repository's default branch and would silently
retarget a stacked PR to `main`.

Save the URL: `state-set <change> pr_url <url>`.

### Never merge

Human review and merge is the exit condition. `stage: done` means *PR open and
retro written*, never *merged*. Under an otherwise autonomous run this is the
most important invariant in the design: it keeps a human on the merge decision
that every anchor stamp in the change depends on. `gh pr merge` is on the
blocked-commands list for exactly this reason.

State transition: `stage: pr` → `stage: retro`.

---

## Stage 9 — Retro

Dispatch `retro-writer`. It writes one file under `.claude/retrospectives/` and
nothing else.

This runs **after** the PR is open, never before — so it can cite the PR number,
and so a retro failure can never delay shipping. If the dispatch fails, log it
and mark `done` anyway: a missing retro is a missing data point, not a broken
run.

```
Dispatch retro-writer with:
  skill:    proposal-to-pr
  subject:  <change name>
  branch:   feat/<change>
  outcome:  pr-opened
  pointers: .git/nullius/pipeline/<change>.state.json
            openspec/changes/<change>/review-evidence.md
            openspec/changes/<change>/progress.md
            PR <pr_url>
```

**Do not summarize the run for it.** Hand it the pointers and let it read the
artefacts. The whole reason it is a separate agent is that your account of the
run — at the end of a long session, with the early mistakes compacted away — is
the least reliable input available.

Commit the retro on the feature branch so it travels with the PR:

```bash
git add .claude/retrospectives/<the-one-file-it-named>
git commit -m "docs: retrospective for <change>" && git push
```

Stage the single path the agent returned, never the directory and never `-A`.
The working tree holds untracked local scratch, and a directory add sweeps it
into a commit that then has to be amended.

Print its three-line return (path, severity, headline). If `severity` is
`notable` or `blocking`, say so in one line — that is the signal worth
interrupting for.

State transition: `stage: retro` → `stage: done`.

---

## Resume semantics

On re-invocation after a pause, read state. `paused=true` and the reason tells
you what to do:

- `human_approval_required` — re-run `pause-check`. Clean → clear `paused` and
  resume from `stage`.
- `unsatisfied_dependency:<dep>` — re-run the Stage 1 gate for every dependency.
  All satisfied → clear and resume into Stage 2. Any still unmet → say which and
  stay paused.
- `human_command:<task_id>` — confirm with the user that the command ran. Tick
  the task and resume Stage 4.
- `refinement_cap` — the user must have addressed the remaining blockers. Re-run
  Stage 2.
- `verify_failed:<chunk>:<check>` — re-run that check on that chunk. Passes →
  clear and resume. Fails → surface again.
- `post_review_unstable` — present the latest post-review output and ask for a
  decision.
- `base_branch_not_on_remote` — re-check `git ls-remote`. Present now → clear and
  resume Stage 8 step 3. Still absent → confirm the user's decision and act.

If no state exists, start at Stage 1. If a canary is still registered on resume
(`canary status` exits 1), clear it before running any `check`.

---

## Surface decisions to the user

Autonomous but transparent. Print a one-line banner at every transition:

```
[proposal-to-pr] <change> — Stage 4/9 (implement), task 6/11 (<task name>)
```

Name each dispatch and what it was asked. For each blocker, name the agent, the
line, and the rule or doc it cites. **Never run silent for more than about five
actions in a row** — the user must be able to interrupt.

## What this skill is NOT

- **Not a replacement for human review.** Stage 8 ends with a PR awaiting a
  human merge.
- **Not an oracle.** If reviewers disagree, surface the disagreement; do not pick
  a side silently on a substantive design question.
- **Not a rule selector.** It emits touched areas and hands them to
  `rule-auditor`, which globs the rules itself.
- **Not for trivial fixes.** A typo does not need the OpenSpec process.

Nothing this skill decides is trusted because a model decided it. Every
judgement it makes re-enters the repository as an Evidence Anchor in the same
grammar any author would use, and is re-checked by the same code that checks
theirs.

## Failure modes to expect

- **A reviewer says "outside my domain"** — drop it from the synthesis and mark
  `Skipped:` in the evidence.
- **Two reviewers irreconcilably disagree** — surface; pause.
- **A task says "ask the user X"** — pause; do not guess.
- **`openspec validate` fails on a SHALL that is present** — the modal verb
  wrapped to line 2. Move the line break.
- **A dependency has not reached `main`** — pause at Stage 1; land it first.
- **A specialist fails Stage 5 three times** — pause; the task was probably
  misread.
- **Six test failures in `flagConformance`** — that is the ugrep baseline, not a
  regression. Any other count is real.
- **`canary plant` fails** — note it, set `probe=not-planted`, run unprobed.
  Instrumentation never blocks shipping.
- **`gh` not authenticated** — pause at Stage 8 with the auth command.

Every pause writes state with a clear reason. Every resume reads state and picks
up where it left off.
