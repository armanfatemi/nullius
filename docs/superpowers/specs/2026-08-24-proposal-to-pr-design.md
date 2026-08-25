# proposal-to-pr — design

**Date:** 2026-08-24
**Status:** approved, awaiting implementation plan
**Source:** `~/Documents/GitHub/nullius-vendor/openspec-pipeline-export/` — `.claude/skills/proposal-to-pr/SKILL.md` (713 lines) and `scripts/proposal-to-pr.sh` (319 lines)

## Problem

Five artifacts in this repository name an orchestrator that does not exist. Four
reviewer agents carry a documented output format, a declared dispatch protocol
and a stated consumer; a roster skill declares them in frontmatter that
`nullius wiring` resolves; and `intent-to-proposal` ends by pointing the user at
a command that is not installed.

**Evidence:** `.claude/skills/advise-specialized-agents/SKILL.md:22@f201d8e` — `orchestrator planned to consume them, and it has not landed — until it does,`

That was deliberate, and its release condition has now been met:

**Evidence:** `docs/superpowers/plans/2026-08-22-review-spine.md:15@f201d8e` — `**Why this is its own plan.** `proposal-to-pr` dispatches reviewers by name from a roster. Landing the machine before the roster gives it review stages that dispatch nothing and report success — the precise failure `nullius wiring` was built to catch. The machine gets its own plan once this one lands.`

The roster landed in PR #36. The machine is this plan.

The front door already promises the gate this design has to build:

**Evidence:** `.claude/skills/intent-to-proposal/SKILL.md:223@f201d8e` — `>      reason. `/proposal-to-pr` will not start implementation until every dependency listed here is`

A promise with no enforcer is the shape this repository exists to refuse.

## Decisions

**D1 — Full nine-stage autonomous port.** Not a trimmed review spine. The
pipeline loads, gates on dependencies, pre-reviews, refines, implements,
verifies, post-reviews, addresses must-fixes, opens a PR and writes a retro.

The cost is stated plainly: full autonomy puts eight review dispatches on the
path to a PR with no human reading whether any of them reviewed anything. D3
is the mitigation, and it is not optional given this decision.

**D2 — `retro-writer` is authored; `retro-rollup` and `retro-harvester` are
not.** Stage 9 needs a fifth roster name, and `nullius wiring`'s
`DANGLING-AGENT` makes declaring it without the file a hard failure — which is
the forcing function that makes this a decision rather than a detail. The
other two aggregate across many retros and have nothing to consume on day one;
the harvester additionally needs a `pnpm-workspace.yaml` glob widened for zero
day-one value.

`retro-writer` earns its place on doctrine rather than convenience. It is a
starved fresh agent handed pointers instead of the coordinator's account,
which is this repository's own argument about why a model's self-report is the
least reliable input available.

**D3 — Stage 2 plants a canary; the score is advisory.** The pre-review layer
is measured on every run:

**Evidence:** `packages/claims/src/cli.ts:84@f201d8e` — `  canary status       show the active canary; exit 1 when one is planted`

`MISSED` is recorded in `review-evidence.md` and the PR body; it does not halt.
Gating on the probe is the natural ratchet once there is a false-positive rate
to reason about, and gating before that data exists would make a four-commit-old
instrument the thing that stops every run.

**D4 — The deterministic half is TypeScript in `packages/kit`, not shell.**

**Evidence:** `packages/kit/package.json:30@f201d8e` — `    "nullius-kit": "dist/cli.js"`

`touched-areas` decides which specialists get dispatched. A wrong row there
produces a run that dispatches nothing and reports a completed review — the
exact failure `nullius wiring` was built to catch, occurring at runtime where
wiring cannot see it. That decision does not belong in untested bash in a
repository whose thesis is that verification is code.

## Architecture

Judgement stays in `SKILL.md`. Every decision settleable by re-reading an
artifact moves to `packages/kit/src/pipeline.ts` under `pnpm test`. The skill
proposes which agents to dispatch and whether blockers are addressed; the kit
decides what a change touches, whether a pause marker is unchecked, whether a
command is human-only, and what the state is.

