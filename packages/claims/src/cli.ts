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
  canaryGuardResult,
  clearCanary,
  loadActiveCanary,
  normalizeRepoPath,
  plantCanary,
  verifyCanary,
} from "./canary";
import {
  buildAuditBrief,
  buildComplianceBrief,
  buildExtractionBrief,
  extractAuditClaims,
  formatAuditPlan,
} from "./audit";
import {
  CliError,
  parseCli,
  type AuditArgs,
  type CanaryArgs,
  type CheckArgs,
  type RulesArgs,
  type WiringArgs,
  type WitnessArgs,
} from "./cliArgs";
import { parseConfig, type ClaimsConfig } from "./config";
import { DEMO_DOC_PATH, demoResults, writeDemoFixture } from "./demo";
import { buildEagerPrompt } from "./eagerPrompt";
import { parseClaims } from "./parseClaims";
import { fileLinesReader, revFileReader, searchRunner } from "./runners";
import { checkRuleCoverage, isRuleCoverageFailure } from "./ruleCoverage";
import { checkRule, isRuleFailure, parseRuleHeader, selectRules } from "./rules";
import { scanRules } from "./rulesScan";
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
                      --expect-rules <rule-id...> additionally checks that
                      every named rule id reached a delivered verdict in this
                      journal (SILENT-RULE otherwise) — the ids \`rules
                      select\` named for this run. Skipped when the journal
                      itself is UNSUPPORTED-VERSION: nothing past its header
                      was read.
  wiring [root]       verify that harness artifacts reference things that
                      exist — agents, skills, read paths, applies_to globs,
                      hook commands. A dispatch naming an agent with no
                      definition file does not error at runtime; it no-ops.
  rules select --paths <path...>
                      deterministic rule selection, no model involved: emit
                      the id of every rule under .claude/rules/ whose
                      applies_to matches at least one given path, in a
                      stable order, then print the excluded count.
                      --emit-brief <rule-id> prints the starved compliance
                      brief for one selected rule instead — one rule per
                      agent, with no sibling rules and no plan rationale.
  rules check [root]  verify every rule's frontmatter (closed keys, a
                      required id, a known severity) and its incident
                      anchor, the same way \`check\` verifies any other
                      document's Evidence Anchors. UNGROUNDED-RULE and
                      RULE-ROT are advisory; a malformed header fails.
  canary plant <doc>  insert a registered, plausibly-false claim, then run
                      your review against the document. A pipeline that flags
                      it is demonstrably alive; one that misses it has been
                      measured dead rather than assumed alive.
  canary verify <report>
                      exit 0 CANARY-CAUGHT, 1 CANARY-MISSED, 3 CANARY-TAINTED
                      (the report named the probe machinery, so the probe is
                      invalid rather than passed), 2 when it could not run.
  canary status       show the active canary; exit 1 when one is planted
  canary clear        remove the planted claim, restoring the document
  eager-prompt <doc>  deprecated alias for \`audit <doc> --propose\`.

check options:
  --config <path>     config file (default: ${DEFAULT_CONFIG_PATH} if present)
  --require-markers   fail when any matched document carries no grounding
                      markers (the floor is per document, not per run)
  --probing           suppress the CANARY-PRESENT merge guard, for the one run
                      that is deliberately checking a planted document
  --help              show this message
  --version           print the package version

witness options:
  --expect-rules <rule-id...>
                      fail the run if any named rule id never reached a
                      delivered verdict (see \`witness validate\` above)

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
    case "canary":
      return "registered canary";
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
    console.error("usage: nullius witness validate <journal.jsonl> [--expect-rules <rule-id...>]");
    return 2;
  }
  if (!existsSync(journal)) {
    console.error(`no such file: ${journal}`);
    return 2;
  }

  const content = readFileSync(journal, "utf8");
  const report = validateJournal(content);

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
  // journal exists to catch: a summary standing in for work not done. And
  // for the same reason, rule coverage — which reads those same unread bytes
  // — must not run either (design.md Decisions 3 and 4): it would misreport
  // silence about content the validator explicitly declined to judge.
  const unreadable = report.findings.some((finding) => finding.verdict === "unsupported-version");
  if (unreadable) {
    console.error("");
    console.error(
      "Validation stopped at the header: this build does not read that schema, so it has no opinion on anything below it. Upgrade the validator rather than reading this as a verdict.",
    );
    return 1;
  }

  // `--expect-rules` rides along with journal validation rather than being a
  // separate command (design.md Decision 4) — a run that validates its
  // journal but forgets a separate coverage flag would recreate the exact
  // silent-check-skipped failure this proposal exists to catch.
  let coverageFailures = 0;
  if (args.expectRules !== undefined) {
    const coverage = checkRuleCoverage(content, args.expectRules);
    for (const finding of coverage) {
      // `RuleCoverageFinding` has no `line` field — an absent-rule finding is
      // about the journal's content as a whole, not one record — so this is
      // deliberately NOT the `<journal>:<line>` shape the loop above uses.
      const line = `${finding.verdict.toUpperCase()}  ${finding.ruleId}  ${finding.detail}`;
      if (isRuleCoverageFailure(finding.verdict)) {
        coverageFailures += 1;
        console.error(line);
      } else {
        console.log(line);
      }
    }
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
  if (args.expectRules !== undefined) {
    console.log(
      `Rule coverage: ${args.expectRules.length} expected rule(s) checked, ${coverageFailures} silent.`,
    );
  }

  if (failures > 0 || coverageFailures > 0) {
    console.error("");
    if (failures > 0) {
      console.error(`${failures} invalid record(s) — this run's own account of itself does not hold up.`);
    }
    if (coverageFailures > 0) {
      console.error(
        `${coverageFailures} rule(s) never reached a delivered verdict in this journal — a terminal record existing is not the same as one being delivered.`,
      );
    }
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

