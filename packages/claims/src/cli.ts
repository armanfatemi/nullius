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
import {
  buildAuditBrief,
  buildExtractionBrief,
  extractAuditClaims,
  formatAuditPlan,
} from "./audit";
import {
  CliError,
  parseCli,
  type AuditArgs,
  type CheckArgs,
  type WiringArgs,
  type WitnessArgs,
} from "./cliArgs";
import { parseConfig, type ClaimsConfig } from "./config";
import { DEMO_DOC_PATH, demoResults, writeDemoFixture } from "./demo";
import { buildEagerPrompt } from "./eagerPrompt";
import { parseClaims } from "./parseClaims";
import { fileLinesReader, revFileReader, searchRunner } from "./runners";
import { checkWiring, isWiringFailure } from "./wiring";
import { fsWiringDeps, scanHarnessRoot } from "./wiringScan";
import { isJournalFailure, validateJournal, type JournalReport } from "./witness";

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
  audit <doc>         list the document's claims as one dispatch each, for a
                      model to try to REFUTE. check asks whether the author
                      looked; audit asks whether the claim is true. Refutations
                      come back as anchors, so check re-verifies them: the model
                      proposes, the checker disposes.
  witness validate <journal.jsonl>
                      verify that a run's own record holds up — every dispatch
                      terminated, no verification cited after the thing it
                      verified changed, no omitted corrections.
  wiring [root]       verify that harness artifacts reference things that
                      exist — agents, skills, read paths, applies_to globs,
                      hook commands. A dispatch naming an agent with no
                      definition file does not error at runtime; it no-ops.
  eager-prompt <doc>  deprecated alias for \`audit <doc> --propose\`.

check options:
  --config <path>     config file (default: ${DEFAULT_CONFIG_PATH} if present)
  --require-markers   fail when any matched document carries no grounding
                      markers (the floor is per document, not per run)
  --help              show this message
  --version           print the package version

audit options:
  --emit-brief <id>   print the starved brief for one claim — one claim per
                      agent, with no siblings and no surrounding document, so
                      the model has no narrative to steelman
  --extract           print the brief that pulls UNANCHORED claims out of the
                      prose (extraction only; it may not judge them)
  --propose           the older confirmation-shaped mode: hunt evidence FOR the
                      document and propose anchors. Kept because retrofitting an
                      unanchored document needs it — but a model sent to find
                      support finds support, so prefer the default

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

function runAudit(args: AuditArgs): number {
  const doc = args.docs[0];
  if (doc === undefined || args.docs.length > 1) {
    console.error(
      "usage: nullius audit <doc> [--emit-brief <id> | --extract | --propose]",
    );
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

  if (args.propose) {
    console.log(buildEagerPrompt(doc, content, config.moments));
    return 0;
  }
  if (args.extract) {
    console.log(buildExtractionBrief(doc, content));
    return 0;
  }

  const claims = extractAuditClaims(doc, content);

  if (args.emitBrief !== undefined) {
    const wanted = args.emitBrief;
    const claim = claims.find((candidate) => candidate.id === wanted);
    if (claim === undefined) {
      console.error(
        `no claim '${wanted}' in ${doc} — run \`nullius audit ${doc}\` for the list`,
      );
      return 2;
    }
    // Deliberately the ONLY thing on stdout: the brief is piped straight into
    // an agent, and anything else printed here is context the claim was
    // supposed to be starved of.
    console.log(buildAuditBrief(claim, config.moments));
    return 0;
  }

  console.log(formatAuditPlan(doc, claims));
  return 0;
}

function runWitness(args: WitnessArgs): number {
  const [sub, journal] = args.operands;
  if (sub !== "validate" || journal === undefined || args.operands.length > 2) {
    console.error("usage: nullius witness validate <journal.jsonl>");
    return 2;
  }
  if (!existsSync(journal)) {
    console.error(`no such file: ${journal}`);
    return 2;
  }

  const report = validateJournal(readFileSync(journal, "utf8"));

  let failures = 0;
  for (const finding of report.findings) {
    const line = `${finding.verdict.toUpperCase().padEnd(20)} ${journal}:${finding.line}  ${finding.subject}`;
    if (isJournalFailure(finding.verdict)) {
      failures += 1;
      console.error(line);
      console.error(`                     ! ${finding.detail}`);
    } else {
      console.log(line);
      console.log(`                     ~ ${finding.detail}`);
    }
  }

  // A schema this build cannot read means the records below the header were
  // never looked at. Printing counts for them would be the exact move the
  // journal exists to catch: a summary standing in for work not done.
  const unreadable = report.findings.some((finding) => finding.verdict === "unsupported-version");
  if (unreadable) {
    console.error("");
    console.error(
      "Validation stopped at the header: this build does not read that schema, so it has no opinion on anything below it. Upgrade the validator rather than reading this as a verdict.",
    );
    return 1;
  }

  console.log("");
  console.log(
    `${report.records} record(s) read: ${report.dispatches} dispatch(es), ${report.verifications} verification(s), ${report.mutations} mutation(s).`,
  );
  // Three numbers, never two. A run that dropped agents on the floor and one
  // where every agent reported nothing summarise identically the moment these
  // are added together.
  console.log(
    `Outcomes: ${report.outcomes.found} found, ${report.outcomes.empty} explicitly empty, ${report.outcomes.noReport} never reported.`,
  );
  console.log(provenance(report));

  if (failures > 0) {
    console.error("");
    console.error(`${failures} invalid record(s) — this run's own account of itself does not hold up.`);
    return 1;
  }

  console.log("Journal valid.");
  return 0;
}