### Boundaries

| Boundary | Rule | Consequence |
|---|---|---|
| Never merges | terminal state is PR-open | merge stays human; squash stays impossible |
| Never selects rules | `rules select` is the kernel's, unbuilt | pipeline emits areas; `rule-auditor` globs |
| Never writes hooks | `one-delivery-mechanism.md` | `.claude/settings.json` is off-limits |
| Never repoints anchors | `never-repoint-under-old-stamp.md` | re-stamp both halves or neither |

The rule-selection boundary is a real overlap, not a hypothetical one:

**Evidence:** `openspec/changes/add-rules-compliance/proposal.md:33@f201d8e` — `- **`rules select --paths <globs>`** (kernel): deterministic, no model — emit`

That command is proposed in the kernel and unimplemented. The pipeline must not
grow a second copy; it emits touched areas and hands them to `rule-auditor`,
which already globs the rules itself. When `rules select` lands the pipeline
gains a sharper input and loses nothing. `add-rules-compliance` is therefore a
soft dependency.

**Discriminator with superpowers** is unchanged from the adoption doc: work
with an `openspec/changes/<name>/` runs this pipeline, anything else runs
superpowers. Stage 4 delegates to `superpowers:test-driven-development` rather
than carrying testing doctrine.

**Terminal state.** `stage: "done"` means *PR open and retro written*, never
*merged*. Under full autonomy this is the most important invariant in the
design: it keeps a human on the merge decision that every anchor stamp in the
change depends on.

## The kit surface

`nullius-kit pipeline <cmd>` — the export's subcommands minus Jira, plus two
the dependency contract needs:

```
list-changes                    every openspec/changes/<name>/
show <change>                   contents; exit 1 if incomplete
state-get <change> [key]        machine-local resume state
state-set <change> <k> <v>
state-reset <change>
pause-check <change>            exit 1 on unchecked ## Human Approval Required
blocked-commands <change>       scan tasks.md + design.md -> HUMAN: <cmd>
touched-areas <change>          repo-relative paths the change names
depends-on <change>             parse the > **Depends on:** blockquote
dep-status <name>               SATISFIED | UNSATISFIED | ORPHANED | UNKNOWN
evidence-append <change> <h>    stdin -> review-evidence.md  (committed)
evidence-print <change>         seeds the PR body
progress-write <change>         stdin -> progress.md        (committed)
```

State lives at `.git/nullius/pipeline/<change>.state.json`, not the export's
`.proposal-to-pr/`. Machine-local nullius state already has a home there, so
this needs no `.gitignore` entry and introduces no second convention.
`progress.md` and `review-evidence.md` still commit into the change folder,
where CI re-verifies any claim they make about the codebase.

### Routing table

| Touched path | Dispatches |
|---|---|
| `packages/claims/src/{checkClaims,witness,wiring,config}.ts` | checker-engineer |
| `packages/{claims,kit}/src/**/*.ts` | test-engineer |
| `spec/fixtures/**`, `.github/workflows/*.yml` | test-engineer |
| `spec/*.md`, `CLAUDE.md`, `openspec/project.md` | architecture-reviewer |
| every change (see below) | rule-auditor |

`rule-auditor` is unconditional, and that is the rule-selection boundary above
being obeyed rather than a shortcut: deciding whether a rule applies means
matching its `applies_to` globs, which is `rules select`'s job in the kernel. The
pipeline does not grow a second copy — it dispatches the agent, which globs for
itself. When `rules select` lands the pipeline can pre-filter and this row gets
sharper. `architecture-reviewer` reads prose invariants nothing scopes, so it
fires on the spec family and on any `openspec/` path — which at Stage 2 always
includes the proposal under review. `checker-engineer` is the discriminating
row, firing only on the four kernel modules. A docs-only change dispatches two agents; a kernel change
dispatches four. That is the focused-dispatch discipline `advise-specialized-agents`
asks for, made mechanical rather than left to the dispatcher's judgement.

