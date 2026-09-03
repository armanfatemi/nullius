/**
 * `witness report` — the run renderer.
 *
 * Everything in this module is pure: no I/O, no `console`, no `process`, and
 * **no wall clock**. Every timestamp it prints comes from a record or a commit,
 * which is what makes the goldens in `witnessReport.test.ts` goldens at all —
 * a renderer that read `Date.now()` would produce a different document on every
 * run and the byte-equality test below the goldens would have to be deleted to
 * make them pass.
 *
 * The renderer decides nothing about provenance. Tier counts are read off
 * `JournalReport.provenance` and `JournalReport.ledger`, both of which the
 * validator computes and both of which are `null` below journal version `0.6`.
 * There is no `tierOf` here, no list of kinds mapped to tiers, and no reading
 * of the header's `origin` — three drafts of this feature each invented an
 * attribution the data did not carry, and the only defence that survives a
 * fourth draft is that the code has nowhere to put one.
 *
 * The envelope this reads is written by `@nullius-inverba/kit`'s
 * `witness bundle`. The kernel does not import the kit — the dependency runs
 * kit → kernel and never back — so the envelope is described here
 * *structurally* and parsed defensively by `parseBundle`. It is a committed,
 * contributor-supplied file: every field is checked before it is read, and a
 * shape this module does not recognise is an error the caller reports rather
 * than a default this module invents.
 */

import { describeCanary, type CanaryEntry } from "./canary";
import type { CheckReport, ReportResult } from "./checkReport";
import type { OracleReport } from "./oracle";
import { isJournalFailure, type JournalFinding, type JournalReport } from "./witness";

/** The report document's own schema version. Independent of `REPORT_VERSION`
 *  (`check --format json`) and of the envelope's `version`: three documents on
 *  one CLI that break on different events, told apart by `kind`.
 *
 *  2 adds the `card` key at the top level. A consumer that recognises only 1
 *  must refuse this document rather than read the fields it knows, which is why
 *  the number moves for an additive change: the Action's accepted set is the
 *  thing that decides compatibility, not this file's optimism. */
export const RUN_REPORT_VERSION = 2;

/**
 * A *round* is a maximal set of dispatches whose start times fall within this
 * of the first, and which contains at least two dispatches. Printed under the
 * flowchart, because a number that decides how the chart is grouped and is not
 * shown is a number the reader cannot check.
 */
export const ROUND_WINDOW_MS = 120_000;

/** Mermaid labels are truncated here. Long enough for an agent name and a task
 *  fragment; short enough that one adversarial label cannot push the chart past
 *  the comment budget on its own. */
export const MERMAID_LABEL_CAP = 60;

/** Nodes beyond this are dropped, with the drop stated under the chart. */
export const FLOWCHART_NODE_CAP = 60;

/**
 * Distinct finding groups rendered into one journal's validation cell.
 *
 * A journal fails validation for a handful of reasons and once per offending
 * record, so the finding list is long and its content is short: the bundle
 * this cap was written for reported 57 findings with 6 distinct details, and
 * rendered them as a single 9.5 KB table cell — 45% of the comment, restating
 * one fact 57 times. Grouping by detail is what makes the cell readable; the
 * cap bounds the case where the details themselves are many, and the drop is
 * stated rather than silent. The JSON form carries every finding.
 */
export const VALIDATION_GROUP_CAP = 4;

/**
 * The markdown budget. A GitHub issue comment is capped at 65536 characters,
 * and a body that exceeds it is rejected outright — so the renderer truncates
 * below the limit and says it did, rather than posting nothing.
 */
export const MARKDOWN_BUDGET_BYTES = 60_000;

// ---------------------------------------------------------------------------
// The envelope, described structurally
// ---------------------------------------------------------------------------

export interface BundleCommit {
  sha: string;
  /** Author time, ISO 8601, as git printed it. */
  at: string;
}

export type BundleClassification = "included" | "inconclusive" | "excluded";

export interface BundleCandidate {
  session: string;
  classification: BundleClassification;
  reason: string;
}

export interface BundleJournal {
  session: string;
  lines: string[];
}

/** The envelope's shape, as this module needs it. Fields the kit writes and
 *  this module does not read are carried by neither type nor code. */
export interface RunBundle {
  version: number;
  range: {
    spec: string;
    base: string;
    head: string;
    resolvedBase: string;
    commits: BundleCommit[];
  };
  selection: {
    rule: string;
    slackMinutes: number;
    prompts: string;
    changedFiles: string[];
    candidates: BundleCandidate[];
  };
  journals: BundleJournal[];
}

const CLASSIFICATIONS: ReadonlySet<string> = new Set<BundleClassification>([
  "included",
  "inconclusive",
  "excluded",
]);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const out: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") return null;
    out.push(entry);
  }
  return out;
}

/**
 * Read an envelope, or say what is wrong with it.
 *
 * Defensive by construction rather than by discipline: the file is committed by
 * the contributor whose run the report describes, so "the kit wrote it" is not
 * a premise this module is entitled to. Every failure returns `{ error }` and
 * the caller exits 2 — an envelope this cannot read is unreadable input, not an
 * absence to render.
 */
export function parseBundle(text: string): RunBundle | { error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return { error: `not valid JSON — ${(error as Error).message}` };
  }
  if (!isObject(parsed)) return { error: "not a JSON object" };

  const version = parsed["version"];
  if (typeof version !== "number" || !Number.isInteger(version)) {
    return { error: "no integer `version` — this is not a witness bundle" };
  }

  const range = parsed["range"];
  if (!isObject(range)) return { error: "no `range` object" };
  for (const key of ["spec", "base", "head"]) {
    if (typeof range[key] !== "string") return { error: `range.${key} is not a string` };
  }
  const rawCommits = range["commits"];
  if (!Array.isArray(rawCommits)) return { error: "range.commits is not an array" };
  const commits: BundleCommit[] = [];
  for (const entry of rawCommits) {
    if (!isObject(entry) || typeof entry["sha"] !== "string" || typeof entry["at"] !== "string") {
      return { error: "range.commits carries an entry without a string `sha` and `at`" };
    }
    commits.push({ sha: entry["sha"], at: entry["at"] });
  }

  const selection = parsed["selection"];
  if (!isObject(selection)) return { error: "no `selection` object" };
  const changedFiles = stringArray(selection["changed_files"]);
  if (changedFiles === null) return { error: "selection.changed_files is not an array of strings" };
  const rawCandidates = selection["candidates"];
  if (!Array.isArray(rawCandidates)) return { error: "selection.candidates is not an array" };
  const candidates: BundleCandidate[] = [];
  for (const entry of rawCandidates) {
    if (
      !isObject(entry) ||
      typeof entry["session"] !== "string" ||
      typeof entry["classification"] !== "string" ||
      !CLASSIFICATIONS.has(entry["classification"]) ||
      typeof entry["reason"] !== "string"
    ) {
      return {
        error:
          "selection.candidates carries an entry without a string `session`, a `reason`, and a " +
          "`classification` of included | inconclusive | excluded",
      };
    }
    candidates.push({
      session: entry["session"],
      classification: entry["classification"] as BundleClassification,
      reason: entry["reason"],
    });
  }

  const rawJournals = parsed["journals"];
  if (!Array.isArray(rawJournals)) return { error: "no `journals` array" };
  const journals: BundleJournal[] = [];
  for (const entry of rawJournals) {
    if (!isObject(entry) || typeof entry["session"] !== "string") {
      return { error: "journals carries an entry without a string `session`" };
    }
    const lines = stringArray(entry["lines"]);
    if (lines === null) {
      return { error: `journal '${entry["session"]}' has no \`lines\` array of strings` };
    }
    journals.push({ session: entry["session"], lines });
  }

  const resolvedBase = range["resolved_base"];
  const slack = selection["slack_minutes"];
  const rule = selection["rule"];
  const prompts = selection["prompts"];

  return {
    version,
    range: {
      spec: range["spec"] as string,
      base: range["base"] as string,
      head: range["head"] as string,
      resolvedBase: typeof resolvedBase === "string" ? resolvedBase : (range["base"] as string),
      commits,
    },
    selection: {
      rule: typeof rule === "string" ? rule : "",
      slackMinutes: typeof slack === "number" ? slack : 0,
      prompts: typeof prompts === "string" ? prompts : "text",
      changedFiles,
      candidates,
    },
    journals,
  };
}

