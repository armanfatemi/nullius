#!/usr/bin/env node
/* eslint-disable no-console -- this is a CLI tool; console output is its user-facing surface */
/**
 * `nullius-kit witness` — the producer half of the journal.
 *
 * `nullius witness validate` judges a journal. This writes one, from harness
 * hook payloads, so that the journal being judged is not text the agent wrote
 * about its own work. Two subcommands, both fed a hook payload on stdin:
 *
 *   witness record   append the record this event implies
 *   witness check    validate the session's journal, advisory, always exit 0
 *
 * Nothing here blocks a session. A recorder that can break the run it observes
 * gets uninstalled the first time it misfires, and then observes nothing.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import { isJournalFailure, validateJournal, type JournalOrigin } from "@nullius-inverba/claims";

import {
  appendRecords,
  journalPathFor,
  linksPathFor,
  openDispatchesIn,
  recordLink,
  resolveLink,
} from "./journalFile";
import { planRecords, type RecordContext } from "./record";

/** The schema this build writes. The validator reads 0.1 and 0.2. */
const SCHEMA_VERSION = "0.2";

/** How many findings the advisory check prints before it says "and N more". */
const ADVISORY_LIMIT = 10;

const USAGE = `nullius-kit — witness recording for agent runs

usage:
  nullius-kit witness record [--origin hooks|self-reported] [--root <dir>]
  nullius-kit witness check  [--root <dir>]

Both read one harness hook payload as JSON on stdin and write to
.nullius/runs/<session_id>.jsonl under an advisory lock.

  record   append the dispatch / report / mutation this event implies, and at
           session end seal every dispatch that never came back as no-report
  check    validate the session's journal and print what does not hold up;
           always exits 0, so it can never block the run it is watching

  --origin  who is writing these records (default: hooks). Journals not
            emitted by the harness must say so: self-reported records certify
            internal consistency and nothing about what happened.
  --root    the repo the journal belongs to (default: $CLAUDE_PROJECT_DIR,
            the payload's cwd, or the working directory)

Set NULLIUS_WITNESS_PROBE=1 to also save each raw payload to
.nullius/probes/<event>.json. That directory is ground truth about the
installed harness — which fields it actually sends — as against documentation,
which describes some version of it.

env: NULLIUS_WITNESS_ROOT, NULLIUS_WITNESS_ORIGIN, NULLIUS_WITNESS_PROBE`;

interface CliOptions {
  origin: JournalOrigin;
  root: string | null;
}

function main(): number {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) {
    console.log(USAGE);
    return argv.length === 0 ? 2 : 0;
  }

  const options = parseOptions(argv);
  if (options === null) return 2;

  const [command, sub] = argv;
  if (command !== "witness") {
    console.error(`unknown command: ${String(command)}\n\n${USAGE}`);
    return 2;
  }
  if (sub === "record") return runRecord(options);
  if (sub === "check") return runCheck(options);

  console.error(`unknown subcommand: witness ${String(sub)}\n\n${USAGE}`);
  return 2;
}

function parseOptions(argv: readonly string[]): CliOptions | null {
  const options: CliOptions = {
    origin: envOrigin(process.env["NULLIUS_WITNESS_ORIGIN"]),
    root: process.env["NULLIUS_WITNESS_ROOT"] ?? null,
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--origin") {
      const value = argv[(index += 1)];
      if (value !== "hooks" && value !== "self-reported") {
        console.error(`--origin must be 'hooks' or 'self-reported', not ${String(value)}`);
        return null;
      }
      options.origin = value;
    } else if (arg === "--root") {
      const value = argv[(index += 1)];
      if (value === undefined) {
        console.error("--root needs a directory");
        return null;
      }
      options.root = value;
    } else {
      console.error(`unknown flag: ${String(arg)}\n\n${USAGE}`);
      return null;
    }
  }

  return options;
}

function runRecord(options: CliOptions): number {
  const payload = readPayload();
  if (payload === null) {
    note("no readable JSON payload on stdin — nothing was recorded");
    return 0;
  }

  const root = resolveRoot(options, payload);
  const session = stringField(payload, "session_id");
  const file = journalPathFor(root, session);
  const event = stringField(payload, "hook_event_name");

  if (process.env["NULLIUS_WITNESS_PROBE"] === "1") probe(root, event, payload);

  const links = linksPathFor(file);
  const context: RecordContext = {
    origin: options.origin,
    now: () => new Date().toISOString(),
    locateTarget: (path) => locateTarget(root, path),
    // Read lazily: only session end asks, and only session end should pay for
    // parsing the whole journal.
    openDispatches: () =>
      existsSync(file) ? openDispatchesIn(readFileSync(file, "utf8")) : [],
    resolveAgent: (agentId) => resolveLink(links, agentId),
  };

  const plan = planRecords(payload, context);
  if (plan.note !== null) note(plan.note);

  // The link is bookkeeping, so it is written whether or not there is a record
  // to go with it — losing it means losing the only join between a subagent's
  // stop and the dispatch that started it.
  if (plan.link !== null) {
    const linked = recordLink(links, plan.link.agentId, plan.link.dispatch);
    if (linked.refused !== null) {
      note(
        `${linked.refused} — without this link, ${plan.link.agentId}'s report cannot be joined to ${plan.link.dispatch}, which will be sealed as no-report at session end`,
      );
    }
  }

  // A journal is opened by a session starting, or by the first thing worth
  // recording. Not by every ignored Bash call — a directory of header-only
  // journals for sessions that dispatched nothing is noise that makes the real
  // ones harder to find.
  if (plan.records.length === 0 && event !== "SessionStart") return 0;

  if (session === null) {
    note(
      "this payload carries no session_id, so its records land in unknown-session.jsonl and may be mixed with another session's",
    );
  }

  const outcome = appendRecords(file, plan.records, {
    version: SCHEMA_VERSION,
    origin: options.origin,
    session,
    source: plan.source,
  });
  if (outcome.refused !== null) note(outcome.refused);
  return 0;
}

