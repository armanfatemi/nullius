import { isSafeSearchCommand } from "./commandSafety";
import {
  type Claim,
  type DispatchClaim,
  type LedgerClaim,
  type LedgerDelivery,
} from "./parseClaims";
import { isSafeRepoPath } from "./pathSafety";

/**
 * The default closed list of binding moments — the six ways two versions of a
 * replicated service system meet at runtime. See spec/binding-moments.md.
 * Projects on a different platform (mobile, embedded, desktop) should define
 * their own list via `CheckOptions.moments`.
 */
export const DEFAULT_BINDING_MOMENTS = [
  "build-time",
  "rollout-window",
  "inter-service-skew",
  "event-consumption",
  "replay-migration",
  "data-at-rest",
] as const;

export type Verdict =
  /** Claim verified exactly as written. */
  | "ok"
  /** Verified, but worth a human glance (see detail). Does not fail the run. */
  | "advisory"
  /** Text found within a few lines of the cited one — the file moved under the doc. */
  | "drift"
  /** Text exists in the file, but nowhere near the cited line. */
  | "wrong-line"
  /** Text does not appear in the file at all. */
  | "fabricated"
  | "missing-file"
  | "count-mismatch"
  /** The cited path escaped the repo (absolute, traversal, or home-relative). */
  | "unsafe-path"
  | "unsafe"
  | "command-error"
  | "unknown-moment"
  | "malformed"
  /** A declared review dispatch with no delivery entry — silence, made loud. */
  | "undelivered"
  /** A delivery entry with no outcome. Writing `None` is valid; writing nothing is not. */
  | "empty-delivery"
  /** Delivered but never declared. Passes — extra coverage, surfaced. */
  | "undeclared"
  /** An `**Expected:**` name outside the configured reviewer vocabulary. */
  | "unknown-reviewer"
  /** The document still contains a registered, uncleared canary. */
  | "canary-present";

export interface ClaimResult {
  claim: Claim;
  verdict: Verdict;
  detail: string;
}

export type SearchOutcome =
  | { ok: true; count: number }
  | { ok: false; error: string };

export interface CheckDeps {
  /** Returns the file's lines, or null when the file does not exist. */
  readFileLines: (path: string) => string[] | null;
  runSearch: (command: string) => SearchOutcome;
}

export interface CheckOptions {
  /** The project's closed list of binding moments. Defaults to the six for replicated services. */
  moments?: readonly string[];
  /**
   * Moments that a CI pipeline already catches — claims binding at one of
   * these pass with an `advisory` verdict prompting the author to reframe the
   * "risk" as a non-risk. Defaults to `['build-time']`.
   */
  ciCaughtMoments?: readonly string[];
  /** How far from the cited line we still call it drift rather than a wrong line. Default 3. */
  driftWindow?: number;
  /**
   * The project's closed reviewer vocabulary for `**Expected:**` names.
   * When unset, names are free-form — zero-config adoption first.
   */
  reviewers?: readonly string[];
}

const DEFAULT_DRIFT_WINDOW = 3;

const PASSING: ReadonlySet<Verdict> = new Set<Verdict>([
  "ok",
  "advisory",
  "drift",
  "undeclared",
]);

export function isFailure(verdict: Verdict): boolean {
  return !PASSING.has(verdict);
}

/** Trim and collapse whitespace runs so indentation differences don't fail a citation. */
function normalize(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function findLine(lines: string[], needle: string): number | null {
  const target = normalize(needle);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line !== undefined && normalize(line).includes(target)) {
      return index + 1;
    }
  }
  return null;
}

