/**
 * `doctor` — is the ratchet still ratcheting?
 *
 * Every delivery mechanism here fails open by design: a hook that cannot run
 * must never break a session, and a workflow missing `fetch-depth: 0` quietly
 * turns every rev-stamped anchor advisory. That is the right posture and it
 * has one cost — every failure is silent. This is the only place a user ever
 * learns the ratchet stopped.
 *
 * Two rules shape what it may say.
 *
 * **Local only.** No network, no API. "Is the journal receiving records" as a
 * remote check is either an mtime heuristic — under which an idle repo looks
 * broken — or network calls in a tool whose README carries a live anchor
 * asserting it makes none.
 *
 * **Absence of evidence is labelled, never inferred.** An empty journal
 * directory is a fact about the directory, not a verdict on the hook pack. A
 * diagnostic that guesses is worse than one that declines, because a user acts
 * on it.
 */

import { accessSync, constants, existsSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";

import { isJournalFailure, parseConfig, validateJournal } from "@nullius-inverba/claims";

import { planRecords, type RecordContext } from "./record";

export type Status =
  /** Checked, and it holds. */
  | "pass"
  /** Checked, and it does not. Exits non-zero. */
  | "fail"
  /** Not checkable from here. Never guessed either way. */
  | "unknown"
  /** An observation with no verdict attached — the absence-of-evidence case. */
  | "fact";

export interface Check {
  name: string;
  status: Status;
  detail: string;
}

export interface DoctorReport {
  checks: Check[];
  /** True when any check failed. */
  failed: boolean;
}

/**
 * A hook entry belongs to the kit when its command resolves to the kit.
 *
 * `.claude/settings.json` hook entries are anonymous objects — JSON carries no
 * comments, the schema has no id field — so the command string is the only
 * durable identity available. `--fix` may only ever touch entries matching
 * this, which is what keeps it from editing hooks somebody else installed.
 */
export function isManagedHookCommand(command: string): boolean {
  return (
    command.includes(".nullius/hooks/") ||
    command.includes("nullius-kit") ||
    /packages[/\\]kit[/\\]dist[/\\]cli\.js/.test(command)
  );
}

interface HookEntry {
  event: string;
  command: string;
}

function readManagedHooks(root: string): { entries: HookEntry[]; unreadable: boolean } {
  const settingsPath = join(root, ".claude", "settings.json");
  if (!existsSync(settingsPath)) return { entries: [], unreadable: false };

  try {
    const settings = JSON.parse(readFileSync(settingsPath, "utf8")) as {
      hooks?: Record<string, { hooks?: { command?: unknown }[] }[]>;
    };
    const entries: HookEntry[] = [];
    for (const [event, matchers] of Object.entries(settings.hooks ?? {})) {
      if (!Array.isArray(matchers)) continue;
      for (const matcher of matchers) {
        for (const hook of matcher.hooks ?? []) {
          if (typeof hook.command !== "string") continue;
          if (isManagedHookCommand(hook.command)) entries.push({ event, command: hook.command });
        }
      }
    }
    return { entries, unreadable: false };
  } catch {
    return { entries: [], unreadable: true };
  }
}

/** The variable the recorder tests, and the only one this check reads. */
const CAPTURE_VAR = "NULLIUS_WITNESS_PROBE";

/** The name the capture-state check reports under. */
const CAPTURE_CHECK = "payload capture";

/**
 * Where live capture writes. Named with the disclaimer attached everywhere it
 * appears, because the committed corpus `probeChecks` reads is a different
 * directory and reading one report as the other is the misreading this check
 * exists to prevent.
 */
const LIVE_PROBE_DIR = ".nullius/probes/ (the live capture directory, not the committed probe corpus)";

interface SettingsRead {
  /** How this file is named in the report. */
  label: string;
  /** The value the file's `env` block carries, or null when it sets none. */
  value: string | null;
  /** The file exists and did not parse — the one honest `unknown`. */
  unreadable: boolean;
  /** The file is not there at all — an observation, never an `unknown`. */
  absent: boolean;
  /**
   * No path was handed to the check, so this file was never looked for.
   *
   * Distinct from `absent`, which is the result of looking. Dropping the read
   * entirely would be worse than either: the report speaks of the files it
   * checked, and a caller that supplied no user settings path would get a list
   * silently one file short of what the sentence claims to enumerate.
   */
  notSupplied: boolean;
}

/**
 * One settings file's `env` entry for a variable.
 *
 * Follows `readManagedHooks`' precedent rather than inventing one: an absent
 * file and an unparseable file are different answers and must not collapse,
 * because only the second is a failure to determine.
 */
function readSettingsEnv(path: string, label: string, variable: string): SettingsRead {
  if (!existsSync(path)) {
    return { label, value: null, unreadable: false, absent: true, notSupplied: false };
  }

  try {
    const settings = JSON.parse(readFileSync(path, "utf8")) as { env?: unknown };
    const env = settings.env;
    if (env === null || typeof env !== "object") {
      return { label, value: null, unreadable: false, absent: false, notSupplied: false };
    }
    const raw = (env as Record<string, unknown>)[variable];
    return {
      label,
      value: raw === undefined || raw === null ? null : String(raw),
      unreadable: false,
      absent: false,
      notSupplied: false,
    };
  } catch {
    return { label, value: null, unreadable: true, absent: false, notSupplied: false };
  }
}

/** What one file contributed, in four states that must not collapse into two. */
function stateOf(read: SettingsRead): string {
  if (read.notSupplied) return "not supplied";
  if (read.unreadable) return "could not be parsed";
  if (read.absent) return "absent";
  return "sets nothing";
}

/**
 * The two clauses that must accompany every "nothing sets it" reading.
 *
 * Factored rather than written twice because both no-setter branches owe the
 * reader the same two things — which files were consulted, and that the list of
 * sources this check *cannot* consult is open. A branch that carries one
 * without the other reads as a completeness claim, which is the one thing this
 * check is not entitled to make.
 */
function checkedAndResidue(reads: SettingsRead[]): string {
  const checked = reads.map((read) => `${read.label} (${stateOf(read)})`).join(", ");
  return `checked ${checked}; capture may still be enabled by sources this check does not read, among them the environment of the process that launched the harness`;
}

/** What `.nullius/probes/` holds, said without a verdict about why. */
function describeLiveCaptures(root: string): string {
  const dir = join(root, ".nullius", "probes");
  if (!existsSync(dir)) return `${LIVE_PROBE_DIR} holds no payloads`;

  let newest: Date | null = null;
  let held = 0;
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      held += 1;
      const { mtime } = statSync(join(dir, entry.name));
      if (newest === null || mtime.getTime() > newest.getTime()) newest = mtime;
    }
  } catch (error) {
    return `${LIVE_PROBE_DIR} could not be listed: ${error instanceof Error ? error.message : String(error)}`;
  }

  // An absent directory and an empty one hold the same number of payloads, so
  // they say the same thing. The count and the time are facts; calling them
  // stale would be a claim that capture has stopped, which cannot be checked
  // from here.
  if (held === 0 || newest === null) return `${LIVE_PROBE_DIR} holds no payloads`;
  return `${LIVE_PROBE_DIR} holds ${held} payload(s), most recently written ${newest.toISOString()}`;
}

