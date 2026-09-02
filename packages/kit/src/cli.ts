#!/usr/bin/env node
/* eslint-disable no-console -- this is a CLI tool; console output is its user-facing surface */
/**
 * `nullius-kit witness` — the producer half of the journal.
 *
 * `nullius witness validate` judges a journal. This writes one, from harness
 * hook payloads, so that the journal being judged is not text the agent wrote
 * about its own work. Three subcommands:
 *
 *   witness record   append the record this event implies (hook payload, stdin)
 *   witness check    validate the session's journal, advisory, always exit 0
 *   witness ledger   append a coordinator's own record (flags, not a payload)
 *
 * `ledger` is the first input path here that is not a hook payload, and it is
 * fenced off from the other two rather than folded in with them. Everything
 * `record` writes is harness-attested; everything `ledger` writes is a
 * coordinator's account of its own run, so every record it appends carries
 * `origin: "self-reported"` and the schema refuses the field any other value.
 * The two tiers share a file precisely so the validator can check one against
 * the other — a `report` the harness attested, a `finding` extracted from it,
 * and a `resolution` somebody wrote about that finding are three claims by
 * three different parties, and that is the whole value of the ledger.
 *
 * Nothing here blocks a session. A recorder that can break the run it observes
 * gets uninstalled the first time it misfires, and then observes nothing.
 * `ledger` is the one exception, and deliberately so: it is run by a
 * coordinator from a skill, not by a hook, and it exits 2 rather than write a
 * record it cannot stand behind.
 */

import { createHash } from "node:crypto";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import {
  isJournalFailure,
  validateJournal,
  CHECK_OUTCOMES,
  RESOLUTION_OUTCOMES,
  SEVERITIES,
  type JournalOrigin,
} from "@nullius-inverba/claims";

import { detect, mayWriteHooks } from "./detect";
import { formatReport, runChecks } from "./doctor";
import { findProfile, PROFILE_NAMES, PROFILES } from "./profiles";
import { applyPlan, buildPlan, formatPlan } from "./render";
import {
  appendRecords,
  journalHasContent,
  journalPathFor,
  linksPathFor,
  openDispatchesIn,
  recordLink,
  resolveLink,
  terminalsIn,
  SCHEMA_VERSION,
} from "./journalFile";
import { NO_IDENTITY, resolveIdentity, type JournalIdentity } from "./identity";
import {
  planRecords,
  withTotal,
  TRANSCRIPT_BUDGET_MS,
  TRANSCRIPT_BYTE_CAP,
  type JournalDraft,
  type RecordContext,
  type RecordPlan,
  type TranscriptBudgets,
  type Usage,
} from "./record";
import { runPipeline } from "./pipeline";
import { runBundle } from "./bundle";

/** How many findings the advisory check prints before it says "and N more". */
const ADVISORY_LIMIT = 10;

/*
 * The schema's closed vocabularies come from the kernel, by import.
 *
 * `SEVERITIES`, `RESOLUTION_OUTCOMES` and `CHECK_OUTCOMES` are exported from
 * `packages/claims/src/witness.ts` and named in that package's barrel, so this
 * producer refuses a value the schema does not accept *before* it appends,
 * against the same list the validator will judge the record by. They were
 * briefly restated here, and the restatement could only ever drift one way a
 * test could see: a member the kernel dropped would fail a round-trip, and a
 * member the kernel ADDED would simply be refused by a producer nothing had
 * told about it.
 *
 * `SEVERITIES` has no flag of its own — no ledger kind takes a severity — and
 * is imported anyway, for `BLOCKER` below.
 */

/**
 * The two outcomes that redirect a finding rather than closing it. They need
 * `merges_into`, and the validator says so — refusing here means the
 * coordinator learns it before a write rather than at the next `validate`.
 *
 * `satisfies` ties the members to the imported vocabulary: an outcome that
 * leaves the kernel's list stops compiling here rather than becoming a merge
 * rule for a value no record may carry. The annotation stays `readonly
 * string[]` because the value checked against it arrives as a `string`.
 */
const MERGE_OUTCOMES: readonly string[] = [
  "duplicate",
  "folded-in",
] satisfies readonly (typeof RESOLUTION_OUTCOMES)[number][];

/**
 * The severity `findings --open` filters on, typed as a member of the kernel's
 * vocabulary rather than written as a bare literal. A severity the schema no
 * longer emits would otherwise leave that filter silently matching nothing —
 * "no unanswered blockers" is the same output as a working filter with nothing
 * to report, which is a gate that has stopped running while still printing.
 */
