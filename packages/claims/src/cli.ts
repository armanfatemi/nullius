#!/usr/bin/env node
/* eslint-disable no-console -- this is a CLI tool; console output is its user-facing surface */

import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { globSync } from "glob";

import {
  canaryGuardResult,
  clearCanary,
  loadActiveCanary,
  plantCanary,
  verifyCanary,
} from "./canary";
import {
  checkClaims,
  isFailure,
  type CheckOptions,
  type ClaimResult,
} from "./checkClaims";
import { parseConfig, type ClaimsConfig } from "./config";
import { DEMO_DOC_PATH, demoResults, writeDemoFixture } from "./demo";
import { buildEagerPrompt } from "./eagerPrompt";
import { parseClaims } from "./parseClaims";
import { fileLinesReader, searchRunner } from "./runners";

const SPEC_URL =
  "https://github.com/armanfatemi/nullius/blob/main/spec/evidence-anchors.md";

const DEFAULT_CONFIG_PATH = "nullius.config.json";

const USAGE = `usage: nullius <command>

commands:
  check [globs...]    verify every grounding marker (Evidence Anchors, Binds
                      at, attestation ledgers) in the matched markdown
                      documents against the working tree. Run from the repo
                      root (citations are repo-relative). Globs come from the
                      command line, or from the "docs" key of
                      ${DEFAULT_CONFIG_PATH} when none are given.
  demo                build a sandbox fixture and check it — one claim per
                      verdict class, no adoption required. The ten-second tour.
  eager-prompt <doc>  emit the refute-first audit brief for a document with no
                      anchors yet. Run it through any agent harness — e.g.
                      claude -p "$(nullius eager-prompt design.md)" — and the
                      model proposes anchors that this checker then verifies.
                      The model proposes; the checker disposes.
  canary plant <doc>  insert a registered, plausibly-false claim (probe state
                      lives under .git/nullius, outside the working tree)
  canary verify <report>
                      scan review output for the planted claim. Exit codes:
                      0 CANARY-CAUGHT, 1 CANARY-MISSED, 3 CANARY-TAINTED
                      (probe machinery leaked into the review — probe invalid)
  canary status       list the active canary; exit 1 when one is planted
  canary clear        remove the planted claim, restoring the document

check options:
  --config <path>     config file (default: ${DEFAULT_CONFIG_PATH} if present)
  --require-markers   fail when no grounding markers are found at all
  --probing           suppress the CANARY-PRESENT merge guard (for the one
                      actor who knows a probe is live)
  --help              show this message
  --version           print the package version

The checker verifies a convention: on a repo with no anchors, \`check\` has
nothing to verify. Adoption starts with the authoring rule (one paste into
your agents' instructions) — see the spec.

spec: ${SPEC_URL}`;

function loadConfig(explicitPath: string | undefined): ClaimsConfig {
  const path = explicitPath ?? DEFAULT_CONFIG_PATH;
  if (!existsSync(path)) {
    if (explicitPath !== undefined) {
      throw new Error(`config file not found: ${explicitPath}`);
    }
    return {};
  }
  return parseConfig(JSON.parse(readFileSync(path, "utf8")), path);
}

function describe(result: ClaimResult): string {
  const { claim } = result;
  switch (claim.kind) {
    case "presence":
      return `${claim.path}:${claim.line}`;
    case "absence":
      return `${claim.command} → ${claim.expectedCount}`;
    case "moment":
      return `binds at ${claim.moment}`;
    case "ledger":
      return `ledger ${claim.cycle}`;
    case "dispatch":
      return claim.name;
    case "canary":
      return "registered canary";
    case "malformed":
      return claim.raw;
  }
}

// Wide enough for the longest verdict (UNKNOWN-REVIEWER) plus a space.
const VERDICT_COLUMN = 16;
const DETAIL_INDENT = " ".repeat(VERDICT_COLUMN + 1);

function report(results: ClaimResult[]): number {
  let failures = 0;

  for (const result of results) {
    const { source } = result.claim;
    const where = `${source.doc}:${source.line}`;
    const what = describe(result);

    if (result.verdict === "ok") {
      console.log(`${"OK".padEnd(VERDICT_COLUMN)} ${where}  ${what}`);
      continue;
    }

    const line = `${result.verdict.toUpperCase().padEnd(VERDICT_COLUMN)} ${where}  ${what}`;
    if (isFailure(result.verdict)) {
      failures += 1;
      console.error(line);
      console.error(`${DETAIL_INDENT}! ${result.detail}`);
    } else {
      console.log(line);
      console.log(`${DETAIL_INDENT}~ ${result.detail}`);
    }
  }

  return failures;
}