/**
 * What the settings files say about live payload capture — a fact, not a fault.
 *
 * Two things this deliberately does not do. It does not read `doctor`'s own
 * `process.env`: the variable governs the hook subprocess, while `doctor` runs
 * in the operator's shell, so its environment answers a different question. And
 * it does not adjudicate precedence between settings files — nothing in this
 * repository establishes the harness's ordering, so naming a deciding file
 * would be an ungrounded claim about external behaviour. Every setter is
 * reported with the value it carries, which is strictly more informative than
 * a winner would have been.
 *
 * Both readings are scoped to the file they came from. "This file enables
 * capture" is checkable; "capture is on" is not, and neither is "capture is
 * off" — a shell export into the harness is invisible here, and no amount of
 * file reading recovers it.
 */
export function captureChecks(
  root: string,
  userSettingsPath?: string,
  userSettingsLabel?: string,
): Check[] {
  const reads = [
    readSettingsEnv(
      join(root, ".claude", "settings.local.json"),
      ".claude/settings.local.json",
      CAPTURE_VAR,
    ),
    readSettingsEnv(join(root, ".claude", "settings.json"), ".claude/settings.json", CAPTURE_VAR),
    userSettingsPath === undefined
      ? {
          label: "the user settings file",
          value: null,
          unreadable: false,
          absent: false,
          notSupplied: true,
        }
      : readSettingsEnv(userSettingsPath, userSettingsLabel ?? userSettingsPath, CAPTURE_VAR),
  ];

  const setters = reads.filter((read) => read.value !== null);
  const unreadable = reads.filter((read) => read.unreadable);

  // `unknown` is for when nothing could be established — not for when
  // something could and something else could not. So this branch requires
  // both an unreadable file and no determinate read anywhere else.
  //
  // It says everything the readable-and-unset branch says, and for the same
  // reason. Naming only the file that would not parse invites the reading
  // "capture is off unless that file turns it on" — a completeness claim over
  // settings files, made by the sentence's shape rather than its words, which
  // is why no forbidden-phrase check ever caught it. Held payloads are
  // reported here too: what could not be settled is the settings, and the
  // directory listing is a separate fact that does not become unavailable
  // because a JSON file is malformed.
  if (setters.length === 0 && unreadable.length > 0) {
    return [
      {
        name: CAPTURE_CHECK,
        status: "unknown",
        detail: `could not parse ${unreadable.map((read) => read.label).join(", ")} — ${CAPTURE_VAR} not determined there, and no settings file this check read sets it; ${checkedAndResidue(reads)}. ${describeLiveCaptures(root)}`,
      },
    ];
  }

  const said =
    setters.length === 0
      ? // Scoped to what was read. "No settings file sets it" leads with a
        // quantifier over every settings file that exists, which three
        // `existsSync` calls do not entitle this check to make.
        `no settings file this check read sets ${CAPTURE_VAR} — ${checkedAndResidue(reads)}`
      : [
          setters
            .map(
              (read) =>
                `${read.label} ${read.value === "1" ? "enables" : "disables"} capture (${CAPTURE_VAR}=${read.value})`,
            )
            .join("; "),
          setters.length > 1 ? "; this check does not adjudicate precedence between settings files" : "",
          unreadable.length > 0
            ? `; could not parse ${unreadable.map((read) => read.label).join(", ")}`
            : "",
        ].join("");

  return [{ name: CAPTURE_CHECK, status: "fact", detail: `${said}. ${describeLiveCaptures(root)}` }];
}