const BLOCKER: (typeof SEVERITIES)[number] = "blocker";

/** The one origin a record may claim for itself. Never the header's `hooks`. */
const RECORD_ORIGIN = "self-reported";

const LEDGER_HELP_RESOLUTION = RESOLUTION_OUTCOMES.join(", ");

const USAGE = `nullius-kit — witness recording for agent runs

usage:
  nullius-kit init   [--profile <name>] [--run-report] [--dry-run] [--yes] [--root <dir>]
  nullius-kit doctor [--fix] [--root <dir>]
  nullius-kit pipeline <command> [<change>] [--root <dir>]
  nullius-kit witness record [--origin hooks|self-reported] [--root <dir>]
  nullius-kit witness check  [--root <dir>]
  nullius-kit witness ledger <kind> [flags] [--session <id>] [--root <dir>]
  nullius-kit witness bundle <base>..<head> [--out <path>] [--include <session>]
                             [--exclude <session>] [--no-prompts]
                             [--slack <minutes>] [--root <dir>]

record and check read one harness hook payload as JSON on stdin and write to
.nullius/runs/<session_id>.jsonl under an advisory lock. ledger takes flags.

  record   append the dispatch / report / mutation this event implies, and at
           session end seal every dispatch that never came back as no-report
  check    validate the session's journal and print what does not hold up;
           always exits 0, so it can never block the run it is watching
  ledger   append a record the coordinator is writing about its own run
  bundle   write a committed envelope of the source lines of every journal
           that produced a commit range, so CI can rejoin them and re-validate
           what it counts; 'witness bundle --help' for its flags

  --origin  who is writing these records (default: hooks). Journals not
            emitted by the harness must say so: self-reported records certify
            internal consistency and nothing about what happened.
  --root    the repo the journal belongs to (default: $CLAUDE_PROJECT_DIR,
            the payload's cwd, or the working directory)

ledger kinds (every record written carries origin: "self-reported"):

  stage       --phase <name> [--iteration <n>] [--change <name>] [--pr <ref>]
  resolution  --finding <id> --outcome <one of: ${LEDGER_HELP_RESOLUTION}>
              --text <why> [--merges-into <id>]
  decision    --choice <what> --rationale <why> [--resolves <ref>]
              [--departed-from <what>]
  check       --command <what ran> --outcome pass|fail --text <what it showed>
              [--counts name=N,...]
  findings    [--open]   list this session's findings; --open shows only the
                         blockers no resolution answers

The journal is addressed by --session, else $CLAUDE_CODE_SESSION_ID, and by
nothing else. There is no "newest journal" fallback: two worktrees or a resumed
session make newest-by-mtime a different journal from yours, and a record in
the wrong session is indistinguishable from one the right session wrote.

Set NULLIUS_WITNESS_PROBE=1 to also save each raw payload to
.nullius/probes/<event>.json. That directory is ground truth about the
installed harness — which fields it actually sends — as against documentation,
which describes some version of it.

Set NULLIUS_WITNESS_PROMPTS=0 to record a prompt's length and hash instead of
its text. The record still says a prompt happened; it says nothing about what
it asked.

env: NULLIUS_WITNESS_ROOT, NULLIUS_WITNESS_ORIGIN, NULLIUS_WITNESS_PROBE,
     NULLIUS_WITNESS_PROMPTS, CLAUDE_CODE_SESSION_ID`;

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

  // `ledger` owns its own flags too — a whole record's worth of them — so it
  // is routed before the witness options parser, which would reject every one.
  if (argv[0] === "witness" && argv[1] === "ledger") return runLedger(argv.slice(2));

  // `bundle` likewise: it takes a range and half a dozen flags of its own, none
  // of which the witness options parser knows.
  if (argv[0] === "witness" && argv[1] === "bundle") return runBundle(argv.slice(2));

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
  runReport: boolean;
}

