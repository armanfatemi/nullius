# Adopting the OpenSpec → PR pipeline

**Status:** design approved, not yet implemented
**Date:** 2026-08-21 · **Stamped against:** `3333623`

## Why

A working, review-gated agent pipeline — idea → OpenSpec proposal → parallel
adversarial review → implementation → PR → retrospective — exists in another
repository and has been exported in portable form.

It is not a foreign practice being adapted. It is close to the artifact nullius
is trying to make generic: a pipeline whose gates any repo could install. The
tension this design resolves is a bootstrapping one — the flow is needed *now*
to build the features that would eventually replace much of it.

## What the export duplicates, and what it exposes

Three of the export's components are prompt-shaped prototypes of nullius
features that are specified but unbuilt. This is the main finding of the
review, and it drives every decision below.

| Export artifact | nullius counterpart | State |
| --- | --- | --- |
| `rule-auditor` + freeform `.claude/rules/` | `add-rules-compliance` (`rules select`, `/comply`, `RULE-ROT`) | specified, unbuilt |
| `retro-harvester` + `retro-writer` | `witness harvest` + the run-ledger producer | deferred |
| SETUP.md's dangling-agent `grep` loop | `nullius wiring` | backlog only |

The rule-header format the third of these needs is already specified:

**Evidence:** `openspec/changes/add-rules-compliance/proposal.md:18@3333623` — `- **Rule headers** (kernel): rule files gain a strict flat frontmatter —`

Two further components are strictly superseded: the export's
`proposal-claims-checker` by `packages/claims`, and its `proposal-grounding.md`
rule by `plugin/skills/evidence-anchors/`.

### The gap that runs the other way

The export has no recorder. Its retrospectives are written by a fresh subagent
reading archaeology — git history, PR comments, review evidence. A subagent
that was dispatched and never returned leaves no commit, no comment and no
check, so it leaves nothing to harvest; the roster of who was dispatched is
recovered from a file the coordinator wrote. That is the exact three-state
collapse `witness` exists to prevent, and this repo already records the
harness's own account of it:

**Evidence:** `.github/workflows/ci.yml:79@3333623` — `- name: nullius witness validate (self)`

The two systems therefore compose rather than compete: witness is the recorder
the export never had, and `retro-writer` is the renderer witness has not built.

## Decisions

- **D1 — Scope.** Port the review/retro spine, the proposal → PR machine, and
  `intent-to-proposal`. Do not port `implement-task` triage or `bug-fix-tdd`;
  the installed superpowers skills already cover ad-hoc work.
  `intent-to-proposal` was added to scope after Phase 0 shipped, on the
  operator's judgement that it is the piece they need most for daily work. An
  earlier reading of this port mapped it onto the existing `openspec-propose`
  skill; that was wrong, and the skill's own description says so — it declares
  itself a replacement for `/opsx:propose` and refuses to chain into it,
  because that command is the generic template generator and this one writes
  richer artifacts directly.
- **D2 — Overlap rule.** Where nullius has a CLI, wire to it. Where nullius has
  only a specification, port the prompt version and treat the friction as
  evidence for that specification.
- **D3 — Approach: schema-first.** Every artifact the ported pipeline emits is
  written in a schema nullius already ships or has already specified, so the
  scaffolding produces product-grade data from the first run and nothing needs
  migrating later.
- **D4 — Build `nullius wiring` before the port lands**, so the roughly ten new
  agent and skill files are accepted by a checker rather than by review.

## Phase 0 — `nullius wiring`

A new kernel command. The repo's existing split is that the kit produces and
integrates while the kernel judges — the kit records journals, the kernel
validates them — and wiring judges files, so it belongs to the kernel. `doctor`
composes it when `add-init-doctor` lands rather than owning it.

Distinguishing a live reference from illustrative prose is the hard part, so
the check splits the way this repo already splits hard `FABRICATED` from
advisory `STALE`.

**Hard — declared fields only, nothing inferred:**

| Verdict | Fires on |
| --- | --- |
| `DANGLING-AGENT` | a name in a skill's `dispatches:` frontmatter with no `.claude/agents/<name>.md` |
| `DANGLING-SKILL` | a skill referenced by name that does not exist |
| `EMPTY-GLOB` | a rule's `applies_to` glob matching zero files |
| `MISSING-PATH` | a declared `reads:` path that does not exist |
| `DEAD-HOOK` | a hook command that does not resolve or is not executable |
| `UNSUBSTITUTED-TOKEN` | a leftover `{{TOKEN}}` |

**Advisory:** `LOOSE-REFERENCE` — a backticked repo-relative path in a body
that does not resolve. Reported, never failing, because prose is allowed to be
prose.

The hard half only works if rosters are declared rather than written as prose
tables. The export's roster is a markdown table, which is precisely why its own
worst failure mode is invisible to it; porting it means converting that table
to skill frontmatter.

