import { describe, expect, it } from "vitest";

import { planRecords, type RecordContext } from "./record";

function context(overrides: Partial<RecordContext> = {}): RecordContext {
  return {
    origin: "hooks",
    now: () => "2026-08-21T12:00:00.000Z",
    locateTarget: (path) => ({ path, hash: "cafebabe0011" }),
    openDispatches: () => [],
    resolveAgent: () => null,
    ...overrides,
  };
}

const TASK_INPUT = {
  subagent_type: "Explore",
  description: "find the retry helper",
  prompt: "Search packages/ for a retry helper and report what you find.",
};

describe("dispatch — PreToolUse on Task", () => {
  it("records a dispatch keyed on the harness tool_use_id", () => {
    const plan = planRecords(
      {
        hook_event_name: "PreToolUse",
        tool_name: "Task",
        tool_use_id: "toolu_01ABC",
        session_id: "sess-1",
        tool_input: TASK_INPUT,
      },
      context(),
    );

    expect(plan.records).toEqual([
      {
        kind: "dispatch",
        id: "d:toolu_01ABC",
        task: "find the retry helper",
        agent: "Explore",
        at: "2026-08-21T12:00:00.000Z",
      },
    ]);
    expect(plan.session).toBe("sess-1");
  });

  it("records a dispatch when the harness calls the tool Agent", () => {
    // Claude Code 2.1.238 sends tool_name "Agent" for the subagent tool while
    // hook matchers still accept "Task". Probed, not assumed:
    // spec/fixtures/probes/claude-code/PreToolUse.json.
    const plan = planRecords(
      {
        hook_event_name: "PreToolUse",
        tool_name: "Agent",
        tool_use_id: "toolu_01JhU",
        tool_input: TASK_INPUT,
      },
      context(),
    );

    expect(plan.records[0]).toMatchObject({ kind: "dispatch", id: "d:toolu_01JhU" });
  });

  it("leaves tools that are not a dispatch alone, and says why", () => {
    const plan = planRecords(
      { hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "ls" } },
      context(),
    );

    expect(plan.records).toEqual([]);
    expect(plan.note).toContain("Bash");
  });
});

describe("report — PostToolUse on Task", () => {
  const base = {
    hook_event_name: "PostToolUse",
    tool_name: "Task",
    tool_use_id: "toolu_01ABC",
    session_id: "sess-1",
    tool_input: TASK_INPUT,
  };

  it("joins the report to its dispatch by tool_use_id", () => {
    const [report] = planRecords({ ...base, tool_response: "src/retry.ts exports retry()" }, context())
      .records;

    expect(report).toMatchObject({
      kind: "report",
      id: "r:toolu_01ABC",
      dispatch: "d:toolu_01ABC",
      outcome: "found",
      findings: ["src/retry.ts exports retry()"],
    });
    expect(report).not.toHaveProperty("ambiguous");
  });

  it("reads a content-block response the way the harness sends it", () => {
    const [report] = planRecords(
      { ...base, tool_response: { content: [{ type: "text", text: "nothing consumes it" }] } },
      context(),
    ).records;

    expect(report).toMatchObject({ outcome: "found", findings: ["nothing consumes it"] });
  });

  it("records a blank response as an explicit empty, not as a find", () => {
    const [report] = planRecords({ ...base, tool_response: "   " }, context()).records;

    expect(report).toMatchObject({ kind: "report", outcome: "empty" });
    expect(String((report as { statement: string }).statement)).not.toHaveLength(0);
  });

  it("records an errored subagent as no-report — it came back with nothing to report", () => {
    const [report] = planRecords(
      { ...base, tool_response: { is_error: true, content: "Error: agent exceeded its turn limit" } },
      context(),
    ).records;

    expect(report).toMatchObject({ kind: "report", outcome: "no-report" });
    expect((report as { statement: string }).statement).toContain("turn limit");
  });

  it("records a missing response as no-report", () => {
    const [report] = planRecords(base, context()).records;

    expect(report).toMatchObject({ kind: "report", outcome: "no-report" });
  });

  it("refuses to read a launch acknowledgement as a report", () => {
    // Observed, not assumed: PostToolUse on Agent fires when the subagent is
    // LAUNCHED, and its response acknowledges the launch. Recording that as a
    // terminal marks every dispatch `found` with the acknowledgement as its
    // finding — the exact laundering this journal exists to prevent, done by
    // its own producer. See spec/fixtures/probes/claude-code/.
    const plan = planRecords(
      {
        ...base,
        tool_response: {
          isAsync: true,
          status: "async_launched",
          agentId: "ab210a2c41e64ee5f",
          description: "Find retry helper definition in src/",
        },
      },
      context(),
    );

    expect(plan.records).toEqual([]);
    expect(plan.note).toContain("launch");
    expect(plan.link).toEqual({ agentId: "ab210a2c41e64ee5f", dispatch: "d:toolu_01ABC" });
  });

  it("caps a long response and says that it capped it", () => {
    const [report] = planRecords(
      { ...base, tool_response: "x".repeat(5000) },
      context(),
    ).records;

    expect(report).toMatchObject({ truncated: true, response_chars: 5000 });
    expect((report as { findings: string[] }).findings[0]?.length).toBeLessThan(5000);
  });
});

