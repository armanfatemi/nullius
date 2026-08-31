# Design — add-run-ledger-producer

## Context

The recorder has one input path — a hook payload on stdin — and one
interpreter, a fixed switch over `hook_event_name`. Its session id comes from
the payload and from nowhere else:

**Evidence:** `packages/kit/src/cli.ts:66@c8305b1` — `Both read one harness hook payload as JSON on stdin and write to`

**Evidence:** `packages/kit/src/cli.ts:462@c8305b1` — `  const session = stringField(payload, "session_id");`

Records are appended under an exclusive-create lock, and the source may be a
function so that a decision can be made under the lock:

**Evidence:** `packages/kit/src/journalFile.ts:100@c8305b1` — `export type RecordSource = readonly JournalDraft[] | (() => readonly JournalDraft[]);`

The validator joins ledger records to dispatches by id within one file only —
`finding.dispatch` and `resolution.finding` are `DANGLING-REFERENCE` when the
referent is not earlier in the same journal — and `SILENT-REVIEWER` fires on
any dispatch whose terminal is `found` and which no `finding` names:

**Evidence:** `packages/claims/src/witness.ts:1288@c8305b1` — `      if (asOutcome(terminal.raw.outcome) !== "found") continue;`

Closed vocabularies the producer must honour:

**Evidence:** `packages/claims/src/witness.ts:259@c8305b1` — `const SEVERITIES = ["blocker", "concern", "looks-good"] as const;`

**Evidence:** `packages/claims/src/witness.ts:291@c8305b1` — `const CHECK_OUTCOMES = ["pass", "fail"] as const;`

Unknown keys on `dispatch` and `report` are ignored at every version; the
`dispatch` case reads nothing at all:

**Evidence:** `packages/claims/src/witness.ts:667@c8305b1` — `        dispatches += 1;`

The reviewers' return contract is declared and consumed:

**Evidence:** `.claude/agents/rule-auditor.md:95@c8305b1` — `You MUST return your findings in this exact shape. `proposal-to-pr` now exists and consumes it (`.claude/skills/proposal-to-pr/SKILL.md`): its Stage 2 and Stage 6 decisions turn on the `[blocker]` and `[false-premise]` markers, the synthesis of your report is appended to the change's committed `review-evidence.md`, that file seeds the PR body, and `retro-writer` reads it to count what each reviewer actually caught. That is review-spine's own sequence completed — the roster landed first, and the machine that dispatches it got its own plan after (`docs/superpowers/plans/2026-08-22-review-spine.md:15`). A human still reads your report as well, so the shape has two audiences now rather than one; keep to it exactly.`

**Evidence:** `.claude/skills/proposal-to-pr/SKILL.md:557@c8305b1` — `- "Report in under 400 words. Mark findings as `[false-premise]`, `[blocker]`,`

Where the harness puts model and usage: the resolved model is on every
`PostToolUse:Agent` response, including the asynchronous launch
acknowledgement, which the recorder currently reduces to an agent id and zero
records; token usage is on the synchronous response only; the `SubagentStop`
terminal carries neither.

**Evidence:** `spec/fixtures/probes/claude-code/PostToolUse-Agent.json:16@c8305b1` — `    "status": "async_launched",`

**Evidence:** `spec/fixtures/probes/claude-code/PostToolUse-Agent.json:19@c8305b1` — `    "resolvedModel": "claude-haiku-4-5-20251001",`

**Evidence:** `packages/kit/src/record.ts:432@c8305b1` — `function launchAcknowledgement(response: unknown): { agentId: string | null } | null {`

**Evidence:** `grep -rnE '"usage"|resolvedModel|totalTokens' spec/fixtures/probes/claude-code/SubagentStop.json` → 0 results

## Decisions

### 1. Two authors, one journal

**Chosen:** `finding` records are written by the recorder from the subagent's
return text at its terminal event. `stage`, `resolution`, `decision`, and
`check` are written by the coordinator through `witness ledger`. All land in
the same session journal.

**Alternatives considered:**

- **Coordinator authors everything, including findings** — rejected: the
  validator's two ledger verdicts would then compare the coordinator's account
  with itself. A coordinator that drops a blocker in prose drops the `finding`
  record too, and `SUPPRESSED-FINDING` has nothing to fire on.
- **A separate self-reported journal per session** — rejected: every join the
  validator makes is within one file, so `finding.dispatch` in a sibling file
  is `DANGLING-REFERENCE`, and `SILENT-REVIEWER` cannot see a `finding` that
  answers a `report` in another file.

**Rationale:** the value of the ledger verdicts is that they cross tiers. A
hook-attested `report: found` checked against a hook-extracted `finding`
checked against a coordinator-authored `resolution` is a chain where each link
was written by a different party.