### Blocked commands

The export scanned for `terraform apply` and secret rotation. Neither exists
here. The human-only set is drawn from the rules and from what autonomy could
quietly break:

```
gh pr merge ...          merge is the human's call
... --squash             merge-never-squash.md
git push --force[-with-lease], git rebase <shared>, filter-branch
npm|pnpm publish         packages are published artifacts
.claude/settings.json    one-delivery-mechanism.md
.git/nullius/**          canary registry + witness journal
openspec archive         self-satisfying dependency
```

The last entry is the non-obvious one. Stage 1 treats a directory under
`openspec/changes/archive/` as proof its change merged. A run that could
archive its own change could satisfy its own dependents with nothing landed.
Archiving stays human, and `openspec-archive-change` keeps owning that moment.

## The nine stages

Six adaptations are load-bearing; the rest is a port.

**Stage 1 — Load.** Drops `jira_issue_key`, `id`, `model:` and the
coordinator-tier advisory — none have a source in this repository. `depends-on`
parses the blockquote and resolves names straight to directories:

**Evidence:** `.claude/skills/intent-to-proposal/SKILL.md:218@f201d8e` — `> **Depends on:** `change-name-a`, `change-name-b` — write "None" if there are no hard prerequisites.`

A dependency is satisfied when its directory is under
`openspec/changes/archive/`, or its state carries a `pr_url` that is `MERGED`
*and* passes `compare/main...<mergeCommit>` as `identical|behind`. `ORPHANED`
and `UNKNOWN` both count unsatisfied, each with its own message — the orphan fix
is a cherry-pick onto `main`, not re-implementation. The export's compare-API
check ports verbatim, and matters more here than there: a PR that merges into a
feature branch and never reaches `main` leaves every anchor it stamped
unreachable, which is the fail-open `UNVERIFIABLE-REV` that
`merge-never-squash.md` exists to describe.

Then one step the export has no reason to carry: **`pnpm build` first.** The
pipeline is about to run nullius CLIs to check its own work, and an unbuilt tree
would have it validate itself against the previous build and report success.
That is the repository's cardinal failure reproduced inside its own orchestrator.

**Stage 2 — Pre-review and probe.** A serial window, because the registry holds
one canary:

```
canary plant openspec/changes/<c>/proposal.md
  -> dispatch routed agents in parallel
canary verify <synthesized report>      -> CAUGHT | MISSED | TAINTED
canary clear
```

The score appends to `review-evidence.md` and the PR body and never halts. If
`plant` fails, note it and run unprobed: instrumentation must not be able to
block shipping. `clear` before Stage 3 is mandatory, or the `canary-present`
verdict fails `check` at Stage 8 — the merge guard doing its job at the wrong
moment. Stage 6 stays unprobed; one probe per run keeps the score interpretable
and the single-slot registry uncontended.

**Stage 3 — Refine.** Ports unchanged. `--max-refine 3`.

**Stage 4 — Implement.** TDD delegates to
`superpowers:test-driven-development`. Specialist-at-declared-tier drops with
the metadata; agents inherit the session model. Any anchor written into
`openspec/changes/**` is stamped with `git rev-parse --short HEAD` at read time.
The spec-vs-code drift branch ports unchanged.

**Stage 5 — Verify.** `pnpm build && pnpm type-check && pnpm test`. No lint
step — this repository has no lint script, so the export's lint token deletes
rather than maps. Two additions:

- **The ugrep baseline is encoded.** Six failures in
  `src/flagConformance.test.ts` are environmental on machines where `grep` is
  ugrep. An auto-fix loop ignorant of this will chase them, and the "fix" is
  editing the flag table to match a local binary — which breaks CI, where real
  GNU grep runs. The loop recognises *exactly* six, *all* in that file, and
  treats that as baseline. Any other count is a real failure.