Phase 0 ships as an OpenSpec change with `spec/wiring.md`, a unit test per
verdict, and directory fixtures — a new fixture shape, since wiring reads a
tree where every existing fixture is a single file. The broken fixture must
trip every hard verdict, because CI asserts only its exit code.

## Phase 1 — the port

Landing in `.claude/`: `proposal-to-pr`, `pr-followup`,
`advise-specialized-agents`, `retro-rollup`, and the `rule-auditor`,
`architecture-reviewer` and `retro-writer` agents. `scripts/proposal-to-pr.sh`
lands verbatim; `tools/retro-harvester/` joins the workspace as a private
package so its tests run under `pnpm test` instead of rotting behind a
manual install step. The workspace glob must be widened to admit it:

**Evidence:** `pnpm-workspace.yaml:2@3333623` — `- packages/*`

Dropped: all Jira integration, every event-sourcing rule and invariant, and the
two superseded components named above.

**Token substitution is smaller than the export's own guide suggests.** Of the
73 token instances across the whole export — including skills not being ported —
27 are tracker-related and leave with Jira; the domain, API,
frontend, event-store, codegen and affected-projects tokens all delete
outright. Eight values genuinely map. There is no lint script, so the lint
verification token goes too — and the verify stage must encode CLAUDE.md's
known-environmental ugrep baseline, or its auto-fix loop will chase six
failures that are not regressions.

**Artifact placement.** Machine-local resume state is gitignored; `progress.md`
and `review-evidence.md` are committed into the change folder, where CI already
re-verifies any claim they make about the codebase:

**Evidence:** `.github/workflows/ci.yml:149@3333623` — `node packages/claims/dist/cli.js check 'openspec/**/*.md'`

**The roster starts at five names, not twelve.** The export's seven specialists
are event-sourcing and frontend shaped and none fit. Authored now:
`checker-engineer` (verdict semantics, parser strictness, the `Verdict` union
as breaking public API) and `test-engineer` (fixtures and the dogfood gates).
`harness-engineer` and `spec-writer` are authored when a run first needs them.
With wiring in place the roster cannot quietly grow past what exists.

`architecture-reviewer` is regrounded on `CLAUDE.md` and `spec/*.md`, and its
placeholder invariants are replaced by nullius's own: model proposes and code
verifies; one delivery mechanism per artifact; anchors rev-stamped from the
start and never repointed under an old stamp; merge commits never squash;
hooks fail open; `Verdict` growth is breaking; a new verdict requires both a
fixture and a unit test; build before any CLI use.

**Boundary with superpowers.** Four of the pipeline's nine stages overlap an
installed superpowers skill, and two process stacks with competing opinions on
one moment is how both get ignored. The change folder is the discriminator:
work with an `openspec/changes/<name>/` runs `proposal-to-pr`, anything else
runs superpowers. Stage 4 delegates to `superpowers:test-driven-development`
rather than carrying its own testing doctrine.

## Phase 1a — `intent-to-proposal`

Five phases: guided dialogue, codebase survey, feasibility with a devil's
advocate, a decomposition decision, then generation. It is the front of the
pipeline — the piece that turns an idea into a change folder the rest of the
machine can execute — and three parts of it need adapting rather than copying.

**The devil's advocate is already built here, and better.** Phase 3 dispatches
a fresh agent told to refute. nullius ships that as a command whose protocol
lives in the CLI rather than in a prompt, so it cannot drift from the checker
that re-verifies what comes back:

**Evidence:** `plugin/commands/audit.md:2@7785686` — `description: Audit the premises of a document — refute-first, one claim per agent, refutations returned as checkable anchors`

It does **not** replace the devil's advocate, and an earlier draft of this
section said it did. They take different inputs at different moments: Phase 3
critiques the *idea*, before any artifact exists, while `/audit` takes a
*document* and refutes its premises one claim per agent. Same doctrine — a
starved fresh agent told to refute — applied to two different things.

So the devil's advocate stays as written, and `/audit` is added after
generation, against the proposal it produced. Two refutation passes at the two
moments each has the right input for, which is cheaper here than anywhere
because the second one already exists.

**The codebase survey already emits anchors — it needs wiring, not
converting.** An earlier draft of this section proposed making survey findings
anchored, as though that were new. It is not: Phase 2 already carries a
section titled "The survey discovers; the coordinator verifies," which
requires any survey finding destined to become a load-bearing claim to be
re-read at the source and captured as `path:line` plus text, or a search
command plus its result count — and says those go straight into the
`**Evidence:**` lines the generation phase writes. Phase 5 then runs a claims
checker over the result.

What the port changes is where those point. The skill cites a
`proposal-grounding` rule file and a `{{CLAIMS_CHECKER_CMD}}` token, both
belonging to the export's own fork of this convention. Here they become the
plugin's `evidence-anchors` skill and the real kernel CLI, which is the D2
overlap rule doing exactly what it was written for.