function parseInit(argv: readonly string[]): InitOptions | null {
  const options: InitOptions = {
    profile: null,
    dryRun: false,
    root: process.cwd(),
    runReport: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--run-report") {
      options.runReport = true;
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
    runReport: options.runReport,
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
      // The config's own answer, never a default. A repair that silently
      // dropped `runReport` would "fix" the doctor check by removing the thing
      // it was checking for, and report success for having done so.
      runReport: kit.kind === "found" ? kit.runReport : false,
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
    // Read by its real path, printed by this one. The report is what a user
    // pastes into an issue, and a check whose subject is payloads leaking
    // absolute home paths should not open by printing one.
    userSettingsLabel: "~/.claude/settings.json",
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
  | { kind: "found"; profile: string; runReport: boolean }
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
    const parsed = JSON.parse(raw) as { profile?: unknown; runReport?: unknown };
    if (typeof parsed.profile !== "string") {
      return { kind: "unreadable", reason: "no `profile` string in nullius.kit.json" };
    }
    // A present-but-wrong `runReport` is refused rather than coerced. The key
    // decides whether a workflow input is rendered, so reading `"true"` or `1`
    // as true would let a config mean something its author did not write — and
    // `doctor` would then report agreement between a workflow and a config it
    // had guessed at.
    if (parsed.runReport !== undefined && typeof parsed.runReport !== "boolean") {
      return {
        kind: "unreadable",
        reason: `\`runReport\` in nullius.kit.json is ${JSON.stringify(parsed.runReport)} — it must be a boolean or absent`,
      };
    }
    return {
      kind: "found",
      profile: parsed.profile,
      runReport: parsed.runReport === true,
    };
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

  // Done HERE, before `appendRecords` takes the lock, and answered from this
  // value afterwards. `planRecords` for a SubagentStop runs *inside* the lock
  // callback, so a reader that touched the filesystem when called would put a
  // multi-megabyte transcript read on the locked path — where every other hook
  // in the session is counting down to being refused. See `identity.ts`'s
  // constraint 2: the expensive case is not I/O failing, it is I/O succeeding
  // slowly.
  const transcriptPath =
    event === "SubagentStop" ? stringField(payload, "agent_transcript_path") : null;
  const transcriptBudgets: TranscriptBudgets = {
    byteCap: TRANSCRIPT_BYTE_CAP,
    budgetMs: TRANSCRIPT_BUDGET_MS,
  };
  const transcriptUsage =
    transcriptPath === null ? null : readTranscriptUsage(transcriptPath, transcriptBudgets);

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
    readAgentDefinition: (subagentType) => readAgentDefinition(root, subagentType),
    // Memoized, never a fresh read. A path this process did not pre-read
    // answers null rather than reading it now: the whole point of resolving it
    // above is that no read happens under the lock, and a "just this once"
    // fallback here would quietly undo that on the one path it matters.
    readTranscriptUsage: (path) => (path === transcriptPath ? transcriptUsage : null),
    // Unwired, this switch is a setting the recorder does not honour, which is
    // worse than not offering it: the operator believes prompt text is being
    // withheld and it is being written. Any value but exactly "0" records the
    // text, which is the operator-settled default.
    recordPromptText: () => process.env["NULLIUS_WITNESS_PROMPTS"] !== "0",
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
    // Resolved out here, before appendRecords takes the lock. Passing a
    // resolver in would put git on the locked path; passing the answer in does
    // not.
    const identity = identityFor(root, file);
    const outcome = appendRecords(
      file,
      () => {
        decided = planRecords(payload, context);
        return decided.records;
      },
      { version: SCHEMA_VERSION, origin: options.origin, session, source: null, ...identity },
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
    // The model goes in with the dispatch id. The launch acknowledgement is
    // the only event that names the model the harness resolved, and the
    // SubagentStop that writes the `report` carries none — so a link that
    // dropped it would make `report.model` unrecoverable for every
    // asynchronous dispatch, which is all of them in this repository.
    const linked = recordLink(links, plan.link.agentId, {
      dispatch: plan.link.dispatch,
      model: plan.link.model ?? null,
    });
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
    // After the early return above, so an ignored Bash call on a session that
    // has not opened its journal yet does not pay for a git call.
    ...identityFor(root, file),
  });
  if (outcome.refused !== null) note(outcome.refused);
  return 0;
}

