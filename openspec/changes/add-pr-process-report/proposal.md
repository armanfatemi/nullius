# Proposal — add-pr-process-report

> **Depends on:** None

## Problem

A maintainer reviewing an agent-authored pull request sees the diff and
nothing about the process that produced it: how many agents ran, how many
review rounds happened, what was caught and what was dropped, whether a test
was weakened on the way, what the human said to steer the run. Every one of
those facts is recorded or re-derivable, and none of it reaches the PR.

The run journals that hold most of it are per-machine and gitignored, so no
CI job can read them:

**Evidence:** `packages/kit/src/journalFile.ts:44@c8305b1` — `export const RUNS_DIR = join(".nullius", "runs");`

**Evidence:** `grep -rn '^\.nullius/runs/$' .gitignore` → 1 result

Nothing selects journals by a commit range. The kit's one enumeration of the
runs directory is `doctor`'s count, and the kernel's `witness survey` walks
whatever glob it is handed — neither knows which sessions produced a branch:

**Evidence:** `packages/kit/src/doctor.ts:542@c8305b1` — `      const journals = readdirSync(runs).filter((name) => name.endsWith(".jsonl"));`

**Evidence:** `packages/claims/src/cli.ts:569@c8305b1` — `    for (const match of patterns.flatMap((pattern) => globSync(pattern))) {`

The Action renders one thing — a fenced dump of the checker's merged
stdout/stderr — to two places, the job summary and a single upserted comment,
and has no second comment or second report:

**Evidence:** `action/action.yml:86@c8305b1` — `          docs_output=$(npx -y "@nullius-inverba/claims@${CLAIMS_VERSION}" check $GLOBS "${args[@]}" 2>&1)`

**Evidence:** `action/action.yml:122@c8305b1` — `        } >> "$GITHUB_STEP_SUMMARY"`

**Evidence:** `action/action.yml:142@c8305b1` — `        marker='<!-- nullius-claims -->'`

The kernel has no verb that renders a run, and its two range-aware pieces —
`oracle`'s classifier and its git binding — are package-internal, with no
machine-readable output for `oracle` at all:

**Evidence:** `grep -rn '"report"' packages/claims/src/cli.ts` → 0 results

**Evidence:** `grep -rn 'oracle' packages/claims/src/index.ts` → 0 results

**Evidence:** `packages/claims/src/cliArgs.ts:133@c8305b1` — `  ["--format", "check"],`

The open `add-maintainer-card` proposal names this exact feature as a
non-goal, for a reason that is correct and that this proposal has to answer
structurally rather than argue with:

**Evidence:** `openspec/changes/add-maintainer-card/proposal.md:74@c8305b1` — `- **Reporting on the agent run that produced the PR.** Witness journal data is`

## Why now

Repositories that adopt nullius are the ones receiving agent-written pull
requests at a rate a diff-only review cannot keep up with. The recorder, the
ledger verdicts, `oracle`, `check --format json` and the canary have each
shipped as a separate answer to a separate question; nothing yet composes them
into the one artefact a maintainer opens. And `add-run-ledger-producer` is
about to make the journal carry findings, decisions, cost and steering — data
that is worth nothing to a maintainer if it never leaves the contributor's
machine.

## What changes

- **`nullius-kit witness bundle <base>..<head>`** selects the session journals
  whose records overlap the range — by time window and by mutation paths
  intersecting the range's changed files, never by the header's `branch`,
  which names where a session *started* — strips them to a redacted subset,
  and writes one committed envelope per branch. The selection rule and the
  sessions it chose are written into the envelope and printed, with
  `--include` / `--exclude` overrides.
- **`nullius witness report <base>..<head> | <sha> [--bundle <path>] [--format md|json]`**
  (kernel) renders the report. A bare `<sha>` is that commit against its
  parent, the reading `parseRange` already gives. Markdown output is what the
  Action posts; JSON is the same data for other consumers, carrying a
  `version`.
- **Three tiers, in a fixed order, never in one table.** *Code-verified* —
  re-run in CI, contributor-independent: `check` over the PR body and touched
  documents, `oracle` over the range, `witness validate` over every bundled
  journal. *Hook-attested* — from the bundle after it re-validates: dispatches
  by agent, parallel rounds, `found / empty / never reported`, mutations and
  test-file edits, extracted findings, prompts, model and token usage.
  *Self-reported* — coordinator-authored ledger records from the bundle:
  stages, resolutions, decisions, checks. Every section renders data or an
  explicit *not recorded* with the reason; absence is never rendered as zero.
- **A flowchart** (mermaid, which GitHub renders in comments) of rounds,
  edit bursts, commits and prompts in time order, with every label passed
  through the renderer's escaper.
- **The Action gains `run-report`** (default `false`): runs the kernel verb
  and upserts a **second** comment under `<!-- nullius-run-report -->`, so the
  grounding comment and the process comment never share a table. No bundle on
  the branch renders the code-verified tier alone and says so.
