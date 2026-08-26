/**
 * `nullius-kit pipeline` — the deterministic half of the proposal-to-pr
 * orchestrator.
 *
 * The skill decides which agents to dispatch and whether a blocker is
 * addressed. Everything here is a decision a checker can settle by re-reading
 * an artefact, which is why it is code with tests rather than prose in a
 * prompt: a wrong answer from this module silently un-dispatches a reviewer,
 * and the run then reports a review that never happened.
 */

import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/** A dependency's state as `dep-status` can prove it from the filesystem —
 *  exactly the two values it emits. The `unsatisfied` / `orphaned` distinction
 *  belongs to the PR half of the gate, which needs a network call the kit
 *  deliberately does not make; `classifyCompareStatus` carries that union.
 *  Declaring the richer vocabulary here would offer callers two states this
 *  module can never return. */
export type DepState = "satisfied" | "unknown";

/**
 * Parse the `> **Depends on:**` blockquote `intent-to-proposal` writes.
 *
 * Only the text before the em-dash is read — the template's own trailing
 * sentence after the em-dash contains the word "None", so reading the whole
 * line would report no dependencies for a proposal that has them. Dependencies
 * are the backticked names present. If the declared segment contains no
 * backticks, there are no dependencies — whether the line reads `None`,
 * contains only whitespace, or the blockquote is absent entirely.
 */