/**
 * Identity for this append — resolved once per session, outside the lock.
 *
 * Two requirements pull against each other here, and this function is where
 * they are reconciled. Identity must be resolved BEFORE the append lock,
 * because a git call under the lock costs every concurrently appending hook
 * its records rather than merely delaying them. But whether a header is needed
 * at all is decided UNDER the lock, by `needsHeader` testing the journal's
 * size — so "resolve before the lock" taken literally means resolving on every
 * single hook event, which is the per-event git call the design rules out.
 *
 * The reconciliation is this unsynchronised pre-check: ask, without the lock,
 * whether the journal already holds anything, and resolve only when it does
 * not. After a session's first append the answer is no on every subsequent
 * event, which is what "once per session, never per event" means in practice.
 *
 * The pre-check may race, and that is acceptable *because it is only an
 * optimisation*. The authoritative decision stays where it was: `needsHeader`
 * under the lock still decides whether a header is written, so a stale
 * pre-check can never produce a second header or a header on a journal that
 * had one. Do not "fix" this race — closing it means moving the size test, and
 * therefore the git call, back under the lock, which reintroduces the exact
 * defect this shape exists to avoid.
 *
 * What the race does cost, recorded here so it is not discovered later as a
 * surprise: if two of a session's first appends race, both resolve identity,
 * and the one that wins the lock had its git call time out, the header is
 * written with no identity fields — and the loser's successfully resolved
 * identity is discarded. Identity is resolved once per session, so there is no
 * second chance: that journal carries no identity for its whole life. This is
 * acceptable under "git failure is never a recording failure" — the records
 * are all there and the run is fully validatable — but it is a real loss, not
 * a wasted computation.
 */
function identityFor(root: string, file: string): JournalIdentity {
  return journalHasContent(file) ? NO_IDENTITY : resolveIdentity(root);
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

/** The four kinds a coordinator writes about its own run. */
const LEDGER_KINDS = ["stage", "resolution", "decision", "check"] as const;

/** Flags that take no value. Everything else is `--name value`. */
const LEDGER_BOOLEAN_FLAGS = new Set(["open"]);

interface LedgerFlags {
  values: Map<string, string>;
  bools: Set<string>;
}

/**
 * `witness ledger` — the coordinator's own record, and the first input path
 * here that is not a hook payload.
 *
 * Three refusals are the whole design, and each one is an exit 2 before any
 * write rather than a repair afterwards:
 *
 *  - **No session, no journal.** `--session`, else `CLAUDE_CODE_SESSION_ID`,
 *    else refuse naming both. Never the newest file by modification time: two
 *    worktrees or a resumed session make "newest" a different journal from
 *    "mine", and a record appended to the wrong session is indistinguishable
 *    from one the right session wrote.
 *  - **A value outside a closed vocabulary is refused, not written.** The
 *    validator would report it as MALFORMED afterwards, which is a journal that
 *    fails its own check for a typo the command could have caught.
 *  - **`finding` is not offered.** The recorder extracts findings from harness
 *    payloads; a hand-written one would be byte-identical to an extracted one,
 *    and the two ledger verdicts exist precisely because those are different
 *    tiers. This is a command-surface convention rather than a property of the
 *    file — the journal is local and nothing stops an editor — and that limit
 *    is stated in the design rather than implied by this refusal.
 */
function runLedger(argv: readonly string[]): number {
  const kind = argv[0];
  if (kind === undefined || kind.startsWith("-")) {
    console.error(
      `witness ledger needs a kind: ${LEDGER_KINDS.join(", ")}, or findings\n\n${USAGE}`,
    );
    return 2;
  }
  if (kind === "finding") {
    console.error(
      "witness ledger does not write `finding` records. Findings are extracted by the recorder from what an agent actually returned, so a coordinator-authored one would claim the harness tier for the coordinator's own account — which is the comparison the ledger verdicts exist to make. Use `witness ledger resolution --finding <id>` to answer one.",
    );
    return 2;
  }
  if (kind !== "findings" && !LEDGER_KINDS.some((known) => known === kind)) {
    console.error(`unknown ledger kind: ${kind}\n\n${USAGE}`);
    return 2;
  }

  // The accepted set is known before parsing, and the parser is handed it, so
  // an unrecognised flag is refused AT the flag rather than after it has eaten
  // the next token. `--opn --root /tmp/x` parsed permissively takes `--root`
  // as the typo's value and then complains about `/tmp/x`, which sends the
  // reader to debug the argument that was correct.
  const accepted = [...(LEDGER_FIELDS[kind] ?? []), "session", "root"];
  const flags = parseLedgerFlags(argv.slice(1), accepted, kind);
  if (flags === null) return 2;

  const root = resolve(
    flags.values.get("root") ??
      process.env["NULLIUS_WITNESS_ROOT"] ??
      process.env["CLAUDE_PROJECT_DIR"] ??
      process.cwd(),
  );

  const session = (flags.values.get("session") ?? process.env["CLAUDE_CODE_SESSION_ID"] ?? "").trim();
  if (session.length === 0) {
    // Both sources named, because a message that names one leaves the reader
    // to discover the other, and the fallback this command does NOT have is
    // the one they will otherwise assume.
    console.error(
      "witness ledger needs a session: pass --session <id>, or set CLAUDE_CODE_SESSION_ID. It will not pick a journal by modification time — a record in the wrong session is indistinguishable from one the right session wrote.",
    );
    return 2;
  }

  const file = journalPathFor(root, session);
  if (kind === "findings") return runLedgerFindings(file, flags.bools.has("open"));

  const built = buildLedgerRecord(kind, flags.values);
  if (typeof built === "string") {
    console.error(built);
    return 2;
  }

  const outcome = appendRecords(file, [built], {
    version: SCHEMA_VERSION,
    origin: envOrigin(process.env["NULLIUS_WITNESS_ORIGIN"]),
    session,
    source: null,
    ...identityFor(root, file),
  });
  if (outcome.refused !== null) {
    note(outcome.refused);
    return 1;
  }
  // The id on stdout, because the next command in a pipeline needs it: a
  // `resolution` names the `finding` it answers, and a caller that cannot read
  // back the id it just wrote has to guess at the hash.
  console.log(String(built["id"]));
  return 0;
}

/**
 * `--name value` pairs and a small set of valueless flags.
 *
 * An unknown flag is refused rather than ignored, and refused where it appears.
 * A misspelled `--outcom fixed` that fell through would produce a record
 * missing a required field, and the refusal that followed would name the field
 * rather than the typo — sending the reader to fix the argument that was right.
 */
function parseLedgerFlags(
  argv: readonly string[],
  accepted: readonly string[],
  kind: string,
): LedgerFlags | null {
  const values = new Map<string, string>();
  const bools = new Set<string>();

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined || !arg.startsWith("--")) {
      console.error(`unexpected argument: ${String(arg)} — every ledger field is a --flag`);
      return null;
    }
    // `--merges-into` becomes `merges-into`, and the record's key is
    // `merges_into`. The flag spelling follows the command line's convention
    // and the record's follows the schema's; neither is bent to match.
    const name = arg.slice(2);
    if (!accepted.includes(name)) {
      console.error(
        `witness ledger ${kind} does not take --${name}. Accepted: --${accepted.join(", --")}`,
      );
      return null;
    }
    if (LEDGER_BOOLEAN_FLAGS.has(name)) {
      bools.add(name);
      continue;
    }
    const value = argv[(index += 1)];
    if (value === undefined) {
      console.error(`--${name} needs a value`);
      return null;
    }
    values.set(name, value);
  }

  return { values, bools };
}