function runCheck(options: CliOptions): number {
  const payload = readPayload();
  if (payload === null) return 0;

  // A Stop hook that acts on a stop it caused itself is a loop. This one only
  // prints, but the guard is unconditional anyway: the day someone makes it
  // blocking is the day the guard has to already be there.
  if (payload["stop_hook_active"] === true) return 0;

  const root = resolveRoot(options, payload);
  const file = journalPathFor(root, stringField(payload, "session_id"));
  if (!existsSync(file)) return 0;

  const report = validateJournal(readFileSync(file, "utf8"));
  const failures = report.findings.filter((finding) => isJournalFailure(finding.verdict));
  if (failures.length === 0) return 0;

  console.error(
    `nullius witness: ${failures.length} record(s) in this run's journal do not hold up (${file}).`,
  );
  for (const finding of failures.slice(0, ADVISORY_LIMIT)) {
    console.error(`  ${finding.verdict.toUpperCase()}  ${finding.subject}  — ${finding.detail}`);
  }
  if (failures.length > ADVISORY_LIMIT) {
    // The cap is stated rather than applied quietly: an elided list that looks
    // complete is the same defect this whole tool is about.
    console.error(`  … and ${failures.length - ADVISORY_LIMIT} more.`);
  }
  console.error(
    "  Advisory only. A dispatch with no report may still be in flight; session end is when that becomes knowable.",
  );
  return 0;
}

/**
 * A path out of a tool payload, as the journal should record it.
 *
 * Repo-relative wherever possible, and always with forward slashes. Invariant
 * 2 compares path STRINGS: a mutation stored as `/Users/x/repo/src/a.ts` would
 * never invalidate a verification stored as `src/a.ts`, and the invariant
 * would fail open silently — the worst way for a check to fail.
 */
function locateTarget(root: string, path: string): { path: string; hash: string } | null {
  const absolute = isAbsolute(path) ? path : resolve(root, path);
  let content: Buffer;
  try {
    content = readFileSync(absolute);
  } catch {
    return null;
  }

  const inside = relative(root, absolute);
  const recorded = inside.length > 0 && !inside.startsWith("..") && !isAbsolute(inside)
    ? inside
    : absolute;
  return {
    path: recorded.split(sep).join("/"),
    hash: createHash("sha256").update(content).digest("hex").slice(0, 16),
  };
}

/**
 * Save one raw payload per event, verbatim.
 *
 * Every field this recorder reads out of a hook payload is an assumption about
 * a harness this repo does not own: whether `PreToolUse` carries a
 * `tool_use_id`, what a Task's `tool_response` looks like, which `source`
 * values a `SessionStart` uses. Documentation describes some version of that;
 * the probe directory records the one that is installed. `doctor` diagnoses
 * against these samples rather than against the docs, which is the difference
 * between "this should work" and "this works here".
 *
 * Last write per event wins: the point is one current sample of each shape,
 * not a log.
 */
function probe(root: string, event: string | null, payload: Record<string, unknown>): void {
  const name = (event ?? "unknown-event").replace(/[^A-Za-z0-9._-]/g, "-");
  const file = join(root, ".nullius", "probes", `${name}.json`);
  try {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  } catch (error) {
    note(`could not save a probe of ${name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function resolveRoot(options: CliOptions, payload: Record<string, unknown>): string {
  return resolve(
    options.root ??
      process.env["CLAUDE_PROJECT_DIR"] ??
      stringField(payload, "cwd") ??
      process.cwd(),
  );
}

function readPayload(): Record<string, unknown> | null {
  let raw: string;
  try {
    raw = readFileSync(0, "utf8");
  } catch {
    return null;
  }
  if (raw.trim().length === 0) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function stringField(payload: Record<string, unknown>, field: string): string | null {
  const value = payload[field];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function envOrigin(value: string | undefined): JournalOrigin {
  return value === "self-reported" ? "self-reported" : "hooks";
}

/** Everything this tool declines to do, it says out loud — on stderr, so it
 *  lands in the hook transcript without touching the journal. */
function note(message: string): void {
  console.error(`nullius witness: ${message}`);
}

process.exit(main());