**The proposal-metadata machinery does not port as-is.** The export assigns
each proposal a stable `prop-<hex>` id, a model, and a `depends_on` list in an
`.openspec.yaml`, so autonomous agents can pick work up in dependency order.
That is a convention its repo added on top of OpenSpec, not something OpenSpec
provides, and nothing here uses it:

**Evidence:** `grep -rn --include='*.yaml' 'depends_on' openspec/` → 0 results

Adopting it is a separate decision from adopting the skill, and it should be
made on whether this repo actually runs proposals autonomously — not inherited
because it arrived in the same file. The skill works without it; the
dependency gate in `proposal-to-pr` is what consumes it.

**Two smaller adjustments.** Its `tasks.md` templates are shaped for
aggregates, GraphQL resolvers and Terraform, and need replacing with this
repo's real shapes — a kernel verdict, a kit command, a spec-family document,
a plugin hook, fixtures plus a CI gate. And it references a `pragmatist-pm`
agent among the seven the export does not ship; either author it or cut the
conditional step that dispatches it, because a dispatch to a missing agent is
the exact silence `nullius wiring` now refuses to let pass.

**Boundary with `openspec-propose`.** Both cannot own the same moment. The
existing skill stays for the case it is good at — scaffolding a change whose
shape is already decided. `intent-to-proposal` owns the case where the idea is
still raw and the survey, the refutation and the decomposition are the point.


## Phase 2 — the schema-first half

**Retrospectives become a journal plus prose.** `retro-writer` keeps its
markdown file for the human half; its machine half moves from bespoke YAML
frontmatter into witness v0.3 records in a sibling `.jsonl`. This is a separate
journal rather than an append to the session's, because `origin` is a header
claim over a whole file and mixing model-authored records into a
harness-emitted journal would corrupt the only thing that journal attests. The
self-reported tier already exists for exactly this:

**Evidence:** `spec/witness-journal.md:82@3333623` — `{"kind":"journal","version":"0.3","origin":"self-reported"`

It also cannot live under the runs directory, which is deliberately not
committed, while retrospectives must survive for `retro-rollup`:

**Evidence:** `.gitignore:7@3333623` — `.nullius/runs/`

The mapping is close to one-to-one — dispatched agents to `dispatch`, agent
errors to `finding` plus `resolution`, human interventions to `decision`,
verify iterations to `stage` — which is itself evidence that both schemas were
derived from the same problem. The one field with no counterpart,
`rules_proposed`, is recorded as evidence for `add-rules-compliance` rather
than invented here.

This gives v0.3 a producer, which it has lacked since it shipped, and it puts
two accounts of the same run side by side.

**`retro-writer` reads the validator's summary, not the journal.** The agent
has a documented history of dying on context, and the summary is four lines
carrying the three-state dispatch accounting that archaeology cannot reach.
Per-agent attribution continues to come from `review-evidence.md`.

**Rules carry the specified frontmatter from day one** — `id`, `applies_to`,
`severity`, and an anchor to the motivating incident — so `rules select`
consumes them unchanged when built. All eight are seeded from scar tissue
already recorded in `CLAUDE.md`, none imported. `CLAUDE.md` itself is left
alone in this change; converting it to pointers belongs with
`add-rules-compliance`, when something actually reads the rule files.

## Phases 3 and 4

The first real run targets `add-authoring-ergonomics`, chosen because it is
small, fully specified, and self-contained:

**Evidence:** `openspec/changes/add-authoring-ergonomics/proposal.md:18@3333623` — `These are kernel-only changes, independent of every other proposal.`

After roughly five runs, `retro-rollup` decides what has earned promotion into
`plugin/`. That gate is what stops the scaffolding calcifying; without it,
"port into `.claude/` first" becomes "port into `.claude/` permanently."

## Failure modes and their mitigations

| Failure | Mitigation |
| --- | --- |
| review reports success having reviewed nothing | `nullius wiring`, Phase 0 |
| `retro-writer` exhausts its context | reads the validator summary and the bounded manifest, never raw sources |
| verify loop chases environmental test failures | the ugrep baseline is encoded in the verify stage |
| a squash merge orphans every anchor stamp | the PR stage encodes merge-commit-only; this gate otherwise fails open |
| two process stacks compete | the change folder is the discriminator |
| scaffolding never becomes product | the Phase 4 promotion gate |

## Non-goals

Comparing the harness journal against the retro journal; `witness harvest`;
`rules select` and `/comply`; any promotion into `plugin/`. Each is a follow-up
this port creates the conditions for, and none is in scope here.

## Open questions

- Does the validator's summary carry enough signal? It reports dispatch counts
  and three-way outcomes but not agent names, so per-agent attribution rests on
  a coordinator-written file. If that proves thin, machine-readable output from
  the validator is the fix.
- How much of the 713-line `proposal-to-pr` survives trimming for a solo
  three-package repo. Unknown until attempted.
- Whether `rules_proposed` should become a sixth v0.3 kind.
- Whether wiring stays in the kernel once `doctor` exists.