/**
 * One record, or the message explaining why there is not one.
 *
 * Returns a string on refusal rather than printing and returning null, so that
 * every reason a record was not written travels the same way and the caller
 * decides where it goes.
 */
function buildLedgerRecord(kind: string, flags: ReadonlyMap<string, string>): JournalDraft | string {
  const at = new Date().toISOString();
  // Every record this command writes, without exception. The header's origin
  // is the origin of records that carry none of their own, so a coordinator's
  // record under a `hooks` header would be attested as harness-emitted — the
  // one claim it is least entitled to make.
  const base = { origin: RECORD_ORIGIN, at };

  switch (kind) {
    case "stage": {
      const phase = required(flags, "phase", "the phase the run reached");
      if (typeof phase !== "string") return phase.message;
      const iteration = flags.get("iteration");
      if (iteration !== undefined && !/^[1-9][0-9]*$/.test(iteration)) {
        return `--iteration is ${JSON.stringify(iteration)} — it must be a positive integer`;
      }
      const record: JournalDraft = {
        kind: "stage",
        ...base,
        phase,
        ...(iteration === undefined ? {} : { iteration: Number(iteration) }),
        ...optional(flags, "change"),
        ...optional(flags, "pr"),
      };
      return withId(record, "s");
    }

    case "resolution": {
      const finding = required(flags, "finding", "the id of the finding it answers");
      if (typeof finding !== "string") return finding.message;
      const outcome = closedValue(flags, "outcome", RESOLUTION_OUTCOMES);
      if (typeof outcome !== "string") return outcome.message;
      const text = required(flags, "text", "the reason, not just the verdict");
      if (typeof text !== "string") return text.message;

      const mergesInto = flags.get("merges-into");
      // Refused here rather than left to the validator, because the validator's
      // message arrives after the write: a merge that names no survivor is a
      // disappearance wearing a label, and this is the last moment it costs
      // nothing to say so.
      if (MERGE_OUTCOMES.includes(outcome) && (mergesInto ?? "").trim().length === 0) {
        return `outcome "${outcome}" needs --merges-into: the finding this one folds into. Without it a merge is indistinguishable from dropping it.`;
      }
      if (mergesInto !== undefined && !MERGE_OUTCOMES.includes(outcome)) {
        return `--merges-into is only meaningful with an outcome that redirects a finding rather than closing it (${MERGE_OUTCOMES.join(", ")}), not with "${outcome}"`;
      }
      return withId(
        {
          kind: "resolution",
          ...base,
          finding,
          outcome,
          text,
          ...(mergesInto === undefined ? {} : { merges_into: mergesInto }),
        },
        "res",
      );
    }

    case "decision": {
      const choice = required(flags, "choice", "the approach taken");
      if (typeof choice !== "string") return choice.message;
      const rationale = required(
        flags,
        "rationale",
        "a choice without its reason is not a decision anyone can audit",
      );
      if (typeof rationale !== "string") return rationale.message;
      return withId(
        {
          kind: "decision",
          ...base,
          choice,
          rationale,
          ...optional(flags, "resolves"),
          ...optional(flags, "departed-from", "departed_from"),
        },
        "dec",
      );
    }

    case "check": {
      const command = required(flags, "command", "what ran");
      if (typeof command !== "string") return command.message;
      const outcome = closedValue(flags, "outcome", CHECK_OUTCOMES);
      if (typeof outcome !== "string") return outcome.message;
      const text = required(flags, "text", "what the run showed, in words");
      if (typeof text !== "string") return text.message;
      const counts = parseCounts(flags.get("counts"));
      if (counts.refusal !== null) return counts.refusal;
      return withId(
        {
          kind: "check",
          ...base,
          command,
          outcome,
          text,
          ...(counts.value === null ? {} : { counts: counts.value }),
        },
        "c",
      );
    }

    default:
      return `unknown ledger kind: ${kind}`;
  }
}

