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
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import { isJournalFailure, validateJournal, type JournalOrigin } from "@nullius-inverba/claims";

import { detect, mayWriteHooks } from "./detect";
import { formatReport, runChecks } from "./doctor";
import { findProfile, PROFILE_NAMES, PROFILES } from "./profiles";
import { applyPlan, buildPlan, formatPlan } from "./render";
import {
  appendRecords,
  journalPathFor,
  linksPathFor,
  openDispatchesIn,
  recordLink,
  resolveLink,
  terminalsIn,
} from "./journalFile";
import { planRecords, type RecordContext, type RecordPlan } from "./record";
import { runPipeline } from "./pipeline";

/** The schema this build writes. The validator reads 0.1 and 0.2. */
const SCHEMA_VERSION = "0.2";

/** How many findings the advisory check prints before it says "and N more". */
const ADVISORY_LIMIT = 10;

const USAGE = `nullius-kit — witness recording for agent runs

usage:
  nullius-kit init   [--profile <name>] [--dry-run] [--yes] [--root <dir>]
  nullius-kit doctor [--fix] [--root <dir>]
  nullius-kit pipeline <command> [<change>] [--root <dir>]
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

  // `init`, `doctor`, and `pipeline` own their own flags; the witness options
  // parser would reject them.
  if (argv[0] === "init") return runInit(argv.slice(1));
  if (argv[0] === "doctor") return runDoctor(argv.slice(1));
  if (argv[0] === "pipeline") return runPipeline(argv.slice(1));

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

/**
 * Pinned by default. `@main` is a moving target, and a workflow that silently
 * changes behaviour is the thing this repo exists to object to.
 */
const ACTION_REF = "armanfatemi/nullius/action@v1";

interface InitOptions {
  profile: string | null;
  dryRun: boolean;
  root: string;
}

function parseInit(argv: readonly string[]): InitOptions | null {
  const options: InitOptions = { profile: null, dryRun: false, root: process.cwd() };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--yes" || arg === "-y") {
      // Accepted and inert: init never prompts, so there is nothing to confirm.
      // Refusing the flag would break the copy-pasteable line in the README
      // for no gain; silently accepting it is honest because the promise it
      // asks for is one init already keeps.
      continue;
    } else if (arg === "--profile") {
      const value = argv[(index += 1)];
      if (value === undefined) {
        console.error(`--profile needs a name (${PROFILE_NAMES.join(", ")})`);
        return null;
      }
      options.profile = value;
    } else if (arg === "--root") {
      const value = argv[(index += 1)];
      if (value === undefined) {
        console.error("--root needs a directory");
        return null;
      }
      if (value.trim() === "") {
        // resolve("") is process.cwd(), so `--root "$REPO"` with REPO unset
        // would silently initialise whatever directory the shell is in.
        console.error("--root was empty — refusing to fall back to the current directory");
        return null;
      }
      options.root = value;
    } else {
      console.error(`unknown flag for \`init\`: ${String(arg)}\n\n${USAGE}`);
      return null;
    }
  }

  return options;
}

function runInit(argv: readonly string[]): number {
  const options = parseInit(argv);
  if (options === null) return 2;

  const root = resolve(options.root);
  if (!existsSync(root)) {
    console.error(`no such directory: ${root}`);
    return 2;
  }
  if (!statSync(root).isDirectory()) {
    // existsSync alone let a FILE through, and the plan then promised three
    // creates before mkdir died on it.
    console.error(`not a directory: ${root}`);
    return 2;
  }

  const detection = detect(root);
  const name = options.profile ?? detection.suggestedProfile;
  const profile = findProfile(name);
  if (profile === null) {
    console.error(
      `unknown profile: ${name}\n\nprofiles:\n${PROFILES.map((entry) => `  ${entry.name.padEnd(7)} ${entry.summary}`).join("\n")}`,
    );
    return 2;
  }

  if (options.profile === null) {
    console.log(`Detected profile \`${profile.name}\` — ${detection.reason}.`);
    console.log("Override with --profile <name>.");
    console.log("");
  }

  const plan = buildPlan({
    root,
    profile,
    kitVersion: packageVersion(),
    actionRef: ACTION_REF,
    hookPolicy: mayWriteHooks(detection.harness),
  });

  console.log(formatPlan(plan, options.dryRun));

  // Named, never enabled. Capture writes raw hook payloads — prompt text and
  // absolute paths — so whether to persist them is the operator's call, and an
  // installer that switched it on as a side effect of setup would have made
  // that call for them. Naming it is the part init owes; setting it is not.
  console.log("");
  console.log("  Payload capture: setting NULLIUS_WITNESS_PROBE to exactly 1 saves every raw");
  console.log("  hook payload to .nullius/probes/. Those payloads carry your prompt text and");
  console.log("  absolute paths, so capture is OFF unless you ask for it — init does not set");
  console.log("  it and will not offer to. Detail: .nullius/README.md");

  if (options.dryRun) {
    console.log("");
    console.log("Dry run — the working tree is unchanged.");
    return 0;
  }

  const result = applyPlan(plan);
  console.log("");
  console.log(
    `${result.written.length} written, ${result.unchanged.length} already current, ${result.skipped.length} skipped, ${result.failed.length} failed.`,
  );

  if (result.failed.length > 0) {
    console.error("");
    for (const failure of result.failed) {
      console.error(`  FAILED  ${failure.path}`);
      console.error(`          ${failure.reason}`);
    }
    // Non-zero, and the counts above say exactly which files did land. A
    // partial apply reported as success is the shape of lie this repo exists
    // to refuse.
    console.error("");
    console.error("Some files were not written. The counts above are what actually happened.");
    return 1;
  }
  return 0;
}