**Provenance is per record where the tiers mix.** The header's `origin` is
defined as "the agent had no opportunity to decline to write them", and the
schema refuses a field whose ambiguity would be read as the better tier. So at
`0.6` every `stage`, `resolution`, `decision` and `check` record carries
`origin: "self-reported"` — **required**; absent or any other value is
`MALFORMED` — and the header's `origin` is documented as the origin of every
record that does not carry its own. `finding` records carry no per-record
origin: the recorder wrote them from the harness payload, so the header's
`hooks` is true of them. The alternative — a third header value such as
`mixed` — was rejected: it says the journal is impure without saying which
records are, which is the ambiguity the field exists to remove. This is one
of the three triggers that owe `0.6` (a new required field on four kinds is
trigger 3).

### 2. Extraction is a line grammar, not a classifier

**Chosen:** at the terminal event the recorder scans the full return text
(before the `EXCERPT_LIMIT` truncation applied to `report.findings`) for lines
matching `^\s*-\s*\[(blocker|concern|looks-good|false-premise)\]\s+(.+)$`. Each
match becomes a `finding` with `severity`, `author` = the dispatch's agent
name, `text` = the rest of the line (capped, with `truncated: true` when cut),
`dispatch` = the terminal's dispatch id, and id `f:<hash of dispatch id +
ordinal>`. `[false-premise]` maps to `severity: "blocker"` with `tag:
"false-premise"`; the tag is metadata no verdict reads.

**Evidence:** `packages/kit/src/record.ts:119@c8305b1` — `const EXCERPT_LIMIT = 2000;`

**Evidence:** `.claude/agents/rule-auditor.md:129@c8305b1` — `- `[false-premise]` — the document states something about the **existing** codebase that the code contradicts, or rests a decision on an uncited claim (`plugin/reviewers/false-premise.md`). **Always a blocker**, independent of rule severity — this offense is the false premise itself, not a named rule violation. Quote what the file actually says with a `path:line`. Report it even when the conclusion it supports still looks right — a correct conclusion reached from a false premise is precisely the case every other reviewer waves through.`

**Alternatives considered:**

- **Parse headings (`### B1.`) as well** — rejected: those are the coordinator's
  synthesis conventions in `review-evidence.md`, not the reviewer's return.
  The recorder reads returns.
- **Add `false-premise` to `SEVERITIES`** — rejected: a new closed-vocabulary
  member is a schema bump for a distinction the reviewers themselves define as
  "always a blocker".

**Rationale:** the tag contract is the one part of a reviewer's output that is
already machine-consumed, so parsing it adds no new dependency on prose shape.
A return with no tags produces no findings, which is the honest reading.

### 3. Addressing by session id, refusing to guess

**Chosen:** `witness ledger` resolves the journal from `--session`, else
`CLAUDE_CODE_SESSION_ID`, else exits 2 with a message naming both. It never
chooses the newest file.

**Alternatives considered:**

- **Newest journal by mtime** — rejected: two worktrees or a resumed session
  make "newest" a different journal from "mine", and a record appended to the
  wrong session is indistinguishable from one the right session wrote.
- **A `current` pointer written by `SessionStart`** — deferred: a fallback for
  harnesses that do not export the variable; not needed while the variable is
  observed present, and it adds a file whose staleness would need its own
  check.

**Rationale:** the recorder's own rule for a payload without a session id is to
say so rather than guess; the coordinator path inherits it.

### 4. Adopt a version at which the verdicts fire, and scope `SILENT-REVIEWER`

**Chosen:** the kit writes `0.6`. The kernel adds `0.6` to `VERSIONS`; at that
floor `SILENT-REVIEWER` fires only for a dispatch carrying
`expects: "findings"`. `expects` is a **closed vocabulary** with one member;
a present value outside it is `MALFORMED` at ≥0.6, because the alternative —
`raw.expects !== "findings"` skipping silently — lets one producer typo disarm
the verdict repo-wide with no finding, and every other closed vocabulary in
this validator reports rather than skips. The recorder sets the key on the
`dispatch` record when the dispatched agent's definition file declares the tag
contract (an `## Output format` section containing `[blocker]`), resolved from
`.claude/agents/<subagent_type>.md` at `PreToolUse` — a filesystem read, not a
judgement. Journals below `0.6` keep the unscoped verdict.

**Known limit, accepted:** the denominator is editable in-session — deleting
`[blocker]` from an agent's output section disarms the verdict for every later
dispatch, and the journal records that only as an ordinary `mutation` of the
agent file. The mitigation belongs to `wiring`, not here: a check that every
agent named in a skill's `dispatches:` declares the tag contract. Recorded as
a follow-up in `tasks.md` §6, not solved in this change.