/** Which flags each kind accepts. Anything else is a typo, and is refused. */
const LEDGER_FIELDS: Record<string, readonly string[]> = {
  stage: ["phase", "iteration", "change", "pr"],
  resolution: ["finding", "outcome", "text", "merges-into"],
  decision: ["choice", "rationale", "resolves", "departed-from"],
  check: ["command", "outcome", "text", "counts"],
  findings: ["open"],
};

interface Refusal {
  message: string;
}

function required(
  flags: ReadonlyMap<string, string>,
  name: string,
  describe: string,
): string | Refusal {
  const value = flags.get(name);
  if (value === undefined || value.trim().length === 0) {
    return { message: `--${name} is required and must not be blank — ${describe}` };
  }
  return value;
}

/**
 * A value from a closed vocabulary, or the refusal naming every member of it.
 *
 * The accepted values go into the message. A refusal that says only "not a
 * valid outcome" makes the caller go and read the schema, which is how a
 * closed vocabulary becomes a guessing game.
 */
function closedValue(
  flags: ReadonlyMap<string, string>,
  name: string,
  allowed: readonly string[],
): string | Refusal {
  const value = flags.get(name);
  if (value === undefined) {
    return { message: `--${name} is required: one of ${allowed.join(", ")}` };
  }
  if (!allowed.includes(value)) {
    return {
      message: `--${name} is ${JSON.stringify(value)}, which is not one of ${allowed.join(", ")} — nothing was written`,
    };
  }
  return value;
}

function optional(
  flags: ReadonlyMap<string, string>,
  name: string,
  key = name,
): Record<string, string> {
  const value = flags.get(name);
  // A present-but-blank value is MALFORMED at the validator for every one of
  // these fields, so an empty flag omits the key rather than writing one.
  return value === undefined || value.trim().length === 0 ? {} : { [key]: value };
}

/**
 * `--counts name=N,other=M` → `{ name: N, other: M }`.
 *
 * Two fields rather than a union, because a counts map has an index signature
 * over `number` and a union with a `{ message: string }` refusal is not
 * narrowable by `in` — the refusal's own message would come back typed
 * `string | number`. Absent is `{ value: null, refusal: null }`; a bad value is
 * a refusal and no record is written.
 */
