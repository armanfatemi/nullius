/**
 * `nullius witness validate --expect-rules` — did every rule `rules select`
 * named actually reach a delivered verdict in this journal?
 *
 * A separate, narrow question from `validateJournal`'s: that function asks
 * whether a journal is internally consistent, from its own bytes alone. This
 * asks whether the journal's content matches an EXTERNALLY-produced
 * expectation — the rule-id list `rules select` computed for this run, an
 * input no other journal check needs. See design.md Decision 1/2.
 *
 * The scan below is deliberately independent of `validateJournal`'s own
 * record-parsing pass (design.md Decision 3): it reads only `dispatch`
 * records' `task`/`id` fields and whichever kinds `witness.ts` exports as
 * `TERMINAL_RECORD_KINDS`, and ignores everything else a journal might carry.
 * A record this scan cannot parse (bad JSON, missing id, no `dispatch`
 * reference on a terminal) is skipped rather than trusted — it is not
 * silently promoted into a valid dispatch or terminal, so it can never make a
 * genuinely-silent rule look covered. `validateJournal` reports the same
 * malformed line on its own terms; this function has no verdict for that and
 * does not try to.
 *
 * "Reached a terminal record" is NOT "delivered a verdict" (design.md
 * Decision 5, the one thing three rounds of review converged on): a rule
 * counts as covered only when a matching dispatch's terminal has
 * `outcome: "found"` AND its `findings` excerpt contains one of the exact
 * strings `COMPLIANT`, `VIOLATION`, or `NOT-APPLICABLE` —
 * `buildComplianceBrief`'s own required vocabulary. `outcome: "empty"` or
 * `"no-report"` are both terminals, and both still produce `silent-rule`.
 */

import { TERMINAL_RECORD_KINDS } from "./witness";

export type RuleCoverageVerdict = "ok" | "silent-rule";

/**
 * No `line` field, unlike `JournalFinding` — a rule that never reached a
 * delivered verdict has no single journal line to point at; it is a claim
 * about the journal's content as a whole (design.md task 2.4).
 */
export interface RuleCoverageFinding {
  ruleId: string;
  verdict: RuleCoverageVerdict;
  detail: string;
}

const PASSING: ReadonlySet<RuleCoverageVerdict> = new Set<RuleCoverageVerdict>(["ok"]);

export function isRuleCoverageFailure(verdict: RuleCoverageVerdict): boolean {
  return !PASSING.has(verdict);
}

/**
 * `buildComplianceBrief`'s required read-receipt-then-verdict vocabulary.
 * Matched as a plain substring anywhere in the excerpt — the excerpt is
 * already capped at `EXCERPT_LIMIT` (2000 chars) by the producer
 * (packages/kit/src/record.ts), and the brief places the verdict well inside
 * the first ~500 characters of any realistic answer (design.md Decision 5,
 * task 4.5), so no truncation logic is needed here.
 */
const VERDICT_STRINGS = ["COMPLIANT", "VIOLATION", "NOT-APPLICABLE"] as const;

function isObject(value: unknown): value is { [key: string]: unknown } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

interface ScannedDispatch {
  id: string;
  task: string | null;
}

interface ScannedTerminal {
  outcome: string | null;
  /** The findings array's string entries, joined — "" when there were none. */
  excerpt: string;
}

interface Scan {
  dispatches: ScannedDispatch[];
  /** dispatch id -> every terminal record that named it. Usually one; more
   *  than one is itself a defect `validateJournal` reports separately, and
   *  this scan does not need to pick a winner — ANY covering terminal is
   *  enough (see `isCovered` below). */
  terminalsByDispatch: Map<string, ScannedTerminal[]>;
}

/**
 * The independent, minimal scan (design.md Decision 3). Parses only what
 * this check needs and skips — never guesses at — anything it cannot read.
 */
