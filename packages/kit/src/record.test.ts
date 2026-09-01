import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  planRecords,
  withTotal,
  TRANSCRIPT_BUDGET_MS,
  TRANSCRIPT_BYTE_CAP,
  type RecordContext,
  type TranscriptBudgets,
} from "./record";

/**
 * A recorder wired to answer every question, because `RecordContext` has no
 * optional members: a caller cannot decline to say whether it can read an
 * agent definition, a transcript, or the operator's prompt.
 *
 * The three defaults are the emptiest true answers, not neutral ones, and each
 * is visible in what the recorder emits:
 *
 *  - `readAgentDefinition: () => null` — "there is no such file". Every
 *    dispatch to a safely-named agent therefore carries
 *    `agent_definition: "missing"`, which is the point: a recorder that asked
 *    and found nothing is not the same as one that never asked, and with the
 *    reader required the second case no longer exists.
 *  - `readTranscriptUsage: () => null` — "no usage could be read". Only
 *    consulted for a payload naming `agent_transcript_path`, and the three
 *    tests that do supply their own.
 *  - `recordPromptText: () => true` — the operator-settled default, now stated
 *    here rather than inferred from an absent predicate.
 */
function context(overrides: Partial<RecordContext> = {}): RecordContext {
  return {
    now: () => "2026-08-21T12:00:00.000Z",
    locateTarget: (path) => ({ path, hash: "cafebabe0011" }),
    openDispatches: () => [],
    resolveAgent: () => null,
    hasTerminal: () => false,
    readAgentDefinition: () => null,
    readTranscriptUsage: () => null,
    recordPromptText: () => true,
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
        // The helper's reader answers "no such file" for every agent, and the
        // dispatch says so. `agent_definition` is on every dispatch that names
        // an agent now that the reader is required — its absence used to mean
        // "the recorder was never wired to ask", and that state no longer
        // exists.
        agent_definition: "missing",
      },
    ]);
    expect(plan.session).toBe("sess-1");
  });

  it("records a dispatch when the harness calls the tool Agent", () => {
    // Claude Code 2.1.238 sends tool_name "Agent" for the subagent tool while
    // hook matchers still accept "Task". Probed, not assumed:
    // spec/fixtures/probes/claude-code/PreToolUse-Agent.json.
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

  it("records no link for an async launch that names no agent, and still no terminal", () => {
    const plan = planRecords(
      { ...base, tool_response: { isAsync: true, status: "async_launched" } },
      context(),
    );

    // Both halves matter. Inventing an id would write a link key no real
    // SubagentStop can match, and two such launches would overwrite each
    // other — ambiguity resolved by fabrication, which is what this file says
    // it never does. And the acknowledgement is still not a report.
    expect(plan.link).toBeNull();
    expect(plan.records).toEqual([]);
    expect(plan.note).toContain("no agent id");
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

describe("a subagent that reports after its dispatch was sealed", () => {
  const stop = {
    hook_event_name: "SubagentStop",
    session_id: "sess-1",
    agent_id: "ag1",
    last_assistant_message: "found it in src/retry.ts",
  };

  it("corrects the ledger instead of writing a second terminal", () => {
    const plan = planRecords(
      stop,
      context({ resolveAgent: () => "d:tA", hasTerminal: (id) => id === "d:tA" }),
    );

    // Session end sealed d:tA as no-report; the subagent then came back. A
    // second report would be DUPLICATE-TERMINAL and the journal would fail
    // validation over a fact it recorded correctly. An append is the schema's
    // own way of saying "here is what I am correcting".
    expect(plan.records).toHaveLength(1);
    expect(plan.records[0]).toMatchObject({ kind: "append" });
    const correction = String(
      (plan.records[0] as { corrections_since_last_append: string }).corrections_since_last_append,
    );
    expect(correction).toContain("d:tA");
    expect(correction).toContain("src/retry.ts");
  });

  it("still writes the ordinary terminal when nothing sealed the dispatch", () => {
    const plan = planRecords(
      stop,
      context({ resolveAgent: () => "d:tA", hasTerminal: () => false }),
    );

    expect(plan.records[0]).toMatchObject({ kind: "report", outcome: "found" });
  });
});

/**
 * A real reviewer return, taken from the example block in
 * `.claude/agents/rule-auditor.md` rather than invented here. The grammar this
 * extraction depends on is the one the reviewers declare, so the fixture is
 * their own declaration of it.
 */
const REVIEW_RETURN = [
  "## Rule audit — feat/add-thing",
  "",
  "**Mode:** proposal",
  "",
  "### False premises",
  "- [false-premise] `openspec/changes/x/proposal.md:14` — claims the checker fails closed on an unresolvable commit; `checkClaims.ts:401` returns the advisory verdict instead.",
  "",
  "### Blockers",
  "- [blocker] `.claude/settings.json:9` — adds a hook entry the plugin already installs (one-delivery-mechanism.md, `severity: blocker`)",
  "",
  "### Concerns",
  "- [concern] `openspec/changes/x/proposal.md:31` — an anchor's line number may have drifted; not confirmed against the stamped commit.",
  "",
  "### Looks good",
  "- [looks-good] `openspec/changes/x/proposal.md:22` — anchor stamped at the moment the file was read.",
  "",
  "### Not checked",
  "- openspec-shall-first-line.md — none of the in-scope files is a `spec.md`.",
].join("\n");

/** An agent file that declares the tag contract, in the shape the four use. */
const REVIEWER_DEFINITION = [
  "---",
  "name: rule-auditor",
  "---",
  "",
  "## Workflow",
  "",
  "Read the rules, then the diff.",
  "",
  "## Output format",
  "",
  "```",
  "### Blockers",
  "- [blocker] `path:line` — what the rule says and what the change did",
  "```",
  "",
  "## Severity discipline",
  "",
  "The label is not your call.",
].join("\n");

/**
 * `retro-writer.md`'s shape: it contains `[blocker]`, and it is not a reviewer.
 * Only the heading spelling separates the two, which is the known limit
 * Decision 4 states and hands to `wiring`.
 */
const NON_REVIEWER_DEFINITION = [
  "## Step 1 — the mechanical signals",
  "",
  "Count the `[blocker]` lines in review-evidence.md.",
  "",
  "## Output back to the dispatcher",
  "",
  "One path, and nothing else.",
].join("\n");

describe("finding extraction — the reviewers' declared tag grammar", () => {
  const stop = {
    hook_event_name: "SubagentStop",
    session_id: "sess-1",
    agent_id: "ag1",
    agent_type: "rule-auditor",
  };
  const linked = () => context({ resolveAgent: () => "d:tA" });

  it("emits one finding per tag line, carrying severity, author and dispatch", () => {
    const records = planRecords({ ...stop, last_assistant_message: REVIEW_RETURN }, linked())
      .records;
    const findings = records.filter((record) => record["kind"] === "finding");

    expect(findings).toHaveLength(4);
    expect(findings.map((finding) => finding["severity"])).toEqual([
      "blocker",
      "blocker",
      "concern",
      "looks-good",
    ]);
    expect(findings[0]).toMatchObject({
      kind: "finding",
      dispatch: "d:tA",
      author: "rule-auditor",
      at: "2026-08-21T12:00:00.000Z",
    });
    expect(String(findings[2]?.["text"])).toContain("may have drifted");
    // The ids are distinct, which is what keeps four findings from one return
    // out of DUPLICATE-ID.
    expect(new Set(findings.map((finding) => finding["id"])).size).toBe(4);
  });

  it("maps [false-premise] to a blocker that keeps its own tag", () => {
    const [finding] = planRecords(
      { ...stop, last_assistant_message: "- [false-premise] `a.md:1` — the code says otherwise." },
      linked(),
    ).records.filter((record) => record["kind"] === "finding");

    expect(finding).toMatchObject({ severity: "blocker", tag: "false-premise" });
  });

  it("extracts nothing from a return that used no tags", () => {
    const plan = planRecords(
      {
        ...stop,
        last_assistant_message: "I looked at the diff and it seems fine to me. No blockers.",
      },
      linked(),
    );

    expect(plan.records).toHaveLength(1);
    expect(plan.records[0]).toMatchObject({ kind: "report", outcome: "found" });
  });

  it("writes the findings after the report, never before it", () => {
    // `finding.dispatch` is a DANGLING-REFERENCE unless the dispatch it names
    // appears earlier in the file, and a finding above its own terminal reads
    // as a review filed before the reviewer came back.
    const records = planRecords({ ...stop, last_assistant_message: REVIEW_RETURN }, linked())
      .records;

    expect(records[0]).toMatchObject({ kind: "report" });
    expect(records.slice(1).every((record) => record["kind"] === "finding")).toBe(true);
  });

  it("extracts from the full return, not from the excerpt the report kept", () => {
    // The tag line sits past EXCERPT_LIMIT, which is exactly where a long
    // review keeps most of them.
    const buried = `${"filler line\n".repeat(400)}- [blocker] \`x.ts:1\` — buried past the cap`;
    const records = planRecords({ ...stop, last_assistant_message: buried }, linked()).records;

    expect(records[0]).toMatchObject({ truncated: true });
    expect(records).toHaveLength(2);
    expect(records[1]).toMatchObject({ severity: "blocker" });
  });

  it("extracts from a synchronous return too, after its report", () => {
    const records = planRecords(
      {
        hook_event_name: "PostToolUse",
        tool_name: "Agent",
        tool_use_id: "toolu_01ABC",
        tool_input: { subagent_type: "rule-auditor", description: "audit" },
        tool_response: { status: "completed", content: [{ type: "text", text: REVIEW_RETURN }] },
      },
      context(),
    ).records;

    expect(records[0]).toMatchObject({ kind: "report", dispatch: "d:toolu_01ABC" });
    expect(records.filter((record) => record["kind"] === "finding")).toHaveLength(4);
    expect(records[1]).toMatchObject({ author: "rule-auditor", dispatch: "d:toolu_01ABC" });
  });

  it("records no findings for a return that errored", () => {
    const plan = planRecords(
      {
        hook_event_name: "PostToolUse",
        tool_name: "Agent",
        tool_use_id: "toolu_01ABC",
        tool_input: { subagent_type: "rule-auditor" },
        tool_response: { is_error: true, content: `turn limit exceeded\n${REVIEW_RETURN}` },
      },
      context(),
    );

    expect(plan.records).toHaveLength(1);
    expect(plan.records[0]).toMatchObject({ outcome: "no-report" });
  });
});

describe("expects — read off the agent's own definition, never inferred", () => {
  const dispatch = (subagentType: string, overrides: Partial<RecordContext> = {}) =>
    planRecords(
      {
        hook_event_name: "PreToolUse",
        tool_name: "Agent",
        tool_use_id: "toolu_01ABC",
        tool_input: { subagent_type: subagentType, description: "audit" },
      },
      context(overrides),
    ).records[0] as Record<string, unknown>;

  it("sets expects only for an agent that declares the tag contract", () => {
    const reviewer = dispatch("rule-auditor", { readAgentDefinition: () => REVIEWER_DEFINITION });
    const other = dispatch("retro-writer", { readAgentDefinition: () => NON_REVIEWER_DEFINITION });

    expect(reviewer["expects"]).toBe("findings");
    expect(other).not.toHaveProperty("expects");
    // Both were read. The difference is what the file said, not whether it
    // could be opened — which is why the two facts are separate fields.
    expect(other["agent_definition"]).toBe("read");
  });

  it("records agent_definition read for a definition it opened", () => {
    expect(dispatch("rule-auditor", { readAgentDefinition: () => REVIEWER_DEFINITION })[
      "agent_definition"
    ]).toBe("read");
  });

  it("records agent_definition missing when there is no such agent file", () => {
    expect(dispatch("no-such-agent", { readAgentDefinition: () => null })["agent_definition"]).toBe(
      "missing",
    );
  });

  it("records agent_definition unreadable when the read throws", () => {
    const record = dispatch("rule-auditor", {
      readAgentDefinition: () => {
        throw new Error("EACCES");
      },
    });

    expect(record["agent_definition"]).toBe("unreadable");
    expect(record).not.toHaveProperty("expects");
  });

  it("records agent_definition unsafe-name for a subagent_type that is a path", () => {
    expect(
      dispatch("../../etc/passwd", { readAgentDefinition: () => REVIEWER_DEFINITION })[
        "agent_definition"
      ],
    ).toBe("unsafe-name");
  });

  it("attempts no read at all for an unsafe subagent_type", () => {
    // The containment is that no path is built and nothing is opened — not
    // that something is opened and then discarded. Asserted by what the stub
    // was asked, because that is the only place the difference exists.
    const asked: string[] = [];
    const record = dispatch("../../etc/passwd", {
      readAgentDefinition: (subagentType) => {
        asked.push(subagentType);
        return REVIEWER_DEFINITION;
      },
    });

    expect(asked).toEqual([]);
    expect(record["agent_definition"]).toBe("unsafe-name");
  });

  it("records agent_definition for every dispatch that names an agent", () => {
    // Replaces "says nothing about a definition it was never wired to read".
    // That test pinned a transitional state — an absent reader, which none of
    // the four values is true of — and `readAgentDefinition` is now required,
    // so the state is unreachable and the test could only ever have passed by
    // describing something that no longer happens.
    //
    // What is worth pinning instead is the invariant the tightening buys: for
    // a dispatch that names an agent there is always an answer on the record.
    // A missing key can no longer mean "nobody asked", so nothing downstream
    // has to distinguish that from the four real outcomes.
    const readers: Partial<RecordContext>[] = [
      { readAgentDefinition: () => REVIEWER_DEFINITION },
      { readAgentDefinition: () => null },
      {
        readAgentDefinition: () => {
          throw new Error("EACCES");
        },
      },
      {},
    ];

    expect(readers.map((reader) => dispatch("rule-auditor", reader)["agent_definition"])).toEqual([
      "read",
      "missing",
      "unreadable",
      "missing",
    ]);
  });

  it("says nothing about a definition when the dispatch names no agent", () => {
    // The one absence still reachable, and the reason `agent_definition` is
    // not simply mandatory: with no `subagent_type` there is no path to form,
    // so `missing` would be a claim about a file nothing ever looked for.
    const record = planRecords(
      {
        hook_event_name: "PreToolUse",
        tool_name: "Agent",
        tool_use_id: "toolu_01ABC",
        tool_input: { description: "audit" },
      },
      context({ readAgentDefinition: () => REVIEWER_DEFINITION }),
    ).records[0] as Record<string, unknown>;

    expect(record).not.toHaveProperty("agent_definition");
    expect(record).not.toHaveProperty("expects");
  });
});

describe("model and usage on a report", () => {
  const SYNC_RESPONSE = {
    status: "completed",
    agentId: "aa610c4fccbcc8540",
    content: [{ type: "text", text: "OK" }],
    resolvedModel: "claude-opus-5",
    totalTokens: 36283,
    usage: {
      input_tokens: 2,
      cache_creation_input_tokens: 36277,
      cache_read_input_tokens: 0,
      output_tokens: 4,
    },
  };

  it("takes the model and usage off a synchronous response, sourced payload", () => {
    const [report] = planRecords(
      {
        hook_event_name: "PostToolUse",
        tool_name: "Agent",
        tool_use_id: "toolu_01ABC",
        tool_input: { subagent_type: "claude" },
        tool_response: SYNC_RESPONSE,
      },
      context(),
    ).records;

    expect(report).toMatchObject({
      model: "claude-opus-5",
      usage_source: "payload",
      usage: { input: 2, output: 4, cache_read: 0, cache_creation: 36277, total: 36283 },
    });
  });

  it("carries the launch acknowledgement's resolvedModel on the link", () => {
    // SubagentStop names no model at all, and the acknowledgement is the only
    // event that does — so the link is the only way it reaches the terminal.
    const plan = planRecords(
      {
        hook_event_name: "PostToolUse",
        tool_name: "Agent",
        tool_use_id: "toolu_01ABC",
        tool_input: TASK_INPUT,
        tool_response: {
          isAsync: true,
          status: "async_launched",
          agentId: "ab210a2c41e64ee5f",
          resolvedModel: "claude-haiku-4-5-20251001",
        },
      },
      context(),
    );

    expect(plan.link).toEqual({
      agentId: "ab210a2c41e64ee5f",
      dispatch: "d:toolu_01ABC",
      model: "claude-haiku-4-5-20251001",
    });
  });

  it("puts the sidecar's model and the transcript's usage on an async report", () => {
    const [report] = planRecords(
      {
        hook_event_name: "SubagentStop",
        agent_id: "ag1",
        agent_transcript_path: "/tmp/agent-ag1.jsonl",
        last_assistant_message: "done",
      },
      context({
        resolveAgent: () => ({ dispatch: "d:tA", model: "claude-haiku-4-5-20251001" }),
        readTranscriptUsage: () =>
          withTotal({ input: 10, output: 5, cache_read: 100, cache_creation: 20 }),
      }),
    ).records;

    expect(report).toMatchObject({
      model: "claude-haiku-4-5-20251001",
      usage_source: "transcript",
      usage: { input: 10, output: 5, cache_read: 100, cache_creation: 20, total: 135 },
    });
  });

  it("omits usage entirely — and says so — when the transcript reader returns null", () => {
    // Over the byte cap, over the time budget, or unreadable: all one answer
    // here, because a partial sum would be indistinguishable from a measured
    // one in the field that carries it.
    const plan = planRecords(
      {
        hook_event_name: "SubagentStop",
        agent_id: "ag1",
        agent_transcript_path: "/tmp/agent-ag1.jsonl",
        last_assistant_message: "done",
      },
      context({ resolveAgent: () => "d:tA", readTranscriptUsage: () => null }),
    );

    expect(plan.records[0]).not.toHaveProperty("usage");
    expect(plan.records[0]).not.toHaveProperty("usage_source");
    expect(plan.note).toContain("/tmp/agent-ag1.jsonl");
  });

  it("hands the reader both budgets, and keeps the time budget under the lock wait", () => {
    // journalFile.ts waits 2000ms for the append lock. A transcript read that
    // could outlast it would starve every other hook in the session.
    let seen: TranscriptBudgets | null = null;
    planRecords(
      {
        hook_event_name: "SubagentStop",
        agent_id: "ag1",
        agent_transcript_path: "/tmp/agent-ag1.jsonl",
        last_assistant_message: "done",
      },
      context({
        resolveAgent: () => "d:tA",
        readTranscriptUsage: (_path, budgets) => {
          seen = budgets;
          return null;
        },
      }),
    );

    expect(seen).toEqual({ byteCap: TRANSCRIPT_BYTE_CAP, budgetMs: TRANSCRIPT_BUDGET_MS });
    expect(TRANSCRIPT_BUDGET_MS).toBeLessThan(2000);
  });
});

describe("prompt — the operator's turn, and the key it joins on", () => {
  // NOTE: the UserPromptSubmit payload shape is an ASSUMPTION. No probe of it
  // exists in spec/fixtures/probes/ and capturing one is tasks §0, still open.
  // These tests pin the recorder's behaviour given a shape, not the shape.
  const submit = {
    hook_event_name: "UserPromptSubmit",
    session_id: "sess-1",
    prompt_id: "f4095b6f-b44c-4b35-97de-8c96cce1ec8e",
    prompt: "Implement the recorder half of the run ledger.",
  };

  it("records the prompt text, its length, and the harness's own id", () => {
    const plan = planRecords(submit, context());

    expect(plan.records).toEqual([
      {
        kind: "prompt",
        id: "p:f4095b6f-b44c-4b35-97de-8c96cce1ec8e",
        text: "Implement the recorder half of the run ledger.",
        chars: submit.prompt.length,
        at: "2026-08-21T12:00:00.000Z",
      },
    ]);
  });

  it("records a length and a hash instead of the text when text is switched off", () => {
    const [record] = planRecords(submit, context({ recordPromptText: () => false })).records as [
      Record<string, unknown>,
    ];

    expect(record).not.toHaveProperty("text");
    expect(record["chars"]).toBe(submit.prompt.length);
    expect(record["hash"]).toBe(
      createHash("sha256").update(submit.prompt).digest("hex"),
    );
  });

  it("says that it capped a long prompt", () => {
    const [record] = planRecords(
      { ...submit, prompt: "x".repeat(5000) },
      context(),
    ).records as [Record<string, unknown>];

    expect(record).toMatchObject({ truncated: true, chars: 5000 });
    expect(String(record["text"]).length).toBeLessThan(5000);
  });

  it("derives the id from session, time and text when the harness supplies no prompt_id", () => {
    const { prompt_id: _omitted, ...anonymous } = submit;
    const [record] = planRecords(anonymous, context()).records as [Record<string, unknown>];

    expect(record["id"]).toBe(
      `p:${createHash("sha256")
        .update(
          JSON.stringify(["sess-1", "2026-08-21T12:00:00.000Z", anonymous.prompt]),
        )
        .digest("hex")
        .slice(0, 16)}`,
    );
  });

  it("says out loud that nothing can join to a prompt with no harness id", () => {
    const { prompt_id: _omitted, ...anonymous } = submit;

    expect(planRecords(anonymous, context()).note).toContain("no prompt_id");
  });

  it("records nothing, and says why, when the payload carries no prompt text", () => {
    // The shape is assumed rather than probed, so its absence is tolerated —
    // and reported, rather than written as a prompt record asserting the
    // operator spoke and nothing about what they said.
    const plan = planRecords(
      { hook_event_name: "UserPromptSubmit", session_id: "sess-1", prompt_id: "p1" },
      context(),
    );

    expect(plan.records).toEqual([]);
    expect(plan.note).toContain("no prompt text");
  });

  it("stamps the join key onto a dispatch made under that prompt", () => {
    const [record] = planRecords(
      {
        hook_event_name: "PreToolUse",
        tool_name: "Agent",
        tool_use_id: "toolu_01ABC",
        prompt_id: "f4095b6f-b44c-4b35-97de-8c96cce1ec8e",
        tool_input: TASK_INPUT,
      },
      context(),
    ).records;

    expect(record).toMatchObject({ prompt: "p:f4095b6f-b44c-4b35-97de-8c96cce1ec8e" });
  });

  it("stamps the join key onto a mutation made under that prompt", () => {
    const [record] = planRecords(
      {
        hook_event_name: "PostToolUse",
        tool_name: "Edit",
        tool_use_id: "toolu_02DEF",
        prompt_id: "f4095b6f-b44c-4b35-97de-8c96cce1ec8e",
        tool_input: { file_path: "/repo/src/retry.ts" },
      },
      context(),
    ).records;

    expect(record).toMatchObject({ prompt: "p:f4095b6f-b44c-4b35-97de-8c96cce1ec8e" });
  });

  it("leaves the join key off entirely when the payload carries no prompt_id", () => {
    const dispatch = planRecords(
      {
        hook_event_name: "PreToolUse",
        tool_name: "Agent",
        tool_use_id: "toolu_01ABC",
        tool_input: TASK_INPUT,
      },
      context(),
    ).records[0];
    const mutation = planRecords(
      {
        hook_event_name: "PostToolUse",
        tool_name: "Edit",
        tool_use_id: "toolu_02DEF",
        tool_input: { file_path: "/repo/src/retry.ts" },
      },
      context(),
    ).records[0];

    expect(dispatch).not.toHaveProperty("prompt");
    expect(mutation).not.toHaveProperty("prompt");
  });
});
