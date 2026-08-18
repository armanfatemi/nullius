import { parseSearchCommand, relaxPlan, type SearchPlan } from "./commandSafety";
import { type Claim } from "./parseClaims";
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
  /**
   * Verified, but the quote does not pin down a line — too short, or matching
   * several lines. The citation is true and nearly contentless. Advisory.
   */
  | "weak-anchor"
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
  | "malformed";

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
  /**
   * Runs a search that `commandSafety` has already validated. Takes a parsed
   * plan rather than a string so that no layer below this one is ever in a
   * position to hand a command line to a shell.
   */
  runSearch: (plan: SearchPlan) => SearchOutcome;
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
   * Shortest quote that counts as distinctive. Below this, a presence citation
   * passes as `weak-anchor` rather than `ok`. Default 8.
   */
  minAnchorChars?: number;
  /**
   * Whether a zero-result absence search is re-run with a broadened pattern as
   * a control. Default true. See `relaxPlan`.
   */
  relaxedControl?: boolean;
}

const DEFAULT_DRIFT_WINDOW = 3;
const DEFAULT_MIN_ANCHOR_CHARS = 8;

const PASSING: ReadonlySet<Verdict> = new Set<Verdict>([
  "ok",
  "advisory",
  "weak-anchor",
  "drift",
]);

export function isFailure(verdict: Verdict): boolean {
  return !PASSING.has(verdict);
}

/** Trim and collapse whitespace runs so indentation differences don't fail a citation. */
function normalize(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

/** The cited source lines of a presence claim, first line first. */
function citedBlock(claim: Extract<Claim, { kind: "presence" }>): string[] {
  return [claim.text, ...(claim.extraLines ?? [])];
}

/**
 * Whether the cited block appears in `lines` starting at 1-based `start`. A
 * multi-line quote must match consecutively — that is what makes the block form
 * a stronger assertion than the inline one rather than a longer one.
 */
function matchesAt(lines: string[], start: number, block: string[]): boolean {
  for (let offset = 0; offset < block.length; offset += 1) {
    const line = lines[start - 1 + offset];
    const quoted = block[offset];
    if (line === undefined || quoted === undefined) return false;
    if (!normalize(line).includes(normalize(quoted))) return false;
  }
  return true;
}

/** How many places in the file the block matches — 1 means it pins a line down. */
function countMatches(lines: string[], block: string[]): number {
  let matches = 0;
  for (let start = 1; start <= lines.length; start += 1) {
    if (matchesAt(lines, start, block)) matches += 1;
  }
  return matches;
}

function findBlock(lines: string[], block: string[]): number | null {
  for (let start = 1; start <= lines.length; start += 1) {
    if (matchesAt(lines, start, block)) return start;
  }
  return null;
}

function checkPresence(
  claim: Extract<Claim, { kind: "presence" }>,
  deps: CheckDeps,
  driftWindow: number,
  minAnchorChars: number,
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

  const block = citedBlock(claim);
  if (matchesAt(lines, claim.line, block)) {
    // The citation is true. Whether it is worth anything is a separate
    // question: matching is substring-based, so a one-character quote is
    // trivially verifiable and asserts nothing about the code. An anchor that
    // does not single out a line has not made the author look at one.
    const quote = block.map(normalize).join(" ").trim();
    if (quote.length < minAnchorChars) {
      return {
        claim,
        verdict: "weak-anchor",
        detail: `quote is ${quote.length} character(s) — too short to pin down a line; quote enough of ${claim.path} to be wrong if the code changes`,
      };
    }
    const matches = countMatches(lines, block);
    if (matches > 1) {
      return {
        claim,
        verdict: "weak-anchor",
        detail: `quote matches ${matches} lines in ${claim.path} — it does not identify line ${claim.line}; quote something distinctive`,
      };
    }
    return { claim, verdict: "ok", detail: "" };
  }

  // Near miss — the file gained or lost a few lines since the doc was written.
  const lower = Math.max(1, claim.line - driftWindow);
  const upper = Math.min(lines.length, claim.line + driftWindow);
  for (let candidate = lower; candidate <= upper; candidate += 1) {
    if (matchesAt(lines, candidate, block)) {
      return {
        claim,
        verdict: "drift",
        detail: `text is on line ${candidate}, not ${claim.line} — update the citation`,
      };
    }
  }

  const elsewhere = findBlock(lines, block);
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
  relaxedControl: boolean,
): ClaimResult {
  // Parsed, not merely pattern-matched: the result IS the argv the runner
  // executes, so an unvalidated command cannot reach a process.
  const parsed = parseSearchCommand(claim.command);
  if (!parsed.safe) {
    return {
      claim,
      verdict: "unsafe",
      detail: `not executed — ${parsed.reason}`,
    };
  }

  const outcome = deps.runSearch(parsed.plan);
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

  // A zero-result search proves nothing on its own — a search aimed at the
  // wrong directory returns zero just as convincingly as a true absence. The
  // relaxed control distinguishes "nothing there" from "not looking there".
  if (relaxedControl && outcome.count === 0) {
    const relaxed = relaxPlan(parsed.plan);
    if (relaxed !== null) {
      const control = deps.runSearch(relaxed);
      if (control.ok && control.count === 0) {
        const pattern = relaxed.segments[0]?.args[relaxed.segments[0].patternIndex ?? 0];
        return {
          claim,
          verdict: "advisory",
          detail: `the broadened control search (pattern '${pattern}') also found nothing — this search may be pointed at the wrong path, include filter, or regex dialect rather than at an absence`,
        };
      }
    }
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

export function checkClaims(
  claims: Claim[],
  deps: CheckDeps,
  options: CheckOptions = {},
): ClaimResult[] {
  const moments = options.moments ?? DEFAULT_BINDING_MOMENTS;
  const ciCaughtMoments = options.ciCaughtMoments ?? ["build-time"];
  const driftWindow = options.driftWindow ?? DEFAULT_DRIFT_WINDOW;
  const minAnchorChars = options.minAnchorChars ?? DEFAULT_MIN_ANCHOR_CHARS;
  const relaxedControl = options.relaxedControl ?? true;

  return claims.map((claim) => {
    switch (claim.kind) {
      case "presence":
        return checkPresence(claim, deps, driftWindow, minAnchorChars);
      case "absence":
        return checkAbsence(claim, deps, relaxedControl);
      case "moment":
        return checkMoment(claim, moments, ciCaughtMoments);
      case "malformed":
        return {
          claim,
          verdict: "malformed" as const,
          detail:
            "not a valid citation — expected `path:line` — `text`, or `command` → N results",
        };
    }
  });
}
