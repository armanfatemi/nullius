# Proposal — add-run-ledger-producer

> **Depends on:** None

> **Some anchors here cite code this change itself introduces, and are stamped
> `@19f7bd4` — the implementation commit, not the commit this proposal was
> drafted against.** They could not be stamped when written: the code did not
> exist in any commit, and stamping against the then-current `HEAD` would have
> asserted the text was there at a commit where it verifiably was not — which is
> `FABRICATED`, the verdict meaning the author did not open the file, and
> strictly worse than an unstamped anchor that verifies against the working
> tree. So they were left unstamped, the gap was recorded as a must-do, and
> `check --stamp` filled them in once the implementation landed. That flag only
> stamps an anchor that holds at `HEAD` *and* in the working tree, so no claim
> was widened by stamping it. `rev-stamp-change-anchors` assumes the cited code
> already exists, which is the ordinary case; a proposal that cites its own
> output is the case it does not cover, and this is how that is handled.

## Problem

Schema v0.3 of the witness journal defined five ledger kinds — `stage`,
`finding`, `resolution`, `check`, `decision` — and two verdicts over them,
`SUPPRESSED-FINDING` and `SILENT-REVIEWER`. The change that landed them
deferred the producer explicitly:

**Evidence:** `openspec/changes/archive/2026-08-21-add-run-ledger/proposal.md:80@c8305b1` — `- **The self-reported producer** — a skill instructing pipeline agents to emit`

Nothing had emitted one since: the kit wrote exactly four kinds — `dispatch`,
`report`, `mutation`, `append` — and no ledger kind anywhere. This change is
what closes that, so the anchor below is a presence anchor on the new emitter
rather than the absence anchor this proposal opened with (which reported
`COUNT-MISMATCH` the moment the code landed, exactly as the gap-map
convention intends):

**Evidence:** `packages/kit/src/record.ts:766@19f7bd4` — `      kind: "finding",`

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

The recorder read neither before this change; it now reads the resolved model
off the launch acknowledgement:

**Evidence:** `grep -rn 'resolvedModel' packages/kit/src/record.ts` → 3 results

Third, the human is absent from the record. A journal says which agents ran
and what they touched, but not who was steering or what they said. The header
resolves branch, head and worktree at session start and nothing about the
operator:

**Evidence:** `packages/kit/src/identity.ts:142@c8305b1` — `    head: git("rev-parse", "HEAD"),`

And the one event that carries the operator's words, `UserPromptSubmit`, was
subscribed by nothing. This change adds the subscription:

**Evidence:** `plugin/hooks/hooks.json:3@19f7bd4` — `    "UserPromptSubmit": [`

Its payload shape is still unrecorded, which is why task §0 captures a probe
before the parser is trusted — and why this anchor is left live rather than
retired: it goes loud the moment the corpus gains one.

**Evidence:** `grep -rn 'UserPromptSubmit' spec/fixtures/probes` → 0 results

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

- **Findings are extracted by code, at the hook.** All four reviewers in this
  repository declare a return contract of lines tagged `[blocker]`,
  `[concern]`, `[looks-good]`; two of them (`rule-auditor`,
  `architecture-reviewer`) also declare `[false-premise]`. The recorder parses
  those lines from the subagent's return text at the terminal event and writes
  one `finding` per tag, with `dispatch` set and `author` taken from the harness
  payload. These findings are hook-attested: the coordinator does not author
  them and cannot omit one.
- **`nullius-kit witness ledger <kind>`** — a structured-record mode of the
  recorder for the kinds only an author with intent can write: `stage`,
  `resolution`, `decision`, `check`. Flags map one-to-one onto the schema's
  fields; the record is validated against the same closed vocabularies the
  kernel enforces before it is appended, under the same lock, into the same
  session journal. **Each of those records carries its own
  `origin: "self-reported"`**, required at schema `0.6`, so a journal whose
  header says `hooks` never presents a coordinator's account as the harness's.
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
- **Schema `0.6`.** The bump is owed by two triggers, for three reasons: a new
  kind (`prompt`, trigger 1); a new required field on four kinds (per-record
  `origin`, trigger 3); and a tightening (a blank `user.name` is `MALFORMED`,
  trigger 3). The rule also gains a fifth trigger — a **loosening** is equally
  a change to the set of valid records — appended rather than inserted, so the
  clause numbers other documents cite do not move; `spec/witness-journal.md`
  is settled as the one canonical statement. Riding on it: the kit writes `0.6`,
  so the two ledger verdicts finally apply to real journals; and because that
  turns `SILENT-REVIEWER` on for every `found` return including non-reviewer
  dispatches, at `0.6` the verdict is scoped to dispatches carrying
  `expects: "findings"` — a closed vocabulary; an unknown value is
  `MALFORMED`, never a silent opt-out. See `design.md` Decision 4.
- **The validator says which records are whose.** At `0.6` the `validate` and
  `survey` summaries print hook-tier and self-reported record counts
  separately, and the header sentence that today reads "records emitted by
  the harness runtime, which the agent had no opportunity to decline" is
  scoped to the records that carry no origin of their own. A per-record
  provenance rule the summary contradicts would be a rule in prose only.
- **A clean review is a tagged review.** The four reviewer agent files'
  `## Output format` sections state that a review with nothing to raise
  returns at least one `[looks-good]` line — the schema's own discharge for
  `SILENT-REVIEWER` — so an untagged "nothing to report" is a contract
  violation the verdict is right to name, not a false positive it must
  tolerate.
