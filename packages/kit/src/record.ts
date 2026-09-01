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

/** A record on its way to the journal. Shapes are the schema's, not ours. */
export type JournalDraft = Record<string, unknown>;

export interface OpenDispatch {
  id: string;
  /** The task text, when the dispatch recorded one. */
  task: string | null;
}

/**
 * What one dispatch cost, in the schema's names rather than any one harness's.
 *
 * Every field is measured or the whole block is absent: there is no branch here
 * that estimates. A report with no `usage` says the recorder could not read the
 * cost; a report with a guessed `usage` would say something false in the same
 * grammar the measured ones use, which is the confusion this journal exists to
 * refuse.
 */
export interface Usage {
  input: number;
  output: number;
  cache_read: number;
  cache_creation: number;
  /** The four above, summed here rather than trusted from the payload. */
  total: number;
}

/**
 * The two bounds a transcript read runs under, passed in rather than baked
 * into the reader, so a test can force the under-cap-but-slow branch instead
 * of reasoning about it. Same seam `identity.ts` uses for its git calls.
 */
export interface TranscriptBudgets {
  /** Refuse a transcript larger than this, in bytes. */
  byteCap: number;
  /** Wall-clock budget for the read. Must stay strictly below the lock wait. */
  budgetMs: number;
}

/**
 * What a launch link resolves to.
 *
 * A bare string is the dispatch id and nothing else — the shape this context
 * function had before `report.model` existed, kept because a caller that knows
 * no model should not have to say so twice. The object form carries the
 * `resolvedModel` the launch acknowledgement named, which is the only place
 * the harness states it for an asynchronous dispatch.
 */
export type AgentLink = string | { dispatch: string; model?: string | null };

/**
 * Why a dispatch does or does not carry `expects`. Metadata no verdict reads,
 * recorded so that "the recorder could not read this agent's definition" is
 * distinguishable in the file from "this agent is not a reviewer" — the two
 * are the same absence of `expects` and very different facts.
 */
export type AgentDefinitionRead = "read" | "missing" | "unreadable" | "unsafe-name";

export interface RecordContext {
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
  resolveAgent: (agentId: string) => AgentLink | null;
  /**
   * Whether a dispatch already has a terminal record. Only session end and a
   * subagent's stop ask, and both ask under the append lock.
   */
  hasTerminal: (dispatchId: string) => boolean;
  /**
   * The text of the dispatched agent's definition file
   * (`.claude/agents/<subagentType>.md`), or null when there is no such file.
   *
   * **Throw rather than return null when the file exists and cannot be read.**
   * "There is no such agent" and "there is one and I could not read it" are
   * different facts, and the dispatch records which — `missing` against
   * `unreadable`. A reader that collapses them makes the two indistinguishable
   * in the journal, which is the whole reason the field exists.
   *
   * `subagentType` is already validated against a conservative name shape
   * before this is called, so the implementation may join it to a path. It is
   * still the implementation's job to keep the read bounded.
   *
   * Required. An absent reader would mean no dispatch carries `expects`, and
   * at schema 0.6 that is SILENT-REVIEWER with an empty denominator — a
   * verdict that cannot fire, reported as a clean journal. A caller with
   * nothing to read says so by returning `null`, which the dispatch records as
   * `agent_definition: "missing"`; there is no way to decline the question.
   */
  readAgentDefinition: (subagentType: string) => string | null;
  /**
   * Token usage summed from the assistant turns of a transcript the harness
   * wrote and handed us a path to. Null when it could not be read inside
   * `budgets` — over the byte cap, over the wall-clock budget, or absent.
   * Null means the report carries no usage: nothing here estimates.
   *
   * **`cli.ts` must perform this read BEFORE `appendRecords` takes the journal
   * lock, and answer from the memoized result.** The `SubagentStop` plan is
   * computed *inside* the lock — `appendRecords(file, () => planRecords(…))`
   * — so a reader that touches the filesystem when called would put a
   * multi-megabyte transcript read on the locked path, where every other hook
   * in the session waits for it.
   *
   * Required, and `null` is the whole vocabulary for "no usage": a caller that
   * cannot read transcripts returns it, and the report then says so with a
   * note. An optional reader would have produced the same absent fields
   * silently, which is the one shape this field must not have.
   */
  readTranscriptUsage: (path: string, budgets: TranscriptBudgets) => Usage | null;
  /**
   * Whether the operator's prompt text goes into the journal, or only its
   * length and hash. `cli.ts` answers this from `NULLIUS_WITNESS_PROMPTS`
   * (`"0"` → hashed), which is the env var `doctor` reports as a fact.
   *
   * Required, and deliberately has no default. An optional predicate whose
   * absence meant "record the text" is a privacy switch that is off unless
   * someone remembered to wire it, and a caller that forgets writes operator
   * prompts into a file it believed was hashed. The default lives in `cli.ts`,
   * where the env var it reads is (design Decision 8, open question 5).
   */
  recordPromptText: () => boolean;
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
  link: { agentId: string; dispatch: string; model?: string } | null;
}

