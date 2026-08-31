# Proposal — add-run-ledger-producer

> **Depends on:** None

## Problem

Schema v0.3 of the witness journal defined five ledger kinds — `stage`,
`finding`, `resolution`, `check`, `decision` — and two verdicts over them,
`SUPPRESSED-FINDING` and `SILENT-REVIEWER`. The change that landed them
deferred the producer explicitly:

**Evidence:** `openspec/changes/archive/2026-08-21-add-run-ledger/proposal.md:80@c8305b1` — `- **The self-reported producer** — a skill instructing pipeline agents to emit`

Nothing has emitted one since. The kit writes exactly four kinds and no ledger
kind anywhere:

**Evidence:** `grep -rnE 'kind: "(finding|resolution|decision|stage|check)"' packages/kit/src` → 0 results

So the account of what reviewers raised, what the coordinator answered, and
why an approach was chosen lives only in `review-evidence.md` — coordinator
prose, appended by a kit command that wraps a heading around whatever arrived
on stdin:

**Evidence:** `packages/kit/src/pipeline.ts:614@c8305b1` — `      appendEvidence(root, change, heading, readInput());`

**Evidence:** `packages/kit/src/pipeline.ts:318@c8305b1` — `  appendFileSync(path, `${header}\n## ${heading}\n\n${body.trimEnd()}\n`, "utf8");`

Two consequences. First, the two ledger verdicts have never fired on a real
journal: the kit still declares `0.2`, below the floor at which they apply.

**Evidence:** `packages/kit/src/cli.ts:52@c8305b1` — `const SCHEMA_VERSION = "0.2";`

**Evidence:** `packages/claims/src/witness.ts:1232@c8305b1` — `  if (versionAtLeast(scan.version, "0.3")) {`

Second, a run's cost and provenance are unrecorded. The harness reports the
resolved model on every dispatch acknowledgement and full token usage on every
synchronous return, and the recorder reads neither:

**Evidence:** `spec/fixtures/probes/claude-code-workflow/PostToolUse-Agent.json:29@c8305b1` — `    "resolvedModel": "claude-opus-5",`

**Evidence:** `spec/fixtures/probes/claude-code-workflow/PostToolUse-Agent.json:31@c8305b1` — `    "totalTokens": 36283,`

**Evidence:** `grep -rniE 'totalTokens|resolvedModel' packages/kit/src` → 0 results

Third, the human is absent from the record. A journal says which agents ran
and what they touched, but not who was steering or what they said. The header
resolves branch, head and worktree at session start and nothing about the
operator:

**Evidence:** `packages/kit/src/identity.ts:142@c8305b1` — `    head: git("rev-parse", "HEAD"),`

And the one event that carries the operator's words, `UserPromptSubmit`, is
neither subscribed by the plugin nor recorded in the probe corpus:

**Evidence:** `grep -rn 'UserPromptSubmit' plugin spec packages/kit/src docs README.md` → 0 results

Every tool-call payload already carries the join key that would tie a prompt
to the dispatches and edits it caused (`SessionStart` does not, and need not):

**Evidence:** `spec/fixtures/probes/claude-code/PreToolUse-Agent.json:5@c8305b1` — `  "prompt_id": "f4095b6f-b44c-4b35-97de-8c96cce1ec8e",`

## Why now

`add-pr-process-report` renders "what was caught, what was dropped, what it
cost" for a maintainer, and every one of those sections reads ledger records.
Without a producer that report can only say *not recorded*. The schema has
also gone two versions (0.4, 0.5) without a single real record being written
against it, which the original design named as its own standing risk.

## What changes

- **Findings are extracted by code, at the hook.** Every reviewer in this
  repository returns a declared contract — lines tagged `[blocker]`,
  `[concern]`, `[looks-good]`, `[false-premise]`. The recorder parses those
  lines from the subagent's return text at the terminal event and writes one
  `finding` per tag, with `dispatch` set and `author` taken from the harness
  payload. These findings are hook-attested: the coordinator does not author
  them and cannot omit one.
