import {
  parseSearchCommand,
  reachabilityPlan,
  type SearchPlan,
} from "./commandSafety";
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
  /**
   * Text exists in the file, but nowhere near the cited line. Passing: the
   * quote is distinctive enough to identify real code on its own, and a line
   * number that has moved is a fact about the repository, not about the author.
   */
  | "wrong-line"
  /**
   * The quote is BOTH non-distinctive and not where it was cited. Failing:
   * neither half of the citation pins anything down, so there is nothing left
   * that re-reading the file could contradict.
   */
  | "unpinned"
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
   * Whether a zero-result absence search is re-run with a match-anything
   * pattern, as a control on whether it examined anything. Default true.
   * See `reachabilityPlan`.
   */
  relaxedControl?: boolean;
}

const DEFAULT_DRIFT_WINDOW = 3;
const DEFAULT_MIN_ANCHOR_CHARS = 8;

/**
 * Passing verdicts.
 *
 * `drift` and `wrong-line` are here because a citation asserts two different
 * things on two different axes. "This text is in this file" is a claim about
 * the author: it can be fabricated, and once true it can never become false by
 * anyone else's edit. "It is on line N" is a claim about the repository, and it
 * goes stale every time someone inserts a line above it. Hard-failing the
 * second axis means a correct, honestly-written document turns red on an
 * unrelated refactor — which is what teaches a team to add `continue-on-error`
 * and stop reading the output.
 *
 * So fabrication stays a hard gate forever and position is advisory — but only
 * while the text half carries real information. A quote too short or too
 * repeated to identify a line is `unpinned` when it is not where it was cited,
 * and that fails: forgiving the line number for a quote that pins nothing is
 * how an anchor gets to assert nothing at all and still show green.
 */
const PASSING: ReadonlySet<Verdict> = new Set<Verdict>([
  "ok",
  "advisory",
  "weak-anchor",
  "drift",
  "wrong-line",
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
 * How a quoted line is compared to a source line.
 *
 * `substring` is what verifies a citation: quoting part of a line is normal and
 * legitimate. `exact` exists only to decide DISTINCTIVENESS, because substring
 * counting cannot tell "this quote is ambiguous" from "someone appended a
 * trailing comment to a copy of this line". A whole-line quote that appears
 * verbatim once is distinctive even when a longer line contains it too.
 */
type MatchMode = "substring" | "exact";

function lineMatches(line: string, quoted: string, mode: MatchMode): boolean {
  const target = normalize(quoted);
  const actual = normalize(line);
  // A blank quoted line asserts a blank source line. Without this, `includes`
  // on the empty string matches anything and a blank line in the quote would
  // silently accept any source line in its place.
  if (target.length === 0) return actual.length === 0;
  return mode === "exact" ? actual === target : actual.includes(target);
}

/**
 * Whether the cited block appears in `lines` starting at 1-based `start`. A
 * multi-line quote must match consecutively — that is what makes the block form
 * a stronger assertion than the inline one rather than a longer one.
 */
function matchesAt(
  lines: string[],
  start: number,
  block: string[],
  mode: MatchMode = "substring",
): boolean {
  if (start < 1) return false;
  for (let offset = 0; offset < block.length; offset += 1) {
    const line = lines[start - 1 + offset];
    const quoted = block[offset];
    if (line === undefined || quoted === undefined) return false;
    if (!lineMatches(line, quoted, mode)) return false;
  }
  return true;
}

/**
 * Where the block matches, in one pass. `count` saturates at 2 because every
 * caller only asks "nowhere, one place, or several?" — and this runs on every
 * presence claim, including large files with large blocks.
 */
interface MatchSurvey {
  count: 0 | 1 | 2;
  first: number | null;
}

function survey(lines: string[], block: string[], mode: MatchMode): MatchSurvey {
  let count: 0 | 1 | 2 = 0;
  let first: number | null = null;
  for (let start = 1; start <= lines.length; start += 1) {
    if (!matchesAt(lines, start, block, mode)) continue;
    if (first === null) first = start;
    count = count === 0 ? 1 : 2;
    if (count === 2) break;
  }
  return { count, first };
}

/**
 * How many places in the file the quote identifies.
 *
 * Exact whole-line matches win when there are any: a quote copied verbatim from
 * one line is pinned to that line even if some longer line happens to contain
 * it. Only when the quote never matches a line exactly — a fragment — does the
 * substring count decide.
 */
function locate(lines: string[], block: string[]): MatchSurvey {
  const exact = survey(lines, block, "exact");
  return exact.count > 0 ? exact : survey(lines, block, "substring");
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
  const quote = block.map(normalize).join(" ").trim();
  const where = locate(lines, block);

  // Two different questions, and conflating them was a bug. "Is this a GOOD
  // citation?" is about length, and the answer is advisory. "Is there anything
  // left to contradict if we forgive the line number?" is about whether the
  // text identifies ONE place — and only that one can justify failing, because
  // a short quote matching exactly one line still pins that line.
  const tooShort = quote.length < minAnchorChars;
  const ambiguous = where.count > 1;

  if (matchesAt(lines, claim.line, block)) {
    if (ambiguous) {
      return {
        claim,
        verdict: "weak-anchor",
        detail: `quote matches several lines in ${claim.path} — the line number is doing all the work; quote something distinctive`,
      };
    }
    if (tooShort) {
      return {
        claim,
        verdict: "weak-anchor",
        detail: `quote is ${quote.length} character(s) — quote enough of ${claim.path} to be wrong if the code changes`,
      };
    }
    return { claim, verdict: "ok", detail: "" };
  }

  // Below here the text is NOT at the cited line, so the line number can no
  // longer pin anything. An ambiguous quote has nothing left to stand on.
  if (ambiguous) {
    return {
      claim,
      verdict: "unpinned",
      detail: `quote matches several lines in ${claim.path} and is on none of them at line ${claim.line} — neither half of this citation identifies anything`,
    };
  }

  const stale = tooShort
    ? ` (and the quote is only ${quote.length} character(s) — worth quoting more)`
    : "";

  // Near miss — the file gained or lost a few lines since the doc was written.
  const lower = Math.max(1, claim.line - driftWindow);
  const upper = Math.min(lines.length, claim.line + driftWindow);
  for (let candidate = lower; candidate <= upper; candidate += 1) {
    if (matchesAt(lines, candidate, block)) {
      return {
        claim,
        verdict: "drift",
        detail: `text is on line ${candidate}, not ${claim.line} — update the citation${stale}`,
      };
    }
  }

  if (where.first !== null) {
    return {
      claim,
      verdict: "wrong-line",
      detail: `text is on line ${where.first}, not ${claim.line} — the quote still identifies real code, so this is stale rather than wrong; update the citation${stale}`,
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
  // control keeps the search's scope and asks only whether it examined any
  // content at all.
  if (relaxedControl && outcome.count === 0) {
    const control = reachabilityPlan(parsed.plan);
    if (control !== null) {
      const reached = deps.runSearch(control);
      if (reached.ok && reached.count === 0) {
        return {
          claim,
          verdict: "advisory",
          detail:
            "this search examined no content at all — the same command matching any line also returns zero, so the path, include filter, or glob is probably wrong rather than the code being absent",
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