function parseCounts(raw: string | undefined): {
  value: Record<string, number> | null;
  refusal: string | null;
} {
  if (raw === undefined || raw.trim().length === 0) return { value: null, refusal: null };
  const counts: Record<string, number> = {};
  for (const pair of raw.split(",")) {
    const [name, value] = pair.split("=");
    if (name === undefined || value === undefined || name.trim().length === 0) {
      return {
        value: null,
        refusal: `--counts must be name=N pairs separated by commas, not ${JSON.stringify(raw)}`,
      };
    }
    if (!/^[0-9]+$/.test(value.trim())) {
      return {
        value: null,
        refusal: `--counts ${name.trim()}=${value.trim()} — counts must be non-negative integers`,
      };
    }
    counts[name.trim()] = Number(value.trim());
  }
  return { value: counts, refusal: null };
}

/**
 * The record's id: its prefix, and a hash of what it says.
 *
 * Content-derived rather than sequential, so two coordinators appending to one
 * journal cannot collide on a counter — and `at` is inside the hash, so two
 * genuinely separate records that happen to say the same thing still get
 * different ids rather than a DUPLICATE-ID.
 */
function withId(record: JournalDraft, prefix: string): JournalDraft {
  const digest = createHash("sha256")
    .update(JSON.stringify(Object.keys(record).sort().map((key) => [key, record[key]])))
    .digest("hex")
    .slice(0, 16);
  return { ...record, id: `${prefix}:${digest}` };
}

/**
 * `witness ledger findings` — what this session's reviewers actually raised.
 *
 * Reads the journal rather than any state the coordinator kept, which is the
 * point: the list is of findings the recorder extracted from what agents
 * returned, so a coordinator that forgot a blocker still sees it here.
 *
 * `--open` follows the merge chain exactly as SUPPRESSED-FINDING does. A merge
 * transfers the obligation rather than discharging it, so folding a blocker
 * into an unanswered concern leaves it open — and a merge chain that closes on
 * itself answers nothing.
 */
function runLedgerFindings(file: string, openOnly: boolean): number {
  if (!existsSync(file)) {
    note(`no journal at ${file} yet — this session has recorded nothing`);
    return 0;
  }

  const findings: { id: string; severity: string; author: string; text: string }[] = [];
  const answered = new Set<string>();
  const merged = new Map<string, string>();

  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (line.trim().length === 0) continue;
    let record: unknown;
    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }
    if (typeof record !== "object" || record === null) continue;
    const raw = record as Record<string, unknown>;
    if (raw["kind"] === "finding" && typeof raw["id"] === "string") {
      findings.push({
        id: raw["id"],
        severity: String(raw["severity"] ?? "?"),
        author: String(raw["author"] ?? "?"),
        text: String(raw["text"] ?? ""),
      });
    }
    if (raw["kind"] === "resolution" && typeof raw["finding"] === "string") {
      const into = raw["merges_into"];
      if (typeof into === "string" && into.length > 0) merged.set(raw["finding"], into);
      else answered.add(raw["finding"]);
    }
  }

  const listed = openOnly
    ? findings.filter((finding) => finding.severity === BLOCKER && !discharged(finding.id, answered, merged))
    : findings;

  for (const finding of listed) {
    // One line per finding, and the text flattened onto it: this output is read
    // by a coordinator deciding what still needs a resolution, and a record
    // that wraps is a record that gets skimmed past.
    console.log(
      `${finding.id}\t${finding.severity}\t${finding.author}\t${finding.text.replace(/\s+/g, " ").trim()}`,
    );
  }
  if (listed.length === 0) {
    note(openOnly ? "no unanswered blockers in this journal" : "no findings in this journal");
  }
  return 0;
}