function checkPresence(
  claim: Extract<Claim, { kind: "presence" }>,
  deps: CheckDeps,
  driftWindow: number,
): ClaimResult {
  // Checked BEFORE any filesystem access: the path comes from PR-controlled
  // document content (see pathSafety.ts).
  const pathVerdict = isSafeRepoPath(claim.path);
  if (!pathVerdict.safe) {
    return {
      claim,
      verdict: "unsafe-path",
      detail: `not read — ${pathVerdict.reason}`,
    };
  }

  const lines = deps.readFileLines(claim.path);
  if (lines === null) {
    return {
      claim,
      verdict: "missing-file",
      detail: `no such file: ${claim.path}`,
    };
  }

  const cited = lines[claim.line - 1];
  if (cited !== undefined && normalize(cited).includes(normalize(claim.text))) {
    return { claim, verdict: "ok", detail: "" };
  }

  // Near miss — the file gained or lost a few lines since the doc was written.
  const lower = Math.max(1, claim.line - driftWindow);
  const upper = Math.min(lines.length, claim.line + driftWindow);
  for (let candidate = lower; candidate <= upper; candidate += 1) {
    const line = lines[candidate - 1];
    if (line !== undefined && normalize(line).includes(normalize(claim.text))) {
      return {
        claim,
        verdict: "drift",
        detail: `text is on line ${candidate}, not ${claim.line} — update the citation`,
      };
    }
  }

  const elsewhere = findLine(lines, claim.text);
  if (elsewhere !== null) {
    return {
      claim,
      verdict: "wrong-line",
      detail: `text appears on line ${elsewhere}, not ${claim.line}`,
    };
  }

  return {
    claim,
    verdict: "fabricated",
    detail: `text does not appear anywhere in ${claim.path}`,
  };
}

function checkAbsence(
  claim: Extract<Claim, { kind: "absence" }>,
  deps: CheckDeps,
): ClaimResult {
  const safety = isSafeSearchCommand(claim.command);
  if (!safety.safe) {
    return {
      claim,
      verdict: "unsafe",
      detail: `not executed — ${safety.reason}`,
    };
  }

  const outcome = deps.runSearch(claim.command);
  if (!outcome.ok) {
    return { claim, verdict: "command-error", detail: outcome.error };
  }

  if (outcome.count !== claim.expectedCount) {
    return {
      claim,
      verdict: "count-mismatch",
      detail: `claimed ${claim.expectedCount}, actual ${outcome.count}`,
    };
  }

  return { claim, verdict: "ok", detail: "" };
}

function checkMoment(
  claim: Extract<Claim, { kind: "moment" }>,
  moments: readonly string[],
  ciCaughtMoments: readonly string[],
): ClaimResult {
  if (!moments.some((moment) => moment === claim.moment)) {
    return {
      claim,
      verdict: "unknown-moment",
      detail: `'${claim.moment}' is not a binding moment; use one of: ${moments.join(", ")}`,
    };
  }

  if (ciCaughtMoments.some((moment) => moment === claim.moment)) {
    return {
      claim,
      verdict: "advisory",
      detail: `'${claim.moment}' is caught by CI — confirm this is documented as a non-risk rather than presented as a runtime risk`,
    };
  }

  return { claim, verdict: "ok", detail: "" };
}

/** Classic edit distance, used only to make a typo'd reviewer name explain itself. */
function editDistance(a: string, b: string): number {
  const row: number[] = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = row[0] ?? 0;
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const above = row[j] ?? 0;
      row[j] = Math.min(
        above + 1,
        (row[j - 1] ?? 0) + 1,
        diagonal + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      diagonal = above;
    }
  }
  return row[b.length] ?? 0;
}

function checkDelivery(
  claim: DispatchClaim,
  entry: LedgerDelivery,
  deps: CheckDeps,
): ClaimResult {
  if (entry.outcome.length === 0) {
    return {
      claim,
      verdict: "empty-delivery",
      detail:
        "entry has no outcome — state findings or the literal `None` (an explicit None is a claim; an omission is nothing at all)",
    };
  }

  if (entry.findingsPath !== undefined) {
    const pathVerdict = isSafeRepoPath(entry.findingsPath);
    if (!pathVerdict.safe) {
      return {
        claim,
        verdict: "unsafe-path",
        detail: `findings path not read — ${pathVerdict.reason}`,
      };
    }
    if (deps.readFileLines(entry.findingsPath) === null) {
      return {
        claim,
        verdict: "missing-file",
        detail: `no such findings file: ${entry.findingsPath}`,
      };
    }
  }

  return { claim, verdict: "ok", detail: "" };
}