- **The dogfood gates run, both polarities.** `witness validate` on valid and
  broken fixtures, `wiring` on both, `check` with `--require-markers`. A fixture
  that stopped failing is a checker that went quiet, and the pipeline should
  notice before the PR does.

**Stage 6 — Post-review.** Same routing, applied to the diff. Ports unchanged.

**Stage 7 — Address must-fixes.** If a reviewer flags a drifted anchor, the fix
is to re-read and re-stamp both halves. Repointing a line under the old hash
converts an advisory `STALE` into a hard `FABRICATED` — the one edit that is
never correct, and the one an automated fixer is most likely to reach for.

**Stage 8 — Open PR.** Body seeded from `evidence-print`. The PR description is
itself a document asserting things about existing code, so the
`evidence-anchors` convention applies to it. `nullius check` runs against the
change folder before the PR opens, so a proposal whose anchors already rotted
never reaches review. The pipeline never merges.

**Stage 9 — Retro.** `retro-writer` on pointers, not on the coordinator's
account. Fails open — a missing retro is a missing data point, not a broken run.
Committed on the feature branch so it travels with the PR.

## Verification

**Five prose claims go false on landing.** Their anchors survive, because they
cite `review-spine.md:15`, which still says what it says. The prose is what
rots, and it is corrected in the same change:

**Evidence:** `.claude/agents/architecture-reviewer.md:107@f201d8e` — `You MUST return your findings in this exact shape. Nothing parses it automatically yet — `proposal-to-pr` is the orchestrator planned to consume it, and it has not landed`

The same sentence appears in `rule-auditor.md:95`, `test-engineer.md:77`,
`checker-engineer.md:105`, and `advise-specialized-agents/SKILL.md:22`.
`architecture-reviewer`'s false-premise pass is precisely the check that should
catch a missed one — the pipeline's first real test is run against its own
landing.

**CI already gates the new files.** `nullius wiring` runs against this
repository itself, so `SKILL.md` and `retro-writer.md` are scanned from the
first commit:

**Evidence:** `.github/workflows/ci.yml:179@f201d8e` — `      - name: nullius wiring (self)`

That requires: `dispatches:` resolving all five agents (`DANGLING-AGENT`), zero
surviving `{{TOKEN}}` (`UNSUBSTITUTED-TOKEN`; the export carries 73 instances
and the port must land at zero), and every declared `reads:` path existing
(`MISSING-PATH`).

**Unit tests** on `pipeline.ts`, with the routing table getting one test per row
asserting that agent *by name*. This is `verdict-needs-fixture-and-test.md`
generalised: a test asserting "some agents were selected" passes while a row is
dead, which is the same one-bit coverage that rule was written against.

**Acceptance test** is a real run against an existing unarchived change.
`add-authoring-ergonomics` is the target: smallest of the seven at 134 lines,
and kernel-facing, so it exercises all four routing rows rather than only the
two universal ones. The run is real if the probe returns `CAUGHT` and the PR
body carries evidence that re-verifies.

## Open questions

- **Does `DANGLING-SKILL` resolve plugin skills?** The pipeline references
  `superpowers:test-driven-development` and `opsx:apply`, which live in plugins
  rather than `.claude/skills/`. If wiring resolves only the local tree these are
  false positives and the references must be phrased not to trip. Verify before
  writing the frontmatter; this is a fact about the checker, not a design choice.
- **Concurrency.** The canary registry holds one entry, so two pipeline runs in
  one clone collide. Single-maintainer use makes this unlikely rather than
  impossible; the plan should decide whether to detect and refuse, or to
  document.

## What this is not

It does not merge. It does not archive. It does not select rules. It does not
write hooks. It does not decide anything a checker could decide — every
judgement it makes is a proposal that re-enters as an Evidence Anchor and is
re-checked by the same code that checks a human's.

## First-run note

Claude Code loads the agent registry at session start. `retro-writer.md` added
in the same session you invoke the skill in is not dispatchable — the dispatch
fails with `Agent type 'retro-writer' not found`. Start a fresh session after
the agent file lands. Verify with a one-word ping dispatch before a real run.