- **`nullius-kit witness ledger <kind>`** — a structured-record mode of the
  recorder for the kinds only an author with intent can write: `stage`,
  `resolution`, `decision`, `check`. Flags map one-to-one onto the schema's
  fields; the record is validated against the same closed vocabularies the
  kernel enforces before it is appended, under the same lock, into the same
  session journal.
- **Journal addressing from the coordinator's shell** uses
  `CLAUDE_CODE_SESSION_ID`, with `--session` as an explicit override. With
  neither, the command refuses — it never picks a journal by modification time.
- **`witness ledger findings`** lists the hook-extracted findings of the
  current session with their ids, so the coordinator can answer them with
  `resolution` records without inventing ids.
- **Model and token usage on `report` records.** `model` from the payload's
  `resolvedModel` (captured at launch for asynchronous dispatches, via the
  links sidecar); `usage` from the payload on synchronous returns. For
  asynchronous returns, whose terminal payload carries no usage, the recorder
  reads the harness-written subagent transcript's per-turn usage under a byte
  and time budget, records `usage_source: "transcript"`, and omits the field
  entirely when the budget is exceeded. Absent is never estimated.
- **The kit adopts a journal version at or above `0.3`** so the two ledger
  verdicts apply to real journals — and, because that turns `SILENT-REVIEWER`
  on for every `found` return including non-reviewer dispatches, the kernel
  gains a version at which that verdict is scoped to dispatches the recorder
  marked as expecting findings. See `design.md` Decision 4; this is the one
  kernel change in the proposal.
- **The git user in the header.** `user: { name, email }` resolved from
  `git config` at session start inside the existing identity budget; omitted,
  never blank, when git cannot answer. Additive header metadata no verdict
  reads.
- **`prompt` records — the operator's steering, hook-attested.** The plugin
  subscribes to `UserPromptSubmit`; the recorder writes one `prompt` record per
  submission (`id: p:<prompt_id>`, `text`, `chars`, `at`), and every
  `dispatch` and `mutation` written afterwards carries `prompt: p:<prompt_id>`
  from its own payload, so a report can show which instruction led to which
  work. `prompt` is a new kind and rides the same `0.6` bump. Text is capped
  and `truncated` when cut; `NULLIUS_WITNESS_PROMPTS=0` records `chars` and a
  hash and omits `text`.
- **`proposal-to-pr` emits ledger records** at each stage transition
  (`stage`), for each addressed finding (`resolution`), for each design
  decision (`decision`), and for each verify chunk (`check`) — alongside the
  existing `evidence-append` calls, not replacing them.
- **`JournalReport` counts ledger kinds**, the public-interface change the
  original design deferred to "the change that gives these records a producer
  worth counting":

  **Evidence:** `openspec/changes/archive/2026-08-21-add-run-ledger/design.md:224@c8305b1` — `- **Whether `JournalReport` should count ledger records.** It exposes`

## Non-goals

- **A model anywhere in the path.** Finding extraction is a line grammar over a
  declared tag contract, not a classifier. A return with no tags yields no
  findings; nothing infers severity from prose.
- **`witness harvest`** — rendering `review-evidence.md` from records. That is
  the other deferred half and it becomes tractable only once this change has
  produced real records to render from.
- **Recording the coordinator's own model or token usage.** No hook payload the
  recorder receives carries it for the main session; this proposal does not
  read the main transcript.
- **A new severity for `[false-premise]`.** It is always a blocker by the
  reviewers' own contract, so it maps to `blocker` with a metadata `tag`; no
  closed vocabulary grows for it.
- **Retiring `review-evidence.md` or `evidence-append`.** Prose and records
  coexist until the records have proven they carry the same information.
- **Recording anything for `Workflow`-tool agents.** They emit `SubagentStop`
  only and are the subject of IDEAS Track 3 P7, not of this change.
- **Recording the assistant's replies.** The `Stop` payload carries
  `last_assistant_message`, and it is the agent's account of its own turn —
  exactly the kind of record this journal exists not to trust. Prompts are
  recorded because they are the human's words; replies are not.
