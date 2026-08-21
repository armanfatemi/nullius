/**
 * Correlation: one harness hook payload in, zero or more journal records out.
 *
 * This file is the whole reason the shipped hooks are one line long. Shell
 * hooks that reach into a harness's payload shapes rot quietly — the payload
 * changes, the extraction returns empty, and the journal keeps being written
 * with nothing in it. Here the logic is typed, unit-tested, and every branch
 * that declines to record something says so in `note` rather than returning an
 * empty list that reads like "nothing happened".
 *
 * Two decisions are load-bearing:
 *
 *  - **Correlate only by a key the harness supplied — never by order or
 *    timing.** On Claude Code the chain runs across three events, because the
 *    one that looks like the terminal is not:
 *
 *        PreToolUse:Agent    tool_use_id ──────────────► dispatch
 *        PostToolUse:Agent   tool_use_id ↔ agentId ────► launch link
 *        SubagentStop        agent_id ─────────────────► terminal report
 *
 *    `PostToolUse` fires when a subagent is LAUNCHED and answers with an
 *    acknowledgement; the result arrives on `SubagentStop`, which carries the
 *    same agent id. Reading the acknowledgement as a terminal would mark every
 *    dispatch `found` and make `no-report` unreachable — this producer
 *    committing the laundering the journal exists to catch. Recorded, not
 *    reasoned: spec/fixtures/probes/claude-code/.
 *  - **Ambiguity is recorded, not resolved.** Where the harness omits
 *    `tool_use_id`, the join falls back to a content hash of the dispatch
 *    input and the report carries `ambiguous: true`. Two identical parallel
 *    dispatches then collide into one id — which the validator reports as
 *    DUPLICATE-ID. That is the point: a journal that admits what it could not
 *    correlate beats one that correlates confidently and wrongly.
 */

import { createHash } from "node:crypto";

import type { JournalOrigin } from "@nullius-inverba/claims";

/** A record on its way to the journal. Shapes are the schema's, not ours. */
export type JournalDraft = Record<string, unknown>;

export interface OpenDispatch {
  id: string;
  /** The task text, when the dispatch recorded one. */
  task: string | null;
}

export interface RecordContext {
  /** Stamped into the header by the writer; `hooks` unless a skill is driving. */
  origin: JournalOrigin;
  now: () => string;
  /**
   * Turn a path out of a tool payload into a journal target: the path as the
   * journal should record it, hashed as it stands NOW. Null when the file
   * cannot be read.
   *
   * Both halves matter. The hash is what invariant 2 compares, and the PATH is
   * what it compares it *under* — so a mutation recorded absolute would never
   * invalidate a verification recorded relative, and the invariant would fail
   * open without a word. Normalisation is the caller's job because only the
   * caller knows where the repo root is.
   */
  locateTarget: (path: string) => { path: string; hash: string } | null;
  /**
   * Dispatches with no terminal record yet. Only ever called at session end,
   * and injected rather than read here so the correlation stays testable
   * without a filesystem.
   */
  openDispatches: () => readonly OpenDispatch[];
  /**
   * The dispatch an agent id belongs to, from the launch link, or null when
   * nothing linked it. Injected for the same reason as `openDispatches`: the
   * correlation stays testable without a filesystem.
   */
  resolveAgent: (agentId: string) => string | null;
}

export interface RecordPlan {
  records: JournalDraft[];
  /** Why nothing was recorded, when nothing was. Never silence. */
  note: string | null;
  /** The header's `source`, when this event knows it (SessionStart). */
  source: string | null;
  /** The session this payload belongs to, when it names one. */
  session: string | null;
  /**
   * An agent id to bind to a dispatch, when this event established one.
   *
   * Producer state, deliberately not a journal record: the journal's schema
   * describes what happened in a run, and "which internal id the harness gave
   * a subagent" is bookkeeping this tool needs and a reader does not.
   */
  link: { agentId: string; dispatch: string } | null;
}

/**
 * Tools that hand work to a subagent.
 *
 * Two names for one tool, because the harness uses both: hook matchers accept
 * `Task`, and the payload of the very same call reports `tool_name: "Agent"`
 * (Claude Code 2.1.238 — see spec/fixtures/probes/claude-code/PreToolUse.json,
 * which is a recording, not a reading of the documentation). Matching only the
 * documented name cost this recorder every dispatch in its first real run: the
 * hooks fired, the extraction found nothing it recognised, and the journal
 * came out empty — which reads exactly like a session that dispatched nobody.
 */