- **The hook script's stdout goes to stderr, and its bound stays in the
  script.** `UserPromptSubmit` is the one event whose hook stdout the harness
  feeds back to the model as context, and the recorder is run through `npx`,
  which can print. The script redirects the runner's stdout for every event, so
  nothing the recorder or its launcher prints reaches the conversation. The
  same event runs synchronously on every human prompt, so the runner is
  time-bounded — in the script, not by a harness `timeout` key: this
  repository's fail-open guarantee is the script's own `exit 0`, and a
  harness-killed process never reaches it.
- **The git user in the header.** `user: { name }` resolved from `git config`
  at session start inside the existing identity budget; omitted when git
  cannot answer, and `MALFORMED` when present and blank — the rule the other
  identity fields already carry. `email` is not recorded: the only redactor is
  in an unmerged downstream change, and a value that needs one should not be
  written before it exists.
- **`prompt` records — the operator's steering, hook-attested.** The plugin
  subscribes to `UserPromptSubmit`; the recorder writes one `prompt` record per
  submission (`id: p:<prompt_id>`, `text`, `chars`, `at`), and every
  `dispatch` and `mutation` written afterwards carries `prompt: p:<prompt_id>`
  from its own payload, so a report can show which instruction led to which
  work. `prompt` is a new kind and is one of the reasons for `0.6`. Text is
  capped and `truncated` when cut; `NULLIUS_WITNESS_PROMPTS=0` records `chars`
  and a hash and omits `text`. If the captured `UserPromptSubmit` payload turns
  out not to carry `prompt_id`, the record's id is derived from the payload
  (`p:<hash of session, at, text>`), the `prompt` key on later records is left
  absent, and a report orders by timestamp instead of joining — stated now so
  the fallback is a design and not an improvisation.
- **`proposal-to-pr` emits ledger records** at each stage transition
  (`stage`), for each addressed finding (`resolution`), for each design
  decision (`decision`), and for each verify chunk (`check`) — alongside the
  existing `evidence-append` calls, not replacing them.
- **`JournalReport` gains a `ledger` block of counters** (`stages`, `findings`,
  `resolutions`, `checks`, `decisions`, `prompts`) and a `provenance` block
  (`hooks`, `selfReported`, `unattributed`) — namespaced, because
  `JournalReport.findings` already exists as the array of validator findings;
  both `null` below `0.6`, so the summary changes shape once and an older
  journal's output is unchanged. `JournalSurvey` sums the same blocks. This is the public-interface change the
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
- **Validating the `prompt` join key.** `dispatch.prompt` and `mutation.prompt`
  are read by no verdict; a value naming no `prompt` record validates clean.
  Stated so the omission is a decision: the key exists for a renderer, and a
  verdict over it would be a new verdict with its own bump.
- **Making a hand-appended `finding` distinguishable from a hook-extracted
  one.** They are byte-identical in the file; `witness ledger` refusing the
  kind is a command-surface convention. The journal is local and the recorder
  is the only writer this change ships; a file-level mechanism (sealing,
  signing) is `add-journal-sealing`'s territory.

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
| Estimated tasks                | ~56                                    |
| Packages or surfaces touched   | 7 (packages/kit, packages/claims, plugin/hooks, spec/, openspec/specs/witness, .claude/skills/proposal-to-pr + .claude/agents, .github/workflows) |
| Risk                           | HIGH                                   |
| Expected sessions to implement | 3                                      |

The surface count exceeds the split threshold. It is kept as one change
because the pieces are not independently shippable: adopting a ≥0.3 journal
version without hook-side finding extraction makes every existing hooks
journal fail `SILENT-REVIEWER`, and finding extraction without the version
adoption produces records no verdict reads. If Stage 2 review disagrees, the
natural seam is the kernel scoping change (Decision 4) as its own prerequisite.

## Open questions

1. **Resolved in pre-review.** `0.6` is owed by triggers 1 and 3 regardless
   (`prompt`; the `user.name` tightening; the per-record `origin` requirement).
   The `SILENT-REVIEWER` scoping is a loosening — no numbered trigger fires,
   but the rule's headline ("the set of valid records changes") is
   direction-neutral and clause 3 names only one direction; the restatement in
   `spec/witness-journal.md` gains clause 3's mirror as part of this change.
2. **How is a probe verdict recorded?** `check.outcome` is closed to
   `pass`/`fail`, and `canary verify` has three outcomes. CAUGHT/MISSED map
   cleanly; TAINTED is a void round, not a failure. Candidates: omit the record
   on TAINTED and record a `decision` explaining the void; or leave probe
   verdicts in `review-evidence.md` only. Resolve in Stage 3.
3. **Is `CLAUDE_CODE_SESSION_ID` exported by every harness entry point?** Still
   open. It was observed in this repository's sessions, matching the live
   journal, and `witness ledger` now reads it — with `--session` as the
   override for when it is absent, and a refusal rather than a guess when
   neither is available:

   **Evidence:** `packages/kit/src/cli.ts:168@19f7bd4` — `The journal is addressed by --session, else $CLAUDE_CODE_SESSION_ID, and by`

   No recorded probe carries it, because a hook payload is JSON on stdin and
   carries no environment at all — so the corpus can never settle this, and
   the absence below is a permanent property of the evidence rather than a gap
   waiting to close:

   **Evidence:** `grep -rn 'CLAUDE_CODE_SESSION_ID' spec/fixtures/probes` → 0 results

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
   Pre-review noted the polarity inverts the probe switch (probes opt in,
   prompts opt out) and routed the decision to the operator. **Settled by the
   operator:** the request that added prompt records asked for the text so a
   report can show the steering; hashed prompts would not serve it. Text stays
   on by default; the switch stays documented in `.nullius/README.md`.
6. **What does the `UserPromptSubmit` payload actually carry?** No probe of it
   exists in the corpus. Task 0 captures one before any parser is written, per
   the corpus discipline; field names in this proposal are assumptions until
   then.
