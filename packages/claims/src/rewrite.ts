/**
 * Plans the edits `--fix` and `--stamp` make to a document, without making
 * them. Pure: takes the document content the results were computed from and
 * returns new content plus a record of every marker it changed or declined to
 * change. The CLI owns the read and the single write per document.
 *
 * Two rules are load-bearing here, and both come from
 * `.claude/rules/never-repoint-under-old-stamp.md`:
 *
 * - Only an UNSTAMPED anchor is ever touched. A stamped anchor's `drift` or
 *   `wrong-line` may be the fail-open path speaking (its commit could not be
 *   read), and repointing its line under the old stamp turns an advisory
 *   result into `FABRICATED`. The only correct repair of a stamped anchor
 *   re-reads and re-stamps both halves — a human's job.
 * - Every line is re-parsed immediately before it is rewritten and must still
 *   carry the citation the result was computed from. If it does not, the
 *   result is reported as `marker-changed` and the line is left alone: the
 *   planner is acting on a line that is not the marker it thinks it is.
 *
 * A stamp is a claim about a commit, so the planner never decides to write
 * one on its own. It asks `intent.stamp.verify` — the caller's read of the
 * cited file AT that commit — and writes `@rev` only when the answer is `ok`
 * or `weak-anchor`. Any other answer is recorded verbatim as the skip reason.
 */

import type { ClaimResult } from "./checkClaims";
import {
  parsePresenceMarker,
  rewriteMarker,
  type PresenceClaim,
  type SourceLocation,
} from "./parseClaims";

/**
 * Decides whether an unstamped claim may be stamped with the intended rev.
 * `"ok"` and `"weak-anchor"` mean stamp; any other string is recorded as the
 * reason the claim was skipped (the CLI passes `verifyAtRev`'s outcomes:
 * `not-at-rev`, `rev-unreadable`).
 */
export type StampCheck = (claim: PresenceClaim) => string;

export interface RewriteIntent {
  /** Repoint `drift` / `wrong-line` results on unstamped anchors. */
  fix: boolean;
  /** Stamp verified unstamped anchors with `rev`, or null to leave them. */
  stamp: { rev: string; verify: StampCheck } | null;
}

export interface Rewrite {
  source: SourceLocation;
  kind: "fix" | "stamp";
  /** The marker line as it was before this rewrite. */
  before: string;
  /** The marker line as it reads after this rewrite. */
  after: string;
  /** The claim as the rewritten marker now states it (new line, or new rev). */
  claim: PresenceClaim;
}

export interface Skipped {
  source: SourceLocation;
  kind: "fix" | "stamp";
  /** `marker-changed`, or whatever `StampCheck` returned. */
  reason: string;
}

export interface RewritePlan {
  content: string;
  applied: Rewrite[];
  skipped: Skipped[];
}

const FIXABLE = new Set<ClaimResult["verdict"]>(["drift", "wrong-line"]);
const STAMPABLE = new Set<ClaimResult["verdict"]>(["ok", "weak-anchor"]);

/**
 * Whether the document line at `claim.source.line` still carries exactly the
 * citation `claim` was computed from. Both revs are compared in the parser's
 * normalised (lower-case) form.
 */
function carries(line: string | undefined, claim: PresenceClaim): boolean {
  if (line === undefined) return false;
  const marker = parsePresenceMarker(line);
  return (
    marker !== null &&
    marker.path === claim.path &&
    marker.line === claim.line &&
    marker.rev === claim.rev
  );
}

export function planRewrites(
  content: string,
  results: readonly ClaimResult[],
  intent: RewriteIntent,
): RewritePlan {
  // Split on "\n" only, so a "\r" stays on its line and is copied through by
  // the marker's trailing-whitespace match; a trailing "\n" survives as a
  // trailing empty element.
  const lines = content.split("\n");
  const applied: Rewrite[] = [];
  const skipped: Skipped[] = [];

  /** Claims the fix pass repointed, keyed by document line, at their new line. */
  const repointed = new Map<number, PresenceClaim>();

  const presenceResults = results.flatMap((result) =>
    result.claim.kind === "presence" ? [{ ...result, claim: result.claim }] : [],
  );

  if (intent.fix) {
    for (const result of presenceResults) {
      const { claim, foundLine } = result;
      if (!FIXABLE.has(result.verdict) || claim.rev !== undefined || foundLine === undefined) {
        continue;
      }
      const index = claim.source.line - 1;
      const before = lines[index];
      const after = before !== undefined && carries(before, claim)
        ? rewriteMarker(before, { line: foundLine })
        : null;
      if (before === undefined || after === null) {
        skipped.push({ source: claim.source, kind: "fix", reason: "marker-changed" });
        continue;
      }
      lines[index] = after;
      const moved: PresenceClaim = { ...claim, line: foundLine };
      applied.push({ source: claim.source, kind: "fix", before, after, claim: moved });
      repointed.set(claim.source.line, moved);
    }
  }

  if (intent.stamp !== null) {
    const { rev, verify } = intent.stamp;
    for (const result of presenceResults) {
      if (result.claim.rev !== undefined) continue;
      // A claim the fix pass just repointed is a candidate at its NEW line;
      // otherwise only a working-tree pass qualifies.
      const claim = repointed.get(result.claim.source.line) ??
        (STAMPABLE.has(result.verdict) ? result.claim : undefined);
      if (claim === undefined) continue;
      const index = claim.source.line - 1;
      const before = lines[index];
      if (before === undefined || !carries(before, claim)) {
        skipped.push({ source: claim.source, kind: "stamp", reason: "marker-changed" });
        continue;
      }
      const outcome = verify(claim);
      const after =
        outcome === "ok" || outcome === "weak-anchor" ? rewriteMarker(before, { rev }) : null;
      if (after === null) {
        skipped.push({ source: claim.source, kind: "stamp", reason: outcome });
        continue;
      }
      lines[index] = after;
      applied.push({
        source: claim.source,
        kind: "stamp",
        before,
        after,
        claim: { ...claim, rev },
      });
    }
  }

  return { content: lines.join("\n"), applied, skipped };
}