describe("correlation without a tool_use_id", () => {
  const input = { hook_event_name: "PreToolUse", tool_name: "Task", tool_input: TASK_INPUT };

  it("falls back to a content hash, and dispatch and report agree on it", () => {
    const [dispatch] = planRecords(input, context()).records as [{ id: string }];
    const [report] = planRecords(
      { ...input, hook_event_name: "PostToolUse", tool_response: "found it" },
      context(),
    ).records as [{ dispatch: string }];

    expect(dispatch.id).toBe(report.dispatch);
    expect(dispatch.id).not.toContain("undefined");
  });

  it("writes the ambiguity into the record rather than guessing quietly", () => {
    const [report] = planRecords(
      { ...input, hook_event_name: "PostToolUse", tool_response: "found it" },
      context(),
    ).records;

    expect(report).toMatchObject({ ambiguous: true });
  });

  it("keeps two differently-tasked parallel dispatches apart", () => {
    const [first] = planRecords(input, context()).records as [{ id: string }];
    const [second] = planRecords(
      { ...input, tool_input: { ...TASK_INPUT, description: "find the cache helper" } },
      context(),
    ).records as [{ id: string }];

    expect(first.id).not.toBe(second.id);
  });
});

describe("mutation — PostToolUse on an editing tool", () => {
  it("records the target as the locator gives it — repo-relative, hashed as it now stands", () => {
    const plan = planRecords(
      {
        hook_event_name: "PostToolUse",
        tool_name: "Edit",
        tool_use_id: "toolu_02DEF",
        tool_input: { file_path: "/repo/src/retry.ts" },
      },
      context({
        // The CLI hands back a repo-relative path on purpose: invariant 2
        // compares path strings, so a mutation recorded as an absolute path
        // would never invalidate a verification recorded as a relative one.
        locateTarget: (path) =>
          path === "/repo/src/retry.ts" ? { path: "src/retry.ts", hash: "deadbeef1234" } : null,
      }),
    );

    expect(plan.records).toEqual([
      {
        kind: "mutation",
        id: "m:toolu_02DEF",
        target: { path: "src/retry.ts", hash: "deadbeef1234" },
        tool: "Edit",
        at: "2026-08-21T12:00:00.000Z",
      },
    ]);
  });

  it("records nothing when the file cannot be read, and says so out loud", () => {
    const plan = planRecords(
      {
        hook_event_name: "PostToolUse",
        tool_name: "Write",
        tool_input: { file_path: "/repo/gone.ts" },
      },
      context({ locateTarget: () => null }),
    );

    expect(plan.records).toEqual([]);
    expect(plan.note).toContain("/repo/gone.ts");
  });
});

