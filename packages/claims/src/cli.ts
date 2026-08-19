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
import { fileLinesReader, revFileReader, searchRunner } from "./runners";

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
  --require-markers   fail when any matched document carries no grounding
                      markers (the floor is per document, not per run)
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
      // The rev is shown: which commit an anchor was settled against is the
      // difference between "this failed" and "this used to be true".
      return `${claim.path}:${claim.line}${claim.rev === undefined ? "" : `@${claim.rev}`}`;
    case "absence":
      return `${claim.command} → ${claim.expectedCount}`;
    case "moment":
      return `binds at ${claim.moment}`;
    case "malformed":
      return claim.raw;
  }
}

/**
 * `OK` on an absence claim is the tool over-claiming on the author's behalf: a
 * search that found nothing certifies the search, never the absence. The
 * verdict is the part a reader remembers, so it says what was actually
 * established.
 */
function label(result: ClaimResult): string {
  if (result.verdict === "ok" && result.claim.kind === "absence") {
    return "SEARCH-CLEAN";
  }
  return result.verdict.toUpperCase();
}

function report(results: ClaimResult[]): number {
  let failures = 0;

  for (const result of results) {
    const { source } = result.claim;
    const where = `${source.doc}:${source.line}`;
    const what = describe(result);

    if (result.verdict === "ok") {
      console.log(`${label(result).padEnd(13)} ${where}  ${what}`);
      continue;
    }

    const line = `${label(result).padEnd(13)} ${where}  ${what}`;
    if (isFailure(result.verdict)) {
      failures += 1;
      console.error(line);
      console.error(`              ! ${result.detail}`);
    } else {
      console.log(line);
      console.log(`              ~ ${result.detail}`);
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
  const rev = writeDemoFixture(root);

  console.log(
    "Demo — a sandbox doc making claims about a sandbox file, one per verdict class.",
  );
  console.log(`Fixture: ${root}`);
  console.log("");
  console.log(`--- ${DEMO_DOC_PATH}`);
  const failures = report(demoResults(root, rev));

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

  // `exclude` entries are globs matched against the full repo-relative path.
  // Matching on basename alone silently excluded same-named files in unrelated
  // directories — a checker that quietly checks less than you configured is
  // the failure mode the config module exists to prevent.
  const ignore = config.exclude ?? [];
  const docs = [
    ...new Set(globs.flatMap((pattern) => globSync(pattern, { ignore }))),
  ].sort();

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
  if (config.minAnchorChars !== undefined) {
    options.minAnchorChars = config.minAnchorChars;
  }
  if (config.relaxedControl !== undefined) {
    options.relaxedControl = config.relaxedControl;
  }

  const deps = {
    readFileLines: fileLinesReader(),
    // Only consulted by `path:line@rev` anchors; an unstamped anchor never
    // shells out to git.
    readFileAtRev: revFileReader(),
    runSearch: searchRunner(undefined, config.searchTimeoutMs),
  };

  let failures = 0;
  let checked = 0;
  let presenceAnchors = 0;
  let absenceAnchors = 0;
  const unanchored: { doc: string; lines: number }[] = [];

  for (const doc of docs) {
    const content = readFileSync(doc, "utf8");
    const lines = content.split("\n").length;
    const claims = parseClaims(doc, content);
    const results = checkClaims(claims, deps, options);

    if (results.length === 0) {
      unanchored.push({ doc, lines });
      continue;
    }

    checked += results.length;
    presenceAnchors += claims.filter((claim) => claim.kind === "presence").length;
    absenceAnchors += claims.filter((claim) => claim.kind === "absence").length;
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
  // Presence and absence are counted apart because they are not the same
  // evidence. A presence anchor made the author open a file; an absence anchor
  // made them run one search. A proposal resting entirely on absence claims
  // should be visible as such at a glance.
  if (checked > 0) {
    console.log(
      `${presenceAnchors} presence anchor(s), ${absenceAnchors} search anchor(s).`,
    );
  }

  // The floor is per DOCUMENT, not per run: one anchored document must never
  // license every other document in the glob to carry none.
  const markerFloorFailed = args.requireMarkers && unanchored.length > 0;
  if (markerFloorFailed) {
    console.error("");
    console.error(
      `${unanchored.length} document(s) carry no grounding markers — under --require-markers a document with no citations is not a pass.`,
    );
    for (const entry of unanchored) {
      console.error(`  ${entry.doc} (${entry.lines} lines)`);
    }
  }

  // Both failure modes are reported: a run can breach the marker floor AND
  // carry unverified claims, and silently dropping one of the two summaries
  // hides work the author still has to do.
  if (failures > 0) {
    console.error("");
    console.error(`${failures} unverified claim(s).`);
    console.error(
      'Open the cited file and correct the claim, or move it to "Open questions".',
    );
  }

  if (markerFloorFailed || failures > 0) {
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
