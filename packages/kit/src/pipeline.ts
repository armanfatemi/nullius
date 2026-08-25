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
 * Only the text before the em-dash is read. The template's own trailing
 * sentence contains the word "None", so a parser that scans the whole line
 * reports no dependencies for a proposal that has them — failing open on the
 * one gate whose whole job is to fail closed.
 */
export function parseDependsOn(proposal: string): string[] {
  for (const line of proposal.split("\n")) {
    const match = /^>\s*\*\*Depends on:\*\*\s*(.+)$/.exec(line);
    if (match === null) continue;
    const declared = (match[1] ?? "").split("—")[0] ?? "";
    if (/\bnone\b/i.test(declared)) return [];
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
