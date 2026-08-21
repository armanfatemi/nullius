# Probes — Claude Code hook payloads, as recorded

These are **recordings, not documentation**. Every field
[`witness record`](../../../../packages/kit/) reads out of a hook payload is an
assumption about a harness this repo does not own, and the only way to hold
such an assumption honestly is to go and look. `doctor` diagnoses an installed
harness against these samples rather than against a docs page describing some
version of it.

**Captured from:** Claude Code 2.1.238, macOS, 2026-08-21, via a hook that
appended every payload verbatim (`NULLIUS_WITNESS_PROBE=1` does the same thing
per event). Absolute paths under the capturing machine's home directory were
replaced with `/home/user/…`; nothing else was altered, and no field was added.

| File | What it is |
| --- | --- |
| `SessionStart.json` | `source: "startup"`, plus `cwd` and `transcript_path` |
| `PreToolUse-Agent.json` | A subagent dispatch: `tool_use_id`, and `tool_input` with `description` / `prompt` / `subagent_type` |
| `PostToolUse-Agent.json` | The **launch acknowledgement** — see below |
| `PostToolUse-Write.json` | A file write: `tool_input.file_path` and a `tool_response` describing the change |
| `SubagentStop.json` | The subagent's actual terminal: `agent_id`, `agent_type`, `last_assistant_message` |
| `Stop.json` | Per assistant turn, with `stop_hook_active` |
| `SessionEnd.json` | `reason` (`"other"` for a `-p` run) |
| `sequence.jsonl` | The order the events arrived in, which is itself the finding |

## What the recording showed

Three things that documentation and reasonable inference both got wrong, and
that only a run could settle:

1. **The subagent tool reports `tool_name: "Agent"`.** Hook matchers accept
   `Task`; the payload for that very call says `Agent`. A recorder matching only
   the documented name fires on every dispatch, recognises none of them, and
   writes a journal that reads exactly like a session which dispatched nobody.

   **Evidence:** `spec/fixtures/probes/claude-code/PreToolUse-Agent.json:8` — `  "tool_name": "Agent",`

2. **`PostToolUse` on `Agent` fires at launch, not at completion.** Its
   `tool_response` is `{"isAsync": true, "status": "async_launched", "agentId":
   …}` — an acknowledgement, not an answer. Treating it as the terminal record
   marks every dispatch `found`, with the acknowledgement as the finding, and
   makes the `no-report` state unreachable. That is the precise failure the
   journal exists to prevent, reintroduced by its own producer.

3. **`SubagentStop` carries a join key after all.** Its `agent_id` equals the
   `agentId` in the launch acknowledgement, and `last_assistant_message` carries
   what the subagent actually said.

   **Evidence:** `spec/fixtures/probes/claude-code/SubagentStop.json:7` — `  "agent_id": "ab210a2c41e64ee5f",`

   **Evidence:** `grep -n 'ab210a2c41e64ee5f' spec/fixtures/probes/claude-code/sequence.jsonl` → 2 results

   So the correlation chain that works here is:

   ```
   PreToolUse:Agent   tool_use_id ─────────────► dispatch
   PostToolUse:Agent  tool_use_id ↔ agentId ───► launch link
   SubagentStop       agent_id    ─────────────► terminal report
   ```

   Point 3 contradicts the design note that ruled `SubagentStop` out for
   lacking a join key. The rule it was defending still holds — never correlate
   by order or timing — but the premise about this harness was wrong, and a
   recording is what says so.
