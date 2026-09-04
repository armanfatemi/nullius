/**
 * The collected result of a `check` run, and the renderers that read it.
 *
 * `check` used to compute its failure count while printing — `report()` both
 * wrote a result's line and counted it — so a second output format would have
 * had to re-derive the exit code or fork the printer. The split here is the
 * one Decision 5 of `add-authoring-ergonomics` names: the CLI COLLECTS one
 * structure per document (claims, results, the canary guard, the rewrite
 * plan), `summarize` derives every count from that structure, and both the
 * human renderer and `renderJson` read the same `CheckRun`. The exit code is
 * computed once, by `exitCode`, independent of which renderer ran.
 *
 * Everything in this module is pure: no I/O, no `console`, no `process`.
 * `cli.ts` ends in `process.exit(main())` and so cannot be imported by a
 * test; the pieces worth unit-testing live here instead.
 */

import { isFailure, type ClaimResult, type Verdict } from "./checkClaims";
import type { Claim, PresenceClaim } from "./parseClaims";
import { escapeCell } from "./markdown";
import type { Rewrite, RewritePlan, Skipped } from "./rewrite";

/** One matched document, as `check` read and verified it. */
export interface CheckedDocument {
  doc: string;
  /** Line count of the document as read — the denominator for anchor density. */
  lines: number;
  claims: Claim[];
  /** Results for the parsed claims ONLY. The guard is kept apart, below. */
  results: ClaimResult[];
  /**
   * The CANARY-PRESENT merge guard, when the registered canary was found in
   * this document and the run was not `--probing`. Not a grounding marker: it
   * counts towards failures but never towards density or the marker floor.
   */
  guard: ClaimResult | null;
  /** What `--fix` / `--stamp` changed or declined to change; null when neither ran. */
  plan: RewritePlan | null;
}

export interface UnanchoredDocument {
  doc: string;
  lines: number;
}

/** Everything a renderer needs, and everything the exit code is computed from. */
export interface CheckRun {
  documents: CheckedDocument[];
  /** Documents whose PARSED results are empty — a guard alone does not anchor a document. */
  unanchored: UnanchoredDocument[];
  /** Grounding markers checked across all documents (parsed results, not guards). */
  checked: number;
  presenceAnchors: number;
  absenceAnchors: number;
  /** Failing results — parsed and guard — decided by `isFailure`, never by naming verdicts. */
  failures: number;
  /** `--require-markers` was set and at least one document carried no marker. */
  markerFloorFailed: boolean;
  guardFired: boolean;
  /**
   * The funnel command (`nullius audit <doc> --propose`) when the run matched
   * documents but found no grounding markers; null otherwise. Both renderers
   * carry it — the human closing line and `summary.next` are the same string.
   */
  next: string | null;
}

/** The parsed results plus the guard, in the order the human renderer prints them. */
export function allResults(document: CheckedDocument): ClaimResult[] {
  return document.guard === null ? document.results : [document.guard, ...document.results];
}

export function countFailures(results: readonly ClaimResult[]): number {
  return results.filter((result) => isFailure(result.verdict)).length;
}

/**
 * Derives every count from the collected documents. Pure, so a fixed result
 * set can pin the failure count and the marker-floor flag without spawning.
 */
export function summarize(documents: CheckedDocument[], requireMarkers: boolean): CheckRun {
  const unanchored: UnanchoredDocument[] = [];
  let checked = 0;
  let presenceAnchors = 0;
  let absenceAnchors = 0;
  let failures = 0;
  let guardFired = false;

  for (const document of documents) {
    // The guard is not a grounding marker: density reports what the AUTHOR
    // anchored, so a canary must not lift a document off the no-anchors list.
    if (document.results.length === 0) {
      unanchored.push({ doc: document.doc, lines: document.lines });
    }
    if (document.guard !== null) guardFired = true;
    checked += document.results.length;
    presenceAnchors += document.claims.filter((claim) => claim.kind === "presence").length;
    absenceAnchors += document.claims.filter((claim) => claim.kind === "absence").length;
    failures += countFailures(allResults(document));
  }

  return {
    documents,
    unanchored,
    checked,
    presenceAnchors,
    absenceAnchors,
    failures,
    // The floor is per DOCUMENT, not per run: one anchored document must never
    // license every other document in the glob to carry none.
    markerFloorFailed: requireMarkers && unanchored.length > 0,
    guardFired,
    next: checked === 0 ? funnel(documents) : null,
  };
}

