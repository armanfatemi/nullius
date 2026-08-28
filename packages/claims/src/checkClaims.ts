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
  /**
   * Rev-stamped anchor: the quote was verified at the commit it names, and the
   * working tree has since moved away from it. Advisory, permanently — drift
   * is a fact about the repository, and the gate already passed on the axis
   * that cannot rot.
   */
  | "stale"
  /**
   * Rev-stamped anchor whose commit cannot be resolved: a shallow clone, a
   * squash-merge that discarded the SHA, or a fork without the history. Fails
   * OPEN — a rev the checker cannot read is not evidence against the author,
   * and treating it as one rebuilds the treadmill from the other direction.
   */
  | "unverifiable-rev"
  /** The cited file did not exist at the stamped commit. */
  | "missing-file-at-rev"
  | "missing-file"
  | "count-mismatch"
  /** The cited path escaped the repo (absolute, traversal, or home-relative). */
  | "unsafe-path"
  | "unsafe"
  | "command-error"
  | "unknown-moment"
  | "malformed"
  /** The document still contains a registered, uncleared canary. */
  | "canary-present";

export interface ClaimResult {
  claim: Claim;
  verdict: Verdict;
  detail: string;
  /**
   * The 1-based line `locate` identified as the quote's unique match, set on
   * `drift` and `wrong-line` only — the two verdicts where the text is real
   * but the cited line is not where it is — and only on UNSTAMPED results.
   * The stamped path never carries it, including its fail-open branch: that
   * branch may borrow the working-tree verdict when the commit cannot be
   * read, but a stamped anchor never carries a line `--fix` could act on.
   */
  foundLine?: number;
}

export type SearchOutcome =
  | { ok: true; count: number }
  | { ok: false; error: string };

/**
 * The result of reading a cited file as it stood at an anchor's stamped
 * revision.
 *
 * `unknown-rev` and `unavailable` are kept apart from `no-file` deliberately.
 * A commit that cannot be resolved is not evidence about anything — it is a
 * shallow clone, a squash-merge that discarded the SHA, or a fork without the
 * history — and the checker fails open there. A file that genuinely did not
 * exist in a commit that DID resolve is a fact about the author.
 */
export type RevRead =
  | { status: "ok"; lines: string[] }
  | { status: "no-file" }
  | { status: "unknown-rev" }
  | { status: "unavailable"; reason: string };