/**
 * `rules select` (deterministic selection, no model) and `rules check`
 * (verify every rule's header and incident anchor) — the kernel half of
 * `add-rules-compliance`. Both scan `.claude/rules/*.md` under `args.root`
 * via `scanRules`, then hand the results to the pure functions in `rules.ts`.
 */
function runRules(args: RulesArgs): number {
  if (!existsSync(args.root)) {
    console.error(`no such directory: ${args.root}`);
    return 2;
  }

  const files = scanRules(args.root);

  if (args.sub === "select") {
    const result = selectRules(files, args.paths);

    if (args.emitBrief !== undefined) {
      const wanted = args.emitBrief;
      const selection = result.selected.find((rule) => rule.id === wanted);
      if (selection === undefined) {
        console.error(
          `no rule '${wanted}' selected for --paths ${args.paths.join(" ")} — run \`nullius rules select --paths ${args.paths.join(" ")}\` for the list`,
        );
        return 2;
      }
      const file = files.find((candidate) => candidate.path === selection.path);
      // `selection` came out of `selectRules(files, ...)` above, so a
      // matching entry in `files` always exists and its header always
      // reparses `ok` — both scans read the same in-memory `files`, not two
      // separate directory reads that could have drifted between calls.
      const header = file === undefined ? null : parseRuleHeader(file.content, file.path);
      if (file === undefined || header === null || header.verdict !== "ok") {
        console.error(`internal error: selected rule '${wanted}' has no readable header`);
        return 2;
      }
      const body = file.content.split("\n").slice(header.bodyLine - 1).join("\n").trim();
      // Deliberately the ONLY thing on stdout: the brief is piped straight
      // into an agent, and anything else printed here is context the rule
      // was supposed to be starved of.
      console.log(buildComplianceBrief({ id: header.id, text: body }, args.paths));
      return 0;
    }

    for (const rule of result.selected) {
      console.log(rule.id);
    }
    console.log("");
    console.log(
      `${result.selected.length} rule(s) selected, ${result.excludedCount} excluded — a selection that silently narrows is the failure this verb exists to prevent.`,
    );
    return 0;
  }

  // args.sub === "check"
  if (files.length === 0) {
    console.error(`no rule files under ${args.root} — expected .claude/rules/*.md`);
    return 2;
  }

  const deps = {
    readFileLines: fileLinesReader(args.root),
    readFileAtRev: revFileReader(args.root),
    runSearch: searchRunner(args.root),
  };

  let failures = 0;
  let advisories = 0;
  for (const file of files) {
    const result = checkRule(file, deps);
    const line = `${result.verdict.toUpperCase().padEnd(22)} ${result.path}  ${result.id ?? "(no id)"}`;
    if (isRuleFailure(result.verdict)) {
      failures += 1;
      console.error(line);
      console.error(`                       ! ${result.detail}`);
    } else {
      if (result.verdict !== "ok") advisories += 1;
      console.log(line);
      if (result.detail.length > 0) console.log(`                       ~ ${result.detail}`);
    }
  }

  console.log("");
  console.log(`${files.length} rule(s) scanned.`);

  if (failures > 0) {
    console.error("");
    console.error(
      `${failures} malformed rule header(s) — an unknown key, a missing id, or an invalid severity.`,
    );
    return 1;
  }

  if (advisories > 0) {
    console.log(
      `${advisories} advisory finding(s) above (ungrounded or rotted rules) — not counted toward this failure.`,
    );
  }

  console.log("Every rule header parses. No hard failures.");
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

  // The canary merge guard: registry content is untrusted and read once; the
  // guard never opens a file — it only inspects documents already matched.
  const { entry: activeCanary, warning: canaryWarning } = loadActiveCanary(
    process.cwd(),
  );

  let failures = 0;
  let checked = 0;
  let presenceAnchors = 0;
  let absenceAnchors = 0;
  let guardFired = false;
  const unanchored: { doc: string; lines: number }[] = [];

  for (const doc of docs) {
    const content = readFileSync(doc, "utf8");
    const lines = content.split("\n").length;
    const claims = parseClaims(doc, content);
    const parsed = checkClaims(claims, deps, options);
    const guard =
      activeCanary !== null && !args.probing
        ? canaryGuardResult(normalizeRepoPath(doc), content, activeCanary)
        : null;
    if (guard !== null) guardFired = true;
    const results = guard === null ? parsed : [guard, ...parsed];

    // The guard is not a grounding marker: density reports what the AUTHOR
    // anchored, so a canary must not lift a document off the no-anchors list.
    if (parsed.length === 0) {
      unanchored.push({ doc, lines });
    }
    if (results.length === 0) continue;

    checked += parsed.length;
    presenceAnchors += claims.filter((claim) => claim.kind === "presence").length;
    absenceAnchors += claims.filter((claim) => claim.kind === "absence").length;
    console.log(`--- ${doc} — ${parsed.length} anchor(s) / ${lines} lines`);
    failures += report(results);
  }

  if (canaryWarning !== undefined) {
    // Fail closed: an unreadable registry means canary state is unknown, and
    // a guard that silently stands down is the failure mode this tool exists
    // to prevent. Advisory would collapse "guarded" and "unguarded" again.
    console.error(canaryWarning);
    console.error(
      "canary state cannot be determined — restore or delete .git/nullius/canaries.json, then re-run",
    );
    return 1;
  }

  if (activeCanary !== null) {
    const matched = docs.some(
      (doc) => normalizeRepoPath(doc) === activeCanary.doc,
    );
    if (!matched) {
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

/**
 * The probe lifecycle. Every subcommand except `plant` fails closed on an
 * unreadable registry: "no active canary" would be a fabricated attestation
 * about the state of the machinery being probed.
 */
function runCanary(args: CanaryArgs): number {
  const [sub, operand, ...extra] = args.operands;
  const root = process.cwd();

  if (sub === "plant") {
    if (operand === undefined || extra.length > 0) {
      console.error("usage: nullius canary plant <doc>");
      return 2;
    }
    try {
      const entry = plantCanary(root, operand);
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

  if (sub !== "verify" && sub !== "status" && sub !== "clear") {
    console.error(
      `usage: nullius canary <plant|verify|status|clear>\n\n${USAGE}`,
    );
    return 2;
  }

  const { entry, warning } = loadActiveCanary(root);
  if (warning !== undefined) {
    console.error(warning);
    console.error(
      "canary state cannot be determined — restore or delete .git/nullius/canaries.json, then re-run",
    );
    return 2;
  }

  if (sub === "verify") {
    if (operand === undefined || extra.length > 0) {
      console.error("usage: nullius canary verify <report-file>");
      return 2;
    }
    if (entry === null) {
      console.error("no active canary — plant one first");
      return 2;
    }
    // A read failure must not exit 1 — that code means CANARY-MISSED, and a
    // missing report file is not evidence that the review missed anything.
    let reportText: string;
    try {
      reportText = readFileSync(operand, "utf8");
    } catch (error) {
      console.error(
        `could not read ${operand}: ${error instanceof Error ? error.message : String(error)}`,
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
    if (entry === null) {
      console.log("no active canary");
      return 0;
    }
    console.log(
      `active canary: ${entry.doc}:${entry.line} (planted ${entry.plantedAt})`,
    );
    return 1;
  }

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
    case "rules":
      return runRules(command);
    case "canary":
      return runCanary(command);
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