/** Whether a finding is answered, following merges to whoever answers them. */
function discharged(
  id: string,
  answered: ReadonlySet<string>,
  merged: ReadonlyMap<string, string>,
): boolean {
  const seen = new Set<string>([id]);
  let current = id;
  for (;;) {
    if (answered.has(current)) return true;
    const next = merged.get(current);
    // A chain that closes on itself answers nothing, and neither does one that
    // ends at a finding no resolution named.
    if (next === undefined || seen.has(next)) return false;
    seen.add(next);
    current = next;
  }
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
 * How much of an agent definition is read before deciding it declares the tag
 * contract. Generous — the largest agent file in this repository is a few
 * kilobytes — and a bound rather than a whole-file read because the path is
 * built from a harness-supplied name.
 */
const AGENT_DEFINITION_BYTE_CAP = 256 * 1024;

/**
 * The dispatched agent's own definition, or null when there is no such file.
 *
 * The null and the throw are not interchangeable, and this is the whole reason
 * this function is not a bare `readFileSync` in a `try`. "There is no agent by
 * that name" and "there is one and I could not read it" are recorded on the
 * dispatch as `agent_definition: "missing"` against `"unreadable"`, and a
 * reader that collapsed them into null would make the two indistinguishable in
 * the journal — erasing the difference the field exists to keep. So ENOENT
 * returns null and every other error propagates, exactly as `record.ts` asks.
 *
 * `subagentType` has already been validated against a conservative name shape
 * by the time this is called; the size bound is this function's own job.
 */
function readAgentDefinition(root: string, subagentType: string): string | null {
  const file = join(root, ".claude", "agents", `${subagentType}.md`);
  let handle: number;
  try {
    handle = openSync(file, "r");
  } catch (error) {
    // Not there, or the path is not a directory on the way down: both mean
    // there is no such agent definition, which is a fact, not a failure.
    const reason = (error as NodeJS.ErrnoException | undefined)?.code;
    if (reason === "ENOENT" || reason === "ENOTDIR") return null;
    throw error;
  }
  try {
    const buffer = Buffer.alloc(AGENT_DEFINITION_BYTE_CAP);
    const read = readSync(handle, buffer, 0, AGENT_DEFINITION_BYTE_CAP, 0);
    return buffer.subarray(0, read).toString("utf8");
  } finally {
    closeSync(handle);
  }
}

/**
 * What an asynchronous dispatch cost, summed from the transcript the harness
 * wrote for it.
 *
 * MUST be called before the append lock is taken — see the call site. Both
 * bounds are parameters rather than constants read from module scope, which is
 * the seam `identity.ts` uses for the same reason: a test can force the
 * under-cap-but-slow branch instead of reasoning about whether it exists.
 *
 * Every failure is the same answer: null, meaning the report carries no usage.
 * A partial sum from however much of the transcript fit inside the budget
 * would be a number in the same field as the measured ones, and nothing
 * downstream could tell them apart — which is the confusion this journal
 * exists to refuse.
 */
function readTranscriptUsage(path: string, budgets: TranscriptBudgets): Usage | null {
  const started = Date.now();
  const overBudget = (): boolean => Date.now() - started >= budgets.budgetMs;
  if (overBudget()) return null;

  let content: string;
  try {
    if (statSync(path).size > budgets.byteCap) return null;
    content = readFileSync(path, "utf8");
  } catch {
    return null;
  }
  // Checked again after the read, not only before it. The byte cap bounds the
  // size, not the time: a transcript on a slow or contended filesystem can sit
  // well under the cap and still take longer than the budget allows.
  if (overBudget()) return null;

  let input = 0;
  let output = 0;
  let cacheRead = 0;
  let cacheCreation = 0;
  let measured = false;

  for (const line of content.split("\n")) {
    if (line.trim().length === 0) continue;
    if (overBudget()) return null;
    let turn: unknown;
    try {
      turn = JSON.parse(line);
    } catch {
      // One unreadable line is not a reason to discard the rest: the harness
      // appends to this file while the subagent runs, so a torn last line is
      // ordinary rather than corrupt.
      continue;
    }
    if (typeof turn !== "object" || turn === null) continue;
    const record = turn as { type?: unknown; message?: unknown };
    // Assistant turns only. A user turn's usage, where one appears, describes
    // the parent's spend rather than this subagent's.
    if (record.type !== "assistant") continue;
    const message = record.message;
    if (typeof message !== "object" || message === null) continue;
    const usage = (message as { usage?: unknown }).usage;
    if (typeof usage !== "object" || usage === null) continue;
    const counts = usage as Record<string, unknown>;
    input += tokens(counts["input_tokens"]);
    output += tokens(counts["output_tokens"]);
    cacheRead += tokens(counts["cache_read_input_tokens"]);
    cacheCreation += tokens(counts["cache_creation_input_tokens"]);
    measured = true;
  }

  // No assistant turn carried usage: that is "could not be measured", not
  // "cost nothing". Four zeros in a `usage` block would be a measurement.
  if (!measured) return null;
  // Summed with the recorder's own arithmetic rather than this file's, so the
  // transcript path and the payload path cannot disagree about what `total`
  // means — a difference no reader of the journal could see.
  return withTotal({ input, output, cache_read: cacheRead, cache_creation: cacheCreation });
}

function tokens(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
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