export interface CheckDeps {
  /** Returns the file's lines, or null when the file does not exist. */
  readFileLines: (path: string) => string[] | null;
  /**
   * Returns the file's lines as of a commit, for `path:line@rev` anchors.
   * Optional: a caller with no git available simply gets the fail-open
   * `unverifiable-rev` path.
   */
  readFileAtRev?: (path: string, rev: string) => RevRead;
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
 *
 * `stale` and `unverifiable-rev` belong to `path:line@rev` anchors, where the
 * two axes are checked against two different snapshots rather than being
 * disentangled from one. See `checkStamped`.
 */
const PASSING: ReadonlySet<Verdict> = new Set<Verdict>([
  "ok",
  "advisory",
  "weak-anchor",
  "drift",
  "wrong-line",
  "stale",
  "unverifiable-rev",
]);

export function isFailure(verdict: Verdict): boolean {
  return !PASSING.has(verdict);
}

/**
 * Trim and collapse whitespace runs so indentation differences don't fail a
 * citation. Exported because canary verify is contractually pinned to the
 * checker's normalization (spec/canary.md) — one copy, not two.
 */
export function normalize(value: string): string {
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

/**
 * Verdict of the whole citation against ONE snapshot of the file. Used twice
 * per rev-stamped anchor: once against the commit the anchor names (the gate)
 * and once against the working tree (the rot check).
 */
function evaluateAgainst(
  lines: string[],
  claim: Extract<Claim, { kind: "presence" }>,
  driftWindow: number,
  minAnchorChars: number,
): { verdict: Verdict; detail: string; foundLine?: number } {
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
        verdict: "weak-anchor",
        detail: `quote matches several lines in ${claim.path} — the line number is doing all the work; quote something distinctive`,
      };
    }
    if (tooShort) {
      return {
        verdict: "weak-anchor",
        detail: `quote is ${quote.length} character(s) — quote enough of ${claim.path} to be wrong if the code changes`,
      };
    }
    return { verdict: "ok", detail: "" };
  }

  // Below here the text is NOT at the cited line, so the line number can no
  // longer pin anything. An ambiguous quote has nothing left to stand on.
  if (ambiguous) {
    return {
      verdict: "unpinned",
      detail: `quote matches several lines in ${claim.path} and is on none of them at line ${claim.line} — neither half of this citation identifies anything`,
    };
  }

  const stale = tooShort
    ? ` (and the quote is only ${quote.length} character(s) — worth quoting more)`
    : "";

  // The quote identifies exactly one place, and it is not the cited line. Both
  // verdicts below are measured from the line `locate` pinned — the
  // exact-preferred unique match — so the verdict and the number a fixer would
  // move to can never disagree. A separate window scan by substring could name
  // a longer line that merely CONTAINS the quote while the uniqueness survey
  // pointed elsewhere.
  if (where.first !== null) {
    // Near miss — the file gained or lost a few lines since the doc was written.
    if (Math.abs(where.first - claim.line) <= driftWindow) {
      return {
        verdict: "drift",
        detail: `text is on line ${where.first}, not ${claim.line} — update the citation${stale}`,
        foundLine: where.first,
      };
    }
    return {
      verdict: "wrong-line",
      detail: `text is on line ${where.first}, not ${claim.line} — the quote still identifies real code, so this is stale rather than wrong; update the citation${stale}`,
      foundLine: where.first,
    };
  }

  return {
    verdict: "fabricated",
    detail: `text does not appear anywhere in ${claim.path}`,
  };
}

/**
 * A rev-stamped anchor, checked on both of its axes.
 *
 * The two propositions a citation makes are checked against two different
 * snapshots, and only one of them can fail:
 *
 *  - **"This was true at `<rev>`"** — checked against `git show <rev>:<path>`.
 *    A commit is immutable, so this answer never changes: an anchor that
 *    passes here passes forever, and one that fails here was false when it was
 *    written. This is the gate.
 *  - **"It is still true"** — checked against the working tree. This one can
 *    change through nobody's fault, so it is advisory (`stale`) by
 *    construction. Nothing anyone does to the repository later can turn a
 *    document red.
 *
 * That split is the whole point of the `@rev` suffix. Without it the checker
 * has only the working tree, and so has to choose between failing honest
 * documents on refactors and forgiving fabrication — the choice that gets
 * `continue-on-error` added to the workflow.
 */
