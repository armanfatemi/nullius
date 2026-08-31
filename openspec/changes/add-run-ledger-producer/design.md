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
record that does not carry its own. The per-record check does not reuse the
header's two-member list, which would accept `"hooks"` on a `resolution`:

**Evidence:** `packages/claims/src/witness.ts:248@c8305b1` — `const ORIGINS = ["hooks", "self-reported"] as const;`

`finding` records carry no per-record origin: the recorder wrote them from the
harness payload, so the header's `hooks` is true of them. The alternative — a third header value such as
`mixed` — was rejected: it says the journal is impure without saying which
records are, which is the ambiguity the field exists to remove. This is one
of the three reasons `0.6` is owed (a new required field on four kinds is
trigger 3).

**The kernel says so where it speaks.** The validate summary currently renders
the header's origin as a sentence about every record in the file:

**Evidence:** `packages/claims/src/cli.ts:681@c8305b1` — `      return `Schema ${header.version}, origin: hooks — records emitted by the harness runtime, which the agent had no opportunity to decline.`;`

At ≥0.6 that sentence is false for part of a journal carrying ledger records,
so the summary changes shape at that floor: the header line is scoped to
"records carrying no origin of their own", followed by counts of hook-tier,
self-reported and unattributed records; `survey` prints the same sums. The
floor is decided in the kernel, not the CLI: `JournalReport.provenance` is
`null` below 0.6 and populated at or above it, so `cli.ts` renders on presence
and never compares versions — `versionAtLeast` stays private to `witness.ts`,
and its JSDoc call-site count is updated for the new sites. `unattributed` is
the branch the old sentence never had to name: records with no origin of their
own under a header whose origin is null or absent belong to nobody, and
counting them as hook-tier would be the flattering read the field exists to
remove. The same sentence lives in two more places the plan sweeps — the
module comment at `witness.ts:31-33` and `JournalHeader.origin`'s JSDoc. A
provenance rule that the tool's own output contradicts would be a rule in prose
only.

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

**The reads arrive through `RecordContext`.** Extraction needs no I/O, but
Decision 4's agent-file read and Decision 5's transcript read do, and
`record.ts` is deliberately I/O-free — its dependencies are injected so
correlation stays testable without a filesystem:

**Evidence:** `packages/kit/src/record.ts:46@c8305b1` — `export interface RecordContext {`

Both reads are added as context functions (`readAgentDefinition`,
`readTranscriptUsage`), implemented in `cli.ts` beside `locateTarget`, and
stubbed in `record.test.ts`.

### 2b. A clean review is a tagged review

**Chosen:** a reviewer whose dispatch carries `expects: "findings"` and whose
return has no tag line earns `SILENT-REVIEWER` at 0.6, as the schema says. The
change makes the contract explicit where the recorder reads it: each of the
four reviewer agent files' `## Output format` gains the sentence "a review
with nothing to raise returns at least one `[looks-good]` line; an untagged
return is recorded as silent". The recorder's own distinction is unchanged —
empty text is `empty`, anything else is `found`:

**Evidence:** `packages/kit/src/record.ts:298@c8305b1` — `          "the subagent stopped without a final message recorded by the harness — it returned, and returned nothing",`

**Alternatives considered:**

- **Make the scoped verdict advisory** — rejected: it collapses the three-state
  distinction the verdict exists for; `found` with no finding would read like
  `empty`, which is the collapse invariant 1 forbids.
- **Treat a bare "None." / "no findings" line as a `looks-good`** — rejected:
  that is a classifier over prose, exactly what Decision 2 refuses.
- **Only mark `expects` when the agent file also says clean reviews are
  tagged** — rejected: it makes the denominator depend on a second prose
  pattern; one declared grammar is enough.

**Rationale:** the schema already settled it — `looks-good` is not decoration:

**Evidence:** `spec/witness-journal.md:122@c8305b1` — `  decoration — an explicit nothing-found is how a reviewer proves it was not`

That is what discharges the verdict. A verdict that fires on an
untagged return is firing on a reviewer that did not use the contract it
declared, and the fix is in the contract's text, not in the verdict.

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

**Known limit, accepted, in both directions:** the denominator is editable
in-session. Deleting `[blocker]` from an agent's output section disarms the
verdict for every later dispatch; renaming `retro-writer.md`'s
`## Output back to the dispatcher` heading to `## Output format` would arm it
against a non-reviewer, since all five agent files contain `[blocker]` and only
the heading spelling separates them. The journal records either edit only as an
ordinary `mutation` of the agent file. The mitigation belongs to `wiring`, not
here: a check that every agent named in a skill's `dispatches:` declares the
tag contract, and that no other agent does. Recorded as a follow-up in
`tasks.md` §6, not solved in this change.