/** Shell operators that are not the command, and whose operands are not either. */
const REDIRECTIONS = /^\d*(>>|>|<<|<|2>&1|&>)/;

/** Interpreters whose FIRST argument is the thing that actually has to exist. */
const INTERPRETERS = new Set(["node", "npx", "bun", "deno", "bash", "sh", "zsh", "python", "python3"]);

/** A PATH lookup, so a bare command name is checked rather than shrugged at. */
function onPath(name: string): string | null {
  const dirs = (process.env["PATH"] ?? "").split(":").filter((dir) => dir.length > 0);
  for (const dir of dirs) {
    const candidate = join(dir, name);
    try {
      accessSync(candidate, constants.X_OK);
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      // Not here; keep looking.
    }
  }
  return null;
}

/** Words that are neither the command nor its interpreter's script. */
function commandWords(command: string): string[] {
  return command
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0 && !REDIRECTIONS.test(word));
}

function unquote(word: string): string {
  return word.replace(/^["']/, "").replace(/["']$/, "");
}

/** Anything the shell — not this tool — is responsible for expanding. */
function needsShell(word: string): boolean {
  return /[$~*?]/.test(word);
}

/**
 * Whether a hook's command can actually run.
 *
 * Deliberately conservative in one direction only. A wrong `pass` here is the
 * worst outcome available: this check exists FOR the hook whose binary moved,
 * and a green line saying so is worse than no line. A wrong `fail` is nearly as
 * bad in practice, because it exits non-zero and breaks a working install — so
 * anything this cannot settle honestly is `unknown`, never a guess in either
 * direction.
 *
 * The predecessor took "the first whitespace token containing a slash" as the
 * binary. That selected redirection targets (`>/dev/null`), passed on any
 * directory because `accessSync(dir, X_OK)` succeeds, and failed on `$VAR`,
 * `~/bin/...` and inner-quoted paths — four wrong verdicts on working hooks
 * and one wrong pass on a command that cannot run at all.
 */
function resolveHookCommand(root: string, command: string): Check {
  const label = command.length > 70 ? `${command.slice(0, 70)}…` : command;
  const words = commandWords(command).map(unquote);
  const head = words[0];

  if (head === undefined) {
    return { name: `hook command: ${label}`, status: "unknown", detail: "empty command" };
  }
  if (needsShell(head)) {
    return {
      name: `hook command: ${head}`,
      status: "unknown",
      detail: "the shell expands this at run time — not resolvable from here",
    };
  }

  // `node path/to/cli.js …` — node is on PATH, and the SCRIPT is the thing
  // that goes missing. A script need not be executable to be run this way, so
  // only its existence is checked.
  if (INTERPRETERS.has(head)) {
    const script = words.slice(1).find((word) => !word.startsWith("-"));
    if (script === undefined || needsShell(script)) {
      return {
        name: `hook command: ${head}`,
        status: "unknown",
        detail:
          script === undefined
            ? `${head} with no script argument — nothing to resolve`
            : "the script path is expanded by the shell at run time",
      };
    }
    // npx resolves from the registry when the package is absent locally, so a
    // missing file is not evidence the hook is broken.
    if (head === "npx") {
      return {
        name: `hook command: ${script}`,
        status: "unknown",
        detail: "npx resolves at run time, from node_modules or the registry",
      };
    }
    const target = isAbsolute(script) ? script : join(root, script);
    if (!existsSync(target)) {
      return { name: `hook command: ${script}`, status: "fail", detail: `does not exist: ${target}` };
    }
    if (!statSync(target).isFile()) {
      return { name: `hook command: ${script}`, status: "fail", detail: `not a file: ${target}` };
    }
    return { name: `hook command: ${script}`, status: "pass", detail: target };
  }

  // A bare name is a PATH lookup, and a missing one IS a dead hook — the spec
  // requires that to be loud rather than shrugged at.
  if (!head.includes("/")) {
    const found = onPath(head);
    return found === null
      ? {
          name: `hook command: ${head}`,
          status: "fail",
          detail: `not found on PATH — the hook would fail to start`,
        }
      : { name: `hook command: ${head}`, status: "pass", detail: found };
  }

  const candidate = isAbsolute(head) ? head : join(root, head);
  if (!existsSync(candidate)) {
    return { name: `hook command: ${head}`, status: "fail", detail: `does not exist: ${candidate}` };
  }
  if (!statSync(candidate).isFile()) {
    // accessSync(dir, X_OK) succeeds on any directory, which is how a
    // redirection target used to resolve green.
    return { name: `hook command: ${head}`, status: "fail", detail: `not a file: ${candidate}` };
  }
  try {
    // Invoked directly, so it must be executable — whatever it is named. The
    // predecessor only enforced this for `.sh`, which let a non-executable
    // shim under any other name report `pass`.
    accessSync(candidate, constants.X_OK);
  } catch {
    return { name: `hook command: ${head}`, status: "fail", detail: `not executable: ${candidate}` };
  }
  return { name: `hook command: ${head}`, status: "pass", detail: candidate };
}

function checkConfigs(root: string): Check[] {
  const checks: Check[] = [];

  const configPath = join(root, "nullius.config.json");
  if (!existsSync(configPath)) {
    checks.push({
      name: "nullius.config.json",
      status: "fact",
      detail: "absent — the CLI falls back to command-line globs",
    });
  } else {
    try {
      parseConfig(JSON.parse(readFileSync(configPath, "utf8")), configPath);
      checks.push({ name: "nullius.config.json", status: "pass", detail: "parses" });
    } catch (error) {
      checks.push({
        name: "nullius.config.json",
        status: "fail",
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // A leftover from kit 0.1.0, which put this under `.nullius/` — the same
  // directory that enables recording. Reported so an upgraded repo is not
  // silently running on config nothing reads any more.
  if (existsSync(join(root, ".nullius", "kit.json"))) {
    checks.push({
      name: "legacy .nullius/kit.json",
      status: "fail",
      detail:
        "kit config moved to nullius.kit.json — `.nullius/` is the recording opt-in and init no longer creates it. Re-run `init`, then delete .nullius/kit.json",
    });
  }

  const kitPath = join(root, "nullius.kit.json");
  if (!existsSync(kitPath)) {
    checks.push({ name: "nullius.kit.json", status: "fact", detail: "absent — run `init`" });
  } else {
    try {
      JSON.parse(readFileSync(kitPath, "utf8"));
      checks.push({ name: "nullius.kit.json", status: "pass", detail: "parses" });
    } catch (error) {
      checks.push({
        name: "nullius.kit.json",
        status: "fail",
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return checks;
}

function checkJournalDir(root: string): Check[] {
  const checks: Check[] = [];
  const nullius = join(root, ".nullius");

  if (!existsSync(nullius)) {
    checks.push({
      name: "recording opt-in",
      status: "fact",
      detail: ".nullius/ absent — runs are not recorded here, which is the default",
    });
    return checks;
  }
  if (!statSync(nullius).isDirectory()) {
    checks.push({
      name: "recording opt-in",
      status: "fail",
      detail: ".nullius exists but is not a directory",
    });
    return checks;
  }

  const runs = join(nullius, "runs");
  const probe = join(nullius, `.doctor-write-probe-${process.pid}`);
  try {
    writeFileSync(probe, "");
    rmSync(probe);
    checks.push({ name: "journal directory writable", status: "pass", detail: nullius });
  } catch (error) {
    checks.push({
      name: "journal directory writable",
      status: "fail",
      detail: error instanceof Error ? error.message : String(error),
    });
  }

  // The absence-of-evidence case, stated exactly. An empty runs/ is a fact
  // about the directory; concluding the hook pack is broken from it would be
  // the inference this tool exists to refuse.
  if (!existsSync(runs)) {
    checks.push({
      name: "journals recorded",
      status: "fact",
      detail: "no runs/ directory yet — nothing has been recorded, which is not evidence of a fault",
    });
  } else {
    // Guarded. A diagnostic is what someone runs when the repo is already in a
    // bad state, which is exactly when an unguarded read throws.
    try {
      const journals = readdirSync(runs).filter((name) => name.endsWith(".jsonl"));
      checks.push({
        name: "journals recorded",
        status: "fact",
        detail:
          journals.length === 0
            ? "no journals recorded — a fact about this directory, not a verdict on the hooks"
            : `${journals.length} journal(s) present`,
      });
    } catch (error) {
      checks.push({
        name: "journals recorded",
        status: "fail",
        detail: `runs/ exists but cannot be listed: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  return checks;
}

function checkWorkflow(root: string): Check {
  const path = join(root, ".github", "workflows", "claims.yml");
  if (!existsSync(path)) {
    return { name: "CI workflow", status: "fact", detail: "absent — no CI gate in this repo" };
  }
  let contents: string;
  try {
    contents = readFileSync(path, "utf8");
  } catch (error) {
    return {
      name: "CI workflow",
      status: "fail",
      detail: `present but unreadable: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  if (!contents.includes("fetch-depth: 0")) {
    // Not cosmetic. Without it `git show <rev>:<path>` fails, every
    // rev-stamped anchor degrades to the advisory UNVERIFIABLE-REV, and the
    // gate stops gating without turning red.
    return {
      name: "CI workflow",
      status: "fail",
      detail:
        "present, but has no `fetch-depth: 0` — rev-stamped anchors will degrade to UNVERIFIABLE-REV and the gate will pass silently",
    };
  }
  return { name: "CI workflow", status: "pass", detail: "present, with fetch-depth: 0" };
}

/**
 * The harness payload shape probe.
 *
 * Every field the recorder reads out of a hook payload is an assumption about
 * a harness this repo does not own. The probes are recordings; this feeds them
 * back through the real extractor, so an upgrade that changes payload shape
 * shows up as a failed check rather than as a journal that quietly records
 * nothing.
 */
export function probeChecks(probeDir: string): Check[] {
  const expectations: { file: string; wants: string; describe: string }[] = [
    { file: "PreToolUse-Agent.json", wants: "dispatch", describe: "a subagent dispatch" },
    { file: "PostToolUse-Write.json", wants: "mutation", describe: "a file write" },
    { file: "SubagentStop.json", wants: "report", describe: "a subagent's terminal" },
  ];

  if (!existsSync(probeDir)) {
    return [
      {
        name: "harness payload probe",
        status: "unknown",
        // Both directories are named because the old text named only this
        // one and then told the reader to fill it with a variable that writes
        // to the other. Following that instruction populated `.nullius/probes/`
        // and left this check reporting the same absence, which is how the
        // corpus came to be read as a live-capture check pointed somewhere
        // wrong. The corpus is fed by promotion, not by capture.
        detail: `no probe recordings at ${probeDir} — that is the committed corpus, fed by hand: NULLIUS_WITNESS_PROBE=1 captures live payloads into .nullius/probes/, and recordings are promoted from there into ${probeDir}`,
      },
    ];
  }

  const context: RecordContext = {
    now: () => "1970-01-01T00:00:00.000Z",
    locateTarget: (path) => ({ path, hash: "0".repeat(16) }),
    openDispatches: () => [],
    // SubagentStop only produces a report when its agent id resolves to a
    // dispatch. The link is producer state held in a file; supplying it here
    // keeps the probe about payload SHAPE rather than about journal history.
    resolveAgent: () => "d:probe",
    hasTerminal: () => false,
  };

  return expectations.map(({ file, wants, describe }) => {
    const path = join(probeDir, file);
    if (!existsSync(path)) {
      return { name: `probe: ${file}`, status: "unknown" as Status, detail: "recording absent" };
    }
    try {
      const payload: unknown = JSON.parse(readFileSync(path, "utf8"));
      const plan = planRecords(payload, context);
      const kinds = plan.records.map((record) => String(record["kind"]));
      if (kinds.includes(wants)) {
        return { name: `probe: ${file}`, status: "pass" as Status, detail: `${describe} → ${wants}` };
      }
      return {
        name: `probe: ${file}`,
        status: "fail" as Status,
        detail: `expected a ${wants} record from ${describe}; got [${kinds.join(", ")}]${plan.note === null ? "" : ` — ${plan.note}`}`,
      };
    } catch (error) {
      return {
        name: `probe: ${file}`,
        status: "fail" as Status,
        detail: error instanceof Error ? error.message : String(error),
      };
    }
  });
}

/**
 * The live proof, and the last thing doctor does.
 *
 * A list of green checks is a claim about configuration. This runs a synthetic
 * hook payload through the installed recorder, validates the journal that
 * comes out with the installed validator, and prints the verdict — the same
 * two halves a real session uses. The user can re-run it, which is the house
 * style: the last line is a verdict, not a reassurance.
 */
export function liveProof(): Check[] {
  const context: RecordContext = {
    now: () => "2026-01-01T00:00:00.000Z",
    locateTarget: (path) => ({ path, hash: "abc123abc123abc1" }),
    openDispatches: () => [{ id: "d:proof", task: "the live proof" }],
    resolveAgent: () => "d:proof",
    hasTerminal: () => false,
  };

  const dispatch = planRecords(
    {
      session_id: "doctor-live-proof",
      hook_event_name: "PreToolUse",
      tool_name: "Agent",
      tool_use_id: "proof",
      tool_input: { description: "the live proof", prompt: "x" },
    },
    context,
  );
  const terminal = planRecords(
    {
      session_id: "doctor-live-proof",
      hook_event_name: "SubagentStop",
      agent_id: "proof-agent",
      last_assistant_message: "Nothing to report.",
    },
    context,
  );

  const records = [...dispatch.records, ...terminal.records];
  if (records.length === 0) {
    return [
      {
        name: "live proof",
        status: "fail",
        detail: `the recorder produced no records from a synthetic dispatch — ${dispatch.note ?? "no reason given"}`,
      },
    ];
  }

  const header = { kind: "journal", version: "0.2", origin: "hooks", session: "doctor-live-proof" };
  const journal = [header, ...records].map((record) => JSON.stringify(record)).join("\n");
  const report = validateJournal(journal);
  const failures = report.findings.filter((finding) => isJournalFailure(finding.verdict));

  return [
    {
      name: "live proof",
      status: failures.length === 0 ? "pass" : "fail",
      detail:
        failures.length === 0
          ? `${report.records} record(s) through the recorder and the validator: ${report.outcomes.found} found, ${report.outcomes.empty} empty, ${report.outcomes.noReport} never reported — journal valid`
          : `the round trip produced an invalid journal: ${failures.map((finding) => finding.verdict).join(", ")}`,
    },
  ];
}

export interface DoctorOptions {
  root: string;
  /** Where recorded harness probes live, when the repo has any. */
  probeDir: string;
  /**
   * The user-level harness settings file, injected rather than derived.
   *
   * Hard-wiring `os.homedir()` at the point of use would make the check
   * untestable: the only way to exercise it would be to mutate the developer's
   * own configuration.
   */
  userSettingsPath?: string;
  /**
   * How that file is named in the report, when its real path should not be.
   *
   * The path is read; the label is printed. `doctor`'s output is what a user
   * pastes into an issue, and this check exists because raw payloads carry
   * absolute home paths — so printing the operator's home directory in the
   * report *about* that leak is the wrong default. Defaults to the path.
   */
  userSettingsLabel?: string;
}

export function runChecks(options: DoctorOptions): DoctorReport {
  const { root, probeDir, userSettingsPath, userSettingsLabel } = options;
  const checks: Check[] = [];

  checks.push(...checkConfigs(root));
  checks.push(...checkJournalDir(root));
  checks.push(checkWorkflow(root));

  const { entries, unreadable } = readManagedHooks(root);
  if (unreadable) {
    checks.push({
      name: "managed hooks",
      status: "unknown",
      detail: ".claude/settings.json could not be parsed — hooks not checkable from here",
    });
  } else if (entries.length === 0) {
    checks.push({
      name: "managed hooks",
      status: "fact",
      detail:
        "none in .claude/settings.json — expected, since the plugin delivers them and init writes none",
    });
  } else {
    for (const entry of entries) {
      const result = resolveHookCommand(root, entry.command);
      checks.push({ ...result, name: `${entry.event} ${result.name}` });
    }
  }

  checks.push(...probeChecks(probeDir));
  // Before the live proof, not after: live proof is the report's closing
  // statement and a test holds it there.
  checks.push(...captureChecks(root, userSettingsPath, userSettingsLabel));
  checks.push(...liveProof());

  return { checks, failed: checks.some((check) => check.status === "fail") };
}

export function formatReport(report: DoctorReport): string {
  const symbol: Record<Status, string> = {
    pass: "  ok  ",
    fail: " FAIL ",
    unknown: "  ??  ",
    fact: "  --  ",
  };

  const lines = report.checks.map(
    (check) => `${symbol[check.status]} ${check.name}\n         ${check.detail}`,
  );

  const counts = report.checks.reduce<Record<Status, number>>(
    (acc, check) => ({ ...acc, [check.status]: (acc[check.status] ?? 0) + 1 }),
    { pass: 0, fail: 0, unknown: 0, fact: 0 },
  );

  lines.push("");
  lines.push(
    `${counts.pass} ok, ${counts.fail} failing, ${counts.unknown} not checkable from here, ${counts.fact} observation(s).`,
  );
  if (counts.unknown > 0) {
    lines.push("`??` is not a pass. It is a fact this tool declines to guess about.");
  }

  return lines.join("\n");
}