function checkStamped(
  claim: Extract<Claim, { kind: "presence" }>,
  rev: string,
  deps: CheckDeps,
  driftWindow: number,
  minAnchorChars: number,
): ClaimResult {
  const readAtRev = deps.readFileAtRev;
  const atRev = readAtRev?.(claim.path, rev) ?? {
    status: "unavailable" as const,
    reason: "this checker was built without git access",
  };

  if (atRev.status === "no-file") {
    return {
      claim,
      verdict: "missing-file-at-rev",
      detail: `${claim.path} did not exist at ${rev} — a commit cannot change, so this citation was never true`,
    };
  }

  if (atRev.status !== "ok") {
    // Fail OPEN on the rev axis. The commit may be gone because the PR was
    // squash-merged, because the clone is shallow, or because this is a fork —
    // none of which is evidence about the author. The working tree still gets
    // checked, and only its FAILING verdicts are softened: a checker that
    // cannot read the history it was pointed at does not get to call anyone a
    // fabricator.
    const fallback = checkUnstamped(claim, deps, driftWindow, minAnchorChars);
    if (!isFailure(fallback.verdict)) {
      // The verdict is borrowed; the repoint target is not. A stamped anchor
      // never carries `foundLine`, even when the commit could not be read —
      // `--fix` must have nothing to act on under an old stamp.
      return { claim, verdict: fallback.verdict, detail: fallback.detail };
    }
    const why =
      atRev.status === "unknown-rev"
        ? `commit ${rev} is not in this clone`
        : atRev.reason;
    return {
      claim,
      verdict: "unverifiable-rev",
      detail: `${fallback.detail} — and ${why}, so this could not be settled against the commit it names (a shallow clone cannot check history: fetch the full one, e.g. actions/checkout with fetch-depth: 0)`,
    };
  }

  const gate = evaluateAgainst(atRev.lines, claim, driftWindow, minAnchorChars);

  if (gate.verdict === "fabricated") {
    return {
      claim,
      verdict: "fabricated",
      detail: `text does not appear anywhere in ${claim.path} as of ${rev} — that commit is immutable, so no later edit can explain this`,
    };
  }
  if (gate.verdict === "unpinned") {
    return { claim, verdict: "unpinned", detail: gate.detail };
  }

  // The gate has passed: the quote WAS in that file at that commit. Everything
  // below is about the repository since, and none of it can fail.
  const mispositioned = gate.verdict === "drift" || gate.verdict === "wrong-line";

  const current = deps.readFileLines(claim.path);
  if (current === null) {
    return {
      claim,
      verdict: "stale",
      detail: `verified at ${rev}; ${claim.path} no longer exists in the working tree`,
    };
  }

  const now = evaluateAgainst(current, claim, driftWindow, minAnchorChars);

  if (mispositioned) {
    // Worth saying out loud, because it is the one thing a stamped anchor can
    // get wrong at authoring time without lying: the quote was real, the line
    // number was not.
    return {
      claim,
      verdict: "advisory",
      detail: `verified at ${rev}, but the line number was already wrong there — ${gate.detail}`,
    };
  }

  if (now.verdict === "ok") return { claim, verdict: "ok", detail: "" };
  if (now.verdict === "weak-anchor" || gate.verdict === "weak-anchor") {
    return { claim, verdict: "weak-anchor", detail: gate.detail || now.detail };
  }
  if (now.verdict === "fabricated") {
    return {
      claim,
      verdict: "stale",
      detail: `verified at ${rev}; that text is no longer in ${claim.path} — the code moved on, so re-read it before relying on this claim`,
    };
  }
  return {
    claim,
    verdict: "stale",
    detail: `verified at ${rev}; ${now.detail}`,
  };
}

/** An anchor with no `@rev`: one snapshot, today's semantics. */
function checkUnstamped(
  claim: Extract<Claim, { kind: "presence" }>,
  deps: CheckDeps,
  driftWindow: number,
  minAnchorChars: number,
): ClaimResult {
  const lines = deps.readFileLines(claim.path);
  if (lines === null) {
    return {
      claim,
      verdict: "missing-file",
      detail: `no such file: ${claim.path}`,
    };
  }
  const { verdict, detail, foundLine } = evaluateAgainst(
    lines,
    claim,
    driftWindow,
    minAnchorChars,
  );
  // Explicit field list, never a spread: `foundLine` is added as a key only
  // when it exists. The stamped path strips it again on its fail-open branch.
  return foundLine === undefined
    ? { claim, verdict, detail }
    : { claim, verdict, detail, foundLine };
}