**What the recorder does say, and the one direction it fails open.** A miss is
not silent: the dispatch records
`agent_definition: "read" | "missing" | "unreadable" | "unsafe-name"` (metadata
no verdict reads), so a dispatch without `expects` because the file could not
be read is distinguishable in the journal from one whose agent is not a
reviewer. But it is still a dispatch `SILENT-REVIEWER` cannot fire on, where at
0.5 it would have — the floor's one fail-open direction, stated here rather
than discovered later. The remedy is the same `wiring` check the arming limit
above names: a reviewer whose definition the recorder cannot read is a broken
reading list, and that is a question about the repository, not about one run. And `subagent_type` is payload-supplied, so it is validated against
the same conservative name shape `isSafeChangeName` enforces before any path is
built; an unsafe value reads nothing and is recorded as such.

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
decisions, prompts } | null` — `null` below 0.6, populated at or above it — and
`JournalReport.provenance` on the same rule (Decision 1). The validate summary
prints each block only when present, so a 0.5 journal's summary is unchanged
from today even though 0.3–0.5 journals may carry ledger kinds: the summary
changes shape once, at the floor where the provenance line changes, not twice.

`JournalSurvey` carries the same two blocks and the same `| null`. A sum is not
an absence: summing over zero qualifying journals yields zeros, and a survey of
only 0.5 journals printing "0 stages, 0 findings…" is exactly the summary
change the spec's own scenario forbids. So the survey's blocks are `null` when
no surveyed journal reached the floor, and its renderer renders on presence,
like `validate`'s. Namespaced because
`JournalReport.findings` already exists as the array of validator findings and
is consumed as one in the kernel CLI, the kit CLI and `doctor`; a counter of
the same name would be a breaking redefinition, not an addition. One new
optional-to-read field on each exported interface is additive.

### 7. The git user is header identity, resolved where the other identity is

**Chosen:** `resolveIdentity` also runs `git config user.name` inside the same
per-call and total budgets, and the header gains `user: { name }`. Missing is
omitted; an empty string is `MALFORMED` at `0.6`, the same **rule** the other
identity fields carry — but not the same code path. Those fields are a flat
list of top-level strings, assigned in one loop that records at every declared
version and whose *rejection* of a blank is gated at 0.4:

**Evidence:** `packages/claims/src/witness.ts:208@c8305b1` — `const IDENTITY_FIELDS = ["branch", "head", "worktree"] as const;`

**Evidence:** `packages/claims/src/witness.ts:481@c8305b1` — `        identity[field] = value as string;`

`user` is nested, and adding it to that list would tighten 0.4 and 0.5
retroactively. It gets its own branch in `scanHeader`: `user.name` is recorded
at every version, and at ≥0.6 a blank `name` — or a `user` that is present but
is not an object carrying a string `name` (`user: "Arman"`, `user: {}`) — is
`MALFORMED` naming the field. The unrecognised-shape case fails closed for the
reason Decision 4 gives for `expects`: a producer that writes the wrong shape
holds a wrong model of the field, and dropping the value silently would let
that persist. The rule is a
**tightening**, so this decision is one of the reasons `0.6` is a bump rather
than a courtesy. `email` is not recorded (see the proposal); adding it later is
additive.

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
`v0.6-broken-run.jsonl` — trips each new rejection by name, and the list in
tasks §1's unit-test line is authoritative; today that is: a `prompt` with
neither `text` nor `chars`+`hash`, a non-integer `chars`, a blank `user.name`,
a `resolution` with no `origin`, a `resolution` with `origin: "hooks"`, a
dispatch with `expects: "reviews"`, and an `expects: "findings"` dispatch left
silent — must exit 1. (The `user` shape cases are unit-tested; a second header
cannot appear in one fixture.) `v0.5-compat-run.jsonl`
— the **same bytes as `v0.6-run.jsonl`** apart from the declared version — must
exit **1**, because at 0.5 the unscoped `SILENT-REVIEWER` fires on the
dispatch without `expects` and the `prompt` kind is unknown.

**Rationale:** the 0.4 pair worked because the newer version was stricter, so
"same bytes, older version passes" proved the floor. This bump loosens one
verdict, so that pair is inverted: same bytes, newer version passes, older
fails. A pair where both fail proves nothing about the direction of the
predicate — which is exactly what a floor written backwards would look like.

**What the twin cannot isolate.** At 0.5 the twin exits 1 for two independent
reasons — the unscoped `SILENT-REVIEWER` and the unknown `prompt` kind — and an
exit code cannot say which fired. The "fires unscoped at 0.5" unit test is
what pins the loosening; the CI comment beside the twin says so, so nobody
reads the exit code as proof of the predicate's direction on its own.

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
timestamps. The join key is read by no verdict — a `prompt` value naming no
record validates clean — and that is stated in the proposal's non-goals rather
than left to be discovered.

**The hook's stdout is not the model's context.** `UserPromptSubmit` is the
one event whose hook stdout the harness returns to the model. The recorder's
own notes go to stderr, but the launcher can print:

**Evidence:** `plugin/hooks/witness-record.sh:45@c8305b1` — `if ! $runner witness record --root "$root"; then`

`$runner` is `npx -y @nullius-inverba/kit` by default, and `npx` writes to
stdout on a cold cache. The script redirects the runner's stdout to stderr for
every event — not only the new one — so the guarantee does not depend on which
event fired. The proof is a subprocess test that runs the script with a stub
runner writing a sentinel to stdout and asserts the sentinel arrives on stderr
only; `doctor`'s live proof cannot stand in for it, because it calls
`planRecords` in-process and never executes the script.

**The time bound goes in the script, not in `hooks.json`.** This event is
synchronous on every human prompt, and a cold `npx` cache stalling the
interactive path is the shape that gets a hook uninstalled — so the runner is
bounded. But the bound is a wrapper inside the script rather than a harness
`timeout` key, because the fail-open guarantee this repository relies on is the
script's own last line:

**Evidence:** `plugin/hooks/witness-record.sh:17@c8305b1` — `# ALWAYS EXITS 0. A PreToolUse hook that exits 2 blocks the tool call, and a`

A harness-killed process never reaches that line, and `UserPromptSubmit` is the
one event where a hook that does not exit cleanly can erase the operator's
prompt. A delegated bound is a convention; an in-script one is a mechanism, and
this file is where the mechanism already lives. `hooks.json` gains no `timeout`
key — it would also be the first in that file.

**Known limit, accepted:** a hand-appended `finding` is byte-identical to a
hook-extracted one. `witness ledger` refuses the kind, which is a
command-surface convention, not a property of the file. The journal is local
and this change ships one writer; a file-level mechanism belongs to
`add-journal-sealing`. A new kind is trigger 1 of the bump rule, and `0.6` is already
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
