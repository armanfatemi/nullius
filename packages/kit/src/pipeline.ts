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

/** A dependency's state as the Stage 1 gate sees it. */
export type DepState = "satisfied" | "unsatisfied" | "orphaned" | "unknown";

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

const ARCHITECTURE_PATHS: readonly RegExp[] = [
  /^spec\/[^/]+\.md$/,
  /^CLAUDE\.md$/,
  /^README\.md$/,
  /^openspec\//,
];

const TEST_PATHS: readonly RegExp[] = [
  /^packages\/(?:claims|kit)\/src\/.+\.ts$/,
  /^spec\/fixtures\//,
  /^\.github\/workflows\/.+\.ya?ml$/,
];

/** Backticked repo-relative paths with a known extension. Prose in backticks
 *  — a type name, a function — carries no extension and is not a path. */
const PATH_TOKEN = /`([A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)+\.(?:ts|md|json|jsonl|ya?ml|sh))`/g;

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
    if (KERNEL_MODULES.includes(path)) agents.add("checker-engineer");
    if (ARCHITECTURE_PATHS.some((pattern) => pattern.test(path))) agents.add("architecture-reviewer");
    if (TEST_PATHS.some((pattern) => pattern.test(path))) agents.add("test-engineer");
  }
  return [...agents].sort();
}
