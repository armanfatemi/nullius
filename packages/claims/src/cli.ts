#!/usr/bin/env node
/* eslint-disable no-console -- this is a CLI tool; console output is its user-facing surface */

import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { globSync } from "glob";

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
  check [globs...]    verify every Evidence Anchor in the matched markdown
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

check options:
  --config <path>     config file (default: ${DEFAULT_CONFIG_PATH} if present)
  --require-markers   fail when no grounding markers are found at all
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
    case "malformed":
      return claim.raw;
  }
}

function report(results: ClaimResult[]): number {
  let failures = 0;

  for (const result of results) {
    const { source } = result.claim;
    const where = `${source.doc}:${source.line}`;
    const what = describe(result);

    if (result.verdict === "ok") {
      console.log(`OK        ${where}  ${what}`);
      continue;
    }

    const line = `${result.verdict.toUpperCase().padEnd(9)} ${where}  ${what}`;
    if (isFailure(result.verdict)) {
      failures += 1;
      console.error(line);
      console.error(`          ! ${result.detail}`);
    } else {
      console.log(line);
      console.log(`          ~ ${result.detail}`);
    }
  }

  return failures;
}

interface ParsedArgs {
  command: string | undefined;
  globs: string[];
  configPath: string | undefined;
  requireMarkers: boolean;
  help: boolean;
  version: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    command: undefined,
    globs: [],
    configPath: undefined,
    requireMarkers: false,
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
  const failures = report(demoResults(root));

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
    .filter((path) => !excluded.has(path.split("/").slice(-1)[0] ?? ""))
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

  let failures = 0;
  let checked = 0;
  const unanchored: { doc: string; lines: number }[] = [];

  for (const doc of docs) {
    const content = readFileSync(doc, "utf8");
    const lines = content.split("\n").length;
    const results = checkClaims(parseClaims(doc, content), deps, options);

    if (results.length === 0) {
      unanchored.push({ doc, lines });
      continue;
    }

    checked += results.length;
    console.log(`--- ${doc} — ${results.length} anchor(s) / ${lines} lines`);
    failures += report(results);
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

  console.error(`unknown command: ${args.command}\n\n${USAGE}`);
  return 2;
}

process.exit(main());