describe("session boundaries", () => {
  it("takes the header's source from SessionStart", () => {
    const plan = planRecords(
      { hook_event_name: "SessionStart", session_id: "sess-1", source: "resume" },
      context(),
    );

    expect(plan.records).toEqual([]);
    expect(plan.source).toBe("resume");
    expect(plan.session).toBe("sess-1");
  });

  it("synthesizes a no-report terminal for every dispatch still open at session end", () => {
    const plan = planRecords(
      { hook_event_name: "SessionEnd", session_id: "sess-1", reason: "clear" },
      context({
        openDispatches: () => [
          { id: "d:toolu_01ABC", task: "find the retry helper" },
          { id: "d:toolu_09XYZ", task: null },
        ],
      }),
    );

    expect(plan.records).toHaveLength(2);
    expect(plan.records[0]).toMatchObject({
      kind: "report",
      dispatch: "d:toolu_01ABC",
      outcome: "no-report",
    });
    expect((plan.records[0] as { statement: string }).statement).toContain("find the retry helper");
    expect((plan.records[1] as { statement: string }).statement).toContain("d:toolu_09XYZ");
  });

  it("writes nothing at session end when every dispatch came back", () => {
    expect(
      planRecords({ hook_event_name: "SessionEnd", session_id: "sess-1" }, context()).records,
    ).toEqual([]);
  });
});

describe("payloads this build does not handle", () => {
  it("ignores an unknown event, and names it", () => {
    const plan = planRecords({ hook_event_name: "Notification" }, context());

    expect(plan.records).toEqual([]);
    expect(plan.note).toContain("Notification");
  });

  it("ignores a payload that is not an object at all", () => {
    expect(planRecords("nonsense", context()).records).toEqual([]);
  });
});

describe("terminal — SubagentStop", () => {
  const stop = {
    hook_event_name: "SubagentStop",
    session_id: "sess-1",
    agent_id: "ab210a2c41e64ee5f",
    agent_type: "Explore",
  };

  it("writes the terminal for the dispatch its agent id is linked to", () => {
    const plan = planRecords(
      { ...stop, last_assistant_message: "The retry helper is in src/retry.ts." },
      context({
        resolveAgent: (id) => (id === "ab210a2c41e64ee5f" ? "d:toolu_01ABC" : null),
      }),
    );

    expect(plan.records).toEqual([
      {
        kind: "report",
        id: "r:ab210a2c41e64ee5f",
        dispatch: "d:toolu_01ABC",
        agent: "Explore",
        outcome: "found",
        findings: ["The retry helper is in src/retry.ts."],
        at: "2026-08-21T12:00:00.000Z",
      },
    ]);
  });

  it("keeps two parallel subagents on their own dispatches", () => {
    const links: Record<string, string> = {
      ab210a2c41e64ee5f: "d:toolu_01ABC",
      aadea4f3d57e80663: "d:toolu_02DEF",
    };
    const resolve = context({ resolveAgent: (id) => links[id] ?? null });

    const first = planRecords({ ...stop, last_assistant_message: "found it" }, resolve).records[0];
    const second = planRecords(
      { ...stop, agent_id: "aadea4f3d57e80663", last_assistant_message: "no debounce helper exists" },
      resolve,
    ).records[0];

    expect(first).toMatchObject({ dispatch: "d:toolu_01ABC" });
    expect(second).toMatchObject({ dispatch: "d:toolu_02DEF" });
  });

  it("records a subagent that stopped without a final message as an explicit empty", () => {
    const plan = planRecords(stop, context({ resolveAgent: () => "d:toolu_01ABC" }));

    expect(plan.records[0]).toMatchObject({ outcome: "empty" });
    expect((plan.records[0] as { statement: string }).statement.length).toBeGreaterThan(0);
  });

  it("records nothing for a stop it cannot link, and says which agent", () => {
    const plan = planRecords(
      { ...stop, last_assistant_message: "orphaned" },
      context({ resolveAgent: () => null }),
    );

    expect(plan.records).toEqual([]);
    expect(plan.note).toContain("ab210a2c41e64ee5f");
  });

  it("does not fire the loop guard's job — a stop is recorded, not validated", () => {
    const plan = planRecords(
      { ...stop, stop_hook_active: true, last_assistant_message: "found it" },
      context({ resolveAgent: () => "d:toolu_01ABC" }),
    );

    expect(plan.records).toHaveLength(1);
  });
});