export function parseDependsOn(proposal: string): string[] {
  for (const line of proposal.split("\n")) {
    const match = /^>\s*\*\*Depends on:\*\*\s*(.+)$/.exec(line);
    if (match === null) continue;
    const declared = (match[1] ?? "").split("—")[0] ?? "";
    return [...declared.matchAll(/`([^`]+)`/g)].map((hit) => hit[1] ?? "").filter((name) => name.length > 0);
  }
  return [];
}

/**
 * Classify a `gh api compare/main...<sha>` status.
 *
 * A PR based on a feature branch reports `MERGED` while its commits never
 * reach `main`. Every anchor that PR stamped is then unreachable, which the
 * claims checker reports as the fail-open `UNVERIFIABLE-REV`. An inconclusive
 * answer is never read as success.
 */
export function classifyCompareStatus(status: string): "landed" | "orphaned" | "unknown" {
  if (status === "identical" || status === "behind") return "landed";
  if (status === "ahead" || status === "diverged") return "orphaned";
  return "unknown";
}

/** A change name is interpolated into a path, so it is validated before it is. */
export function isSafeChangeName(name: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name) && name !== "." && name !== "..";
}

/** The roster this pipeline can dispatch for review. `retro-writer` is not a
 *  reviewer and is dispatched by stage, not by routing. */
export type AgentName =
  | "architecture-reviewer"
  | "checker-engineer"
  | "rule-auditor"
  | "test-engineer";

/** The four modules that decide a verdict. `checker-engineer` owns exactly these. */
export const KERNEL_MODULES: readonly string[] = [
  "packages/claims/src/checkClaims.ts",
  "packages/claims/src/config.ts",
  "packages/claims/src/wiring.ts",
  "packages/claims/src/witness.ts",
];

/**
 * The kernel modules' bare filenames, derived from `KERNEL_MODULES` rather
 * than hard-coded a second time — a second list is a second thing to keep in
 * sync, and this table has already paid once for a routing row that quietly
 * stopped matching.
 *
 * Measured across this repository's own live changes, proposals cite kernel
 * source by basename (`checkClaims.ts`) more than twice as often as by full
 * path (`packages/claims/src/checkClaims.ts`). A routing row that only
 * matched the full path therefore missed most real citations, and did so
 * silently: `checker-engineer` — the reviewer whose entire job is these four
 * files — went undispatched on changes that modified them, which produces a
 * run that reports a review that never happened.
 */
const KERNEL_BASENAMES: ReadonlySet<string> = new Set(
  KERNEL_MODULES.map((path) => path.split("/").pop() ?? path),
);

const ARCHITECTURE_PATHS: readonly RegExp[] = [
  /^spec\/[^/]+\.md$/,
  /^CLAUDE\.md$/,
  /^README\.md$/,
  // Proposals cite this repository's project doctrine bare (`project.md`), the
  // same basename convention that motivated KERNEL_BASENAMES above — the real
  // path is `openspec/project.md`, but `^openspec\/` below only matches a
  // citation that carries the directory, and this one usually does not.
  /^project\.md$/,
  /^openspec\//,
];

const TEST_PATHS: readonly RegExp[] = [
  /^packages\/(?:claims|kit)\/src\/.+\.ts$/,
  /^spec\/fixtures\//,
  /^\.github\/workflows\/.+\.ya?ml$/,
  // A bare `*.ts` token — no directory — is, by this repo's own
  // proposal-writing convention, a citation of package source even though it
  // does not say which package. This deliberately over-dispatches: a bare
  // filename that turns out not to be package source earns test-engineer
  // anyway. That is the same trade this pipeline makes everywhere else a
  // citation is ambiguous — a reviewer dispatched needlessly costs tokens; a
  // reviewer silently never dispatched produces a review that never happened.
  /^[A-Za-z0-9._-]+\.ts$/,
];

/** Backticked repo-relative paths with a known extension. Paths may be bare
 *  root filenames (CLAUDE.md, README.md) or nested (packages/claims/src/file.ts).
 *  Prose in backticks — a type name, a function — carries no extension and is
 *  not a path. */
const PATH_TOKEN = /`([A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*\.(?:ts|md|json|jsonl|ya?ml|sh))`/g;

export function touchedPaths(text: string): string[] {
  const found = new Set<string>();
  for (const hit of text.matchAll(PATH_TOKEN)) {
    const path = hit[1];
    if (path !== undefined) found.add(path);
  }
  return [...found].sort();
}

/**
 * Decide which reviewers a set of touched paths earns.
 *
 * `rule-auditor` is unconditional. Deciding whether a rule applies means
 * matching its `applies_to` globs, and that is `rules select`'s job in the
 * kernel — a second implementation here is exactly the duplicate this
 * pipeline is forbidden to grow, so the agent globs for itself. When
 * `rules select` lands, this row can pre-filter instead.
 */
export function routeAgents(paths: readonly string[]): AgentName[] {
  const agents = new Set<AgentName>(["rule-auditor"]);
  for (const path of paths) {
    if (KERNEL_MODULES.includes(path) || KERNEL_BASENAMES.has(path)) agents.add("checker-engineer");
    if (ARCHITECTURE_PATHS.some((pattern) => pattern.test(path))) agents.add("architecture-reviewer");
    if (TEST_PATHS.some((pattern) => pattern.test(path))) agents.add("test-engineer");
  }
  return [...agents].sort();
}

/**
 * Route a diff's changed paths directly, bypassing prose extraction.
 *
 * `route` reads `proposal.md` and `tasks.md` and can only route what a
 * proposal says — and a proposal may name no source files at all (round 1's
 * corpus re-measurement found three such changes). Stage 6 post-review
 * routes on the diff instead, where changed files are facts from `git`, not
 * prose. Those paths must NOT go through `touchedPaths`: that extractor
 * only finds backticked mentions, and a real `git diff --name-only` line
 * never carries backticks — running it through the extractor would drop
 * every path.
 */
export function routePathsFrom(input: string): AgentName[] {
  return routeAgents(stdinPaths(input));
}

/**
 * The non-empty, trimmed lines of a stdin payload.
 *
 * Split out of `routePathsFrom` because "nothing was piped in" has to be
 * distinguishable from "these paths earned this set". `routeAgents` always
 * returns the unconditional `rule-auditor`, so an empty payload otherwise
 * produces a one-agent answer that reads exactly like a real routing result.
 */
export function stdinPaths(input: string): string[] {
  return input
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/** One human-only command found in a change's own artefacts. */
export interface BlockedCommand {
  readonly line: number;
  readonly text: string;
  readonly reason: string;
}

/**
 * Commands a run may propose but never execute unattended. Drawn from the
 * rules and from what autonomy could quietly break — not from a general idea
 * of danger.
 */
const HUMAN_ONLY: readonly { readonly pattern: RegExp; readonly reason: string }[] = [
  { pattern: /\bgh\s+pr\s+merge\b/, reason: "merge is the human's call" },
  { pattern: /--squash\b/, reason: "merge-never-squash.md — a squash orphans every anchor stamp" },
  { pattern: /\bgit\s+push\b.+?(?:--force|-f)\b/, reason: "rewrites published history" },
  { pattern: /\bgit\s+(?:rebase|filter-branch|filter-repo)\b/, reason: "rewrites published history" },
  { pattern: /\b(?:npm|pnpm|yarn)(?:\s+.+?)?\s+publish\b/, reason: "publishes an artefact" },
  { pattern: /\.claude\/settings\.json\b/, reason: "one-delivery-mechanism.md" },
  { pattern: /\.git\/nullius\//, reason: "canary registry and witness journal" },
  { pattern: /repos\/[^/]+\/[^/]+\/pulls\/\d+\/merge/, reason: "merge is the human's call" },
  { pattern: /\bopenspec\s+archive\b/, reason: "archiving would satisfy this change's own dependents" },
];

export function blockedCommands(text: string): BlockedCommand[] {
  const found: BlockedCommand[] = [];
  text.split("\n").forEach((line, index) => {
    for (const { pattern, reason } of HUMAN_ONLY) {
      if (!pattern.test(line)) continue;
      found.push({ line: index + 1, text: line.trim(), reason });
      return;
    }
  });
  return found;
}

/**
 * Line numbers of unchecked boxes under a `Human Approval Required` heading.
 *
 * Scoped to that block deliberately: `tasks.md` is nothing but unchecked
 * boxes, and a pause-check that counted them all would pause on every change.
 * Nested subheadings are included in the block; only a sibling or shallower
 * heading closes it, so authors may group approval items without losing them.
 */
export function unapprovedBlocks(proposal: string): number[] {
  const unchecked: number[] = [];
  // 0 means "not inside the block". Otherwise it holds the heading depth the
  // block opened at: only a sibling or shallower heading closes it, so an
  // author may group approval items under subheadings without the boxes
  // silently falling outside the scan.
  let openedAt = 0;
  proposal.split("\n").forEach((line, index) => {
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading !== null) {
      const level = (heading[1] ?? "").length;
      if (/^Human Approval Required\b/i.test(heading[2] ?? "")) {
        openedAt = level;
      } else if (openedAt > 0 && level <= openedAt) {
        openedAt = 0;
      }
      return;
    }
    if (openedAt > 0 && /^\s*-\s*\[ \]/.test(line)) unchecked.push(index + 1);
  });
  return unchecked;
}

/**
 * Where a run's resume state lives.
 *
 * Under `.git/`, beside the canary registry, because machine-local nullius
 * state already has a home there — which means no `.gitignore` entry and one
 * convention rather than two. `review-evidence.md` and `progress.md` are the
 * opposite case: they are committed into the change folder, where CI already
 * re-verifies any claim they make about the codebase.
 */
export function statePath(root: string, change: string): string {
  if (!isSafeChangeName(change)) {
    throw new Error(`unsafe change name: ${change}`);
  }
  return join(root, ".git", "nullius", "pipeline", `${change}.state.json`);
}

/** Absent or corrupt state reads as empty. A resume that crashes on its own
 *  bookkeeping is worse than a resume that starts over. */
export function readState(root: string, change: string): Record<string, string> {
  const path = statePath(root, change);
  if (!existsSync(path)) return {};
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
    );
  } catch {
    return {};
  }
}

export function writeStateKey(root: string, change: string, key: string, value: string): void {
  const path = statePath(root, change);
  const state = readState(root, change);
  state[key] = value;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

/** Append one section to the change's committed review evidence. */
export function appendEvidence(root: string, change: string, heading: string, body: string): void {
  if (!isSafeChangeName(change)) throw new Error(`unsafe change name: ${change}`);
  const path = join(root, "openspec", "changes", change, "review-evidence.md");
  const header = existsSync(path) ? "" : "# Review evidence\n";
  appendFileSync(path, `${header}\n## ${heading}\n\n${body.trimEnd()}\n`, "utf8");
}

const PIPELINE_USAGE = `nullius-kit pipeline — deterministic helpers for proposal-to-pr

usage:
  nullius-kit pipeline <command> [<change>] [--root <dir>]
  (<change> is required by most commands; list-changes and route-paths take none)

  list-changes                  every openspec/changes/<name>/
  show <change>                 the change's artefacts; exit 1 if incomplete
  state-get <change> [key]      read resume state
  state-set <change> <k> <v>    write one key
  state-reset <change>          wipe state for this change
  pause-check <change>          exit 1 on an unchecked Human Approval box
  blocked-commands <change>     exit 1 and print HUMAN: <cmd> for each
  touched-areas <change>        repo-relative paths the change names
  depends-on <change>           the > **Depends on:** blockquote, one per line
  route <change>                the agents this change earns: the paths it
                                 cites, unioned with its own artefacts
  route-paths                   the agents these paths earn — exactly the ones
                                 given on stdin, nothing injected
                                 (one per line, e.g. git diff --name-only)
  dep-status <change>           exit 0 only if provably archived
  classify-compare <status>     landed | orphaned | unknown; exit 0 on landed
  evidence-append <change> <h>  read a section from stdin
  evidence-print <change>       print accumulated review evidence; exit 1 if
                                 there is none to print
  progress-write <change>       overwrite progress.md from stdin

Exit codes: 0 ok · 1 pause, blocker, or an artefact that is not there
            2 usage error`;

function changeDir(root: string, change: string): string {
  return join(root, "openspec", "changes", change);
}

function readIfPresent(path: string): string {
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

/**
 * How a subcommand gets its piped payload.
 *
 * Injectable so that "nothing arrived on stdin" is assertable as an exit code.
 * A test that read fd 0 for real would block on a terminal — which is the
 * precise failure the `isTTY` guards below exist to prevent, so reproducing it
 * inside the suite that proves they work is not an option.
 */
export type StdinReader = () => string;

const readStdin: StdinReader = () => readFileSync(0, "utf8");

/**
 * Refuse to answer a question about an artefact that is not there.
 *
 * Every subcommand guarded by this reports its finding as an *absence* — no
 * prerequisites, no human-only commands, no touched paths, no accumulated
 * evidence — and a missing file produces exactly that answer for exactly the
 * wrong reason. `show` catches an incomplete change on the linear path, but a
 * resume re-enters at a later stage without re-running it, so the guard has to
 * live with each reader rather than upstream of all of them.
 *
 * The bar is "at least one of the files this subcommand actually reads": a
 * command reading two artefacts has read something if either is present, and
 * demanding both would block a change that legitimately carries one.
 */
function missingArtefacts(dir: string, change: string, files: readonly string[]): string | null {
  if (files.some((file) => existsSync(join(dir, file)))) return null;
  return `no ${files.join(" or ")} in openspec/changes/${change}/`;
}

export function runPipeline(argv: readonly string[], readInput: StdinReader = readStdin): number {
  const rootIndex = argv.indexOf("--root");
  const root = rootIndex === -1 ? process.cwd() : (argv[rootIndex + 1] ?? process.cwd());
  // Guard the -1 case explicitly. `indexOf` returns -1 when the flag is
  // absent, and `rootIndex + 1` is then 0 — a filter written without this
  // branch drops argv[0], the subcommand itself.
  const positional =
    rootIndex === -1
      ? [...argv]
      : argv.filter((_, index) => index !== rootIndex && index !== rootIndex + 1);
  const [command, change, ...rest] = positional;

  if (command === undefined || command === "--help" || command === "-h") {
    console.log(PIPELINE_USAGE);
    return command === undefined ? 2 : 0;
  }

  if (command === "list-changes") {
    const dir = join(root, "openspec", "changes");
    if (!existsSync(dir)) return 0;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name !== "archive") console.log(entry.name);
    }
    return 0;
  }

  if (command === "route-paths") {
    // No change name: the paths come from stdin, not from a change's own
    // artefacts. Handled here, before the change-name guard, so a caller
    // piping `git diff --name-only` isn't rejected for missing an argument
    // this subcommand doesn't take.
    //
    // Both guards below are the ones `evidence-append` and `progress-write`
    // already carry. An unattended runner that blocks on a terminal read stops
    // with no error and no exit code, indistinguishable from work still in
    // progress; and a payload that arrived empty is not a routing question at
    // all — `routeAgents` would answer it with the unconditional reviewer, and
    // Stage 6 would read that as a routed set.
    if (process.stdin.isTTY === true) {
      console.error(`pipeline ${command} reads its paths on stdin, one per line`);
      return 2;
    }
    const paths = stdinPaths(readInput());
    if (paths.length === 0) {
      console.error("pipeline route-paths got no paths on stdin — routing nothing is not a routing answer");
      return 1;
    }
    for (const agent of routeAgents(paths)) console.log(agent);
    return 0;
  }

  if (change === undefined) {
    // `classify-compare` takes a status word, not a change name — name the
    // argument this subcommand actually expects rather than the wrong noun.
    const noun = command === "classify-compare" ? "a status word" : "a change name";
    console.error(`pipeline ${command} needs ${noun}\n\n${PIPELINE_USAGE}`);
    return 2;
  }
  // `classify-compare` takes a status word, not a change name, so it is
  // answered before the name guard rather than exempted inside it.
  if (command === "classify-compare") {
    const verdict = classifyCompareStatus(change);
    console.log(verdict);
    return verdict === "landed" ? 0 : 1;
  }
  if (!isSafeChangeName(change)) {
    console.error(`unsafe change name: ${change}`);
    return 2;
  }

  const dir = changeDir(root, change);
  // A subcommand that reports success — or, worse, blocks forever reading
  // stdin — without ever confirming the change's directory exists hands the
  // skill a proof it never obtained. Hoisted once, above every artefact and
  // stdin read, rather than repeated per subcommand. `state-set`, `state-get`,
  // and `state-reset` read and write resume state under `.git/`, not under this
  // directory, and `dep-status`'s whole job is answering whether the (archived)
  // directory exists — all four legitimately act on a change whose directory
  // may not exist yet, so they stay exempt.
  const needsDir = command !== "state-set" && command !== "state-get" && command !== "state-reset" && command !== "dep-status";
  if (needsDir && !existsSync(dir)) {
    console.error(`no openspec/changes/${change}/`);
    return 1;
  }
  const proposal = readIfPresent(join(dir, "proposal.md"));
  const tasks = readIfPresent(join(dir, "tasks.md"));
  const design = readIfPresent(join(dir, "design.md"));

  switch (command) {
    case "show": {
      const missing = ["proposal.md", "design.md", "tasks.md"].filter(
        (file) => !existsSync(join(dir, file)),
      );
      for (const file of readdirSync(dir)) console.log(file);
      if (missing.length > 0) {
        console.error(`incomplete change — missing ${missing.join(", ")}`);
        return 1;
      }
      return 0;
    }
    case "pause-check": {
      // The directory guard above proves the change exists, not that its
      // proposal does. unapprovedBlocks("") is [] — an absent proposal.md
      // would otherwise read as "every box checked, proceed" for the one
      // gate that protects a human decision.
      const absent = missingArtefacts(dir, change, ["proposal.md"]);
      if (absent !== null) {
        console.error(absent);
        return 1;
      }
      const unchecked = unapprovedBlocks(proposal);
      for (const line of unchecked) console.error(`proposal.md:${line} unchecked approval`);
      return unchecked.length > 0 ? 1 : 0;
    }
    case "blocked-commands": {
      // These two files are the whole corpus this scan reads. With neither
      // present the answer is "this change contains no human-only commands",
      // which is the reassurance a coordinator acts on right before running
      // something only a human may run.
      const absent = missingArtefacts(dir, change, ["tasks.md", "design.md"]);
      if (absent !== null) {
        console.error(absent);
        return 1;
      }
      const found = [...blockedCommands(tasks), ...blockedCommands(design)];
      for (const entry of found) console.log(`HUMAN: ${entry.text}  — ${entry.reason}`);
      return found.length > 0 ? 1 : 0;
    }
    case "touched-areas": {
      // Silence is a legitimate answer here — a proposal may genuinely name no
      // source file — but only once something was read. With neither artefact
      // present the empty set is Stage 1's `touched_areas`, handed onward as
      // fact.
      const absent = missingArtefacts(dir, change, ["proposal.md", "tasks.md"]);
      if (absent !== null) {
        console.error(absent);
        return 1;
      }
      for (const path of touchedPaths(`${proposal}\n${tasks}`)) console.log(path);
      return 0;
    }
    case "depends-on": {
      // parseDependsOn("") is [], which the Stage 1 gate reads as "no
      // prerequisites" — the one answer that gate must never get wrong, since
      // it starts a change whose prerequisite has not landed. The resume path
      // re-runs this gate without re-running `show`, so `show`'s completeness
      // check does not cover it.
      const absent = missingArtefacts(dir, change, ["proposal.md"]);
      if (absent !== null) {
        console.error(absent);
        return 1;
      }
      for (const name of parseDependsOn(proposal)) console.log(name);
      return 0;
    }
    case "route": {
      // A change's own artefacts are part of what is under review at Stage 2,
      // and they are `openspec/` paths — so they earn the reviewer whose
      // subject is the prose invariants whether or not the proposal happens to
      // cite one. Without them a proposal that names no `openspec/` path
      // silently loses `architecture-reviewer`: a review stage that reports
      // success and did not happen. Measured on this repository's own corpus,
      // that is not hypothetical — three of seven live changes cite no source
      // file at all, and the ones that cite only bare kernel basenames name no
      // `openspec/` path either.
      //
      // Unioned here rather than composed by the caller. The alternative — two
      // routing calls the skill's prose tells a coordinator to combine — puts a
      // routing decision back in a model's hands, untested, at every future
      // call site. `route-paths` deliberately does NOT do this: it routes
      // exactly the paths it is given, which is what Stage 6 needs from a diff.
      //
      // That injection is also why this needs its own guard: with nothing to
      // read, the union still prints `architecture-reviewer` and
      // `rule-auditor`, a plausible reviewer set that has silently dropped
      // `checker-engineer` and `test-engineer` — a review stage that reports
      // success and did not happen.
      const absent = missingArtefacts(dir, change, ["proposal.md", "tasks.md"]);
      if (absent !== null) {
        console.error(absent);
        return 1;
      }
      const artefacts = ["proposal.md", "design.md", "tasks.md"].map(
        (file) => `openspec/changes/${change}/${file}`,
      );
      const paths = [...touchedPaths(`${proposal}\n${tasks}`), ...artefacts];
      for (const agent of routeAgents(paths)) console.log(agent);
      return 0;
    }
    case "state-get": {
      const state = readState(root, change);
      const key = rest[0];
      if (key === undefined) console.log(JSON.stringify(state, null, 2));
      else if (state[key] !== undefined) console.log(state[key]);
      return 0;
    }
    case "state-set": {
      const [key, value] = rest;
      if (key === undefined || value === undefined) {
        console.error("state-set needs <key> <value>");
        return 2;
      }
      writeStateKey(root, change, key, value);
      return 0;
    }
    case "state-reset": {
      const path = statePath(root, change);
      if (existsSync(path)) writeFileSync(path, "{}\n", "utf8");
      return 0;
    }
    case "evidence-append": {
      const heading = rest[0];
      if (heading === undefined) {
        console.error("evidence-append needs a heading");
        return 2;
      }
      // An unattended runner that blocks on a terminal read stops with no
      // error and no exit code, which is indistinguishable from work still
      // in progress. There is never any input coming on a TTY, so refuse
      // before the read rather than hang waiting for it.
      if (process.stdin.isTTY === true) {
        console.error(`pipeline ${command} reads its content on stdin`);
        return 2;
      }
      appendEvidence(root, change, heading, readInput());
      return 0;
    }
    case "evidence-print": {
      // Stage 8 seeds the pull request body from this. A run that resumed at
      // Stage 8, or whose `evidence-append` calls failed, would otherwise
      // print nothing, exit 0, and open a PR whose review-evidence and probe
      // sections are empty — the silent-success shape, this time aimed at a
      // human reviewer rather than at a later stage.
      const absent = missingArtefacts(dir, change, ["review-evidence.md"]);
      if (absent !== null) {
        console.error(absent);
        return 1;
      }
      process.stdout.write(readIfPresent(join(dir, "review-evidence.md")));
      return 0;
    }
    case "progress-write": {
      // See evidence-append above: a TTY never supplies piped input, so a
      // read here would hang rather than fail.
      if (process.stdin.isTTY === true) {
        console.error(`pipeline ${command} reads its content on stdin`);
        return 2;
      }
      writeFileSync(join(dir, "progress.md"), readInput(), "utf8");
      return 0;
    }
    case "dep-status": {
      // The archive check is the whole filesystem-answerable half. The PR half
      // needs a network call, so the skill runs `gh` and hands the result back
      // to `classify-compare` — the model performs the I/O, tested code
      // interprets it. Anything not provably satisfied exits 1.
      const archived = existsSync(join(root, "openspec", "changes", "archive", change));
      const state: DepState = archived ? "satisfied" : "unknown";
      console.log(state);
      return archived ? 0 : 1;
    }
    default: {
      console.error(`unknown subcommand: pipeline ${command}\n\n${PIPELINE_USAGE}`);
      return 2;
    }
  }
}