**Evidence:** `packages/claims/src/witness.ts:184@c8305b1` — `export const VERSIONS = ["0.1", "0.2", "0.3", "0.4", "0.5"] as const;`

**Alternatives considered:**

- **Adopt `0.5` as-is** — rejected: every `found` return from an `Explore`
  or implementing agent, which carry no tags, would earn `SILENT-REVIEWER`,
  and a verdict that fires on three dispatches in five gets learned as noise
  — the exact calibration argument that gated `SUPPRESSED-FINDING` to
  blockers.
- **Emit a `looks-good` finding for untagged returns** — rejected: that is the
  recorder fabricating a review verdict the agent did not give.
- **Stay at `0.2` and write ledger kinds anyway** — rejected: they are
  `MALFORMED` below `0.3`.

**Rationale:** the verdict's own rationale presumes the dispatch was a reviewer
("an explicit nothing-found is how a reviewer proves it was not silent"). Under
a producer that records every dispatch, that presumption has to be declared,
and the recorder is the only party that can declare it from a file rather than
from an opinion. The scoping itself is a loosening and fires no numbered
trigger; it rides on a bump that is owed anyway (Decisions 1, 7 and 8), and
the exemption is unavailable to it because a verdict now reads the field:

**Evidence:** `spec/witness-journal.md:387@c8305b1` — `It does **not** bump for additive optional metadata that no verdict reads.`

### 5. Model and usage on `report`, never on `dispatch`

**Chosen:** `report` gains optional `model` and `usage` (`{input, output,
cache_read, cache_creation, total}`) plus `usage_source: "payload" |
"transcript"`. For an asynchronous dispatch the launch acknowledgement's
`resolvedModel` is stored in the links sidecar alongside the agent id and
copied onto the `report` at `SubagentStop`. Usage for asynchronous returns is
summed from `message.usage` of assistant turns in `agent_transcript_path`,
read before the lock is taken, under a byte cap and a wall-clock budget below
the lock wait; over budget, the field is omitted and a note says so. Both
budgets are parameters of the reader (the seam `identity.ts` already uses for
`budgetMs`/`perCallMs`), so a test can force the under-cap-but-slow branch
deterministically rather than reason about it.

**Alternatives considered:**

- **On `dispatch`** — rejected: the dispatch record is written at
  `PreToolUse`, before the harness has resolved a model or spent a token.
- **Skip asynchronous usage entirely** — kept as the fallback the budget
  enforces, not the default: this repository's pipeline dispatches
  asynchronously, so "sync only" would record cost for none of its reviews.

**Rationale:** additive optional metadata no verdict reads — no bump. The
transcript is a file the harness wrote and handed the recorder a path to; the
agent had no opportunity to edit it, which is the hooks tier's criterion.

### 6. `JournalReport` gains a namespaced `ledger` block

**Chosen:** `JournalReport.ledger = { stages, findings, resolutions, checks,
decisions, prompts }`, printed in the validate summary, and `JournalSurvey`
gains the same block summed across journals. Namespaced because
`JournalReport.findings` already exists as the array of validator findings and
is consumed as one in the kernel CLI, the kit CLI and `doctor`; a counter of
the same name would be a breaking redefinition, not an addition. One new
optional-to-read field on each exported interface is additive.

### 7. The git user is header identity, resolved where the other identity is

**Chosen:** `resolveIdentity` also runs `git config user.name` inside the same
per-call and total budgets, and the header gains `user: { name }`. Missing is
omitted; an empty string is `MALFORMED` at `0.6`, matching the rule the other
identity fields carry — and that rule is a **tightening**, so this decision is
one of the reasons `0.6` is a bump rather than a courtesy. `email` is not
recorded (see the proposal); adding it later is additive.

**Evidence:** `packages/kit/src/identity.ts:58@c8305b1` — `export const IDENTITY_BUDGET_MS = 600;`

**Alternatives considered:**

- **Read the committer from `git log` after the fact** — rejected: a session
  that never commits has no author in history, and the report's question is
  who was steering, not who committed.
- **Record on every record** — rejected: the operator does not change within a
  session; the header is where session-constant identity lives.
- **Record `email` too** — rejected for now: the only redactor is in the
  unmerged `add-pr-process-report`, and a guard that lives entirely downstream
  is not a mechanism.

**Rationale:** the field is a claim about the tree's operator, in the same
class as `branch` and `worktree`, and gets their non-empty rule for the same
reason: a blank compares equal to every other blank.

### 9. The 0.6 fixture pair, and what the compatibility twin proves