const DISPATCH_TOOLS = new Set(["Task", "Agent"]);

/** Tools whose success means a file on disk is now different. */
const EDITING_TOOLS = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);

/**
 * How much of a subagent's response is copied into the journal. A cap is
 * necessary and therefore must be visible: a truncated record says
 * `truncated: true` and how many characters there were, because a silent cap
 * is indistinguishable from a short answer.
 */
const EXCERPT_LIMIT = 2000;

/** Enough of an error to identify it, without pasting a stack into a journal. */
const ERROR_EXCERPT_LIMIT = 400;

export function planRecords(payload: unknown, context: RecordContext): RecordPlan {
  if (!isObject(payload)) {
    return { records: [], note: "payload is not a JSON object", source: null, session: null, link: null };
  }

  const event = str(payload["hook_event_name"]);
  const session = str(payload["session_id"]);
  const tool = str(payload["tool_name"]);
  const plan = (
    records: JournalDraft[],
    note: string | null = null,
    link: RecordPlan["link"] = null,
  ): RecordPlan => ({ records, note, source: null, session, link });

  switch (event) {
    case "SessionStart":
      // No record of its own: the header IS the record, and the writer lays it
      // down on first append so a session that dispatched nothing does not
      // leave a journal claiming to describe a run.
      return { records: [], note: null, source: str(payload["source"]), session, link: null };

    case "SessionEnd":
      return plan(sealOpenDispatches(payload, context));

    case "SubagentStop":
      return terminalForStop(payload, context, plan);

    case "PreToolUse": {
      if (tool === null || !DISPATCH_TOOLS.has(tool)) {
        return plan([], `${tool ?? "an unnamed tool"} is not a dispatch`);
      }
      const { key } = joinKey(payload);
      const input = isObject(payload["tool_input"]) ? payload["tool_input"] : {};
      const task = str(input["description"]) ?? firstLine(str(input["prompt"]));
      return plan([
        {
          kind: "dispatch",
          id: `d:${key}`,
          ...(task === null ? {} : { task }),
          ...(str(input["subagent_type"]) === null ? {} : { agent: str(input["subagent_type"]) }),
          at: context.now(),
        },
      ]);
    }

    case "PostToolUse": {
      if (tool !== null && DISPATCH_TOOLS.has(tool)) {
        const launched = launchAcknowledgement(payload["tool_response"]);
        if (launched !== null) {
          // Not a terminal — the subagent has been started, not finished. What
          // this event is good for is the key: it is the only place the
          // harness's agent id and the dispatch's tool_use_id appear together,
          // and SubagentStop knows only the former.
          const { key } = joinKey(payload);
          return plan(
            [],
            `the subagent was launched asynchronously as ${launched}; this event acknowledges a launch rather than terminating a dispatch, so the dispatch stays open until its SubagentStop`,
            { agentId: launched, dispatch: `d:${key}` },
          );
        }
        return plan([reportFor(payload, context)]);
      }
      if (tool !== null && EDITING_TOOLS.has(tool)) return mutationFor(payload, context, plan);
      return plan([], `${tool ?? "an unnamed tool"} changes nothing and dispatches nothing`);
    }

    default:
      return plan([], `${event ?? "an unnamed event"} is not an event this build records`);
  }
}

/**
 * Invariant 1's third state, written at the only moment it is knowable. "Never
 * came back" cannot be detected while a run is in flight — every open dispatch
 * might still report — and it stops being detectable once the session is gone.
 */
function sealOpenDispatches(payload: JsonObject, context: RecordContext): JournalDraft[] {
  const reason = str(payload["reason"]) ?? "reason unrecorded";
  return context.openDispatches().map((dispatch) => ({
    kind: "report",
    id: `r:sealed:${dispatch.id}`,
    dispatch: dispatch.id,
    outcome: "no-report",
    statement:
      dispatch.task === null
        ? `dispatch ${dispatch.id} never terminated; the session ended (${reason}) with no report from it`
        : `dispatched as "${dispatch.task}" (${dispatch.id}) and never terminated; the session ended (${reason}) with no report from it`,
    at: context.now(),
    synthesized: true,
  }));
}

