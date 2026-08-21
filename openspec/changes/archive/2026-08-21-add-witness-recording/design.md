# Design — witness recording

## Context

The journal exists to make three failures visible: silence read as success,
verification quoted after its subject changed, and omission read as "nothing to
report". The producer must not reintroduce any of them through its own
mechanics.

## Decision 1 — correlate by explicit key, across three events

**Revised during implementation, on evidence.** The original decision put the
terminal at `PostToolUse:Task` and ruled `SubagentStop` out for carrying "no
join key". A probe of the installed harness refuted both halves:

**Evidence:** `spec/fixtures/probes/claude-code/PostToolUse-Agent.json:16` — `    "status": "async_launched",`

**Evidence:** `spec/fixtures/probes/claude-code/SubagentStop.json:7` — `  "agent_id": "ab210a2c41e64ee5f",`

On Claude Code 2.1.238, `PostToolUse` on a subagent fires when it is *launched*
and answers with an acknowledgement, not a result; the result arrives on
`SubagentStop`, which carries `agent_id` — equal to the acknowledgement's
`agentId` — and `last_assistant_message`. So the chain is three events, joined
at each step by a key the harness supplied:

```
PreToolUse:Agent    tool_use_id ─────────────────► dispatch
PostToolUse:Agent   tool_use_id ↔ agentId ───────► launch link (sidecar, not a record)
SubagentStop        agent_id ────────────────────► terminal report
```

The principle the original decision was defending is unchanged and is the
reason this survives the parallel case: **correlate only by a key the harness
supplied, never by order or timing.** What was wrong was a premise about which
events carry such a key — the kind of thing that cannot be settled by reasoning
about a system you do not own, which is why the probe fixtures exist.

Reading the acknowledgement as a terminal is the failure mode to avoid, and it
is not a small one: it marks every dispatch `found` with the acknowledgement as
its finding, and makes `no-report` unreachable. The producer would commit,
mechanically, the exact laundering the journal exists to catch. `witness record`
therefore refuses to read a launch acknowledgement as a report under any
topology.

The link is producer state, not journal content: `agentId → dispatch` lives in
`.nullius/runs/<session>.links.json`, so the schema stays as specified and a
journal remains readable without it.

Two degradations, both deliberate:

- **Where the harness omits `tool_use_id`**, the dispatch/report join falls back
  to a content hash of `tool_input`, and the record carries `ambiguous: true`.
  Two identical parallel dispatches then collide onto one id, which the
  validator reports as `DUPLICATE-ID`. A journal that admits what it could not
  correlate beats one that correlates confidently and wrongly.
- **Where a `SubagentStop` resolves to no link**, nothing is recorded and the
  reason is printed. That state means either the subagent was synchronous — in
  which case `PostToolUse` already carried the real response and wrote the
  terminal — or the dispatch predates the hooks. Writing a report against an
  invented dispatch id would manufacture a `DANGLING-REFERENCE` out of the
  common case.

## Decision 2 — `mutation` is a new kind, not a reuse of `verification`

Recording an Edit/Write as a `verification` would be semantically false:
nothing was checked. But invariant 2 (verified-once-is-not-verified) needs
mutations to advance the per-path hash map, which today only verification and
append records do. `mutation` carries `target: {path, hash}` and participates
in the hash map; it can never be the object of a `reliance`.

## Decision 3 — a version header, and how unknown versions fail

First record: `{"kind":"journal","version":"0.2","origin":"hooks",...}`.
Headerless input is validated as v0.1 (everything that exists today). A version
the validator does not know yields a single `UNSUPPORTED-VERSION` finding and
stops — one clear message instead of a `MALFORMED` cascade that buries the
cause. The closed-vocabulary strictness that is right for verdicts means every
schema addition is loud; the version record is what makes it loud *and*
diagnosable.

## Decision 4 — locked appends, one file per session

Layout: `.nullius/runs/<session_id>.jsonl`. Parallel subagent hooks append
concurrently to one file; `O_APPEND` atomicity is only assured for small
writes, so `witness record` takes an advisory lock (`flock`) around each
append. A resumed session gets a new session id and therefore a new file; the
header records `source` (startup/resume/clear/compact) so a fork in journal
identity is visible rather than mysterious. Cross-file `reliance` references
are out of scope for v0.2 and remain `dangling-reference` — documented, not
hidden.

## Decision 5 — Stop-hook validation is advisory in v1

A Stop hook that exits 2 on validation failure re-prompts the agent and risks
loops (guarded on `stop_hook_active` regardless). v1 prints findings and exits
0 — advisory first, the project's standing posture. Stop also fires per
assistant turn, not per run; run-end semantics belong to session end, and the
synthesized `no-report` terminals are legitimate there because "never came
back" is machine-detectable at that moment and at no earlier one.

## Decision 6 — the self-reported tier is labeled, loudly

For harnesses without hooks, skills can instruct agents to write the same
records. That journal is internally consistent fiction at worst — so `origin:
"self-reported"` goes in the header, and `witness validate` prints it in the
summary line. The distinction between "the harness attests this" and "the
agent says so" is the tool's entire subject; the output must carry it.

## Alternatives considered

- **Logic in shell hooks** — rejected; the existing plan-discovery scan in
  `check-plan.sh` shows how fragile harness-coupled shell becomes. All logic
  lives in `witness record`; shims are one line.
- **SubagentStop + ordering heuristics** — rejected per Decision 1.
- **Extending the v0.1 schema silently** — rejected; unknown kinds are hard
  `MALFORMED` today, so old validators would reject new journals confusingly.