interface ParsedArgs {
  command: string | undefined;
  globs: string[];
  configPath: string | undefined;
  requireMarkers: boolean;
  probing: boolean;
  help: boolean;
  version: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    command: undefined,
    globs: [],
    configPath: undefined,
    requireMarkers: false,
    probing: false,
    help: false,
    version: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) continue;
    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
    } else if (arg === "--version") {
      parsed.version = true;
    } else if (arg === "--require-markers") {
      parsed.requireMarkers = true;
    } else if (arg === "--probing") {
      parsed.probing = true;
    } else if (arg === "--config") {
      index += 1;
      parsed.configPath = argv[index];
      if (parsed.configPath === undefined) {
        throw new Error("--config requires a path argument");
      }
    } else if (arg.startsWith("--")) {
      throw new Error(`unknown option: ${arg}`);
    } else if (parsed.command === undefined) {
      parsed.command = arg;
    } else {
      parsed.globs.push(arg);
    }
  }

  return parsed;
}

function packageVersion(): string {
  // dist/cli.js sits one level below the package root.
  const url = new URL("../package.json", import.meta.url);
  const manifest = JSON.parse(readFileSync(url, "utf8")) as {
    version?: string;
  };
  return manifest.version ?? "unknown";
}

function runDemo(): number {
  const root = mkdtempSync(join(tmpdir(), "nullius-demo-"));
  writeDemoFixture(root);

  console.log(
    "Demo — a sandbox doc making claims about a sandbox file, one per verdict class.",
  );
  console.log(`Fixture: ${root}`);
  console.log("");
  console.log(`--- ${DEMO_DOC_PATH}`);

  const results = demoResults(root);
  const groups: [string, (kind: string) => boolean][] = [
    ["Evidence Anchors & Binding Moments", (kind) => kind !== "dispatch" && kind !== "canary"],
    ["Attestation ledger", (kind) => kind === "dispatch"],
    ["Canary", (kind) => kind === "canary"],
  ];
  let failures = 0;
  for (const [title, matches] of groups) {
    const grouped = results.filter((result) => matches(result.claim.kind));
    if (grouped.length === 0) continue;
    console.log(`# ${title}`);
    failures += report(grouped);
    console.log("");
  }

  console.log("");
  console.log(
    `${failures} failing claim(s) — a real \`check\` would exit 1 here; the demo exits 0.`,
  );
  console.log(
    `Poke the fixture and re-run: cd ${root} && npx @nullius-inverba/claims check ${DEMO_DOC_PATH}`,
  );
  console.log(`Authoring convention: ${SPEC_URL}`);
  return 0;
}

function runEagerPrompt(args: ParsedArgs): number {
  const doc = args.globs[0];
  if (doc === undefined || args.globs.length > 1) {
    console.error(`usage: nullius eager-prompt <doc> [--config <path>]`);
    return 2;
  }
  if (!existsSync(doc)) {
    console.error(`no such file: ${doc}`);
    return 2;
  }

  let config: ClaimsConfig;
  try {
    config = loadConfig(args.configPath);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 2;
  }

  const content = readFileSync(doc, "utf8");
  console.log(buildEagerPrompt(doc, content, config.moments));
  return 0;
}

function runCheck(args: ParsedArgs): number {
  let config: ClaimsConfig;
  try {
    config = loadConfig(args.configPath);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 2;
  }

  const globs = args.globs.length > 0 ? args.globs : (config.docs ?? []);
  if (globs.length === 0) {
    console.error(
      `no documents to check — pass globs or set "docs" in ${DEFAULT_CONFIG_PATH}\n\n${USAGE}`,
    );
    return 2;
  }

  const excluded = new Set(config.exclude ?? []);
  const docs = [...new Set(globs.flatMap((pattern) => globSync(pattern)))]
    .filter((path) => !excluded.has(path.split(/[\\/]/).slice(-1)[0] ?? ""))
    .sort();

  if (docs.length === 0) {
    console.error(`no files matched: ${globs.join(" ")}`);
    return args.requireMarkers ? 1 : 0;
  }

  const options: CheckOptions = {};
  if (config.moments !== undefined) options.moments = config.moments;
  if (config.ciCaughtMoments !== undefined) {
    options.ciCaughtMoments = config.ciCaughtMoments;
  }
  if (config.driftWindow !== undefined) {
    options.driftWindow = config.driftWindow;
  }
  if (config.reviewers !== undefined) {
    options.reviewers = config.reviewers;
  }

  const deps = { readFileLines: fileLinesReader(), runSearch: searchRunner() };

  // The canary merge guard: registry content is untrusted and read once; the
  // guard never opens a file — it only inspects documents already matched.
  const { entry: activeCanary, warning: canaryWarning } = loadActiveCanary(
    process.cwd(),
  );
  if (canaryWarning !== undefined) {
    console.error(`warning: ${canaryWarning}`);
  }

  let failures = 0;
  let checked = 0;
  let guardFired = false;
  const unanchored: { doc: string; lines: number }[] = [];

  for (const doc of docs) {
    const content = readFileSync(doc, "utf8");
    const lines = content.split("\n").length;
    const parsed = checkClaims(parseClaims(doc, content), deps, options);
    const guard =
      activeCanary !== null && !args.probing
        ? canaryGuardResult(doc, content, activeCanary)
        : null;
    if (guard !== null) guardFired = true;
    const results = guard === null ? parsed : [guard, ...parsed];

    if (results.length === 0) {
      unanchored.push({ doc, lines });
      continue;
    }

    checked += results.length;
    console.log(`--- ${doc} — ${results.length} anchor(s) / ${lines} lines`);
    failures += report(results);
  }

  if (activeCanary !== null) {
    if (!docs.includes(activeCanary.doc)) {
      console.error(
        `warning: the registered canary points at a document outside the matched set (${activeCanary.doc}) — not read; run \`canary status\``,
      );
    } else if (!guardFired && !args.probing) {
      console.error(
        `warning: the registered canary is no longer present in ${activeCanary.doc} — stale registry; delete .git/nullius/canaries.json after restoring the document`,
      );
    }
  }

  // Anchor density is reported, never judged: the checker cannot know how
  // many claims a document OUGHT to carry, but a long document with zero
  // anchors should be visible at a glance, not silently skipped.
  if (unanchored.length > 0) {
    console.log("");
    console.log(`No anchors (${unanchored.length} document(s)):`);
    for (const entry of unanchored) {
      console.log(`  ${entry.doc} (${entry.lines} lines)`);
    }
  }

  console.log("");
  console.log(
    `${docs.length - unanchored.length} of ${docs.length} matched document(s) carry grounding markers.`,
  );

  if (args.requireMarkers && checked === 0) {
    console.error(
      "No grounding markers found — a document with no citations is not a pass under --require-markers.",
    );
    console.error(`See ${SPEC_URL}.`);
    return 1;
  }

  if (failures > 0) {
    console.error(`${failures} unverified claim(s).`);
    console.error(
      'Open the cited file and correct the claim, or move it to "Open questions".',
    );
    console.error(`See ${SPEC_URL}.`);
    return 1;
  }

  console.log(`All ${checked} grounding marker(s) verified.`);
  return 0;
}