/**
 * Tools that hand work to a subagent.
 *
 * Two names for one tool, because the harness uses both: hook matchers accept
 * `Task`, and the payload of the very same call reports `tool_name: "Agent"`
 * (Claude Code 2.1.238 — see spec/fixtures/probes/claude-code/PreToolUse-Agent.json,
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

/**
 * The reviewers' declared tag grammar, and the whole of the extraction.
 *
 * This is a line grammar rather than a classifier on purpose. The tags are
 * already machine-consumed — `proposal-to-pr` turns its stage decisions on
 * `[blocker]` and `[false-premise]` — so reading them adds no new dependency
 * on prose shape, and a return with no tag lines produces no findings, which
 * is the honest reading rather than a charitable one.
 */
const TAG_LINE = /^\s*-\s*\[(blocker|concern|looks-good|false-premise)\]\s+(.+)$/;

/**
 * A dispatched agent declares the tag contract by containing `[blocker]` under
 * an `## Output format` heading. The heading spelling is the whole test:
 * `retro-writer.md` also contains `[blocker]`, under `## Output back to the
 * dispatcher`, and is not a reviewer. That the denominator is one heading wide
 * is a known limit of Decision 4, mitigated in `wiring` rather than here.
 */
const OUTPUT_FORMAT_HEADING = /^(#{1,6})\s+output format\b/i;
const ANY_HEADING = /^(#{1,6})\s+/;

/**
 * `subagent_type` is payload-supplied and is about to become a path, so it is
 * validated against the same conservative shape `isSafeChangeName` enforces.
 * An unsafe value reads nothing at all — the refusal is that no read is
 * attempted, not that a read is attempted and then discarded.
 */
const SAFE_SUBAGENT_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/**
 * The bounds a subagent transcript is read under.
 *
 * `TRANSCRIPT_BUDGET_MS` must stay strictly below `DEFAULT_WAIT_MS` in
 * `journalFile.ts` (2000ms at the time of writing). It is duplicated as a
 * number rather than imported because that module reaches for `node:fs` and
 * this one is deliberately I/O-free; the relation is the next chunk's to
 * assert in a test beside the reader it wires.
 */
export const TRANSCRIPT_BYTE_CAP = 2_000_000;
export const TRANSCRIPT_BUDGET_MS = 500;

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

    case "UserPromptSubmit":
      return promptFor(payload, context, plan);

    case "PreToolUse": {
      if (tool === null || !DISPATCH_TOOLS.has(tool)) {
        return plan([], `${tool ?? "an unnamed tool"} is not a dispatch`);
      }
      const { key } = joinKey(payload);
      const input = isObject(payload["tool_input"]) ? payload["tool_input"] : {};
      const task = str(input["description"]) ?? firstLine(str(input["prompt"]));
      const agent = str(input["subagent_type"]);
      return plan([
        {
          kind: "dispatch",
          id: `d:${key}`,
          ...(task === null ? {} : { task }),
          ...(agent === null ? {} : { agent }),
          // Whether this dispatch is one SILENT-REVIEWER may fire on, decided
          // by reading the agent's own definition file — a filesystem read,
          // not a judgement about what the agent is for.
          ...agentContract(agent, context),
          ...promptJoin(payload),
          at: context.now(),
        },
      ]);
    }

    case "PostToolUse": {
      if (tool !== null && DISPATCH_TOOLS.has(tool)) {
        const launched = launchAcknowledgement(payload["tool_response"]);
        if (launched !== null) {
          if (launched.agentId === null) {
            // Still not a terminal — an acknowledgement never is — but there
            // is nothing to link it by. Recording the ambiguity beats
            // inventing an id that no SubagentStop can match and that a second
            // unnamed launch would silently overwrite.
            return plan(
              [],
              "a subagent was launched asynchronously but the payload carried no agent id, so its report cannot be joined to this dispatch; the dispatch stays open and will be sealed no-report at session end",
            );
          }
          // The launch is not a terminal, but it is the only place the
          // harness's agent id and the dispatch's tool_use_id appear together,
          // and SubagentStop knows only the former. It is also the only place
          // the harness names the model it resolved for this subagent, so the
          // model rides the same link — SubagentStop carries neither.
          const { key } = joinKey(payload);
          return plan(
            [],
            `the subagent was launched asynchronously as ${launched.agentId}; this event acknowledges a launch rather than terminating a dispatch, so the dispatch stays open until its SubagentStop`,
            {
              agentId: launched.agentId,
              dispatch: `d:${key}`,
              ...(launched.model === null ? {} : { model: launched.model }),
            },
          );
        }
        return plan(terminalForResponse(payload, context));
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

  const link = linkParts(context.resolveAgent(agentId));
  const dispatch = link === null ? null : link.dispatch;
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

  // The dispatch was already terminated — almost always by session end sealing
  // it `no-report` while this subagent was still running. It then came back,
  // which makes the seal wrong and this report late. A second terminal would
  // be DUPLICATE-TERMINAL: the journal failing validation over a pair of facts
  // it recorded correctly. So the ledger gets a correction instead, which is
  // what `append` is for — invariant 3 exists so that a correction has to say
  // what it corrected.
  if (context.hasTerminal(dispatch)) {
    return plan(
      [
        {
          kind: "append",
          id: `a:${agentId}`,
          corrections_since_last_append:
            text.length === 0
              ? `${dispatch} was terminated before subagent ${agentId} stopped; it returned with no final message, so the existing terminal stands`
              : `${dispatch} was terminated before subagent ${agentId} stopped — most likely sealed no-report at session end — but it did report: ${clip(text, ERROR_EXCERPT_LIMIT)}`,
          at: context.now(),
          late: true,
        },
      ],
      `subagent ${agentId} reported after ${dispatch} was already terminated; recorded as a correction rather than a second terminal`,
    );
  }
  const agent = str(payload["agent_type"]);
  const head: JournalDraft = {
    kind: "report",
    id: `r:${agentId}`,
    dispatch,
    ...(agent === null ? {} : { agent }),
  };
  // The model comes off the launch link because this event does not carry one;
  // the usage comes off the transcript the harness wrote, because this event
  // does not carry that either. Both are absent rather than approximated when
  // they cannot be had.
  const cost = transcriptCost(payload, context);
  const tail = {
    ...(link?.model == null ? {} : { model: link.model }),
    ...cost.fields,
    at: context.now(),
  };

  if (text.length === 0) {
    // It came back — the stop event is proof of that — so "never reported" is
    // false. What it did not do is say anything, and the statement says which.
    return plan(
      [
        {
          ...head,
          outcome: "empty",
          statement:
            "the subagent stopped without a final message recorded by the harness — it returned, and returned nothing",
          ...tail,
        },
      ],
      cost.note,
    );
  }

  return plan(
    [
      {
        ...head,
        outcome: "found",
        findings: [clip(text, EXCERPT_LIMIT)],
        ...(text.length > EXCERPT_LIMIT ? { truncated: true, response_chars: text.length } : {}),
        ...tail,
      },
      // Reported first, then what the report declared — and both from the
      // untruncated text, which is why extraction reads `text` rather than the
      // clipped copy that went into `report.findings`.
      ...extractFindings(text, dispatch, agent ?? agentId).map((finding) => ({
        ...finding,
        at: context.now(),
      })),
    ],
    cost.note,
  );
}

/**
 * Normalise a launch link into its two halves. A bare string is a link written
 * before `report.model` existed — a real dispatch id with no model recorded,
 * which is not the same as a model this build failed to read, and both come
 * out the same way here because the journal says nothing either way.
 */
function linkParts(link: AgentLink | null): { dispatch: string; model: string | null } | null {
  if (link === null) return null;
  if (typeof link === "string") return { dispatch: link, model: null };
  return { dispatch: link.dispatch, model: str(link.model) };
}

/**
 * Usage for an asynchronous return, from the subagent transcript.
 *
 * Over budget or unreadable: no `usage`, no `usage_source`, and a note saying
 * so. The alternative — a partial sum from however much of the transcript fit
 * inside the budget — would be a number in the same field as the measured
 * ones, and nothing downstream could tell them apart. A payload that names no
 * transcript at all is silent instead: there was nothing to fail at.
 */
function transcriptCost(
  payload: JsonObject,
  context: RecordContext,
): { fields: { usage?: Usage; usage_source?: "transcript" }; note: string | null } {
  const path = str(payload["agent_transcript_path"]);
  if (path === null) return { fields: {}, note: null };

  let usage: Usage | null;
  try {
    usage = context.readTranscriptUsage(path, {
      byteCap: TRANSCRIPT_BYTE_CAP,
      budgetMs: TRANSCRIPT_BUDGET_MS,
    });
  } catch {
    usage = null;
  }
  if (usage === null) {
    return {
      fields: {},
      note: `${path} could not be read inside its ${TRANSCRIPT_BYTE_CAP}-byte and ${TRANSCRIPT_BUDGET_MS}ms budgets, so this report carries no usage — a partial or estimated total would be indistinguishable from a measured one`,
    };
  }
  return { fields: { usage, usage_source: "transcript" }, note: null };
}

/**
 * The synchronous terminal, and the findings the return declared.
 *
 * One append, report first. `finding.dispatch` is a DANGLING-REFERENCE unless
 * the dispatch it names appears EARLIER in the same file, and the ordering
 * within an append is the order of this array — so a finding written before
 * its report is still fine (the dispatch is older than both), but writing them
 * in the other order would put the reviewer's findings above the terminal that
 * says the reviewer came back, which reads backwards for no gain.
 */
function terminalForResponse(payload: JsonObject, context: RecordContext): JournalDraft[] {
  const { report, found } = reportFor(payload, context);
  if (found === null) return [report];

  const input = isObject(payload["tool_input"]) ? payload["tool_input"] : {};
  return [
    report,
    ...extractFindings(found, String(report["dispatch"]), authorFor(str(input["subagent_type"]), report))
      .map((finding) => ({ ...finding, at: context.now() })),
  ];
}

/**
 * Who raised a finding. The dispatched agent's name when the harness gave one;
 * the dispatch id when it did not. The schema requires a non-empty author and
 * leaves it a free string, so the fallback names something real rather than
 * inventing a plausible agent — an unnamed dispatch is still an identifiable
 * one.
 */
function authorFor(agent: string | null, report: JournalDraft): string {
  return agent ?? str(report["agent"]) ?? String(report["dispatch"]);
}

function reportFor(
  payload: JsonObject,
  context: RecordContext,
): { report: JournalDraft; found: string | null } {
  const { key, ambiguous } = joinKey(payload);
  const response = readResponse(payload["tool_response"]);
  const head: JournalDraft = {
    kind: "report",
    id: `r:${key}`,
    dispatch: `d:${key}`,
    ...(ambiguous ? { ambiguous: true } : {}),
  };
  // What the dispatch cost, as the harness itself reported it on this very
  // payload. `usage_source` says where it came from, because a number read off
  // a transcript and a number the harness handed over are not the same
  // evidence and a reader should not have to guess which this is.
  const tail = { ...payloadCost(payload["tool_response"]), at: context.now() };

  if (!response.present) {
    return {
      report: {
        ...head,
        outcome: "no-report",
        statement:
          "the harness recorded no response for this dispatch — it was handed out and nothing came back",
        ...tail,
      },
      found: null,
    };
  }

  if (response.error) {
    return {
      report: {
        ...head,
        outcome: "no-report",
        statement: `the subagent ended in an error and produced no report: ${clip(response.text, ERROR_EXCERPT_LIMIT)}`,
        ...tail,
      },
      // No extraction from an errored return. A dispatch that ended in an
      // error produced no report, and tags scraped out of a stack trace would
      // be findings filed against a review that did not happen.
      found: null,
    };
  }

  const text = response.text.trim();
  if (text.length === 0) {
    return {
      report: {
        ...head,
        outcome: "empty",
        statement:
          "the subagent returned with no content. Recorded from the harness payload — this is what came back, not the agent's account of what it did.",
        ...tail,
      },
      found: null,
    };
  }

  return {
    report: {
      ...head,
      outcome: "found",
      findings: [clip(text, EXCERPT_LIMIT)],
      ...(text.length > EXCERPT_LIMIT ? { truncated: true, response_chars: text.length } : {}),
      ...tail,
    },
    // The FULL text, before the excerpt cap. Extracting from the clipped copy
    // would silently drop every tag line past 2000 characters — which is where
    // a long review keeps most of them.
    found: text,
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
      ...promptJoin(payload),
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
 * Returns null when this is not an acknowledgement at all. When it is, returns
 * the agent id it names — or a null id, which is a different thing and must
 * stay different: "not a terminal, and not linkable" is still not a terminal.
 * Collapsing the two by inventing a placeholder id was the bug here.
 */
function launchAcknowledgement(
  response: unknown,
): { agentId: string | null; model: string | null } | null {
  if (!isObject(response)) return null;
  const launched = response["isAsync"] === true || response["status"] === "async_launched";
  if (!launched) return null;
  return {
    agentId: str(response["agentId"]) ?? str(response["agent_id"]),
    // The acknowledgement is where the harness states the model it resolved,
    // and the only place it does so for an asynchronous dispatch — the
    // SubagentStop that terminates it carries no model at all. Recorded here,
    // carried on the link, spent at the terminal.
    model: str(response["resolvedModel"]) ?? str(response["model"]),
  };
}

/**
 * Pull the reviewers' declared tag lines out of a return.
 *
 * Pure and total: text in, drafts out, no filesystem and no judgement. Every
 * decision it makes is settled by the regex — which severity, which tag, where
 * the text ends — so the same return always yields the same findings, and a
 * return that used no tags yields none rather than a charitable reading of its
 * prose.
 *
 * The drafts are complete except for `at`, which the caller stamps from its own
 * clock so that a report and the findings it carries share one timestamp.
 *
 * @param text       The FULL return text, before any excerpt cap.
 * @param dispatchId The terminal's dispatch id. Every finding names it, and the
 *                   validator requires that dispatch to appear earlier in the
 *                   same journal.
 * @param author     Who raised it — the dispatched agent's name.
 */
export function extractFindings(
  text: string,
  dispatchId: string,
  author: string,
): JournalDraft[] {
  const findings: JournalDraft[] = [];
  for (const line of text.split("\n")) {
    const match = TAG_LINE.exec(line);
    if (match === null) continue;
    const tag = match[1];
    const body = (match[2] ?? "").trim();
    if (tag === undefined || body.length === 0) continue;

    findings.push({
      kind: "finding",
      // Stable across re-reads of the same return: the dispatch it belongs to
      // and its position within that return, and nothing about when it was
      // read. A clock in this id would make one return produce a different set
      // of findings every time it was extracted.
      id: `f:${digest(`${dispatchId}#${findings.length}`)}`,
      dispatch: dispatchId,
      // `false-premise` is not a severity. The reviewers define it as always a
      // blocker, so it maps onto the closed vocabulary the schema already has
      // and keeps its own name in `tag` — metadata no verdict reads. Adding it
      // to SEVERITIES would be a schema bump for a distinction the reviewers
      // themselves say collapses.
      severity: tag === "false-premise" ? "blocker" : tag,
      ...(tag === "false-premise" ? { tag } : {}),
      author,
      text: clip(body, EXCERPT_LIMIT),
      ...(body.length > EXCERPT_LIMIT ? { truncated: true, chars: body.length } : {}),
    });
  }
  return findings;
}

/**
 * Whether a dispatch is one `SILENT-REVIEWER` may fire on, and why the answer
 * is what it is.
 *
 * `expects` is set from a file the dispatched agent declared its own contract
 * in — never from the agent's name, its task text, or anything the dispatcher
 * asserted about it. `agent_definition` records how that read went, so a
 * dispatch missing `expects` because nothing could be read is distinguishable
 * from one whose agent is simply not a reviewer. That is the one direction
 * this scoping fails open, and the file says which case it is in.
 */
function agentContract(
  subagentType: string | null,
  context: RecordContext,
): { expects?: "findings"; agent_definition?: AgentDefinitionRead } {
  // Nothing named, nothing to read: there is no agent file whose absence would
  // mean anything, so `missing` would be a claim about a path never formed.
  if (subagentType === null) return {};

  // Before any path is built. The refusal is that no read is attempted.
  if (!SAFE_SUBAGENT_NAME.test(subagentType)) return { agent_definition: "unsafe-name" };

  let definition: string | null;
  try {
    definition = context.readAgentDefinition(subagentType);
  } catch {
    return { agent_definition: "unreadable" };
  }
  if (definition === null) return { agent_definition: "missing" };
  return declaresTagContract(definition)
    ? { expects: "findings", agent_definition: "read" }
    : { agent_definition: "read" };
}

/**
 * Does this agent definition declare the tag contract? True when `[blocker]`
 * appears under an `## Output format` heading, and the section ends at the
 * next heading of the same level or shallower.
 */
function declaresTagContract(definition: string): boolean {
  let depth: number | null = null;
  for (const line of definition.split("\n")) {
    if (depth === null) {
      const opened = OUTPUT_FORMAT_HEADING.exec(line);
      if (opened !== null) depth = (opened[1] ?? "#").length;
      continue;
    }
    const heading = ANY_HEADING.exec(line);
    if (heading !== null && (heading[1] ?? "#").length <= depth) return false;
    if (line.includes("[blocker]")) return true;
  }
  return false;
}

/**
 * The operator's turn.
 *
 * ⚠️ THE PAYLOAD SHAPE HERE IS AN ASSUMPTION, NOT A RECORDING. Every other
 * shape this file reads is pinned to a probe under
 * `spec/fixtures/probes/claude-code/`; `UserPromptSubmit` has no probe in that
 * corpus, and capturing one is tasks §0 of this change, still open. So the
 * text is looked for under several plausible keys and its absence is tolerated
 * — recorded as a note rather than as a `prompt` record asserting the operator
 * spoke and saying nothing they said. When the probe lands, replace this list
 * with the observed key and delete the fallbacks.
 */
const PROMPT_TEXT_KEYS = ["prompt", "prompt_text", "user_prompt", "text"] as const;

function promptFor(
  payload: JsonObject,
  context: RecordContext,
  plan: (records: JournalDraft[], note?: string | null) => RecordPlan,
): RecordPlan {
  let text: string | null = null;
  for (const key of PROMPT_TEXT_KEYS) {
    text = str(payload[key]);
    if (text !== null) break;
  }
  if (text === null) {
    return plan(
      [],
      `a UserPromptSubmit payload carried no prompt text under any key this build reads (${PROMPT_TEXT_KEYS.join(", ")}) — this event's shape is assumed rather than probed, so nothing was recorded rather than a prompt record that says the operator spoke and nothing about what they said`,
    );
  }

  const at = context.now();
  const promptId = str(payload["prompt_id"]);
  // The harness's own key when it supplies one, so the join to dispatches and
  // mutations is attested rather than inferred from timestamps. Without one
  // the prompt is still recorded — it happened — but nothing later can claim
  // to belong to it, and this id says so by not being a key anything joins on.
  const id =
    promptId !== null
      ? `p:${promptId}`
      : `p:${digest(JSON.stringify([str(payload["session_id"]) ?? "", at, text]))}`;

  const keepText = context.recordPromptText();
  return plan(
    [
      {
        kind: "prompt",
        id,
        // One of the two shapes, never neither: the text, or a length and a
        // hash. The hashed mode proves a prompt happened without recording
        // what it asked; a record with neither would assert an exchange
        // occurred that cannot be inspected at all.
        ...(keepText
          ? {
              text: clip(text, EXCERPT_LIMIT),
              ...(text.length > EXCERPT_LIMIT ? { truncated: true } : {}),
            }
          : { hash: hashText(text) }),
        chars: text.length,
        at,
      },
    ],
    promptId === null
      ? "this UserPromptSubmit payload carried no prompt_id, so the prompt is recorded under a content-derived id and no dispatch or mutation in this session can be joined to it"
      : null,
  );
}

/** The join key later records carry, when the harness supplied one to join on. */
function promptJoin(payload: JsonObject): { prompt?: string } {
  const promptId = str(payload["prompt_id"]);
  return promptId === null ? {} : { prompt: `p:${promptId}` };
}

/**
 * Model and usage as the harness reported them on this very payload — the
 * synchronous case, where the response that terminates the dispatch also
 * carries what it cost.
 */
function payloadCost(response: unknown): {
  model?: string;
  usage?: Usage;
  usage_source?: "payload";
} {
  if (!isObject(response)) return {};
  const model = str(response["resolvedModel"]) ?? str(response["model"]);
  const usage = readUsage(response["usage"]);
  return {
    ...(model === null ? {} : { model }),
    ...(usage === null ? {} : { usage, usage_source: "payload" as const }),
  };
}

/**
 * The harness's token counts, renamed to the schema's names. Absent when the
 * shape carries none of them: a usage block of four zeros would say a dispatch
 * cost nothing, which is a measurement, not a silence.
 */
function readUsage(value: unknown): Usage | null {
  if (!isObject(value)) return null;
  const input = num(value["input_tokens"]);
  const output = num(value["output_tokens"]);
  const cacheRead = num(value["cache_read_input_tokens"]);
  const cacheCreation = num(value["cache_creation_input_tokens"]);
  if (input === null && output === null && cacheRead === null && cacheCreation === null) {
    return null;
  }
  return withTotal({
    input: input ?? 0,
    output: output ?? 0,
    cache_read: cacheRead ?? 0,
    cache_creation: cacheCreation ?? 0,
  });
}

/**
 * Sum the four parts into `total`, rather than copying a total the payload
 * offered. Exported so the transcript reader `cli.ts` wires computes its total
 * the same way — two producers writing the same field by different arithmetic
 * is a difference no reader could see.
 */
export function withTotal(parts: Omit<Usage, "total">): Usage {
  return { ...parts, total: parts.input + parts.output + parts.cache_read + parts.cache_creation };
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
  return hashText(text).slice(0, 16);
}

/**
 * The whole digest, not the short one. A prompt's `hash` is the only thing the
 * hashed mode records about what was said, so it is not shortened to the width
 * a join key can afford to collide at.
 *
 * Exported for `bundle.ts`, which converts an already-recorded prompt to this
 * same hashed shape under `--no-prompts`. A second `createHash("sha256")` there
 * would be a copy of the one thing that has to agree byte for byte: two hashes
 * of the same prompt differing would read to anybody comparing them as
 * tampering rather than as drift. It is NOT re-exported from `index.ts` — the
 * published surface is unchanged.
 */
export function hashText(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}
