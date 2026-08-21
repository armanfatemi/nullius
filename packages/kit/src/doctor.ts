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
import { join } from "node:path";

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

/**
 * Whether a hook's command can actually run.
 *
 * The command is a shell string, so this resolves the first path-shaped token
 * in it rather than pretending to parse a shell. A command it cannot make
 * sense of is reported `unknown`, not `pass` — the whole point of this check
 * is the hook whose binary moved.
 */
function resolveHookCommand(root: string, command: string): Check {
  const stripped = command.replace(/^"|"$/g, "");
  const token = stripped.split(/\s+/).find((part) => part.includes("/") || part.endsWith(".sh"));

  if (token === undefined) {
    return {
      name: `hook command: ${command.slice(0, 60)}`,
      status: "unknown",
      detail: "no path-shaped token in the command — cannot tell whether it resolves",
    };
  }
  if (token.includes("${")) {
    // ${CLAUDE_PLUGIN_ROOT} and friends are expanded by the harness, not here.
    return {
      name: `hook command: ${token}`,
      status: "unknown",
      detail: "contains a variable the harness expands at run time — not resolvable from here",
    };
  }

  const candidate = token.startsWith("/") ? token : join(root, token);
  if (!existsSync(candidate)) {
    return {
      name: `hook command: ${token}`,
      status: "fail",
      detail: `does not exist: ${candidate}`,
    };
  }
  try {
    accessSync(candidate, constants.X_OK);
  } catch {
    // A .js run through node need not be executable; a .sh invoked directly must be.
    if (candidate.endsWith(".sh")) {
      return { name: `hook command: ${token}`, status: "fail", detail: `not executable: ${candidate}` };
    }
  }
  return { name: `hook command: ${token}`, status: "pass", detail: candidate };
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

  const kitPath = join(root, ".nullius", "kit.json");
  if (!existsSync(kitPath)) {
    checks.push({ name: ".nullius/kit.json", status: "fact", detail: "absent — run `init`" });
  } else {
    try {
      JSON.parse(readFileSync(kitPath, "utf8"));
      checks.push({ name: ".nullius/kit.json", status: "pass", detail: "parses" });
    } catch (error) {
      checks.push({
        name: ".nullius/kit.json",
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
    const journals = readdirSync(runs).filter((name) => name.endsWith(".jsonl"));
    checks.push({
      name: "journals recorded",
      status: "fact",
      detail:
        journals.length === 0
          ? "no journals recorded — a fact about this directory, not a verdict on the hooks"
          : `${journals.length} journal(s) present`,
    });
  }

  return checks;
}

function checkWorkflow(root: string): Check {
  const path = join(root, ".github", "workflows", "claims.yml");
  if (!existsSync(path)) {
    return { name: "CI workflow", status: "fact", detail: "absent — no CI gate in this repo" };
  }
  const contents = readFileSync(path, "utf8");
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
        detail: `no probe recordings at ${probeDir} — capture some with NULLIUS_WITNESS_PROBE=1`,
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
}

export function runChecks(options: DoctorOptions): DoctorReport {
  const { root, probeDir } = options;
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