function scan(journalContent: string): Scan {
  const dispatches: ScannedDispatch[] = [];
  const terminalsByDispatch = new Map<string, ScannedTerminal[]>();
  const terminalKinds = new Set(TERMINAL_RECORD_KINDS);

  for (const rawLine of journalContent.split("\n")) {
    const line = rawLine.trim();
    if (line.length === 0) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      // Not this scan's business to report — validateJournal already does,
      // on the same line. A record it cannot parse is a record it cannot
      // treat as a valid dispatch or terminal, either.
      continue;
    }
    if (!isObject(parsed)) continue;

    const kind = parsed["kind"];

    if (kind === "dispatch") {
      const id = parsed["id"];
      if (!nonEmptyString(id)) continue; // no id, no valid dispatch
      const task = typeof parsed["task"] === "string" ? parsed["task"] : null;
      dispatches.push({ id, task });
      continue;
    }

    if (typeof kind === "string" && terminalKinds.has(kind)) {
      const dispatchRef = parsed["dispatch"];
      if (!nonEmptyString(dispatchRef)) continue; // no target, cannot terminate anything
      const outcome = typeof parsed["outcome"] === "string" ? parsed["outcome"] : null;
      const findings = parsed["findings"];
      const excerpt = Array.isArray(findings)
        ? findings.filter((entry): entry is string => typeof entry === "string").join("\n")
        : "";
      const existing = terminalsByDispatch.get(dispatchRef) ?? [];
      existing.push({ outcome, excerpt });
      terminalsByDispatch.set(dispatchRef, existing);
    }
  }

  return { dispatches, terminalsByDispatch };
}

function deliversVerdict(terminal: ScannedTerminal): boolean {
  if (terminal.outcome !== "found") return false;
  return VERDICT_STRINGS.some((verdict) => terminal.excerpt.includes(verdict));
}

/**
 * `checkRuleCoverage(journalContent, expectedRuleIds)` — pure, no fs/git
 * access (design.md Decision 2). The caller reads the journal and computes
 * `expectedRuleIds` (from `rules select`) itself.
 *
 * Matching convention (design.md's first open question, resolved here):
 * a dispatch matches a rule id by EXACT equality between its `task` field and
 * the rule id — `plugin/commands/comply.md`'s dispatch step (task 1.1) is
 * responsible for setting `description: <rule-id>` so that equality holds.
 *
 * Re-dispatch convention (design.md's second open question, resolved here):
 * a rule counts as covered if ANY dispatch whose task matches it reached a
 * delivered verdict — not "exactly one dispatch per rule id". A re-dispatch
 * after a timeout is a legitimate recovery path, not a defect (task 4.2).
 */
export function checkRuleCoverage(
  journalContent: string,
  expectedRuleIds: readonly string[],
): RuleCoverageFinding[] {
  const { dispatches, terminalsByDispatch } = scan(journalContent);
  const findings: RuleCoverageFinding[] = [];

  for (const ruleId of expectedRuleIds) {
    const matching = dispatches.filter((dispatch) => dispatch.task === ruleId);

    if (matching.length === 0) {
      findings.push({
        ruleId,
        verdict: "silent-rule",
        detail: `no dispatch in this journal has task "${ruleId}" — the rule was never dispatched`,
      });
      continue;
    }

    const terminals = matching.flatMap(
      (dispatch) => terminalsByDispatch.get(dispatch.id) ?? [],
    );

    if (terminals.some(deliversVerdict)) continue; // covered — implicitly ok, no finding

    if (terminals.length === 0) {
      findings.push({
        ruleId,
        verdict: "silent-rule",
        detail: `"${ruleId}" was dispatched but never reached a terminal (report) record — dispatched and never terminated`,
      });
      continue;
    }

    const collapsedOutcome = terminals.find(
      (terminal) => terminal.outcome === "empty" || terminal.outcome === "no-report",
    );
    if (collapsedOutcome !== undefined) {
      findings.push({
        ruleId,
        verdict: "silent-rule",
        detail:
          `"${ruleId}" reached a terminal record, but its outcome was "${collapsedOutcome.outcome}" — ` +
          "a subagent that ran and reported nothing is not a delivered verdict",
      });
      continue;
    }

    findings.push({
      ruleId,
      verdict: "silent-rule",
      detail:
        `"${ruleId}" reported "found" but its findings excerpt contains none of ${VERDICT_STRINGS.join(", ")} — ` +
        "a terminal record's mere existence is not the same as a delivered verdict",
    });
  }

  return findings;
}