function checkPresence(
  claim: Extract<Claim, { kind: "presence" }>,
  deps: CheckDeps,
  driftWindow: number,
  minAnchorChars: number,
): ClaimResult {
  // Checked BEFORE any filesystem access: the path comes from PR-controlled
  // document content (see pathSafety.ts). It gates the git read too — a
  // `git show <rev>:../../etc/passwd` is the same oracle by another route.
  const pathVerdict = isSafeRepoPath(claim.path);
  if (!pathVerdict.safe) {
    return {
      claim,
      verdict: "unsafe-path",
      detail: `not read — ${pathVerdict.reason}`,
    };
  }

  return claim.rev === undefined
    ? checkUnstamped(claim, deps, driftWindow, minAnchorChars)
    : checkStamped(claim, claim.rev, deps, driftWindow, minAnchorChars);
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

/**
 * Whether an anchor holds at a named commit — the gate `--stamp` writes behind.
 * NOT a `Verdict`: it has no PASSING set and is never rendered as a result.
 * `ok`/`weak-anchor` are the same evaluation outcomes `evaluateAgainst` gives on
 * the lines actually read at `rev`; `not-at-rev` is any other outcome on those
 * lines; `rev-unreadable` means the file could not be read at `rev` at all —
 * no reader, unknown rev, unavailable git, or the file absent at that commit —
 * and says nothing about the claim either way.
 */
export type RevVerification = "ok" | "weak-anchor" | "not-at-rev" | "rev-unreadable";

/**
 * Evaluates `claim` against the file as it stood at `rev`, and ONLY that.
 *
 * `claim.rev`, if set, is ignored: the question is about the commit passed
 * in. The working tree is never consulted, so no answer here can be a
 * working-tree `ok` wearing a commit's name — the read status is the gate,
 * and a read that is anything but `ok` is `rev-unreadable`. The same
 * `CheckOptions` as `checkClaims` resolve `driftWindow`/`minAnchorChars`
 * identically, so `ok`/`weak-anchor` here means what it means there.
 */
export function verifyAtRev(
  claim: Extract<Claim, { kind: "presence" }>,
  rev: string,
  deps: CheckDeps,
  options: CheckOptions = {},
): RevVerification {
  const { driftWindow, minAnchorChars } = presenceThresholds(options);
  // Same gate as `checkPresence`: the path comes from document content and
  // must not reach `git show` unchecked.
  if (!isSafeRepoPath(claim.path).safe) return "rev-unreadable";
  const readAtRev = deps.readFileAtRev;
  if (readAtRev === undefined) return "rev-unreadable";
  const atRev = readAtRev(claim.path, rev);
  if (atRev.status !== "ok") return "rev-unreadable";

  const { verdict } = evaluateAgainst(atRev.lines, claim, driftWindow, minAnchorChars);
  return verdict === "ok" || verdict === "weak-anchor" ? verdict : "not-at-rev";
}

/** The two presence thresholds, resolved from options the one way both callers share. */
function presenceThresholds(options: CheckOptions): { driftWindow: number; minAnchorChars: number } {
  return {
    driftWindow: options.driftWindow ?? DEFAULT_DRIFT_WINDOW,
    minAnchorChars: options.minAnchorChars ?? DEFAULT_MIN_ANCHOR_CHARS,
  };
}

export function checkClaims(
  claims: Claim[],
  deps: CheckDeps,
  options: CheckOptions = {},
): ClaimResult[] {
  const moments = options.moments ?? DEFAULT_BINDING_MOMENTS;
  const ciCaughtMoments = options.ciCaughtMoments ?? ["build-time"];
  const { driftWindow, minAnchorChars } = presenceThresholds(options);
  const relaxedControl = options.relaxedControl ?? true;

  return claims.map((claim) => {
    switch (claim.kind) {
      case "presence":
        return checkPresence(claim, deps, driftWindow, minAnchorChars);
      case "absence":
        return checkAbsence(claim, deps, relaxedControl);
      case "moment":
        return checkMoment(claim, moments, ciCaughtMoments);
      case "canary":
        // Produced by the merge guard, never parsed — reaching here is a bug.
        return {
          claim,
          verdict: "malformed" as const,
          detail: "internal: canary claims are produced, not checked",
        };
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