**Chosen:** three fixtures. `v0.6-run.jsonl` — every kind including `prompt`,
per-record `origin` on the four coordinator kinds, an `expects: "findings"`
dispatch with a `finding`, a dispatch **without** `expects` whose terminal is
`found` and which no finding names, and a `user.name` header — must exit 0.
`v0.6-broken-run.jsonl` — trips each new rejection by name: a `prompt` with
neither `text` nor `chars`+`hash`, a non-integer `chars`, a blank `user.name`,
a `resolution` with no `origin`, a dispatch with `expects: "reviews"`, and an
`expects: "findings"` dispatch left silent — must exit 1. `v0.5-compat-run.jsonl`
— the **same bytes as `v0.6-run.jsonl`** apart from the declared version — must
exit **1**, because at 0.5 the unscoped `SILENT-REVIEWER` fires on the
dispatch without `expects` and the `prompt` kind is unknown.

**Rationale:** the 0.4 pair worked because the newer version was stricter, so
"same bytes, older version passes" proved the floor. This bump loosens one
verdict, so that pair is inverted: same bytes, newer version passes, older
fails. A pair where both fail proves nothing about the direction of the
predicate — which is exactly what a floor written backwards would look like.

### 8. Prompts are a record kind, joined by the harness's own key

**Chosen:** the plugin's `hooks.json` gains a `UserPromptSubmit` entry routed
to the same `witness-record.sh`. The recorder writes
`{"kind":"prompt","id":"p:<prompt_id>","text":…,"chars":N,"at":…}` and, from
then on, stamps `prompt: "p:<prompt_id>"` onto each `dispatch` and `mutation`
whose payload carries that `prompt_id`. The `Stop` event stays unrecorded.

**Evidence:** `plugin/hooks/hooks.json:64@c8305b1` — `    "Stop": [`

**Evidence:** `packages/kit/src/record.ts:200@c8305b1` — `      return plan([], `${event ?? "an unnamed event"} is not an event this build records`);`

**Alternatives considered:**

- **Record the reply on `Stop` as well, to show each exchange** — rejected:
  `last_assistant_message` is the agent's self-account, which is the tier this
  journal is built to distrust. The steering is evidence; the reply is a
  claim, and the work it caused is already recorded as dispatches and
  mutations.
- **Record only a hash of the prompt** — kept as the `NULLIUS_WITNESS_PROMPTS=0`
  mode, not the default: a hash proves a prompt happened and says nothing a
  reviewer can act on, and the report this feeds exists to show what the human
  said.
- **Store prompts in a sidecar rather than the journal** — rejected: the value
  is the join to dispatches and mutations, and every join the validator and
  any renderer make is within one file.

**Rationale:** `prompt_id` is already on every tool-call and stop payload the
recorder receives (not on `SessionStart`, which precedes any prompt), so the
join costs nothing and is harness-attested rather than inferred from
timestamps. A new kind is trigger 1 of the bump rule, and `0.6` is already
owed by Decision 4. Text length is capped at the same `EXCERPT_LIMIT` a
report's findings use, with `truncated: true` and `chars` when cut.

## Compatibility risks

**Risk:** a kit writing `0.6` produces journals an older standalone kernel
cannot read; it stops at `UNSUPPORTED-VERSION` and validates nothing below the
header.

**Binds at:** `inter-service-skew`

**Skew path:** `@nullius-inverba/kit@<this>` → `.nullius/runs/<session>.jsonl` → `@nullius-inverba/claims@≤0.8.0` invoked directly by a user or a CI step

**Symptom:** `witness validate` prints one finding and exits 1 on a journal that is otherwise sound.

**Mitigation closes it because:** the kit's own `witness check` validates through the kernel it depends on, so the plugin path cannot skew — the kit imports the validator from the package it pins:

**Evidence:** `packages/kit/src/cli.ts:22@c8305b1` — `import { isJournalFailure, validateJournal, type JournalOrigin } from "@nullius-inverba/claims";`

The residual case is a hand-run older kernel, and the finding it prints names the schema and says to upgrade rather than reporting a verdict.

## Open questions

Mirrored from `proposal.md`:

1. ~~Whether Decision 4's scoping is a bump~~ — resolved: 0.6 is owed by
   triggers 1 and 3 regardless; the scoping rides along.
2. How TAINTED probe rounds are recorded, if at all.
3. Whether `CLAUDE_CODE_SESSION_ID` is present under every harness entry point.
4. Whether transcript-derived usage belongs to the hooks tier.
5. ~~Whether prompt text is on by default~~ — settled by the operator: on.
6. The real field names of the `UserPromptSubmit` payload (probe first); the
   no-`prompt_id` fallback is stated in the proposal.