/**
 * The real terminal for an asynchronous subagent.
 *
 * `SubagentStop` knows the harness's `agent_id` and the subagent's final
 * message, but nothing about the dispatch that started it. The launch link is
 * what closes that gap, and it is the only thing that does: pairing a stop with
 * a dispatch by arrival order would work in every test and fail in exactly the
 * case this journal exists for.
 */
function terminalForStop(
  payload: JsonObject,
  context: RecordContext,
  plan: (records: JournalDraft[], note?: string | null) => RecordPlan,
): RecordPlan {
  const agentId = str(payload["agent_id"]) ?? str(payload["agentId"]);
  if (agentId === null) return plan([], "a subagent stopped without an agent id to identify it by");

  const dispatch = context.resolveAgent(agentId);
  if (dispatch === null) {
    // Not an error, and not a place to guess. No link means either the
    // subagent was synchronous — in which case PostToolUse carried the real
    // response and already wrote the terminal — or the dispatch happened
    // before these hooks were installed. A report against an invented dispatch
    // id would turn the ordinary case into a DANGLING-REFERENCE.
    return plan(
      [],
      `subagent ${agentId} stopped with no launch link to a dispatch — either its terminal is already recorded or its dispatch predates this recorder, so nothing was written`,
    );
  }

  const message = readResponse(payload["last_assistant_message"]);
  const text = message.text.trim();
  const head: JournalDraft = {
    kind: "report",
    id: `r:${agentId}`,
    dispatch,
    ...(str(payload["agent_type"]) === null ? {} : { agent: str(payload["agent_type"]) }),
  };
  const tail = { at: context.now() };

  if (text.length === 0) {
    // It came back — the stop event is proof of that — so "never reported" is
    // false. What it did not do is say anything, and the statement says which.
    return plan([
      {
        ...head,
        outcome: "empty",
        statement:
          "the subagent stopped without a final message recorded by the harness — it returned, and returned nothing",
        ...tail,
      },
    ]);
  }

  return plan([
    {
      ...head,
      outcome: "found",
      findings: [clip(text, EXCERPT_LIMIT)],
      ...(text.length > EXCERPT_LIMIT ? { truncated: true, response_chars: text.length } : {}),
      ...tail,
    },
  ]);
}

function reportFor(payload: JsonObject, context: RecordContext): JournalDraft {
  const { key, ambiguous } = joinKey(payload);
  const response = readResponse(payload["tool_response"]);
  const head: JournalDraft = {
    kind: "report",
    id: `r:${key}`,
    dispatch: `d:${key}`,
    ...(ambiguous ? { ambiguous: true } : {}),
  };
  const tail = { at: context.now() };

  if (!response.present) {
    return {
      ...head,
      outcome: "no-report",
      statement:
        "the harness recorded no response for this dispatch — it was handed out and nothing came back",
      ...tail,
    };
  }

  if (response.error) {
    return {
      ...head,
      outcome: "no-report",
      statement: `the subagent ended in an error and produced no report: ${clip(response.text, ERROR_EXCERPT_LIMIT)}`,
      ...tail,
    };
  }

  const text = response.text.trim();
  if (text.length === 0) {
    return {
      ...head,
      outcome: "empty",
      statement:
        "the subagent returned with no content. Recorded from the harness payload — this is what came back, not the agent's account of what it did.",
      ...tail,
    };
  }

  return {
    ...head,
    outcome: "found",
    findings: [clip(text, EXCERPT_LIMIT)],
    ...(text.length > EXCERPT_LIMIT ? { truncated: true, response_chars: text.length } : {}),
    ...tail,
  };
}

function mutationFor(
  payload: JsonObject,
  context: RecordContext,
  plan: (records: JournalDraft[], note?: string | null) => RecordPlan,
): RecordPlan {
  const input = isObject(payload["tool_input"]) ? payload["tool_input"] : {};
  const path = str(input["file_path"]) ?? str(input["notebook_path"]);
  const tool = str(payload["tool_name"]);
  if (path === null) {
    return plan([], `${tool ?? "an editing tool"} ran without a file path in its input`);
  }

  // No target, no record. A mutation carries `target: {path, hash}` because a
  // change that cannot say what it changed cannot invalidate the verification
  // it invalidated — and a placeholder hash would be a lie the validator would
  // happily believe. The skip goes to stderr instead of into the journal.
  const target = context.locateTarget(path);
  if (target === null) {
    return plan(
      [],
      `${path} could not be read after ${tool ?? "the edit"}, so its post-edit hash is unknown and no mutation was recorded — any verification of that path stays quotable in this journal`,
    );
  }

  const { key } = joinKey(payload);
  return plan([
    {
      kind: "mutation",
      id: `m:${key}`,
      target,
      ...(tool === null ? {} : { tool }),
      at: context.now(),
    },
  ]);
}