function checkLedger(
  ledger: LedgerClaim,
  deps: CheckDeps,
  reviewers: readonly string[] | undefined,
): ClaimResult[] {
  const results: ClaimResult[] = [];
  const pools = new Map<string, LedgerDelivery[]>();
  for (const entry of ledger.delivered) {
    const pool = pools.get(entry.name) ?? [];
    pool.push(entry);
    pools.set(entry.name, pool);
  }

  // Expected occurrences consume delivery entries by name, in order — counted
  // multiplicity, so 2-of-3 deliveries of a repeated dispatch stays visible.
  const consumed = new Map<string, number>();
  for (const expected of ledger.expected) {
    const claim: DispatchClaim = {
      kind: "dispatch",
      name: expected.name,
      source: expected.source,
    };
    const pool = pools.get(expected.name) ?? [];
    const used = consumed.get(expected.name) ?? 0;

    if (reviewers !== undefined && !reviewers.includes(expected.name)) {
      if (used < pool.length) consumed.set(expected.name, used + 1);
      results.push({
        claim,
        verdict: "unknown-reviewer",
        detail: `'${expected.name}' is not in the reviewer vocabulary; use one of: ${reviewers.join(", ")}`,
      });
      continue;
    }

    const entry = pool[used];
    if (entry !== undefined) {
      consumed.set(expected.name, used + 1);
      results.push(checkDelivery(claim, entry, deps));
      continue;
    }

    let detail = `declared and silent — no delivery entry for '${expected.name}'`;
    const candidate = ledger.delivered.find(
      (delivery) =>
        delivery.name !== expected.name &&
        editDistance(delivery.name, expected.name) <= 2,
    );
    if (candidate !== undefined) {
      detail += `; did you mean '${candidate.name}' (delivered)?`;
    }
    results.push({ claim, verdict: "undelivered", detail });
  }

  for (const entry of ledger.delivered) {
    const pool = pools.get(entry.name) ?? [];
    if (pool.indexOf(entry) < (consumed.get(entry.name) ?? 0)) continue;
    results.push({
      claim: { kind: "dispatch", name: entry.name, source: entry.source },
      verdict: "undeclared",
      detail: "delivered but never declared — nobody was waiting on this report",
    });
  }

  return results;
}

export function checkClaims(
  claims: Claim[],
  deps: CheckDeps,
  options: CheckOptions = {},
): ClaimResult[] {
  const moments = options.moments ?? DEFAULT_BINDING_MOMENTS;
  const ciCaughtMoments = options.ciCaughtMoments ?? ["build-time"];
  const driftWindow = options.driftWindow ?? DEFAULT_DRIFT_WINDOW;

  return claims.flatMap((claim): ClaimResult[] => {
    switch (claim.kind) {
      case "presence":
        return [checkPresence(claim, deps, driftWindow)];
      case "absence":
        return [checkAbsence(claim, deps)];
      case "moment":
        return [checkMoment(claim, moments, ciCaughtMoments)];
      case "ledger":
        return checkLedger(claim, deps, options.reviewers);
      case "dispatch":
      case "canary":
        // Produced by ledger expansion / the merge guard, never parsed —
        // reaching here is a bug.
        return [
          {
            claim,
            verdict: "malformed",
            detail: "internal: dispatch and canary claims are produced, not checked",
          },
        ];
      case "malformed":
        return [
          {
            claim,
            verdict: "malformed" as const,
            detail:
              claim.expected ??
              "not a valid citation — expected `path:line` — `text`, or `command` → N results",
          },
        ];
    }
  });
}