interface DoctorOpts {
  fix: boolean;
  root: string;
}

function parseDoctor(argv: readonly string[]): DoctorOpts | null {
  const options: DoctorOpts = { fix: false, root: process.cwd() };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--fix") {
      options.fix = true;
    } else if (arg === "--root") {
      const value = argv[(index += 1)];
      if (value === undefined) {
        console.error("--root needs a directory");
        return null;
      }
      if (value.trim() === "") {
        console.error("--root was empty — refusing to fall back to the current directory");
        return null;
      }
      options.root = value;
    } else {
      console.error(`unknown flag for \`doctor\`: ${String(arg)}\n\n${USAGE}`);
      return null;
    }
  }

  return options;
}

function runDoctor(argv: readonly string[]): number {
  const options = parseDoctor(argv);
  if (options === null) return 2;

  const root = resolve(options.root);
  if (!existsSync(root)) {
    console.error(`no such directory: ${root}`);
    return 2;
  }
  if (!statSync(root).isDirectory()) {
    console.error(`not a directory: ${root}`);
    return 2;
  }

  // --fix first, so the checks below describe the repaired state rather than
  // the one the user is about to stop having. There is no separate `update`
  // verb: diagnose-then-repair is one mental model, and a second verb would
  // answer no question this one does not.
  if (options.fix) {
    const detection = detect(root);
    const kit = readKitProfile(root);

    if (kit.kind === "unreadable") {
      // Refuse rather than fall back to detection. Guessing here rewrites the
      // repo's CI gating semantics on the strength of a directory listing.
      console.error(`cannot re-render: nullius.kit.json is unreadable — ${kit.reason}`);
      console.error(
        "Refusing to guess the profile from repo shape: that would silently change which documents are checked, and whether CI can fail.",
      );
      console.error("Fix the file, or re-run `init --profile <name>` to set it deliberately.");
      return 2;
    }

    const name = kit.kind === "found" ? kit.profile : detection.suggestedProfile;
    const profile = findProfile(name);
    if (profile === null) {
      console.error(`cannot re-render: unknown profile \`${name}\` in nullius.kit.json`);
      return 2;
    }
    if (kit.kind === "absent") {
      console.log(`No nullius.kit.json — using the detected profile \`${profile.name}\` (${detection.reason}).`);
    }

    console.log(`Re-rendering managed artifacts for profile \`${profile.name}\`.`);
    const plan = buildPlan({
      root,
      profile,
      kitVersion: packageVersion(),
      actionRef: ACTION_REF,
      hookPolicy: mayWriteHooks(detection.harness),
      // User-owned files come out byte-identical from a repair.
      touchUserFiles: false,
    });
    const applied = applyPlan(plan);
    console.log(
      `  ${applied.written.length} re-rendered, ${applied.unchanged.length} already current, ${applied.skipped.length} skipped, ${applied.failed.length} failed.`,
    );
    for (const failure of applied.failed) {
      console.error(`  FAILED  ${failure.path}: ${failure.reason}`);
    }
    // Hook entries are deliberately untouched. `--fix` may only ever modify
    // artifacts matching the kit's own command-path convention, and the kit
    // writes no hooks at all — so there is nothing here it owns.
    console.log("");
  }

  const report = runChecks({
    root,
    probeDir: join(root, "spec", "fixtures", "probes", "claude-code"),
    // Resolved here rather than inside the check: `runChecks` takes the path
    // so a test can point it at a fixture instead of the developer's own
    // configuration.
    userSettingsPath: join(homedir(), ".claude", "settings.json"),
  });
  console.log(formatReport(report));

  return report.failed ? 1 : 0;
}