/** Rejoin a bundled journal into the text `validateJournal` reads. */
export function reconstructJournal(lines: readonly string[]): string {
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------

/**
 * The fields of a journal record this renderer reads. Deliberately a flat
 * projection rather than the record: what is *not* here is what the renderer
 * cannot accidentally start tiering by.
 */
export interface RecordView {
  /** 1-based line in the reconstructed journal. */
  line: number;
  kind: string;
  id: string | null;
  /** Epoch ms, or null when the record carries no readable `at`. */
  atMs: number | null;
  at: string | null;
  /** `target.path`, present on `mutation`, `verification` and `append` only. */
  path: string | null;
  agent: string | null;
  task: string | null;
  tool: string | null;
  model: string | null;
  usageTotal: number | null;
  text: string | null;
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function readRecords(lines: readonly string[]): RecordView[] {
  const out: RecordView[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const raw = (lines[index] ?? "").trim();
    if (raw.length === 0) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // A line the validator rejects is the validator's finding to report. It
      // is carried in the bundle for exactly that reason, and skipped here.
      continue;
    }
    if (!isObject(parsed)) continue;
    const kind = parsed["kind"];
    if (typeof kind !== "string") continue;

    const at = optionalString(parsed["at"]);
    const parsedAt = at === null ? Number.NaN : Date.parse(at);
    const target = parsed["target"];
    const usage = parsed["usage"];
    const total = isObject(usage) ? usage["total"] : undefined;

    out.push({
      line: index + 1,
      kind,
      id: optionalString(parsed["id"]),
      atMs: Number.isFinite(parsedAt) ? parsedAt : null,
      at,
      path: isObject(target) ? optionalString(target["path"]) : null,
      agent: optionalString(parsed["agent"]),
      task: optionalString(parsed["task"]),
      tool: optionalString(parsed["tool"]),
      model: optionalString(parsed["model"]),
      usageTotal: typeof total === "number" && Number.isFinite(total) ? total : null,
      text: optionalString(parsed["text"]),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Escaping
// ---------------------------------------------------------------------------

const CONTROL = /[\u0000-\u001F\u007F]/g;

/**
 * Escape a string for a markdown table cell.
 *
 * Order matters: the backslash goes first, or every escape added below is
 * itself escaped by the pass that was supposed to protect it. Control
 * characters — including the newline that would end the row and the carriage
 * return that would hide the rest of it — become a visible middle dot rather
 * than vanishing, because a cell that silently loses its second half reads as
 * a shorter string rather than as a redacted one.
 */
export function escapeCell(value: string): string {
  const flattened = value.replace(CONTROL, "·");
  const escaped = flattened
    .replace(/\\/g, "\\\\")
    .replace(/\|/g, "\\|")
    .replace(/`/g, "\\`")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  // A leading markdown control character turns the cell into a heading, a list
  // item or a blockquote in renderers that reflow a table cell's contents.
  return /^[#>\-+=!]/.test(escaped) ? `\\${escaped}` : escaped;
}

/**
 * The mermaid label grammar: an allow-list, not a deny-list.
 *
 * `[A-Za-z0-9 ._:/x()-]` is the whole vocabulary a label may contain and
 * everything else becomes `·`. The `x` is redundant — `A-Za-z` already covers
 * it — and is written out anyway because it is the point of the rule: an
 * earlier draft of the design wrote `×` (U+00D7) here, and a multiplication
 * sign in a mermaid label is a non-ASCII character the grammar has no need of.
 * `×` is replaced; ASCII `x` is kept. A test asserts both.
 *
 * The label is also quoted by the caller. Quoting and replacement answer
 * different questions: `:` is *inside* the allow-list, so `a::b` survives
 * replacement untouched and is made inert by the quotes alone.
 */
const MERMAID_ALLOWED = /[^A-Za-z0-9 ._:/x()-]/g;

export function escapeMermaidLabel(value: string): string {
  const replaced = value.replace(MERMAID_ALLOWED, "·");
  // The ellipsis is three ASCII dots rather than `…`: `.` is inside the
  // allow-list and `…` is not, so a one-character ellipsis would be replaced
  // by `·` and the truncation would stop being legible as a truncation.
  return replaced.length > MERMAID_LABEL_CAP
    ? `${replaced.slice(0, MERMAID_LABEL_CAP - 3)}...`
    : replaced;
}

/** A quoted mermaid label. The quotes are the second half of the grammar. */
export function mermaidLabel(value: string): string {
  return `"${escapeMermaidLabel(value)}"`;
}

// ---------------------------------------------------------------------------
// The report structure
// ---------------------------------------------------------------------------

export interface ReportTable {
  columns: string[];
  rows: string[][];
}

export interface ReportSection {
  id: string;
  title: string;
  /** One line saying what this section is and where its numbers came from. */
  statement: string;
  status: "data" | "not-recorded";
  /**
   * Present if and only if `status` is `not-recorded`. A section with no data
   * says why; it never renders a missing source as a zero.
   */
  reason?: string;
  /**
   * Present if and only if a count was actually recorded. Absent — the key
   * itself missing — is how "not recorded" is distinguished from `0` by a
   * consumer that reads the JSON rather than the prose.
   */
  count?: number;
  /**
   * How many of this section's subjects are the case a reader is asking about,
   * where that differs from `count` and a card row needs it.
   *
   * `count` is how many things the section is about; `failing` is how many of
   * them are the bad one. The two are different numbers and were previously
   * only different in prose: `outcomes` carries three terminal states summed
   * into `count`, with the one that matters — never reported — reachable only
   * as a cell in the rendered table, and `canary` carried no number at all.
   *
   * Optional, and absent rather than zero when the section has nothing to say.
   * A consumer distinguishing "none failing" from "this section does not report
   * a failing figure" needs the key's absence to mean the second, exactly as it
   * does for `count`. A section with no data never carries it.
   */
  failing?: number;
  table?: ReportTable;
  notes: string[];
}

export type TierId = "code-verified" | "hook-attested" | "self-reported" | "unattributed";

export interface ReportTier {
  id: TierId;
  title: string;
  /** The tier's provenance statement — what a number in it is evidence of. */
  provenance: string;
  sections: ReportSection[];
}

export interface FlowchartNode {
  id: string;
  label: string;
  atMs: number;
}

export interface Flowchart {
  mermaid: string;
  nodes: number;
  windowMs: number;
  /** Nodes dropped at `FLOWCHART_NODE_CAP`. */
  dropped: number;
}

export interface NotRecordedEntry {
  tier: TierId | null;
  section: string;
  reason: string;
}

/**
 * What a card row can say, and the whole of it.
 *
 * Three states, because two would collapse the distinction the tiered document
 * exists to hold: a figure nobody recorded and a figure that came back zero are
 * different facts, and rendering the first as the second is the flattering
 * default this report refuses everywhere else.
 */
export type CardMark = "clear" | "attention" | "not-recorded";

/**
 * How a row decides its mark, and the entire vocabulary of that decision.
 *
 * Two shapes rather than one. Most rows ask "how many of the bad thing", where
 * more than none wants attention. Two rows — did review happen, did reviewers
 * run together — ask the opposite: the count *is* the good thing, and zero is
 * the finding. A single "above zero is bad" rule would have rendered a run with
 * no review at all as clear, which is the most important thing a card claiming
 * to describe review could get wrong.
 *
 * Both read a named numeric field off a section. Neither inspects a record,
 * neither knows a record kind, and neither has a default branch: a field that
 * is absent is `not-recorded`, never a guess.
 */
type MarkShape = "attention-when-positive" | "attention-when-zero";

interface RowSpec {
  id: string;
  question: string;
  /** The section id this row reads. Never a tier — see `buildCard`. */
  section: string;
  /** Which numeric field on that section carries this row's figure. */
  figure: "count" | "failing";
  shape: MarkShape;
}

/**
 * The rows, in render order, and the only judgment in this feature.
 *
 * It is a constant rather than a computation for the same reason the kernel's
 * PASSING set is: a calibration that decides an outcome has to be reviewable in
 * one place, and testable by name. Each row is asserted individually.
 *
 * Every entry names a section that `buildRunReport` produces. A row whose
 * section is missing is omitted and reported, never defaulted — which is what
 * keeps this table from quietly becoming a second source of truth about what
 * the report contains.
 */
const CARD_ROWS: readonly RowSpec[] = [
  {
    id: "grounded",
    question: "Are load-bearing claims cited and verified?",
    section: "anchors",
    figure: "failing",
    shape: "attention-when-positive",
  },
  {
    id: "graders",
    question: "Was anything that grades this project weakened?",
    section: "oracle",
    // `failing`, not `count`: they are the same number for a complete run, and
    // only `failing` is withheld when the run was partial.
    figure: "failing",
    shape: "attention-when-positive",
  },
  {
    id: "record",
    question: "Does the run's own record hold up?",
    section: "journal-validation",
    figure: "failing",
    shape: "attention-when-positive",
  },
  {
    id: "probe",
    question: "Is a review probe still planted?",
    section: "canary",
    figure: "failing",
    shape: "attention-when-positive",
  },
  {
    id: "reviewed",
    question: "Did agent review happen at all?",
    section: "dispatches",
    figure: "count",
    shape: "attention-when-zero",
  },
  {
    id: "concurrent",
    question: "Did reviewers run together rather than in series?",
    section: "rounds",
    figure: "count",
    shape: "attention-when-zero",
  },
  {
    id: "reported",
    question: "Did every review report back?",
    section: "outcomes",
    figure: "failing",
    shape: "attention-when-positive",
  },
];

export interface CardRow {
  id: string;
  question: string;
  /** The section id this row read. A reference, never a copy of its content. */
  section: string;
  /** Read from the tier that contains the section. Never assigned here. */
  tier: TierId;
  mark: CardMark;
}

export interface Card {
  rows: CardRow[];
  /** Row ids whose section was not in the report. Stated, never silent. */
  omitted: string[];
  /** How many rendered rows are `not-recorded`. */
  unanswerable: number;
}

export interface RunReport {
  kind: "run-report";
  version: typeof RUN_REPORT_VERSION;
  range: {
    spec: string;
    base: string;
    head: string;
    commits: number;
    changedFiles: number;
  };
  /**
   * The reviewer's summary, projected from `tiers` below.
   *
   * Duplicates nothing: a row carries the *id* of the section it read and its
   * mark, never a copy of that section's title, table or figures. The tiers
   * stay the source, and a consumer that disagrees with a mark can resolve the
   * row and see the section it was computed from.
   */
  card: Card;
  /** Exactly four, in the fixed order code-verified → unattributed. */
  tiers: ReportTier[];
  flowchart: Flowchart | null;
  notRecorded: NotRecordedEntry[];
  /**
   * The `check --format json` document, verbatim, under its own key and
   * carrying its own `version`. Never flattened into this document: two
   * schemas numbered `version: 1` on one CLI is a consumer bug waiting for the
   * first tool that reads a file it did not invoke.
   */
  check: CheckReport | null;
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

export interface BundledJournalReport {
  session: string;
  report: JournalReport;
}

export interface RunReportInput {
  range: { spec: string; base: string; head: string };
  /** The envelope, or null when there is none to read. */
  bundle: RunBundle | null;
  /** The path the envelope was looked for at. Rendered when `bundle` is null. */
  bundlePath: string;
  /** Range commits, oldest first. */
  commits: readonly BundleCommit[];
  /** Why git could not be read, when it could not. */
  commitsUnreadable?: string;
  changedFiles: readonly string[];
  /** The `check --format json` document for this range's documents. */
  checkRun: CheckReport | null;
  /** Why no check ran, when none did. */
  checkUnavailable?: string;
  /** `checkOracles`' return, called directly — never through the CLI verb,
   *  which exits 2 on an unconfigured project. */
  oracleReport: OracleReport | null;
  /** One per bundled journal, in the envelope's order. */
  journalReports: readonly BundledJournalReport[];
  /** The registered canary, if any. Rendered through `describeCanary` with
   *  `reveal` unset, so neither its document nor its line can reach the page. */
  canary?: CanaryEntry | null;
}

// ---------------------------------------------------------------------------
// Section helpers
// ---------------------------------------------------------------------------

function dataSection(
  id: string,
  title: string,
  statement: string,
  extra: { count?: number; failing?: number; table?: ReportTable; notes?: string[] } = {},
): ReportSection {
  const section: ReportSection = { id, title, statement, status: "data", notes: extra.notes ?? [] };
  if (extra.count !== undefined) section.count = extra.count;
  if (extra.failing !== undefined) section.failing = extra.failing;
  if (extra.table !== undefined) section.table = extra.table;
  return section;
}

/** A section with no data. Never carries `count` — not even zero. */
function absentSection(
  id: string,
  title: string,
  statement: string,
  reason: string,
): ReportSection {
  return { id, title, statement, status: "not-recorded", reason, notes: [] };
}

// ---------------------------------------------------------------------------
// Rounds and bursts
// ---------------------------------------------------------------------------

export interface Round {
  index: number;
  startMs: number;
  startedAt: string;
  agents: string[];
  size: number;
  label: string;
}

/**
 * Maximal sets of dispatches starting within `ROUND_WINDOW_MS` of the first,
 * with at least two members. A lone dispatch is not a round and is not
 * promoted into one: two agents running together is the thing being counted.
 */
export function detectRounds(dispatches: readonly RecordView[], windowMs = ROUND_WINDOW_MS): Round[] {
  const timed = dispatches
    .filter((record) => record.atMs !== null)
    .sort((a, b) => (a.atMs as number) - (b.atMs as number) || (a.id ?? "").localeCompare(b.id ?? ""));

  const rounds: Round[] = [];
  let index = 0;
  while (index < timed.length) {
    const first = timed[index] as RecordView;
    const start = first.atMs as number;
    let end = index + 1;
    while (end < timed.length && ((timed[end] as RecordView).atMs as number) - start <= windowMs) {
      end += 1;
    }
    const group = timed.slice(index, end);
    if (group.length >= 2) {
      const agents = [...new Set(group.map((record) => record.agent ?? "(no agent)"))].sort();
      rounds.push({
        index: rounds.length + 1,
        startMs: start,
        startedAt: first.at ?? "",
        agents,
        size: group.length,
        // Parenthesised rather than em-dashed: this label is a mermaid label,
        // and the allow-list replaces an em dash with `·` — a chart that reads
        // `Round 1 · 3 dispatches` is the escaper working and looking broken.
        label: `Round ${String(rounds.length + 1)} (${String(group.length)} dispatches)`,
      });
      index = end;
    } else {
      index += 1;
    }
  }
  return rounds;
}

export interface EditBurst {
  startMs: number;
  mutations: number;
  paths: { path: string; count: number }[];
}

/**
 * The mutations between consecutive rounds or commits, grouped by path.
 *
 * Range-scoped: this is a mutation-derived table, and mutation-derived tables
 * are the only place scoping applies. The tier counts above are journal-wide
 * and stay that way.
 */
export function detectBursts(
  mutations: readonly RecordView[],
  boundaries: readonly number[],
): EditBurst[] {
  const timed = mutations
    .filter((record) => record.atMs !== null)
    .sort((a, b) => (a.atMs as number) - (b.atMs as number) || (a.path ?? "").localeCompare(b.path ?? ""));
  const marks = [...boundaries].sort((a, b) => a - b);

  const bursts: EditBurst[] = [];
  let pending: RecordView[] = [];
  let nextMark = 0;

  const flush = (): void => {
    if (pending.length === 0) return;
    const counts = new Map<string, number>();
    for (const record of pending) {
      const path = record.path ?? "(no path)";
      counts.set(path, (counts.get(path) ?? 0) + 1);
    }
    bursts.push({
      startMs: (pending[0] as RecordView).atMs as number,
      mutations: pending.length,
      paths: [...counts.entries()]
        .map(([path, count]) => ({ path, count }))
        .sort((a, b) => b.count - a.count || a.path.localeCompare(b.path)),
    });
    pending = [];
  };

  for (const record of timed) {
    const at = record.atMs as number;
    while (nextMark < marks.length && (marks[nextMark] as number) <= at) {
      flush();
      nextMark += 1;
    }
    pending.push(record);
  }
  flush();
  return bursts;
}

// ---------------------------------------------------------------------------
// buildRunReport
// ---------------------------------------------------------------------------

const TIER_PROVENANCE: Record<TierId, string> = {
  "code-verified":
    "Re-computed by this command from the repository and its history. Nothing here came from the bundle, so nothing here depends on the contributor.",
  "hook-attested":
    "Emitted by the harness's own runtime hooks — the agent had no opportunity to decline to write them. Read from the bundle, after every bundled journal re-validated.",
  "self-reported":
    "Written by a coordinator about its own run. Internally consistent; not evidence the run went this way.",
  unattributed:
    "Records that belong to nobody: no origin of their own, under a header that claims none. Counting these as hook-attested would be the flattering default the field exists to remove.",
};

const TIER_TITLES: Record<TierId, string> = {
  "code-verified": "Code-verified",
  "hook-attested": "Hook-attested",
  "self-reported": "Self-reported",
  unattributed: "Unattributed",
};

/** The one reason the three bundle tiers cannot be counted, whatever it is. */
interface BundleBlock {
  reason: string;
}

function shortSha(sha: string): string {
  return sha.slice(0, 7);
}

/**
 * The card: one row per question a reviewer asks, projected from the report.
 *
 * Takes a built `RunReport` and nothing else. It has no `RunReportInput`
 * parameter, so it cannot call git, read the bundle, or re-validate anything —
 * every value it renders was computed by the builder above and is reachable
 * from a section. That is the whole of the guarantee, and it is enforced by the
 * signature rather than by discipline.
 *
 * **A row never assigns a tier.** It finds the tier that contains its section
 * and reports that. There is no row-to-tier map here and no reading of a record
 * kind: a section that moves tier moves its row with it, because there is no
 * second place to edit. Three earlier drafts of this feature each invented an
 * attribution the data did not carry, and this signature is the fourth draft's
 * defence.
 */
/**
 * How a mark is drawn, and its word.
 *
 * The glyph is for the glance and the word is for everything else — a screen
 * reader, a terminal without colour emoji, a `grep`. A card that carried only
 * the glyph would be unreadable in exactly the places a maintainer triaging a
 * queue actually reads it.
 */
const MARK_GLYPH: Readonly<Record<CardMark, string>> = {
  clear: "\u2705",
  attention: "\u26a0\ufe0f",
  "not-recorded": "\u26aa",
};

const MARK_WORD: Readonly<Record<CardMark, string>> = {
  clear: "clear",
  attention: "look",
  "not-recorded": "not recorded",
};

export function buildCard(report: Pick<RunReport, "tiers">): Card {
  const located = new Map<string, { section: ReportSection; tier: TierId }>();
  for (const tier of report.tiers) {
    for (const section of tier.sections) {
      // First wins. Ids are unique across the report today; if that ever stops
      // being true, the row reads the earlier tier rather than silently the
      // later one, and the duplicate is a bug in the builder, not here.
      if (!located.has(section.id)) located.set(section.id, { section, tier: tier.id });
    }
  }

  const rows: CardRow[] = [];
  const omitted: string[] = [];
  for (const spec of CARD_ROWS) {
    const found = located.get(spec.section);
    if (found === undefined) {
      // No section, no row. Rendering it anyway would mean inventing both a
      // tier and a mark, which is exactly what this function refuses to do.
      omitted.push(spec.id);
      continue;
    }
    rows.push({
      id: spec.id,
      question: spec.question,
      section: spec.section,
      tier: found.tier,
      mark: markOf(found.section, spec),
    });
  }

  return {
    rows,
    omitted,
    unanswerable: rows.filter((row) => row.mark === "not-recorded").length,
  };
}

/**
 * One row's mark, from one section's own fields.
 *
 * Absence is the first question and it is not a fallback: a section with no
 * data, or with no figure recorded, cannot be clear. `failing: 0` and no
 * `failing` at all are different answers, and only the first is a pass.
 */
function markOf(section: ReportSection, spec: RowSpec): CardMark {
  if (section.status === "not-recorded") return "not-recorded";
  const figure = spec.figure === "count" ? section.count : section.failing;
  if (figure === undefined) return "not-recorded";
  return spec.shape === "attention-when-zero"
    ? figure === 0
      ? "attention"
      : "clear"
    : figure > 0
      ? "attention"
      : "clear";
}

export function buildRunReport(input: RunReportInput): RunReport {
  const bundle = input.bundle;
  const changedFiles = new Set(input.changedFiles);

  // --- Which journals are readable, and can any of the bundle tiers be counted?
  const failedJournals = input.journalReports.filter((entry) =>
    entry.report.findings.some((finding) => finding.verdict !== "ok"),
  );

  let block: BundleBlock | null = null;
  if (bundle === null) {
    block = { reason: `no bundle at ${input.bundlePath}` };
  } else if (input.journalReports.length === 0) {
    block = { reason: `the bundle at ${input.bundlePath} carries no journal` };
  } else if (failedJournals.length > 0) {
    // Short on purpose, and pointing rather than repeating: the validator's
    // full finding is rendered once, in the code-verified tier, and every
    // bundle-derived section carries this line instead. An earlier draft
    // repeated the whole detail into all fourteen of them, which buried the one
    // table that could be acted on under thirteen copies of its own text.
    const detail = failedJournals
      .map((entry) => {
        const first = entry.report.findings.find((finding) => finding.verdict !== "ok");
        return `${entry.session} reports ${first?.verdict.toUpperCase() ?? "an invalid record"} at line ${String(first?.line ?? 0)}`;
      })
      .join("; ");
    block = {
      reason: `a bundled journal did not re-validate, so nothing is counted from the bundle — ${detail}; the finding is under "Bundled journals re-validated" above`,
    };
  }

  // --- Records, and the range scoping that applies to the mutation-derived
  //     tables and the flowchart only.
  const records: RecordView[] =
    block === null && bundle !== null
      ? bundle.journals.flatMap((journal) => readRecords(journal.lines))
      : [];
  const dispatches = records.filter((record) => record.kind === "dispatch");
  const reports = records.filter((record) => record.kind === "report");
  const prompts = records.filter((record) => record.kind === "prompt");
  const allMutations = records.filter((record) => record.kind === "mutation");
  const inRangeMutations = allMutations.filter(
    (record) => record.path !== null && changedFiles.has(record.path),
  );
  const outOfRangeMutations = allMutations.filter(
    (record) => record.path === null || !changedFiles.has(record.path),
  );

  const rounds = detectRounds(dispatches);
  const commitTimes = input.commits
    .map((commit) => Date.parse(commit.at))
    .filter((ms) => Number.isFinite(ms));
  const bursts = detectBursts(inRangeMutations, [
    ...rounds.map((round) => round.startMs),
    ...commitTimes,
  ]);

  const tiers: ReportTier[] = [
    {
      id: "code-verified",
      title: TIER_TITLES["code-verified"],
      provenance: TIER_PROVENANCE["code-verified"],
      sections: codeVerifiedSections(input),
    },
    {
      id: "hook-attested",
      title: TIER_TITLES["hook-attested"],
      provenance: TIER_PROVENANCE["hook-attested"],
      sections: hookAttestedSections(input, block, {
        dispatches,
        reports,
        prompts,
        inRangeMutations,
        outOfRangeMutations,
        rounds,
        bursts,
      }),
    },
    {
      id: "self-reported",
      title: TIER_TITLES["self-reported"],
      provenance: TIER_PROVENANCE["self-reported"],
      sections: selfReportedSections(input, block),
    },
    {
      id: "unattributed",
      title: TIER_TITLES.unattributed,
      provenance: TIER_PROVENANCE.unattributed,
      sections: unattributedSections(input, block),
    },
  ];

  const flowchart = buildFlowchart(rounds, bursts, input.commits, prompts);

  const notRecorded: NotRecordedEntry[] = [];
  for (const tier of tiers) {
    for (const section of tier.sections) {
      if (section.status === "not-recorded") {
        notRecorded.push({ tier: tier.id, section: section.title, reason: section.reason ?? "" });
      }
    }
  }
  for (const candidate of bundle?.selection.candidates ?? []) {
    if (candidate.classification !== "inconclusive") continue;
    notRecorded.push({
      tier: null,
      section: `session ${candidate.session}`,
      reason: `${candidate.reason} — carry it with: witness bundle --include ${candidate.session}`,
    });
  }

  const built: Omit<RunReport, "card"> = {
    kind: "run-report",
    version: RUN_REPORT_VERSION,
    range: {
      spec: input.range.spec,
      base: input.range.base,
      head: input.range.head,
      commits: input.commits.length,
      changedFiles: input.changedFiles.length,
    },
    tiers,
    flowchart,
    notRecorded,
    check: input.checkRun,
  };

  // Built last, from the finished tiers, so it cannot see anything the tiers do
  // not carry — the same guarantee `buildCard`'s signature gives, made true at
  // the one call site that could have bypassed it.
  return { ...built, card: buildCard(built) };
}

// ---------------------------------------------------------------------------
// Code-verified
// ---------------------------------------------------------------------------

/**
 * Said once, and said the same way whether or not there was a journal to
 * validate. The second half is the sentence that stops a green row from being
 * read as a claim it does not make: `validateJournal` settles a bundle's
 * internal consistency and says nothing at all about its completeness, so a
 * bundle with whole journals removed validates cleanly.
 */
const JOURNAL_VALIDATION_STATEMENT =
  "`witness validate` re-run over every journal reconstructed from the bundle, before any count was taken from it. This checks a bundle's internal consistency and never its completeness: a bundle with whole journals removed validates cleanly.";

/**
 * One journal's failing findings, grouped by what they say.
 *
 * Deliberately keyed on `detail` alone rather than on `verdict` + `detail`:
 * the detail is what a reader acts on, and two verdicts that produce the same
 * sentence are the same instruction. The verdict still leads each group, taken
 * from the group's first member, so nothing is attributed to a verdict that
 * did not produce it.
 *
 * Counts are stated, never implied by a list length — a collapse that hides
 * how much it collapsed is worse than the list it replaced. `(n)` rather than
 * `\u00d7n`, matching the burst table below.
 */
export function summariseJournalFindings(findings: readonly JournalFinding[]): string {
  if (findings.length === 0) return "valid";

  const groups = new Map<string, { verdict: string; line: number; count: number }>();
  for (const finding of findings) {
    const existing = groups.get(finding.detail);
    if (existing === undefined) {
      groups.set(finding.detail, {
        verdict: finding.verdict.toUpperCase(),
        line: finding.line,
        count: 1,
      });
      continue;
    }
    existing.count += 1;
    // The first line is the one a reader opens the journal at, so it is the
    // minimum rather than whichever member happened to arrive first.
    if (finding.line < existing.line) existing.line = finding.line;
  }

  const entries = [...groups.entries()];
  const shown = entries.slice(0, VALIDATION_GROUP_CAP);
  const rendered = shown.map(([detail, group]) =>
    group.count === 1
      ? `${group.verdict} at line ${String(group.line)}: ${detail}`
      : `${group.verdict} (${String(group.count)} records, first at line ${String(group.line)}): ${detail}`,
  );

  const dropped = entries.length - shown.length;
  if (dropped > 0) {
    rendered.push(
      `+${String(dropped)} further distinct finding(s) — the JSON form carries them all`,
    );
  }
  return rendered.join("; ");
}

function codeVerifiedSections(input: RunReportInput): ReportSection[] {
  const sections: ReportSection[] = [];

  if (input.commitsUnreadable !== undefined) {
    sections.push(
      absentSection(
        "commits",
        "Commits in range",
        "Read from `git log` over the range.",
        input.commitsUnreadable,
      ),
    );
  } else {
    sections.push(
      dataSection("commits", "Commits in range", "Read from `git log` over the range.", {
        count: input.commits.length,
        table: {
          columns: ["commit", "authored"],
          rows: input.commits.map((commit) => [shortSha(commit.sha), commit.at]),
        },
      }),
    );
  }

  sections.push(
    dataSection(
      "changed-files",
      "Files changed",
      "Read from `git diff --name-status` over the range. This is the set the mutation-derived tables below are scoped by.",
      { count: input.changedFiles.length },
    ),
  );

  // --- Anchors
  if (input.checkRun === null) {
    sections.push(
      absentSection(
        "anchors",
        "Evidence Anchors re-checked",
        "Every anchor in the range's touched documents, re-verified by re-reading the cited file.",
        input.checkUnavailable ?? "no document in this range was checked",
      ),
    );
  } else {
    const check = input.checkRun;
    const results = check.documents.flatMap((document) => document.results);
    const verdictRows = Object.entries(check.summary.verdicts)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([verdict, count]) => [verdict, String(count)]);
    const failing = results.filter((result) => result.failing);
    const notes = [
      `${String(check.summary.failures)} failing, over ${String(check.summary.documents)} document(s).`,
    ];
    if (failing.length > 0) {
      notes.push("Failing anchors:");
      for (const result of failing) notes.push(`- ${anchorSubject(result)}`);
    }
    sections.push(
      dataSection(
        "anchors",
        "Evidence Anchors re-checked",
        "Every anchor in the range's touched documents, re-verified by re-reading the cited file. A failure here is rendered, not gated: the gate is `nullius check`, which runs on its own.",
        {
          count: results.length,
          // The number the card's row is about, lifted out of the note string
          // it was only reachable from. `check.summary.failures` rather than a
          // recount here: the check document already decided which verdicts
          // fail, and a second opinion about that in this file would be a copy
          // of the kernel's PASSING set.
          failing: check.summary.failures,
          table: { columns: ["verdict", "count"], rows: verdictRows },
          notes,
        },
      ),
    );
  }

  // --- Oracle
  const oracle = input.oracleReport;
  if (oracle === null) {
    sections.push(
      absentSection(
        "oracle",
        "Oracle conservation",
        "Whether anything that grades this project was deleted, skipped or weakened in the range, and whether a decision accounted for it.",
        "no oracle run for this range",
      ),
    );
  } else if (oracle.unconfigured) {
    sections.push(
      absentSection(
        "oracle",
        "Oracle conservation",
        "Whether anything that grades this project was deleted, skipped or weakened in the range, and whether a decision accounted for it.",
        // Plain prose, no markdown: this string is escaped on the way out
        // because a reason can carry contributor text, and backticks written
        // here would arrive as literal backslashes.
        'not configured — this project declares no "oracles" key in nullius.config.json, so this run checked nothing. An unconfigured project and a project whose oracle held still are different facts; declare the glob that grades this project to tell them apart.',
      ),
    );
  } else {
    const notes = [
      `${String(oracle.justified.length)} justified change(s); ${String(oracle.advisory.length)} other change(s) to a declared oracle.`,
    ];
    if (oracle.unreadable.length > 0) {
      notes.push(
        `git could not be read for part of this range, so the oracle run is partial: ${oracle.unreadable.join("; ")}`,
      );
    }
    sections.push(
      dataSection(
        "oracle",
        "Oracle conservation",
        "Whether anything that grades this project was deleted, skipped or weakened in the range, and whether a decision accounted for it.",
        {
          count: oracle.findings.length,
          // Absent when git could not be read for part of the range. Zero
          // findings because nothing was diffed is not zero findings —
          // `oracle.ts` says so where it synthesizes the empty result — and a
          // card row over that count would render a partial run as a clean
          // one. The section keeps its count and table, which are true of what
          // *was* read; the row loses its figure and marks not-recorded, which
          // is the honest answer to "was anything weakened".
          ...(oracle.unreadable.length > 0 ? {} : { failing: oracle.findings.length }),
          table: {
            columns: ["verdict", "subject", "detail"],
            rows: oracle.findings.map((finding) => [
              finding.verdict.toUpperCase(),
              finding.record === undefined
                ? `${finding.subject}${finding.change === undefined ? "" : ` (${finding.change})`}`
                : `${finding.subject}:${finding.record}`,
              finding.detail,
            ]),
          },
          notes,
        },
      ),
    );
  }

  // --- Journal validation
  if (input.journalReports.length === 0) {
    sections.push(
      absentSection(
        "journal-validation",
        "Bundled journals re-validated",
        JOURNAL_VALIDATION_STATEMENT,
        `no journal to validate — ${input.bundle === null ? `no bundle at ${input.bundlePath}` : "the bundle carries none"}`,
      ),
    );
  } else {
    const rows = input.journalReports.map((entry) => {
      const failures = entry.report.findings.filter((finding) => finding.verdict !== "ok");
      return [
        entry.session,
        entry.report.version,
        String(entry.report.records),
        summariseJournalFindings(failures),
      ];
    });
    sections.push(
      dataSection(
        "journal-validation",
        "Bundled journals re-validated",
        JOURNAL_VALIDATION_STATEMENT,
        {
          count: input.journalReports.length,
          // How many of the bundled journals failed re-validation. A run whose
          // own record does not hold up cannot support any bundle-derived row,
          // and the card says so on one line rather than through several grey
          // ones.
          failing: input.journalReports.filter((entry) =>
            // `isJournalFailure`, not `verdict !== "ok"`: the validator owns
            // which verdicts fail, and a second copy here would over-flag the
            // first advisory journal verdict anyone adds.
            entry.report.findings.some((finding) => isJournalFailure(finding.verdict)),
          ).length,
          table: { columns: ["session", "schema", "records", "verdict"], rows },
        },
      ),
    );
  }

  // --- Canary
  const canary = input.canary ?? null;
  sections.push(
    dataSection(
      "canary",
      "Review probe",
      "Whether a canary claim is planted in a document under review. The location is never printed — printing it answers the question the probe asks.",
      {
        // Whether one is planted, and nothing about where. The section knows
        // only the registration state — not whether a reviewer found it — so
        // this figure reports an uncleared probe, which is a merge blocker, and
        // makes no claim about whether the review worked.
        failing: canary === null ? 0 : 1,
        notes: [
          canary === null
            ? "No canary is registered for this repository."
            : `A canary is registered (${describeCanary(canary)}). Run: nullius canary clear — before approval.`,
        ],
      },
    ),
  );

  return sections;
}

/**
 * What a failing anchor is rendered as.
 *
 * `canary-present` is the one verdict whose subject is suppressed: its
 * `source` is the planted document and the planted line, which is exactly the
 * pair the probe measures whether a reviewer found for themselves. The failure
 * is still counted and still shown — only its location is withheld.
 */
function anchorSubject(result: ReportResult): string {
  if (result.claim.kind === "canary") {
    return "CANARY-PRESENT — a registered canary is still planted in a checked document (location withheld); run: nullius canary clear — before approval";
  }
  return `${result.label} — ${result.source.doc}:${String(result.source.line)} — ${result.detail}`;
}

// ---------------------------------------------------------------------------
// The three bundle tiers
// ---------------------------------------------------------------------------

/**
 * The reason the three tier-count sections cannot be counted, or null.
 *
 * `provenance` is `null` below journal version `0.6`, and the report says so in
 * those words rather than printing a zero. A zero would be a claim that every
 * record was attributed and none of them landed in this tier; the truth is that
 * attribution was not recorded at all.
 */
function attributionBlock(
  input: RunReportInput,
  block: BundleBlock | null,
): string | null {
  if (block !== null) return block.reason;
  const unattributedJournals = input.journalReports.filter(
    (entry) => entry.report.provenance === null,
  );
  if (unattributedJournals.length === 0) return null;
  const detail = unattributedJournals
    .map((entry) => `'${entry.session}' is version ${entry.report.version}`)
    .join(", ");
  return `tier breakdown not recorded — ${detail}, and per-record attribution arrived at 0.6`;
}

function ledgerBlock(input: RunReportInput, block: BundleBlock | null): string | null {
  if (block !== null) return block.reason;
  const without = input.journalReports.filter((entry) => entry.report.ledger === null);
  if (without.length === 0) return null;
  const detail = without
    .map((entry) => `'${entry.session}' is version ${entry.report.version}`)
    .join(", ");
  return `ledger counts not recorded — ${detail}, and the run ledger's counters arrived at 0.6`;
}

function sumProvenance(
  input: RunReportInput,
  field: "hooks" | "selfReported" | "unattributed",
): number {
  let total = 0;
  for (const entry of input.journalReports) total += entry.report.provenance?.[field] ?? 0;
  return total;
}

function sumLedger(
  input: RunReportInput,
  field: "stages" | "findings" | "resolutions" | "checks" | "decisions" | "prompts",
): number {
  let total = 0;
  for (const entry of input.journalReports) total += entry.report.ledger?.[field] ?? 0;
  return total;
}

interface RecordSets {
  dispatches: RecordView[];
  reports: RecordView[];
  prompts: RecordView[];
  inRangeMutations: RecordView[];
  outOfRangeMutations: RecordView[];
  rounds: Round[];
  bursts: EditBurst[];
}

function hookAttestedSections(
  input: RunReportInput,
  block: BundleBlock | null,
  sets: RecordSets,
): ReportSection[] {
  const sections: ReportSection[] = [];
  const attribution = attributionBlock(input, block);
  const ledgerAbsent = ledgerBlock(input, block);

  const attributionStatement =
    "How many records the validator's provenance partition put in this tier. Journal-wide: `provenance` has no path predicate, so scoping it by the range would mean re-partitioning records here, which is the one thing this renderer does not do.";
  sections.push(
    attribution === null
      ? dataSection("hook-attribution", "Records attributed to the harness", attributionStatement, {
          count: sumProvenance(input, "hooks"),
        })
      : absentSection(
          "hook-attribution",
          "Records attributed to the harness",
          attributionStatement,
          attribution,
        ),
  );

  if (block !== null) {
    for (const [id, title] of [
      ["dispatches", "Dispatches"],
      ["outcomes", "Dispatch outcomes"],
      ["rounds", "Review rounds"],
      ["mutations", "Files mutated in the range"],
      ["edit-bursts", "Edit bursts"],
      ["findings", "Findings raised"],
      ["prompts", "Operator turns"],
      ["usage", "Model and tokens"],
    ] as const) {
      sections.push(absentSection(id, title, "Read from the bundled journals.", block.reason));
    }
    return sections;
  }

  // --- Dispatches, by agent. Journal-wide: a dispatch carries no path.
  const byAgent = new Map<string, number>();
  for (const record of sets.dispatches) {
    const agent = record.agent ?? "(no agent)";
    byAgent.set(agent, (byAgent.get(agent) ?? 0) + 1);
  }
  sections.push(
    dataSection(
      "dispatches",
      "Dispatches",
      "One row per agent. Journal-wide, not scoped by the range: a `dispatch` record carries no path to scope by.",
      {
        count: sets.dispatches.length,
        table: {
          columns: ["agent", "dispatches"],
          rows: [...byAgent.entries()]
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
            .map(([agent, count]) => [agent, String(count)]),
        },
      },
    ),
  );

  const outcomes = { found: 0, empty: 0, noReport: 0 };
  for (const entry of input.journalReports) {
    outcomes.found += entry.report.outcomes.found;
    outcomes.empty += entry.report.outcomes.empty;
    outcomes.noReport += entry.report.outcomes.noReport;
  }
  sections.push(
    dataSection(
      "outcomes",
      "Dispatch outcomes",
      "The validator's three terminal states, counted apart. `never reported` is the one a summary cannot surface on its own, because the missing record is missing.",
      {
        count: outcomes.found + outcomes.empty + outcomes.noReport,
        // The one of the three a reader acts on, lifted out of the table so a
        // consumer reads it as a number rather than by matching a row label.
        failing: outcomes.noReport,
        table: {
          columns: ["outcome", "count"],
          rows: [
            ["found", String(outcomes.found)],
            ["explicitly empty", String(outcomes.empty)],
            ["never reported", String(outcomes.noReport)],
          ],
        },
      },
    ),
  );

  sections.push(
    dataSection(
      "rounds",
      "Review rounds",
      `A round is a maximal set of dispatches starting within ${String(ROUND_WINDOW_MS)} ms of the first, with at least two members. A lone dispatch is not a round.`,
      {
        count: sets.rounds.length,
        table: {
          columns: ["round", "started", "dispatches", "agents"],
          rows: sets.rounds.map((round) => [
            String(round.index),
            round.startedAt,
            String(round.size),
            round.agents.join(", "),
          ]),
        },
      },
    ),
  );

  const mutationCounts = new Map<string, number>();
  for (const record of sets.inRangeMutations) {
    const path = record.path ?? "(no path)";
    mutationCounts.set(path, (mutationCounts.get(path) ?? 0) + 1);
  }
  sections.push(
    dataSection(
      "mutations",
      "Files mutated in the range",
      "Scoped by the range: this is a mutation-derived table, and mutation-derived tables and the flowchart are the only places scoping applies. The tier counts above are journal-wide.",
      {
        count: sets.inRangeMutations.length,
        table: {
          columns: ["path", "mutations"],
          rows: [...mutationCounts.entries()]
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
            .map(([path, count]) => [path, String(count)]),
        },
        notes: [
          `${String(sets.outOfRangeMutations.length)} mutation record(s) are present in the bundle and excluded here: their path is outside the range's changed files.`,
        ],
      },
    ),
  );

  sections.push(
    dataSection(
      "edit-bursts",
      "Edit bursts",
      "The in-range mutations between consecutive rounds or commits, grouped by path.",
      {
        count: sets.bursts.length,
        table: {
          columns: ["burst", "started", "mutations", "paths"],
          rows: sets.bursts.map((burst, index) => [
            String(index + 1),
            new Date(burst.startMs).toISOString(),
            String(burst.mutations),
            // `(n)` rather than `×n`: the mermaid allow-list forbids U+00D7
            // three sections down, and one document that spells the same idea
            // two ways invites the reader to conclude the rule is decorative.
            burst.paths.map((entry) => `${entry.path} (${String(entry.count)})`).join(", "),
          ]),
        },
      },
    ),
  );

  const findingsStatement =
    "`finding` records, counted by the validator. A finding carries no per-record origin: the recorder extracts it from the harness payload at the dispatch's terminal event, so the header's `hooks` is true of it.";
  sections.push(
    ledgerAbsent === null
      ? dataSection("findings", "Findings raised", findingsStatement, {
          count: sumLedger(input, "findings"),
        })
      : absentSection("findings", "Findings raised", findingsStatement, ledgerAbsent),
  );

  const promptStatement =
    "`prompt` records — what the operator asked for. The one record in the journal the agent did not cause.";
  if (ledgerAbsent !== null) {
    sections.push(absentSection("prompts", "Operator turns", promptStatement, ledgerAbsent));
  } else {
    sections.push(
      dataSection("prompts", "Operator turns", promptStatement, {
        count: sumLedger(input, "prompts"),
        table: {
          columns: ["at", "prompt"],
          rows: sets.prompts.map((record) => [
            record.at ?? "(no timestamp)",
            record.text ?? "(hashed — the bundle carried no text)",
          ]),
        },
      }),
    );
  }

  const withUsage = sets.reports.filter((record) => record.usageTotal !== null);
  const usageStatement =
    "Token usage the harness resolved for each dispatched agent, summed. Additive metadata no verdict reads.";
  if (withUsage.length === 0) {
    sections.push(
      absentSection(
        "usage",
        "Model and tokens",
        usageStatement,
        "no report record in the bundled journal(s) carries usage — the recorder writes token counts at journal version 0.6",
      ),
    );
  } else {
    const models = [...new Set(withUsage.map((record) => record.model ?? "(no model)"))].sort();
    sections.push(
      dataSection("usage", "Model and tokens", usageStatement, {
        count: withUsage.reduce((total, record) => total + (record.usageTotal ?? 0), 0),
        notes: [`Over ${String(withUsage.length)} report record(s). Models: ${models.join(", ")}.`],
      }),
    );
  }

  return sections;
}

function selfReportedSections(input: RunReportInput, block: BundleBlock | null): ReportSection[] {
  const attribution = attributionBlock(input, block);
  const ledgerAbsent = ledgerBlock(input, block);

  const attributionStatement =
    "How many records carried `origin: \"self-reported\"` of their own, or none under a self-reported header. Journal-wide.";
  const sections: ReportSection[] = [
    attribution === null
      ? dataSection(
          "self-attribution",
          "Records the coordinator claimed",
          attributionStatement,
          { count: sumProvenance(input, "selfReported") },
        )
      : absentSection(
          "self-attribution",
          "Records the coordinator claimed",
          attributionStatement,
          attribution,
        ),
  ];

  for (const [id, title, field, statement] of [
    ["stages", "Stages", "stages", "`stage` records — the pipeline phases the run went through."],
    [
      "resolutions",
      "Resolutions",
      "resolutions",
      "`resolution` records — what happened to each finding.",
    ],
    ["decisions", "Decisions", "decisions", "`decision` records — an approach chosen, and why."],
    ["checks", "Checks", "checks", "`check` records — a command ran, and what it showed."],
  ] as const) {
    sections.push(
      ledgerAbsent === null
        ? dataSection(id, title, statement, { count: sumLedger(input, field) })
        : absentSection(id, title, statement, ledgerAbsent),
    );
  }

  return sections;
}

function unattributedSections(input: RunReportInput, block: BundleBlock | null): ReportSection[] {
  const attribution = attributionBlock(input, block);
  const statement =
    "The validator's third partition: records with no origin of their own under a header whose origin is null or absent, plus any record whose origin this schema cannot read. Journal-wide.";
  return [
    attribution === null
      ? dataSection("unattributed", "Records that belong to nobody", statement, {
          count: sumProvenance(input, "unattributed"),
        })
      : absentSection("unattributed", "Records that belong to nobody", statement, attribution),
  ];
}

// ---------------------------------------------------------------------------
// Flowchart
// ---------------------------------------------------------------------------

/** Ties are broken by this rank, so two events at the same millisecond always
 *  render in the same order. */
const EVENT_RANK: Record<string, number> = { prompt: 0, round: 1, burst: 2, commit: 3 };

function buildFlowchart(
  rounds: readonly Round[],
  bursts: readonly EditBurst[],
  commits: readonly BundleCommit[],
  prompts: readonly RecordView[],
): Flowchart | null {
  interface Event {
    atMs: number;
    type: keyof typeof EVENT_RANK;
    key: string;
    label: string;
  }
  const events: Event[] = [];

  for (const round of rounds) {
    events.push({ atMs: round.startMs, type: "round", key: String(round.index), label: round.label });
  }
  for (const burst of bursts) {
    const files = burst.paths.length;
    events.push({
      atMs: burst.startMs,
      type: "burst",
      key: String(burst.startMs),
      label: `${String(burst.mutations)} edits / ${String(files)} file(s)`,
    });
  }
  for (const commit of commits) {
    const at = Date.parse(commit.at);
    if (!Number.isFinite(at)) continue;
    events.push({ atMs: at, type: "commit", key: commit.sha, label: `commit ${shortSha(commit.sha)}` });
  }
  for (const record of prompts) {
    if (record.atMs === null) continue;
    events.push({
      atMs: record.atMs,
      type: "prompt",
      key: record.id ?? String(record.line),
      label: `prompt: ${record.text ?? "(hashed)"}`,
    });
  }

  if (events.length === 0) return null;

  events.sort(
    (a, b) =>
      a.atMs - b.atMs ||
      (EVENT_RANK[a.type] ?? 9) - (EVENT_RANK[b.type] ?? 9) ||
      a.key.localeCompare(b.key),
  );

  const dropped = Math.max(0, events.length - FLOWCHART_NODE_CAP);
  const shown = events.slice(0, FLOWCHART_NODE_CAP);

  const lines = ["flowchart LR"];
  shown.forEach((event, index) => {
    const id = `n${String(index)}`;
    // Node ids are generated, never derived from content: an id is the one
    // position in the grammar quoting cannot protect.
    lines.push(`  ${id}[${mermaidLabel(event.label)}]`);
  });
  for (let index = 1; index < shown.length; index += 1) {
    lines.push(`  n${String(index - 1)} --> n${String(index)}`);
  }

  return {
    mermaid: lines.join("\n"),
    nodes: shown.length,
    windowMs: ROUND_WINDOW_MS,
    dropped,
  };
}

// ---------------------------------------------------------------------------
// Renderers
// ---------------------------------------------------------------------------

function renderTable(table: ReportTable): string[] {
  if (table.rows.length === 0) return ["_no rows_"];
  const lines = [
    `| ${table.columns.map(escapeCell).join(" | ")} |`,
    `| ${table.columns.map(() => "---").join(" | ")} |`,
  ];
  for (const row of table.rows) {
    lines.push(`| ${row.map(escapeCell).join(" | ")} |`);
  }
  return lines;
}

/**
 * The markdown form — what the Action posts, verbatim and without ever
 * interpolating a report string into a workflow command.
 */
/**
 * The card, as the lines that lead the document.
 *
 * Renders only what `buildCard` returned: an id, a question, a section id, a
 * tier and a mark, every one of them a constant declared in this file. No
 * contributor-controlled string reaches these lines, which is a stronger
 * property than escaping one would be — it survives someone deleting an escape
 * call. `escapeCell` is still applied, because a constant that stops being one
 * should not silently become an injection.
 */
export function renderCard(card: Card): string[] {
  const out: string[] = [];
  out.push("## How this run was produced");
  out.push("");

  const total = card.rows.length;
  if (card.unanswerable === 0) {
    out.push(`All ${String(total)} checks below have an answer.`);
  } else {
    out.push(
      `**${String(card.unanswerable)} of ${String(total)}** checks could not be answered — ` +
        "the sections they read recorded nothing. A row with a hollow mark is a question this run " +
        "cannot answer, which is not the same as a clean result.",
    );
  }
  out.push("");
  // Said once, above the table, because a reader skims marks rather than
  // columns and the tier column alone does not carry it.
  out.push(
    "_A `code-verified` row was re-computed here by re-reading the repository. " +
      "A `hook-attested` row comes from records the harness wrote, which the agent " +
      "had no opportunity to decline. A `self-reported` row is the coordinator's " +
      "own account of its run, and is the weakest of the three._",
  );
  out.push("");
  out.push("| | check | reads | tier |");
  out.push("| --- | --- | --- | --- |");
  for (const row of card.rows) {
    out.push(
      `| ${MARK_GLYPH[row.mark]} ${MARK_WORD[row.mark]} | ${escapeCell(row.question)} | \`${escapeCell(row.section)}\` | ${escapeCell(row.tier)} |`,
    );
  }

  if (card.omitted.length > 0) {
    out.push("");
    out.push(
      `${String(card.omitted.length)} row(s) are not shown because no section in this ` +
        `report answers them: ${card.omitted.map((id) => escapeCell(id)).join(", ")}.`,
    );
  }
  return out;
}

export function renderMarkdown(
  report: RunReport,
  options: { budgetBytes?: number } = {},
): string {
  const out: string[] = [];
  /** Reason text -> the section title that stated it in full. */
  const reasonFirstStated = new Map<string, string>();
  out.push(`# Run report — ${escapeCell(report.range.spec)}`);
  out.push("");
  out.push(
    `${String(report.range.commits)} commit(s), ${String(report.range.changedFiles)} file(s) changed. ` +
      "This report renders what happened; it does not gate. Every section shows its data or says why it has none.",
  );

  // Ahead of the tiers, and therefore ahead of anything the budget can cut:
  // truncation slices from the end, so the summary is the last thing lost.
  //
  // Rebuilt from `report.tiers` rather than read from `report.card`, and the
  // difference matters. The tiers are the source; a `card` handed in by a
  // caller is a claim about them. Deriving here means the rendered card cannot
  // disagree with the document it sits on top of, even for a report assembled
  // by hand — which is the same reason every verdict in this project re-reads
  // the artefact instead of trusting a field. For a report from
  // `buildRunReport` the two are identical, and a test asserts it.
  out.push("");
  out.push(...renderCard(buildCard(report)));

  for (const tier of report.tiers) {
    out.push("");
    out.push(`## ${tier.title}`);
    out.push("");
    out.push(`_${tier.provenance}_`);
    for (const section of tier.sections) {
      out.push("");
      const heading =
        section.count === undefined
          ? `### ${section.title}`
          : `### ${section.title} — ${String(section.count)}`;
      out.push(heading);
      out.push("");
      out.push(section.statement);
      if (section.status === "not-recorded") {
        out.push("");
        const reason = section.reason ?? "";
        const first = reasonFirstStated.get(reason);
        if (first === undefined) {
          reasonFirstStated.set(reason, section.title);
          out.push(`**Not recorded:** ${escapeCell(reason)}`);
        } else {
          // One cause blocking fourteen sections is one fact. Restating it
          // under each of them is how a 21 KB comment spent 6 KB saying the
          // same sentence thirty times, and buried the one section that could
          // be acted on. The JSON form still carries every reason in full.
          out.push(`**Not recorded:** as above, under "${escapeCell(first)}".`);
        }
        continue;
      }
      if (section.table !== undefined) {
        out.push("");
        out.push(...renderTable(section.table));
      }
      for (const note of section.notes) {
        out.push("");
        out.push(escapeCell(note));
      }
    }
  }

  if (report.flowchart !== null) {
    out.push("");
    out.push("## Timeline");
    out.push("");
    out.push("```mermaid");
    out.push(report.flowchart.mermaid);
    out.push("```");
    out.push("");
    out.push(
      `Rounds group dispatches starting within ${String(report.flowchart.windowMs)} ms of the first.` +
        (report.flowchart.dropped > 0
          ? ` ${String(report.flowchart.dropped)} later node(s) are not shown; the JSON form carries them all.`
          : ""),
    );
  }

  out.push("");
  out.push("## Not recorded");
  out.push("");
  if (report.notRecorded.length === 0) {
    out.push("Nothing. Every section above carries data.");
  } else {
    // Grouped by cause, in first-seen order. The JSON form keeps one entry per
    // section: this is a rendering of that list, not a shorter version of it.
    const byReason = new Map<string, string[]>();
    for (const entry of report.notRecorded) {
      const where = entry.tier === null ? entry.section : `${entry.tier} / ${entry.section}`;
      const existing = byReason.get(entry.reason);
      if (existing === undefined) byReason.set(entry.reason, [where]);
      else existing.push(where);
    }
    for (const [reason, wheres] of byReason) {
      // A cause covering one section keeps the original shape. Where it covers
      // many, the cause leads: it is the actionable half, and putting fifteen
      // bold section names in front of it is how the reader loses it.
      if (wheres.length === 1) {
        out.push(`- **${escapeCell(wheres[0] ?? "")}** — ${escapeCell(reason)}`);
        continue;
      }
      out.push(`- **${String(wheres.length)} section(s)** — ${escapeCell(reason)}`);
      out.push(`  - ${wheres.map((where) => escapeCell(where)).join(", ")}`);
    }
  }
  out.push("");

  const body = out.join("\n");
  const budget = options.budgetBytes ?? MARKDOWN_BUDGET_BYTES;
  if (body.length <= budget) return body;

  const notice =
    "\n\n> **Truncated** — this report exceeded the comment budget. The full document is the JSON form (`witness report --format json`).\n";
  const room = budget - notice.length;
  const cut = body.slice(0, Math.max(0, room));
  const lastBreak = cut.lastIndexOf("\n");
  return `${lastBreak > 0 ? cut.slice(0, lastBreak) : cut}${notice}`;
}

/** One pretty-printed JSON document, two-space indent, trailing newline. */
export function renderJson(report: RunReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}