function runCanary(args: ParsedArgs): number {
  const sub = args.globs[0];
  const root = process.cwd();

  if (sub === "plant") {
    const doc = args.globs[1];
    if (doc === undefined || args.globs.length > 2) {
      console.error("usage: nullius canary plant <doc>");
      return 2;
    }
    try {
      const entry = plantCanary(root, doc);
      console.log(`planted ${entry.doc}:${entry.line}`);
      console.log(
        "registry: .git/nullius/canaries.json (per-clone, never committed)",
      );
      console.log(
        "run your review, then `nullius canary verify <report>`; `check` will fail CANARY-PRESENT until cleared (suppress with --probing)",
      );
      return 0;
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      return 1;
    }
  }

  if (sub === "verify") {
    const reportFile = args.globs[1];
    if (reportFile === undefined || args.globs.length > 2) {
      console.error("usage: nullius canary verify <report-file>");
      return 2;
    }
    if (!existsSync(reportFile)) {
      console.error(`no such file: ${reportFile}`);
      return 2;
    }
    const { entry, warning } = loadActiveCanary(root);
    if (warning !== undefined) console.error(warning);
    if (entry === null) {
      console.error("no active canary — plant one first");
      return 2;
    }
    // A read failure must not exit 1 — that code means CANARY-MISSED.
    let reportText: string;
    try {
      reportText = readFileSync(reportFile, "utf8");
    } catch (error) {
      console.error(
        `could not read ${reportFile}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return 2;
    }
    const outcome = verifyCanary(reportText, entry);
    if (outcome === "tainted") {
      console.log(
        "CANARY-TAINTED — the review output references the probe machinery; the probe is invalid, not caught",
      );
      return 3;
    }
    if (outcome === "caught") {
      console.log(`CANARY-CAUGHT — the review flagged ${entry.doc}:${entry.line}`);
      return 0;
    }
    console.log(
      `CANARY-MISSED — nothing in the review references ${entry.doc}:${entry.line} or the planted claim`,
    );
    return 1;
  }

  if (sub === "status") {
    const { entry, warning } = loadActiveCanary(root);
    if (warning !== undefined) console.error(warning);
    if (entry === null) {
      console.log("no active canary");
      return 0;
    }
    console.log(
      `active canary: ${entry.doc}:${entry.line} (planted ${entry.plantedAt})`,
    );
    return 1;
  }

  if (sub === "clear") {
    const { entry, warning } = loadActiveCanary(root);
    if (warning !== undefined) console.error(warning);
    if (entry === null) {
      console.log("no active canary — nothing to clear");
      return 0;
    }
    try {
      clearCanary(root, entry);
      console.log(`cleared ${entry.doc}:${entry.line}`);
      return 0;
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      return 1;
    }
  }

  console.error(`usage: nullius canary <plant|verify|status|clear>\n\n${USAGE}`);
  return 2;
}

function main(): number {
  let args: ParsedArgs;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 2;
  }

  if (args.version) {
    console.log(packageVersion());
    return 0;
  }
  if (args.help || args.command === undefined) {
    console.log(USAGE);
    return args.help ? 0 : 2;
  }
  if (args.command === "demo") {
    return runDemo();
  }
  if (args.command === "eager-prompt") {
    return runEagerPrompt(args);
  }
  if (args.command === "check") {
    return runCheck(args);
  }
  if (args.command === "canary") {
    return runCanary(args);
  }

  console.error(`unknown command: ${args.command}\n\n${USAGE}`);
  return 2;
}

process.exit(main());
