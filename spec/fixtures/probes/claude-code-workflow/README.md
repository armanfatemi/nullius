# Probes — dynamic workflows, as recorded

These are **recordings, not documentation**, for the same reason as
[`../claude-code/`](../claude-code/README.md): every field the recorder reads is
an assumption about a harness this repo does not own, and the only honest way
to hold one is to go and look.

This corpus settles IDEAS.md Track 3 P6: **do agents spawned inside a Claude
Code dynamic workflow reach the witness recorder?**

**Captured from:** Claude Code 2.1.240, Linux x86_64, 2026-08-22, via a
diagnostic hook that appended every payload verbatim. Absolute paths under the
capturing machine's home directory were replaced with `/home/user/…`; nothing
else was altered, and no field was added.

| File | What it is |
| --- | --- |
| `sequence.jsonl` | The order events arrived in, across both probes — the finding itself |
| `PreToolUse-Agent.json` | A plain subagent dispatch (the control) |
| `PostToolUse-Agent.json` | The control's terminal — `status: "completed"`, not a launch acknowledgement |
| `SubagentStop-subagent.json` | A subagent terminal, carrying `agent_id` and `last_assistant_message` |
| `PreToolUse-Workflow.json` | The `Workflow` tool call itself, carrying the whole script in `tool_input.script` |
| `PostToolUse-Workflow.json` | The workflow's completion |
| `workflow-journal-two-agents.jsonl` | The harness's own per-workflow journal: `started` / `result` per agent |
| `workflow-journal-resumed.jsonl` | The same journal after a **cached** resume — unchanged, which is the point |

## What the recording showed

### 1. Workflow agents emit `SubagentStop` and nothing else

Probe 1 ran one plain `Agent` call as a control and a two-agent workflow. The
control produced all three events. The two workflow agents produced **only**
`SubagentStop` — no `PreToolUse:Agent`, no `PostToolUse:Agent`.

**Evidence:** `spec/fixtures/probes/claude-code-workflow/sequence.jsonl:4`

```
{"probe": "probe-1", "event": "SubagentStop", "tool_name": null, "tool_use_id": null, "agent_id": "a82cd6f70e576140c", "last_assistant_message": "BRAVO"}
```

Its dispatch is absent because no `Agent` event carrying a `tool_use_id` for it
appears anywhere in the sequence — every `PreToolUse` recorded is either the
control or the `Workflow` call itself.

The hook pack's correlation chain begins at `PreToolUse`, so there is no
`dispatch` to join a terminal to. The recorder declines to invent one, which is
correct and is also the whole problem: replaying all five captured payloads
through the shipped recorder yields a journal with **one** dispatch — the
control — and the validator's verdict is `Journal valid.`

Two agents ran, returned `ALPHA` and `BRAVO`, and left no trace. That is
verbatim the failure this project exists to prevent, restated one layer up:
a run that dispatched three agents summarises identically to one that
dispatched one, and the validator certifies it.

Anything claiming `witness` covers a workflow-shaped run is false as of this
build.

### 2. The plan is visible even though the executions are not

`PreToolUse` **does** fire for the `Workflow` tool, and `tool_input.script`
carries the entire script.

**Evidence:** `spec/fixtures/probes/claude-code-workflow/PreToolUse-Workflow.json:11` — `  "tool_name": "Workflow",`

**Evidence:** `grep -c '"script"' spec/fixtures/probes/claude-code-workflow/PreToolUse-Workflow.json` → 1 results

This is the source P7 was missing. A workflow script is a declared dispatch
plan — `parallel(...)` states how many agents are intended before any of them
runs — so `planned N, terminated K` becomes computable from the hook payload
alone. Today the validator can only catch a dispatch that was *recorded and
never terminated*; it is blind to one that was never made, for want of a
denominator. The denominator was in the payload the whole time.

### 3. The harness already writes a per-workflow journal

`started` and `result`, one pair per agent, keyed by `agentId` — which is the
same id `SubagentStop` carries. One agent's id appears three times across this
corpus: once as a terminal, twice in the harness's own journal. The search
excludes this README, which now quotes the id too — the claim is about the
fixtures, not about the prose describing them.

**Evidence:** `grep -rn --exclude='README.md' 'a82cd6f70e576140c' spec/fixtures/probes/claude-code-workflow/` → 3 results
 That is a `dispatch`/`report` pair in all but
name, and it correlates to the hook events by a key the harness supplied,
which is the standing rule for correlation here.

So a workflow producer has two candidate sources and does not have to guess:
the script (the plan) and this journal (the executions).

### 4. A cached resume records nothing — the journal layer is honest

Re-running a workflow with `resumeFromRunId` and an unchanged script returned
the cached result in 7ms with zero subagent tokens. It emitted **no**
`SubagentStop`, and `workflow-journal-resumed.jsonl` is byte-identical to the
pre-resume state — still one `result`, for the one agent that really ran.

**Evidence:** `grep -c '"type":"result"' spec/fixtures/probes/claude-code-workflow/workflow-journal-resumed.jsonl` → 1 results

This **closes P8 as a non-hazard at the record layer**. The worry was that a
cached agent would emit records indistinguishable from real work — the producer
committing the laundering the journal exists to catch. It does not.

The summary layer is a different story, and worth stating precisely because the
distinction is this repo's whole subject: the resumed run's usage block reported
`agent_count: 1, agents_done: 1` for a run in which no agent ran. The
mechanical record is honest; the human-readable account of it is not. A journal
and a summary are different objects, and only one of them is evidence.

## What this corpus does not show

- **Nothing about scale.** Three agents, not sixty-four. Whether the ordering
  holds under real concurrency is untested here.
- **Nothing about `isolation: "worktree"`** agents, background agents, or
  nested `workflow()` calls.
- **Nothing about the plugin.** These were captured with a diagnostic hook, not
  the shipped hook pack, because the plugin was not installed in the capturing
  session. The replay through `witness record` used the shipped recorder, so
  finding 1 is about real code; the *capture* is not evidence the plugin
  installs correctly.
- **The control's event order is not the corpus's.** Here `SubagentStop`
  arrived *before* `PostToolUse`, and `tool_response.status` was `"completed"`
  rather than `"async_launched"` — a synchronous dispatch, where
  [`../claude-code/`](../claude-code/README.md) captured an asynchronous one.
  The recorder handles both; the ordering is not a fixed property of the
  harness, and correlation logic must not assume it.

  **Evidence:** `spec/fixtures/probes/claude-code-workflow/PostToolUse-Agent.json:19` — `    "status": "completed",`