/**
 * The dispatch/report join. `tool_use_id` when the harness supplies one; a
 * content hash of the dispatch input when it does not — and in that case the
 * caller marks the record ambiguous rather than passing the guess off as a
 * correlation.
 */
function joinKey(payload: JsonObject): { key: string; ambiguous: boolean } {
  const id = str(payload["tool_use_id"]);
  if (id !== null) return { key: id, ambiguous: false };
  return { key: `h${digest(canonical(payload["tool_input"]))}`, ambiguous: true };
}

/**
 * Recognise a launch acknowledgement.
 *
 * On Claude Code 2.1.238, `PostToolUse` on a subagent tool fires at LAUNCH and
 * answers `{"isAsync": true, "status": "async_launched", "agentId": …}`. The
 * subagent's actual answer arrives later, on `SubagentStop`, keyed by that same
 * `agentId` — see spec/fixtures/probes/claude-code/, which is a recording of a
 * real run rather than a reading of documentation.
 *
 * Until the correlation topology is settled in the spec, this recogniser earns
 * its place on its own: an acknowledgement is not a report under ANY topology,
 * and reading one as a terminal would mark every dispatch `found` and make
 * `no-report` unreachable.
 *
 * Returns the agent id when the response is an acknowledgement, else null.
 */
function launchAcknowledgement(response: unknown): string | null {
  if (!isObject(response)) return null;
  const launched = response["isAsync"] === true || response["status"] === "async_launched";
  if (!launched) return null;
  return str(response["agentId"]) ?? str(response["agent_id"]) ?? "an unnamed agent";
}

interface ResponseRead {
  /** Whether the payload carried a response field at all. */
  present: boolean;
  error: boolean;
  text: string;
}

/**
 * Pull text out of a tool response without assuming one shape. Harness payload
 * shapes are the external assumption in all of this — the one thing that
 * cannot be settled from inside this repo — so this reads the shapes that are
 * documented, falls back to the raw JSON rather than to silence, and leaves
 * `doctor` to report what the installed harness actually sends.
 */
function readResponse(value: unknown): ResponseRead {
  if (value === undefined || value === null) return { present: false, error: false, text: "" };
  if (typeof value === "string") return { present: true, error: false, text: value };
  if (Array.isArray(value)) return { present: true, error: false, text: blocksToText(value) };
  if (!isObject(value)) return { present: true, error: false, text: String(value) };

  const error = value["is_error"] === true || value["isError"] === true;
  const content = value["content"];
  if (typeof content === "string") return { present: true, error, text: content };
  if (Array.isArray(content)) return { present: true, error, text: blocksToText(content) };

  for (const field of ["text", "output", "result", "error", "message"]) {
    const candidate = value[field];
    if (typeof candidate === "string") return { present: true, error, text: candidate };
  }

  // An unrecognised shape is recorded verbatim rather than dropped: a response
  // this build cannot read is still a response that came back.
  const keys = Object.keys(value);
  return { present: true, error, text: keys.length === 0 ? "" : JSON.stringify(value) };
}

function blocksToText(blocks: readonly unknown[]): string {
  return blocks
    .map((block) => {
      if (typeof block === "string") return block;
      if (isObject(block) && typeof block["text"] === "string") return block["text"];
      return "";
    })
    .filter((text) => text.length > 0)
    .join("\n");
}

type JsonObject = { [key: string]: unknown };

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function firstLine(value: string | null): string | null {
  if (value === null) return null;
  const line = value.split("\n").find((candidate) => candidate.trim().length > 0);
  return line === undefined ? null : clip(line.trim(), 200);
}

function clip(text: string, limit: number): string {
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}

/** Stable JSON: key order must not change the join key. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (isObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function digest(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}