/**
 * Whose account this is — printed on every run, next to the verdict it
 * qualifies. "Journal valid" means something different depending on who wrote
 * the journal, and a summary that omits the difference invites the flattering
 * reading: a self-reported journal is internally consistent, which is a claim
 * about the text and not about the run.
 */
function provenance(report: JournalReport): string {
  const header = report.header;
  if (header === null) {
    return "Schema 0.1 (no header): this journal does not record who wrote it, so nothing here claims a harness did.";
  }
  switch (header.origin) {
    case "hooks":
      return `Schema ${header.version}, origin: hooks — records emitted by the harness runtime, which the agent had no opportunity to decline.`;
    case "self-reported":
      return `Schema ${header.version}, origin: self-reported — written by the agent it describes. Valid means internally consistent; it is not evidence that the run went this way.`;
    default:
      return `Schema ${header.version}, origin: unrecorded — see the MALFORMED finding on the header.`;
  }
}

function runWiring(args: WiringArgs): number {
  if (!existsSync(args.root)) {
    console.error(`no such directory: ${args.root}`);
    return 2;
  }

  const artifacts = scanHarnessRoot(args.root);
  if (artifacts.length === 0) {
    console.error(
      `no harness artifacts under ${args.root} — expected .claude/agents, .claude/skills, .claude/rules, .claude/commands, or a hooks JSON file`,
    );
    return 2;
  }

  const report = checkWiring(artifacts, fsWiringDeps(args.root));

  let failures = 0;
  let advisories = 0;
  for (const finding of report.findings) {
    const line = `${finding.verdict.toUpperCase().padEnd(20)} ${finding.artifact}:${finding.line}  ${finding.subject}`;
    if (isWiringFailure(finding.verdict)) {
      failures += 1;
      console.error(line);
      console.error(`                     ! ${finding.detail}`);
    } else {
      advisories += 1;
      console.log(line);
      console.log(`                     ~ ${finding.detail}`);
    }
  }

  console.log("");
  console.log(
    `${report.artifacts} artifact(s) scanned, ${report.references} declared reference(s) checked.`,
  );

  // Four summary states, each its own sentence: a clean run, an
  // advisory-only run, a failing run, and a run that checked nothing must not
  // read alike. Every finding above is either a hard failure or a
  // `loose-reference` advisory — the checker never emits an `ok` finding — so
  // `failures` and `advisories` together account for every line printed, and
  // a run that stayed silent about a dozen advisories would look identical to
  // one that found nothing. Separately, `references === 0` means no
  // `dispatches`, `skills`, `reads`, `applies_to`, or hook `command` was ever
  // examined — "every declared reference resolves" is technically true of an
  // empty set, but it is the sentence a human skims and CI reads only the
  // exit code, so a scan that checked nothing must not say the word
  // "resolves" at all.
  if (failures > 0) {
    console.error("");
    console.error(
      `${failures} unresolved reference(s) — each one is an instruction addressed to something that is not there.`,
    );
    if (advisories > 0) {
      console.error(
        `${advisories} additional advisory loose-reference finding(s) above — not counted toward this failure.`,
      );
    }
    return 1;
  }

  if (report.references === 0) {
    console.log(
      "No declared references were found to check — this is not the same as everything resolving.",
    );
    if (advisories > 0) {
      console.log(
        `${advisories} advisory loose-reference finding(s) above — unresolvable prose paths, not declared references.`,
      );
    }
    return 0;
  }

  if (advisories > 0) {
    console.log(
      `Every declared reference resolves. ${advisories} advisory loose-reference finding(s) above — unresolvable prose paths, not declared references, so the run still passes.`,
    );
    return 0;
  }

  console.log("Every declared reference resolves. No advisories.");
  return 0;
}

function runCheck(args: CheckArgs): number {
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
  let command;
  try {
    command = parseCli(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    // A parse error prints its own sentence and the usage, because the two
    // together are what tell someone which of the two they got wrong.
    if (error instanceof CliError) console.error(`\n${USAGE}`);
    return 2;
  }

  switch (command.kind) {
    case "version":
      console.log(packageVersion());
      return 0;
    case "help":
      console.log(USAGE);
      // No arguments is not the same request as `--help`, and the exit code
      // is where the difference is visible to a script.
      return command.requested ? 0 : 2;
    case "demo":
      return runDemo();
    case "check":
      return runCheck(command);
    case "witness":
      return runWitness(command);
    case "wiring":
      return runWiring(command);
    case "audit":
      if (command.viaAlias) {
        // Kept working so a pinned pipeline does not break; the name moved
        // because "find evidence for this document" is one mode of auditing,
        // and the confirmation-shaped one at that.
        console.error(
          "note: `eager-prompt` is now `audit <doc> --propose`; the old name still works.",
        );
      }
      return runAudit(command);
  }
}

process.exit(main());