/**
 * The retrofit command for the largest matched document (Decision 6). Only
 * consulted when NO document carried a grounding marker: `All 0 grounding
 * marker(s) verified.` is literally true and reads as a pass on a repository
 * the tool has not examined, so the closing line names the next step instead.
 * Ties on line count go to the first document in the run's (sorted) order.
 * Null when nothing matched — there is no document to point at.
 */
function funnel(documents: readonly CheckedDocument[]): string | null {
  let largest: CheckedDocument | null = null;
  for (const document of documents) {
    if (largest === null || document.lines > largest.lines) largest = document;
  }
  return largest === null ? null : `nullius audit ${largest.doc} --propose`;
}

/**
 * The one expression that decides pass or fail, shared by both renderers.
 * Both failure modes count: a run can breach the marker floor AND carry
 * unverified claims.
 */
export function exitCode(run: CheckRun): 0 | 1 {
  return run.markerFloorFailed || run.failures > 0 ? 1 : 0;
}

/** The `path:line[@rev]` half of a presence citation, as the document states it. */
export function citation(claim: Pick<PresenceClaim, "path" | "line" | "rev">): string {
  return `${claim.path}:${claim.line}${claim.rev === undefined ? "" : `@${claim.rev}`}`;
}

/** What the claim cited, for the human line. */
export function describe(result: ClaimResult): string {
  const { claim } = result;
  switch (claim.kind) {
    case "presence":
      // The rev is shown: which commit an anchor was settled against is the
      // difference between "this failed" and "this used to be true".
      return citation(claim);
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
export function label(result: ClaimResult): string {
  if (result.verdict === "ok" && result.claim.kind === "absence") {
    return "SEARCH-CLEAN";
  }
  return result.verdict.toUpperCase();
}

/*
 * ---------------------------------------------------------------------------
 * `--format json`
 * ---------------------------------------------------------------------------
 */

/** A `Claim` with `source` hoisted onto the result entry. */
export type ClaimBody = {
  [K in Claim["kind"]]: Omit<Extract<Claim, { kind: K }>, "source">;
}[Claim["kind"]];

export interface ReportResult {
  /** The `Verdict` union member, verbatim. */
  verdict: Verdict;
  /** The human-mode label — `SEARCH-CLEAN` for a passing absence claim — so scripts can key on either. */
  label: string;
  /** `isFailure(verdict)`: the same predicate that decides the exit code. */
  failing: boolean;
  source: { doc: string; line: number };
  claim: ClaimBody;
  detail: string;
  /** Present only when the checker located the quote elsewhere (`drift`, `wrong-line`). */
  foundLine?: number;
}

export interface ReportDocument {
  doc: string;
  lines: number;
  results: ReportResult[];
}

export interface ReportSummary {
  documents: number;
  anchoredDocuments: number;
  unanchored: UnanchoredDocument[];
  presenceAnchors: number;
  absenceAnchors: number;
  /** Count per verdict, over every result in `documents` (guard included). */
  verdicts: Partial<Record<Verdict, number>>;
  failures: number;
  markerFloorFailed: boolean;
  next: string | null;
}

export interface ReportRewrites {
  applied: ({ doc: string } & Rewrite)[];
  skipped: ({ doc: string } & Skipped)[];
}

/**
 * The `check --format json` document. Schema version 1.
 *
 * Compatibility policy, stated before v1 ships. `verdict` makes the `Verdict`
 * vocabulary a wire contract, so:
 *
 * - Adding a field to any object is NOT a breaking change and does not bump
 *   `version`.
 * - Renaming or removing a field IS breaking and bumps `version`.
 * - Adding a member to the `Verdict` union is ALSO breaking — for any consumer
 *   that switches on `verdict` exhaustively — and bumps `version`, the same
 *   discipline `openspec/project.md` applies to the union itself.
 * - Consumers that only need pass/fail should read `failing`, which is stable
 *   across union growth because it is computed by `isFailure` rather than by
 *   enumerating verdicts.
 *
 * `rewrites` is present only when `--fix` or `--stamp` ran. `diagnostics`
 * carries messages that also went to stderr and that changed the exit code or
 * the matched set (no files matched; an unreadable canary registry); absent
 * when there were none.
 *
 * The exit-code rule a consumer can rely on: the process exits non-zero if
 * and only if `summary.failures > 0`, or `summary.markerFloorFailed`, or
 * `diagnostics` is present. A no-match run under `--require-markers` sets
 * `markerFloorFailed` (nothing matched, so nothing was anchored), and the
 * unreadable-registry case is the one exit that only `diagnostics` explains.
 */
export interface CheckReport {
  version: 1;
  documents: ReportDocument[];
  summary: ReportSummary;
  rewrites?: ReportRewrites;
  diagnostics?: string[];
}

export const REPORT_VERSION = 1;

function reportResult(result: ClaimResult): ReportResult {
  const { source, ...claim } = result.claim;
  const entry: ReportResult = {
    verdict: result.verdict,
    label: label(result),
    failing: isFailure(result.verdict),
    source: { doc: source.doc, line: source.line },
    claim,
    detail: result.detail,
  };
  // Explicit, never a spread of `result`: `foundLine` is a key only when the
  // checker set one, so its absence stays meaningful on the wire.
  if (result.foundLine !== undefined) entry.foundLine = result.foundLine;
  return entry;
}

export function buildReport(run: CheckRun): CheckReport {
  const documents = run.documents.map(
    (document): ReportDocument => ({
      doc: document.doc,
      lines: document.lines,
      results: allResults(document).map(reportResult),
    }),
  );

  const verdicts: Partial<Record<Verdict, number>> = {};
  for (const document of documents) {
    for (const result of document.results) {
      verdicts[result.verdict] = (verdicts[result.verdict] ?? 0) + 1;
    }
  }

  const report: CheckReport = {
    version: REPORT_VERSION,
    documents,
    summary: {
      documents: run.documents.length,
      anchoredDocuments: run.documents.length - run.unanchored.length,
      unanchored: run.unanchored,
      presenceAnchors: run.presenceAnchors,
      absenceAnchors: run.absenceAnchors,
      verdicts,
      failures: run.failures,
      markerFloorFailed: run.markerFloorFailed,
      next: run.next,
    },
  };

  const planned = run.documents.filter((document) => document.plan !== null);
  if (planned.length > 0) {
    report.rewrites = {
      applied: planned.flatMap((document) =>
        (document.plan as RewritePlan).applied.map((rewrite) => ({ doc: document.doc, ...rewrite })),
      ),
      skipped: planned.flatMap((document) =>
        (document.plan as RewritePlan).skipped.map((skip) => ({ doc: document.doc, ...skip })),
      ),
    };
  }

  return report;
}

/** One pretty-printed JSON document, two-space indent, trailing newline. */
export function renderJson(run: CheckRun, diagnostics: readonly string[] = []): string {
  const report = buildReport(run);
  if (diagnostics.length > 0) report.diagnostics = [...diagnostics];
  return `${JSON.stringify(report, null, 2)}\n`;
}

// ---------------------------------------------------------------------------
// The maintainer card
// ---------------------------------------------------------------------------

/**
 * A verdict whose location must not be printed.
 *
 * `canary-present` is counted in the failure total and named as a verdict, and
 * its `source` is withheld. The probe's value depends on its location not being
 * published, and a pull-request comment is the most public place this tool
 * writes — more public than the command `add-canary-status-redaction` narrowed.
 * A card that rendered every result faithfully would reopen that exposure in a
 * worse place.
 */
const REDACTED_VERDICTS: ReadonlySet<Verdict> = new Set<Verdict>(["canary-present"]);

export interface CardOptions {
  /**
   * A blob URL the failing-anchor list links into, e.g.
   * `https://github.com/owner/repo/blob/<sha>/`. Omitted, the list renders the
   * location as plain text — the kernel knows no repository and invents none.
   */
  linkBase?: string;
}

/**
 * A location as a jump link, or as inert text when there is nowhere to jump to.
 *
 * The path is URL-encoded before it reaches the href and escaped before it
 * reaches the label, because it comes from the checked document and a `)` in a
 * path would otherwise close the link and spill the rest into the comment.
 */
function locationLink(doc: string, line: number, options: CardOptions): string {
  const shown = `${escapeCell(doc)}:${String(line)}`;
  if (options.linkBase === undefined) return shown;
  // `encodeURIComponent` leaves `(` and `)` alone, and a `)` inside an href
  // closes the markdown link early — spilling the rest of the row into the
  // comment as live markdown. The label half is protected by `escapeCell`'s
  // bracket escaping; the href half needs these two explicitly.
  const encoded = doc
    .split("/")
    .map((segment) => encodeURIComponent(segment).replace(/\(/g, "%28").replace(/\)/g, "%29"))
    .join("/");
  const href = `${options.linkBase.replace(/\/$/, "")}/${encoded}#L${String(line)}`;
  return `[${shown}](${href})`;
}

/** How a failing result is named, with its location withheld where required. */
function failingSubject(result: ReportResult, options: CardOptions): string {
  if (REDACTED_VERDICTS.has(result.verdict)) {
    return "a registered canary is still planted in a checked document (location withheld) — run: nullius canary clear";
  }
  return `${locationLink(result.source.doc, result.source.line, options)} — ${escapeCell(result.detail)}`;
}

/**
 * The pull-request comment's body, as a card rather than a fenced dump of
 * human-format stdout.
 *
 * Every interpolated value goes through `escapeCell`, and that is security work
 * rather than formatting: the checked document is PR-controlled input, and both
 * `detail` and the `claim` fields originate there. The fenced dump this replaces
 * neutralised them by accident; a structured renderer has to do it on purpose.
 *
 * Counts come from `summary` and are never recomputed from `documents`. The
 * summary is what the exit code is derived from, so a card that counted for
 * itself could disagree with the gate it sits beside.
 */
export function renderCard(report: CheckReport, options: CardOptions = {}): string {
  const s = report.summary;
  const out: string[] = [];

  const headline =
    s.failures > 0
      ? `${String(s.failures)} unverified claim(s)`
      : s.presenceAnchors + s.absenceAnchors === 0
        ? "no anchors to verify"
        : "all grounding markers verified";
  out.push(`## nullius claims check — ${headline}`);
  out.push("");

  out.push("| | |");
  out.push("| --- | --- |");
  out.push(`| documents checked | ${String(s.documents)}, of which ${String(s.anchoredDocuments)} carry markers |`);
  out.push(
    `| anchors checked | ${String(s.presenceAnchors)} presence, ${String(s.absenceAnchors)} absence |`,
  );
  const verdicts = Object.entries(s.verdicts).sort((a, b) => a[0].localeCompare(b[0]));
  out.push(
    `| verdicts | ${verdicts.length === 0 ? "none" : verdicts.map(([v, n]) => `${escapeCell(v)} ${String(n)}`).join(", ")} |`,
  );
  out.push(`| failures | ${String(s.failures)} |`);

  if (s.unanchored.length > 0) {
    out.push("");
    out.push(
      `${String(s.unanchored.length)} matched document(s) carry no grounding markers: ` +
        `${s.unanchored.map((entry) => escapeCell(entry.doc)).join(", ")}.`,
    );
    // Said explicitly, because "All 0 grounding marker(s) verified." is
    // literally true and reads as a pass on a document nothing examined.
    if (s.presenceAnchors + s.absenceAnchors === 0) {
      out.push("Nothing was checked here — that is not the same as nothing being wrong.");
    }
  }

  const failing = report.documents.flatMap((document) =>
    document.results.filter((result) => result.failing),
  );
  if (failing.length > 0) {
    out.push("");
    out.push("**Unverified:**");
    for (const result of failing) out.push(`- \`${escapeCell(result.label)}\` ${failingSubject(result, options)}`);
  }

  if (report.diagnostics !== undefined && report.diagnostics.length > 0) {
    out.push("");
    out.push("**Diagnostics:**");
    for (const line of report.diagnostics) out.push(`- ${escapeCell(line)}`);
  }

  out.push("");
  // The modesty line, and it is load-bearing rather than decorative. A tidy
  // green table reads as a stronger claim than the prose it replaces, and the
  // one thing it must not imply is that the document's reasoning was checked.
  out.push(
    "_A verdict certifies the citation and not the argument built on it: a real line, quoted " +
      "accurately, can still support a false conclusion. Reasoning is what `nullius audit` " +
      "examines, and it did not run here._",
  );
  return out.join("\n");
}