- **`init --run-report`** adds the input to the generated workflow and records
  `runReport: true` in `nullius.kit.json`; `doctor` reports whether the
  workflow carries the input the config asks for.
- **`proposal-to-pr` Stage 8** runs `witness bundle`, commits and pushes the
  envelope before `gh pr create`, so this repository dogfoods from the next
  pull request.
- **Escaping lives in the kernel renderer**, unit-tested, which also answers
  `add-maintainer-card`'s open question about where security-relevant string
  handling belongs.

## Non-goals

- **A model anywhere in the path.** No summary is generated; every sentence
  in the report is a template over counts and records.
- **Parsing `review-evidence.md`.** The self-reported tier reads ledger
  records, not coordinator prose. Without `add-run-ledger-producer` that tier
  renders *not recorded*.
- **Contributor-independent enforcement.** The bundle is contributor-supplied
  by construction. The report labels it so, re-validates it, and puts the
  tier that needs no bundle first; it does not pretend a missing bundle is
  evidence of anything.
- **Ref-backed transport.** `add-journal-sealing` proposes `refs/nullius/runs`;
  this change commits an envelope because a ref does not travel with a fork's
  pull request. If sealing lands, `bundle` reads from the ref as a second
  source; the envelope stays the thing CI reads.
- **Rendering a canary's location, or the out-of-scope warning.** The
  redaction discipline is inherited, not reopened.
- **Reading the PR's review thread or CI history.** GitHub state is the
  maintainer's already.

## Dependencies

### Hard (must be merged before this starts)

None. The hook-attested tier and the code-verified tier work on journals the
kit writes today.

### Soft (design assumes these exist; graceful degradation if absent)

- `add-run-ledger-producer` — supplies findings, decisions, resolutions,
  stages, prompts, model and usage. Absent, those sections say *not recorded*.
- `add-maintainer-card` — rewrites the Action's checker step and comment; the
  two changes touch the same file and this one should land second so the
  second marker is added to the rewritten step. Its escaper question is
  answered here in favour of the kernel.
- `add-diff-scoped-strictness` — puts a range on `check`; the report's
  code-verified tier reuses it to scope the anchor check to touched documents
  when present, and checks the PR body alone when absent.
- `add-rev-ancestry-check` — adds a `Verdict` member and bumps
  `REPORT_VERSION`; the renderer reads `failing`, not the union, so it is
  unaffected, but the JSON consumer discipline is the same.
- `add-journal-sealing` — a second source for `bundle`, per Non-goals.
- `add-touched-areas-from-anchors` — edits the same SKILL.md region as the
  Stage 8 step.

### Enables (future changes that will depend on this)

- `witness harvest` (unproposed) — the renderer's record → markdown
  projections are the same ones harvest needs for `review-evidence.md`.
- A per-repository process baseline (IDEAS Track 2 "Geiger counter") — once
  every PR carries a report, rates across PRs become a question the JSON form
  can answer.

## Size estimate

|                                |                                        |
| ------------------------------ | -------------------------------------- |
| Estimated tasks                | ~52                                    |
| Packages or surfaces touched   | 7 (packages/claims, packages/kit, action/, .github/workflows, spec/, .claude/skills/proposal-to-pr, docs) |
| Risk                           | HIGH                                   |
| Expected sessions to implement | 3                                      |

This exceeds the split threshold. `tasks.md` is staged so the seams are
explicit — bundle (kit) → report (kernel) → Action/init — and each stage is
shippable alone: a bundle nobody renders is still a committed record; a verb
nobody posts is still a CLI. Stage 2 review may cut along either seam.

## Open questions

1. **Where does the committed envelope live?** Not under `.nullius/` — that
   directory's existence is the recording consent, and the kit already refused
   to put its own config there for exactly this reason:

   **Evidence:** `packages/kit/src/profiles.ts:66@c8305b1` — ` * Deliberately NOT under `.nullius/`.`

   Proposed: `nullius.runs/<branch-slug>.json`, matching the kit's root-file
   family. The name is a taste question; the constraint is not.
2. **How large may the comment be?** GitHub caps an issue comment at 65,536
   characters, a fact this repository does not record and cannot anchor. The
   renderer truncates the markdown form at a stated budget with a visible
   truncation line and points at the JSON artefact; the exact budget is
   Stage 3's.
3. **Which prompts travel?** `add-run-ledger-producer` records prompt text
   locally. The bundler includes it by default, capped, and offers
   `--no-prompts`; whether the default should be the other way round is the
   contributor's consent call and is asked here rather than assumed.
4. **What does the report say when `oracles` is not configured?** `oracle`
   refuses without the key. The proposal renders *oracle: not configured* in
   the code-verified tier with the config snippet, rather than omitting the
   row — a missing grader check is a fact the maintainer should see.
5. **Round detection window.** Dispatches starting within a fixed window are
   one round; the window is printed. Ten minutes is the starting value from
   this repository's own journals; it may need to be a config knob.