- **Deciding what a prompt record may travel to a pull request.** Journals are
  local and gitignored; what leaves the machine is `add-pr-process-report`'s
  bundling decision, not the recorder's.

## Dependencies

### Hard (must be merged before this starts)

None.

### Soft (design assumes these exist; graceful degradation if absent)

- `add-journal-sealing` — rewrites the kit's `SessionEnd` path and where a
  journal's durable copy lives. No semantic dependency, but both changes edit
  `packages/kit/src/cli.ts`'s record path and `journalFile.ts`; whichever
  lands second rebases.
- `add-touched-areas-from-anchors` — edits the same `proposal-to-pr` SKILL.md
  region where the kit's subcommand list is enumerated in prose.

### Enables (future changes that will depend on this)

- `add-pr-process-report` — its "caught during review", "decisions", and
  "cost" sections read the records this change produces.
- `witness harvest` (unproposed) — rendering needs records to render.
- `MISSING-ATTESTATION` (IDEAS P7) — a `stage` record naming which reviewers
  were routed is a declared denominator.

## Size estimate

|                                |                                        |
| ------------------------------ | -------------------------------------- |
| Estimated tasks                | ~46                                    |
| Packages or surfaces touched   | 6 (packages/kit, packages/claims, plugin/hooks, spec/, .claude/skills/proposal-to-pr, .github/workflows) |
| Risk                           | HIGH                                   |
| Expected sessions to implement | 2                                      |

The surface count exceeds the split threshold. It is kept as one change
because the pieces are not independently shippable: adopting a ≥0.3 journal
version without hook-side finding extraction makes every existing hooks
journal fail `SILENT-REVIEWER`, and finding extraction without the version
adoption produces records no verdict reads. If Stage 2 review disagrees, the
natural seam is the kernel scoping change (Decision 4) as its own prerequisite.

## Open questions

1. **Does the `SILENT-REVIEWER` scoping in Decision 4 take a version bump?**
   None of the four triggers fires literally — no new kind, no vocabulary
   member, no tightening, no new verdict — but a verdict starts reading a field
   it did not read before, which the exemption clause does not cover. The
   proposal assumes a bump to `0.6` and asks `checker-engineer` to settle it.
2. **How is a probe verdict recorded?** `check.outcome` is closed to
   `pass`/`fail`, and `canary verify` has three outcomes. CAUGHT/MISSED map
   cleanly; TAINTED is a void round, not a failure. Candidates: omit the record
   on TAINTED and record a `decision` explaining the void; or leave probe
   verdicts in `review-evidence.md` only. Resolve in Stage 3.
3. **Is `CLAUDE_CODE_SESSION_ID` exported by every harness entry point?**
   Observed in this repository's sessions and matching the live journal; not
   found in any recorded probe or in-repo document:

   **Evidence:** `grep -rn 'CLAUDE_CODE_SESSION_ID' packages plugin .claude/skills spec` → 0 results

   `--session` exists so the command works without it; whether the skill can
   rely on the variable being present is empirical.
4. **Transcript reading for asynchronous usage** — is reading a harness-written
   file the recorder was handed a path to inside the hooks tier, or a third
   tier? The proposal treats it as hooks-tier data with a distinct
   `usage_source`, because the agent had no opportunity to write it. Reviewers
   may disagree.
5. **Is prompt text on by default under the existing `.nullius/` opt-in?** The
   repository's own probe-capture doc names prompt text as the reason capture
   is off by default:

   **Evidence:** `.nullius/README.md:65@c8305b1` — `Capture is off unless a settings file asks for it:`

   **Evidence:** `.nullius/README.md:82@c8305b1` — `prompt text, tool inputs and outputs, and absolute paths including your home`

   The proposal argues the journal is different from a raw probe — the words
   are the operator's own, the file is local and gitignored, and the directory
   was created by a human — and ships text on with a documented off switch.
   That is a consent decision and belongs to the operator's review of this
   proposal as much as to Stage 2.
6. **What does the `UserPromptSubmit` payload actually carry?** No probe of it
   exists in the corpus. Task 0 captures one before any parser is written, per
   the corpus discipline; field names in this proposal are assumptions until
   then.