/**
 * The profile a previous `init` recorded, so `--fix` re-renders the same one.
 *
 * "Corrupt" and "absent" are different answers and must not collapse. They did:
 * both returned null, and null fell through to re-detection — so a truncated
 * write or a bad merge silently converted a `prs` repo to `specs`, which turns
 * CI from advisory to blocking. A corrupt config is the single most likely
 * state after an interrupted write, and it is the one that must refuse.
 */
type KitProfile =
  | { kind: "found"; profile: string }
  | { kind: "absent" }
  | { kind: "unreadable"; reason: string };

function readKitProfile(root: string): KitProfile {
  const path = join(root, "nullius.kit.json");
  if (!existsSync(path)) {
    // kit 0.1.0 wrote this under `.nullius/`, which is the recording opt-in.
    // Say so rather than treating an upgraded repo as never initialised.
    const legacy = join(root, ".nullius", "kit.json");
    if (existsSync(legacy)) {
      return {
        kind: "unreadable",
        reason:
          "found .nullius/kit.json from kit 0.1.0 — kit config moved to nullius.kit.json, because .nullius/ is the recording opt-in and init must not create it. Re-run `init` to migrate, then delete the old file",
      };
    }
    return { kind: "absent" };
  }
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (error) {
    return { kind: "unreadable", reason: error instanceof Error ? error.message : String(error) };
  }
  try {
    const parsed = JSON.parse(raw) as { profile?: unknown };
    if (typeof parsed.profile === "string") return { kind: "found", profile: parsed.profile };
    return { kind: "unreadable", reason: "no `profile` string in nullius.kit.json" };
  } catch (error) {
    return { kind: "unreadable", reason: error instanceof Error ? error.message : String(error) };
  }
}

function packageVersion(): string {
  try {
    const url = new URL("../package.json", import.meta.url);
    const manifest = JSON.parse(readFileSync(url, "utf8")) as { version?: string };
    return manifest.version ?? "unknown";
  } catch {
    return "unknown";
  }
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
    now: () => new Date().toISOString(),
    locateTarget: (path) => locateTarget(root, path),
    // Read lazily: only session end asks, and only session end should pay for
    // parsing the whole journal.
    openDispatches: () =>
      existsSync(file) ? openDispatchesIn(readFileSync(file, "utf8")) : [],
    resolveAgent: (agentId) => resolveLink(links, agentId),
    hasTerminal: (dispatch) =>
      existsSync(file) ? terminalsIn(readFileSync(file, "utf8")).has(dispatch) : false,
  };

  // Two events decide what to write by reading what is already written, and
  // both must do it under the lock. Session end seals every dispatch with no
  // terminal; a subagent's stop writes a terminal unless one is already there.
  // Deciding either outside the lock leaves a window: the seal writes a SECOND
  // terminal for a dispatch that just came back, which validates as
  // DUPLICATE-TERMINAL and counts a subagent that reported under "never
  // reported" — the one error this journal exists to prevent, committed by its
  // own recorder.
  if (event === "SessionEnd" || event === "SubagentStop") {
    let decided: RecordPlan | undefined;
    const outcome = appendRecords(
      file,
      () => {
        decided = planRecords(payload, context);
        return decided.records;
      },
      { version: SCHEMA_VERSION, origin: options.origin, session, source: null },
      { createEmpty: false },
    );
    if (decided?.note != null) note(decided.note);
    if (outcome.refused !== null) note(outcome.refused);
    return 0;
  }

  const plan = planRecords(payload, context);
  if (plan.note !== null) note(plan.note);

  // The link is bookkeeping, so it is written whether or not there is a record
  // to go with it — losing it means losing the only join between a subagent's
  // stop and the dispatch that started it. Written before the append, and under
  // its own lock rather than nested inside the journal's, so the two locks are
  // never held at once.
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
