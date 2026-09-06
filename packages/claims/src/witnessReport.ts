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
import { escapeCell, formatCount, plural } from "./markdown";
import type { CheckReport, ReportResult } from "./checkReport";
import type { OracleReport } from "./oracle";
import { isJournalFailure, type JournalFinding, type JournalReport } from "./witness";

/** The report document's own schema version. Independent of `REPORT_VERSION`
 *  (`check --format json`) and of the envelope's `version`: three documents on
 *  one CLI that break on different events, told apart by `kind`.
 *
 *  2 adds the `card` key at the top level. 3 adds `totalCommits` and
 *  `agentCommits` to `flowchart`. A consumer that recognises only an older
 *  version must refuse this document rather than read the fields it knows,
 *  which is why the number moves for an additive change: the Action's
 *  accepted set is the thing that decides compatibility, not this file's
 *  optimism. */
export const RUN_REPORT_VERSION = 3;

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
  /**
   * The commit's subject line. Optional: the bundle's own embedded
   * `range.commits` (parsed below) predates this field and never carries it —
   * only the live git read `witness report` actually renders from does.
   */
  message?: string;
  /**
   * The value of a `Co-authored-by` trailer, if the commit has one. Same
   * optionality reasoning as `message`. See `isAgentCoAuthored` for what this
   * is (and is not) used to claim.
   */
  coAuthor?: string;
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

export { escapeCell, formatCount, plural } from "./markdown";

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
 *
 * A *run* of disallowed characters collapses to one `·`, not one per
 * character — the `+` below. A commit subject like `gloss "stale", stop`
 * has a quote directly followed by a comma; without the `+` that pair
 * becomes `··`, which reads as corruption rather than punctuation. The
 * one-run-one-dot rule is what keeps a quoted, comma-adjacent word looking
 * like `·stale·` instead.
 */
const MERMAID_ALLOWED = /[^A-Za-z0-9 ._:/x()-]+/g;

export function escapeMermaidLabel(value: string): string {
  const replaced = value.replace(MERMAID_ALLOWED, "·");
  if (replaced.length <= MERMAID_LABEL_CAP) return replaced;
  // The ellipsis is three ASCII dots rather than `…`: `.` is inside the
  // allow-list and `…` is not, so a one-character ellipsis would be replaced
  // by `·` and the truncation would stop being legible as a truncation.
  const budget = MERMAID_LABEL_CAP - 3;
  const hardCut = replaced.slice(0, budget);
  // Break at the last word boundary inside the budget, not mid-word — a
  // fixed-offset cut on real commit-message text produces `...shape
  // assertio...` and, worse, a truncated single-character substitution
  // stranded right against the ellipsis (`...feedback ·...`), both of which
  // read as corrupted text rather than an intentionally shortened sentence.
  // Only trusted when the boundary is not so early it would throw away most
  // of the label — no real word in commit-message prose runs anywhere near
  // the cap, so a very early (or absent) space means there is no good
  // boundary to break at, and the hard cut is the honest fallback.
  const lastSpace = hardCut.lastIndexOf(" ");
  const cut = lastSpace > budget * 0.4 ? hardCut.slice(0, lastSpace) : hardCut;
  return `${cut}...`;
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
  /** Commit nodes actually drawn (after the `FLOWCHART_NODE_CAP`), and how
   *  many of those carry a Claude co-author trailer — see
   *  `isAgentCoAuthored`. A uniform 0 or a uniform match against
   *  `totalCommits` is exactly the case where the stadium-shape convention
   *  draws no contrast, which is why a renderer needs the raw counts rather
   *  than re-deriving them by parsing `mermaid` back out. */
  totalCommits: number;
  agentCommits: number;
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
  /**
   * Why this row is unanswerable, taken verbatim from its section. Present only
   * on a `not-recorded` row.
   *
   * Carried so the card can say a shared cause once rather than leaving a
   * reader to count hollow marks and guess. It is the section's own text, not
   * a summary of it: one missing bundle blocking four rows is one fact, and a
   * reader who sees four unexplained hollows has been told four.
   */
  reason?: string;
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
  /**
   * Why the canary registry could not be read, when it could not.
   *
   * `loadActiveCanary` returns `entry: null` alongside a warning for an
   * unparseable registry, an invalid entry, and an unsafe path — three states
   * where "no canary is registered" is a guess rather than a reading. Without
   * this the row renders clear over a registry nobody could open, which is the
   * same defect as a synthesized zero and reached this report through a
   * destructuring that dropped the warning.
   */
  canaryUnreadable?: string;
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
    "Records with no origin of their own, filed under a header that names none either. Counting these as hook-attested would be a guess this report refuses to make.",
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
    const mark = markOf(found.section, spec);
    const reason = found.section.reason;
    rows.push({
      id: spec.id,
      question: spec.question,
      section: spec.section,
      tier: found.tier,
      mark,
      ...(mark === "not-recorded" && reason !== undefined ? { reason } : {}),
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
  // Journals whose body was never read, and therefore whose counts are
  // deliberate zeros rather than measurements.
  //
  // This used to be "any journal carrying any failing finding", and that was
  // the renderer making the validator's judgement a second time and worse. A
  // journal with twenty verified dispatch records was contributing nothing to
  // the report because a resolution elsewhere in the same file pointed at a
  // missing id — a blank that read as "no review happened" when the answer was
  // "twenty dispatches, and some bookkeeping is wrong".
  //
  // The validator already refuses to report counts it cannot stand behind: it
  // zeroes them when nothing past the header was read, and it excludes every
  // record it rejects from the counts it does report. `bodyRead` is that
  // decision stated in a field, so nothing here needs a list of which verdicts
  // invalidate which number — the list that would drift the moment a verdict
  // is added.
  const failedJournals = input.journalReports.filter((entry) => !entry.report.bodyRead);

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
        const first = entry.report.findings.find((finding) => isJournalFailure(finding.verdict));
        return `${entry.session} declares version ${entry.report.version}${first === undefined ? "" : ` and reports ${first.verdict.toUpperCase()} at line ${String(first.line)}`}`;
      })
      .join("; ");
    block = {
      reason: `a bundled journal could not be read past its header, so its counts are zeros rather than measurements — ${detail}; the finding is under "Bundled journals re-validated" above`,
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
      `+${String(dropped)} further distinct ${plural(dropped, "finding")} — the JSON form carries them all`,
    );
  }
  return rendered.join("; ");
}

function codeVerifiedSections(input: RunReportInput): ReportSection[] {
  const sections: ReportSection[] = [];

  // Deliberately not rendered as their own sections: which commits and which
  // files are in range is exactly what GitHub's own Commits and Files-changed
  // tabs already show, natively, on the same PR — restating a `git log` or
  // `git diff --name-status` listing here is not "how this run was
  // produced," it's the one fact a reader is least likely to need explained
  // again. The counts still drive the subtitle, the mutation-scoping tables
  // below, and the diagram's commit nodes; only the standalone tables are
  // gone.

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
      `${String(check.summary.failures)} failing, over ${String(check.summary.documents)} ${plural(check.summary.documents, "document")}.`,
    ];
    // The verdict table below names "stale" as its own bucket with no gloss,
    // sitting one row under a card mark that already said "clear" — a reader
    // who opens this section to see what's behind that glyph finds a bucket
    // the lede's own ⚪/✅ vocabulary never covers. `stale` is advisory, not a
    // failure: the quote was real at the stamped commit, only the line
    // number needs a re-read.
    if ((check.summary.verdicts["stale"] ?? 0) > 0) {
      notes.push(
        `"stale" is not a failure: the quoted text was real at the commit it names, and only the line number has moved since.`,
      );
    }
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
          //
          // Withheld when any anchor came back `unverifiable-rev`. That verdict
          // passes, and it should — a clone that cannot resolve a commit has no
          // evidence about the author. But it means the stamped half of those
          // citations was never settled, so `failures: 0` is "nothing was
          // checked", not "nothing failed". `merge-never-squash.md` names this
          // exactly: a disarmed gate and a satisfied one produce the same green
          // check. The verdict counts stay in the table below, which is where a
          // reader sees how many.
          //
          // Also withheld when nothing was checked. `checkReport.ts` names this
          // shape where it computes the signal: "All 0 grounding marker(s)
          // verified." is literally true and reads as a pass on a repository
          // the tool has not examined. `summary.next` is non-null exactly then,
          // and it is the kernel's own answer rather than a recount here.
          ...(unverifiableAnchors(check) > 0 || check.summary.next !== null || results.length === 0
            ? {}
            : { failing: check.summary.failures }),
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
      `${String(oracle.justified.length)} justified ${plural(oracle.justified.length, "change")}; ` +
        `${String(oracle.advisory.length)} other ${plural(oracle.advisory.length, "change")} to a declared oracle` +
        (oracle.advisory.length > 0 ? `: ${oracle.advisory.join(", ")}` : "") +
        ".",
    ];
    if (oracle.advisory.length > 0) {
      // The card row above reads "no unjustified changes" precisely because
      // an advisory change is neither a finding nor a violation — it is a
      // real touch to a declared oracle file this checker doesn't require
      // justification for. Without this line, a reader who sees "0 findings"
      // above and "N other changes" here has been handed two numbers with no
      // stated relationship between them.
      notes.push(
        `An advisory change is a genuine touch to a declared oracle file — this checker does not require it to be justified, and it is not counted as a finding.`,
      );
    }
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
          // Withheld whenever some part of the run did not happen, not only
          // when git failed. `weakeningUnchecked` names every declared oracle
          // glob with no `weakening` marker, which means the weakened sub-check
          // never ran — and "was anything weakened" is precisely this row's
          // question. Zero findings from a check that was skipped is not zero
          // findings.
          ...(oracle.unreadable.length > 0 || oracle.weakeningUnchecked.length > 0
            ? {}
            : { failing: oracle.findings.length }),
          // Omitted entirely when there are no findings, rather than a table
          // that renders as a bare "_no rows_" — the note right below already
          // states the count in prose, and a placeholder saying the same
          // thing in fewer words reads as unrendered scaffold, not content.
          ...(oracle.findings.length === 0
            ? {}
            : {
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
              }),
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
      const failures = entry.report.findings.filter((finding) => isJournalFailure(finding.verdict));
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
  const canaryUnreadable = input.canaryUnreadable;
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
        //
        // Withheld when the registry could not be read. A null entry from an
        // unparseable registry and a null entry from an empty one are the same
        // value and different facts.
        ...(canaryUnreadable === undefined ? { failing: canary === null ? 0 : 1 } : {}),
        notes: [
          canaryUnreadable !== undefined
            ? `The canary registry could not be read, so whether a probe is planted is unknown — ${canaryUnreadable}`
            : canary === null
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
/**
 * Anchors whose stamped commit could not be resolved.
 *
 * `unverifiable-rev` is a passing verdict and belongs in the passing set: a
 * clone that cannot read the history it was pointed at has learned nothing
 * about the author, and accusing them would be the wrong call. But a passing
 * verdict is not a verified one, and a card row that cannot tell the two apart
 * reports a disarmed gate as a satisfied one.
 */
function unverifiableAnchors(check: CheckReport): number {
  return check.summary.verdicts["unverifiable-rev"] ?? 0;
}

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
    "How many records the harness attributed to this tier, across this entire working session rather than just this PR.";
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
      "One row per agent, across this entire working session rather than just this PR.",
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
  let dispatchCount = 0;
  for (const entry of input.journalReports) {
    outcomes.found += entry.report.outcomes.found;
    outcomes.empty += entry.report.outcomes.empty;
    outcomes.noReport += entry.report.outcomes.noReport;
    dispatchCount += entry.report.dispatches;
  }
  // Dispatches with no terminal record of any kind. The validator reports each
  // as NO-TERMINAL and counts it in none of the three states, so the shortfall
  // between dispatches and terminals is exactly the set that never came back.
  const neverTerminated = Math.max(
    0,
    dispatchCount - (outcomes.found + outcomes.empty + outcomes.noReport),
  );
  sections.push(
    dataSection(
      "outcomes",
      "Dispatch outcomes",
      "The three ways a dispatch can end, counted apart. `never reported` is the one that can only show up here — there's no record anywhere else for a summary to surface.",
      {
        count: outcomes.found + outcomes.empty + outcomes.noReport,
        // The one of the three a reader acts on, lifted out of the table so a
        // consumer reads it as a number rather than by matching a row label.
        //
        // Withheld when no dispatch reached a terminal state at all. A journal
        // whose schema this build cannot read contributes three zeros, and
        // `noReport: 0` then means "nothing was counted" rather than "every
        // review reported back". `journal-validation` flags that separately,
        // but a row has to stand on its own section.
        //
        // The figure is `noReport` PLUS every dispatch that reached no terminal
        // record at all. Those are NO-TERMINAL findings and are in none of the
        // three outcome states, so counting only `noReport` reported "every
        // review reported back" over a dispatch that demonstrably did not — the
        // same shape of zero this report exists to refuse, and one a blanket
        // block was hiding rather than answering.
        ...(outcomes.found + outcomes.empty + outcomes.noReport === 0
          ? {}
          : { failing: outcomes.noReport + neverTerminated }),
        table: {
          columns: ["outcome", "count"],
          rows: [
            ["found", String(outcomes.found)],
            ["explicitly empty", String(outcomes.empty)],
            ["never reported", String(outcomes.noReport)],
            // Last, because it is the one the other three cannot account for:
            // a dispatch with no terminal record is in none of their counts.
            ["no terminal record at all", String(neverTerminated)],
          ],
        },
      },
    ),
  );

  sections.push(
    dataSection(
      "rounds",
      "Review rounds",
      `A round is a maximal set of dispatches starting within ${formatDuration(ROUND_WINDOW_MS)} of the first, with at least two members. A lone dispatch is not a round.`,
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
  // `git diff --name-status` and the bundle's mutation records come from two
  // independent sources, and they are not required to agree: a file `git`
  // counts as changed can carry zero recorder-attributed edits — created
  // outside a hooked tool, or moved rather than edited. Silent about it, a
  // reader who compares this table's row count against "Files changed" above
  // reads the gap as a bug in the count rather than the fact that it is.
  const silent = [...new Set(input.changedFiles)]
    .filter((path) => !mutationCounts.has(path))
    .sort((a, b) => a.localeCompare(b));
  sections.push(
    dataSection(
      "mutations",
      "Files mutated in the range",
      "Scoped to this PR's changed files — unlike the tier counts above, which span the whole session.",
      {
        count: sets.inRangeMutations.length,
        table: {
          columns: ["path", "mutations"],
          rows: [...mutationCounts.entries()]
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
            .map(([path, count]) => [path, String(count)]),
        },
        notes: [
          `${String(sets.outOfRangeMutations.length)} mutation ${plural(sets.outOfRangeMutations.length, "record")} ${plural(sets.outOfRangeMutations.length, "is", "are")} present in the bundle and excluded here: their path is outside the range's changed files.`,
          ...(silent.length === 0
            ? []
            : [
                `${String(silent.length)} changed ${plural(silent.length, "file")} ${plural(silent.length, "carries", "carry")} no recorded edit at all — ${silent.join(", ")}. Not necessarily a gap: a generated file, a rename, or an edit made outside a hooked tool would all look like this too.`,
              ]),
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
    "How many findings agents raised during review, read from each dispatch's final report — a moment the harness itself captures, which is why these count as hook-attested even though a finding carries no origin of its own.";
  sections.push(
    ledgerAbsent === null
      ? dataSection("findings", "Findings raised", findingsStatement, {
          count: sumLedger(input, "findings"),
        })
      : absentSection("findings", "Findings raised", findingsStatement, ledgerAbsent),
  );

  const promptStatement =
    "`prompt` records — what the operator asked for. The one record kind in the journal the agent did not cause.";
  if (ledgerAbsent !== null) {
    sections.push(absentSection("prompts", "Operator turns", promptStatement, ledgerAbsent));
  } else {
    // A harness wakeup is also a `prompt` record — the coordinator resuming
    // after a dispatch, not the operator asking for anything — so it belongs
    // in the Timeline as the "agent reported back" node it already is there,
    // not in a table whose own count is the coordinator's own tally of
    // genuine operator turns. Filtering here is what keeps that count and
    // this table naming the same thing, rather than a row count a reader has
    // no way to reconcile with the heading above it.
    const genuine = sets.prompts.filter((record) => !isHarnessWakeup(record.text ?? ""));
    const wakeups = sets.prompts.length - genuine.length;
    sections.push(
      dataSection("prompts", "Operator turns", promptStatement, {
        count: sumLedger(input, "prompts"),
        table: {
          columns: ["at", "prompt"],
          rows: genuine.map((record) => [
            record.at ?? "(no timestamp)",
            record.text ?? "(hashed — the bundle carried no text)",
          ]),
        },
        notes:
          wakeups === 0
            ? []
            : [
                `${String(wakeups)} harness ${plural(wakeups, "wakeup")} ${plural(wakeups, "is", "are")} excluded here — that's the coordinator resuming after a dispatch, shown in the Timeline below, not an operator turn.`,
              ],
      }),
    );
  }

  const withUsage = sets.reports.filter((record) => record.usageTotal !== null);
  const usageStatement =
    "Token usage the harness recorded for each dispatched agent, summed. Informational only — no check in this report depends on it.";
  if (withUsage.length === 0) {
    sections.push(
      absentSection(
        "usage",
        "Model and tokens",
        usageStatement,
        "no report record in the bundled journals carries usage — the recorder writes token counts at journal version 0.6",
      ),
    );
  } else {
    const models = [...new Set(withUsage.map((record) => record.model ?? "(no model)"))].sort();
    sections.push(
      dataSection("usage", "Model and tokens", usageStatement, {
        count: withUsage.reduce((total, record) => total + (record.usageTotal ?? 0), 0),
        notes: [
          `Over ${String(withUsage.length)} report ${plural(withUsage.length, "record")}. Models: ${models.join(", ")}.`,
        ],
      }),
    );
  }

  return sections;
}

function selfReportedSections(input: RunReportInput, block: BundleBlock | null): ReportSection[] {
  const attribution = attributionBlock(input, block);
  const ledgerAbsent = ledgerBlock(input, block);

  const attributionStatement =
    "How many records the coordinator reported about itself, across this entire working session.";
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
      // Not "each finding": one resolution can cover several findings raised
      // together, and this count has no reason to match "Findings raised"
      // above — the two live in different tiers for exactly that reason.
      "`resolution` records — what the coordinator says happened to a finding. Not one-to-one with findings raised: several can share a single resolution.",
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
  // The tier description just above already says what qualifies as
  // unattributed — this is the one section in that tier, so this statement
  // adds only what the tier line doesn't already cover, instead of repeating
  // it a few lines down.
  const statement =
    "What's described above, plus any record whose origin this report simply can't read at all. Counted across this entire working session.";
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
 *  render in the same order. `human` and `system` share a rank: both are
 *  `prompt` records at the source, and only their content tells them apart. */
const EVENT_RANK: Record<string, number> = { human: 0, system: 0, round: 1, burst: 2, commit: 3 };

/**
 * Mermaid `classDef` colors, one per event kind. Explicit fill/text/stroke
 * triples rather than mermaid's default theme palette: GitHub's renderer does
 * not reliably carry the page's light/dark toggle into an un-styled
 * flowchart's node fills, so a hard-coded pair is what keeps this legible in
 * both rather than betting on a theme variable resolving the way it does
 * locally.
 */
const EVENT_STYLE: Record<string, { fill: string; text: string; stroke: string }> = {
  human: { fill: "#4C6EF5", text: "#ffffff", stroke: "#364FC7" },
  system: { fill: "#adb5bd", text: "#212529", stroke: "#868e96" },
  round: { fill: "#2F9E44", text: "#ffffff", stroke: "#2B8A3E" },
  burst: { fill: "#F59F00", text: "#212529", stroke: "#E67700" },
  commit: { fill: "#7048E8", text: "#ffffff", stroke: "#5F3DC4" },
};

/**
 * A harness re-invocation dressed up as a `prompt` record: the coordinator
 * waking back up after dispatching an agent, not a human typing something.
 * Undetected, this renders as a wall of escaped XML — `<task-notification>`
 * run through `escapeMermaidLabel`'s allow-list becomes a string of `·`
 * fragments with no content left in it, which is real diagram output PR #92
 * actually posted. Detected, it renders as one short, honest label instead.
 */
function isHarnessWakeup(text: string): boolean {
  return text.includes("<task-notification>");
}

/**
 * True when a commit's `Co-authored-by` trailer names Claude — the one
 * agent-authorship convention this repo's own CLAUDE.md prescribes for every
 * commit an agent makes here. This is a string match against trailer text,
 * not a verified identity: a human could type the same trailer by hand, and
 * an agent that skips this exact wording will not match. It exists to give a
 * run with no recorded bundle *some* honest signal to draw a diagram from —
 * a git-only fallback, not a claim nullius could stand behind the way a
 * bundled run's own dispatch records let it.
 */
function isAgentCoAuthored(coAuthor: string | undefined): boolean {
  return coAuthor !== undefined && /claude/i.test(coAuthor);
}

function buildFlowchart(
  rounds: readonly Round[],
  bursts: readonly EditBurst[],
  commits: readonly BundleCommit[],
  prompts: readonly RecordView[],
): Flowchart | null {
  interface Event {
    atMs: number;
    type: keyof typeof EVENT_STYLE;
    key: string;
    label: string;
    /** Only for `round`: one sub-node per agent, in place of a single node —
     *  the shape a concurrent dispatch actually has. */
    agents?: string[];
    /** Only for `system`: how many consecutive harness-wakeup events this
     *  node stands in for, after coalescing. Absent means 1. */
    count?: number;
    /** Only for `commit`: draw this node with rounded ends, the same shape a
     *  round's agent boxes use — see `isAgentCoAuthored`. */
    agentCoAuthored?: boolean;
  }
  const events: Event[] = [];

  for (const round of rounds) {
    events.push({
      atMs: round.startMs,
      type: "round",
      key: String(round.index),
      label: round.label,
      agents: round.agents,
    });
  }
  for (const burst of bursts) {
    const files = burst.paths.length;
    events.push({
      atMs: burst.startMs,
      type: "burst",
      key: String(burst.startMs),
      label: `${String(burst.mutations)} edits / ${String(files)} ${plural(files, "file")}`,
    });
  }
  for (const commit of commits) {
    const at = Date.parse(commit.at);
    if (!Number.isFinite(at)) continue;
    events.push({
      atMs: at,
      type: "commit",
      key: commit.sha,
      // The message, not just the hash: a hash tells a reader which commit,
      // never what it did. `mermaidLabel`'s own cap truncates a long subject
      // the same way it already truncates every other label.
      label:
        commit.message === undefined || commit.message.length === 0
          ? `commit ${shortSha(commit.sha)}`
          : `${shortSha(commit.sha)} ${commit.message}`,
      agentCoAuthored: isAgentCoAuthored(commit.coAuthor),
    });
  }
  for (const record of prompts) {
    if (record.atMs === null) continue;
    const text = record.text ?? "(hashed)";
    const wakeup = isHarnessWakeup(text);
    events.push({
      atMs: record.atMs,
      type: wakeup ? "system" : "human",
      key: record.id ?? String(record.line),
      label: wakeup ? "agent reported back" : `prompt: ${text}`,
    });
  }

  if (events.length === 0) return null;

  events.sort(
    (a, b) =>
      a.atMs - b.atMs ||
      (EVENT_RANK[a.type] ?? 9) - (EVENT_RANK[b.type] ?? 9) ||
      a.key.localeCompare(b.key),
  );

  // A round's own fan-in already shows that several agents converged; the
  // harness wakeup that follows is one near-identical, anonymous node per
  // agent — `n4["agent reported back"]`, `n5["agent reported back"]`,
  // `n6["agent reported back"]`, chained as if the third depended on the
  // second. There is no per-record agent attribution on these events to
  // label them correctly (a `<task-notification>` payload carries a task
  // description, not an agent name), and inventing one would be exactly the
  // fabricated attribution this file refuses to produce anywhere else. So a
  // run of consecutive `system` events collapses into one honest node that
  // states a count instead of N nodes that state nothing new.
  const coalesced: Event[] = [];
  for (const event of events) {
    const last = coalesced[coalesced.length - 1];
    if (event.type === "system" && last !== undefined && last.type === "system") {
      const runLength = (last.count ?? 1) + 1;
      last.count = runLength;
      last.label = `${String(runLength)} agents reported back`;
      continue;
    }
    coalesced.push({ ...event });
  }

  const dropped = Math.max(0, coalesced.length - FLOWCHART_NODE_CAP);
  const shown = coalesced.slice(0, FLOWCHART_NODE_CAP);

  // Every event contributes one or more "anchor" node ids: what the edge from
  // the previous event lands on, and what the edge to the next event leaves
  // from. Both are the same single id for every kind except `round`, whose
  // agents fan out from the predecessor and fan back into the successor —
  // concurrent work rendered as concurrent boxes, rather than one node
  // labelled with a dispatch count a reader has to take on faith.
  const lines = ["flowchart LR"];
  const anchors: string[][] = [];
  let renderedNodes = 0;

  shown.forEach((event, index) => {
    if (event.type === "round" && event.agents !== undefined && event.agents.length > 0) {
      const ids = event.agents.map((_, agentIndex) => `n${String(index)}_${String(agentIndex)}`);
      lines.push(`  subgraph s${String(index)}[${mermaidLabel(event.label)}]`);
      event.agents.forEach((agent, agentIndex) => {
        // Stadium shape, not a rectangle: the one visual cue in this diagram
        // that says "this box is an agent", independent of its color.
        lines.push(`  ${ids[agentIndex]}([${mermaidLabel(agent)}])`);
      });
      lines.push("  end");
      anchors.push(ids);
      renderedNodes += ids.length;
    } else {
      const id = `n${String(index)}`;
      // Node ids are generated, never derived from content: an id is the one
      // position in the grammar quoting cannot protect.
      // The same stadium shape as a round's agent boxes, reused here so a
      // commit an agent co-authored carries the one visual cue this diagram
      // already has for "agent", even on a run with no bundle to draw a real
      // round from.
      lines.push(
        event.agentCoAuthored === true
          ? `  ${id}([${mermaidLabel(event.label)}])`
          : `  ${id}[${mermaidLabel(event.label)}]`,
      );
      anchors.push([id]);
      renderedNodes += 1;
    }
  });

  for (let index = 1; index < shown.length; index += 1) {
    const from = anchors[index - 1] ?? [];
    const to = anchors[index] ?? [];
    for (const a of from) {
      for (const b of to) lines.push(`  ${a} --> ${b}`);
    }
  }

  // classDefs are emitted unconditionally — five short constant lines — so
  // the palette never depends on which event kinds this particular run
  // happened to produce, and adding a class assignment below never requires
  // remembering to also declare it.
  for (const [kind, style] of Object.entries(EVENT_STYLE)) {
    lines.push(`  classDef ${kind} fill:${style.fill},color:${style.text},stroke:${style.stroke},stroke-width:1px`);
  }
  const byClass = new Map<string, string[]>();
  shown.forEach((event, index) => {
    const ids = anchors[index] ?? [];
    byClass.set(event.type, [...(byClass.get(event.type) ?? []), ...ids]);
  });
  for (const [kind, ids] of byClass) {
    if (ids.length > 0) lines.push(`  class ${ids.join(",")} ${kind}`);
  }

  const shownCommits = shown.filter((event) => event.type === "commit");

  return {
    mermaid: lines.join("\n"),
    totalCommits: shownCommits.length,
    agentCommits: shownCommits.filter((event) => event.agentCoAuthored === true).length,
    nodes: renderedNodes,
    windowMs: ROUND_WINDOW_MS,
    dropped,
  };
}

// ---------------------------------------------------------------------------
// Renderers
// ---------------------------------------------------------------------------

/**
 * A millisecond count, in the unit a reader actually thinks in — "120000 ms"
 * reads like an unconverted config constant; "2 minutes" reads like authored
 * prose. The exact figure stays alongside it in parentheses, for the one
 * reader who came to check the number itself.
 */
function formatDuration(ms: number): string {
  if (ms >= 60_000 && ms % 60_000 === 0) {
    const minutes = ms / 60_000;
    return `${String(minutes)} ${plural(minutes, "minute")} (${String(ms)} ms)`;
  }
  if (ms >= 1_000 && ms % 1_000 === 0) {
    const seconds = ms / 1_000;
    return `${String(seconds)} ${plural(seconds, "second")} (${String(ms)} ms)`;
  }
  return `${String(ms)} ms`;
}

/**
 * Which not-recorded section states its reason in full, per reason — the
 * first one encountered in render order — and which titles a later,
 * same-reason section should point back at.
 *
 * A tier blocked by one shared cause (no bundle, an unreadable journal) used
 * to open and expand every section in it: nine "not recorded" leaves, each
 * one restating "as above, under X" as if it were nine separate facts a
 * reader had to individually confirm. Only the first section carries new
 * information; the rest are a pointer, and a pointer does not need to
 * default open to be read.
 */
interface Disclosures {
  /** Section ids that state a not-recorded reason for the first time. */
  first: ReadonlySet<string>;
  /** reason -> the title of the section that first stated it. */
  titleByReason: ReadonlyMap<string, string>;
}

function computeDisclosures(tiers: readonly ReportTier[]): Disclosures {
  const titleByReason = new Map<string, string>();
  const first = new Set<string>();
  for (const tier of tiers) {
    for (const section of tier.sections) {
      if (section.status !== "not-recorded") continue;
      const reason = section.reason ?? "";
      if (!titleByReason.has(reason)) {
        titleByReason.set(reason, section.title);
        first.add(section.id);
      }
    }
  }
  return { first, titleByReason };
}

/**
 * Whether a section is the reason its tier should default to expanded.
 *
 * A `not-recorded` section counts only when it is the first to state its
 * reason — see `computeDisclosures`. A `data` section counts on its own
 * `failing` figure exactly as before; that half never had a restatement
 * problem, because a failing count is never shared prose two sections deep.
 */
function sectionNeedsAttention(section: ReportSection, disclosures: Disclosures): boolean {
  if (section.status === "not-recorded") return disclosures.first.has(section.id);
  return section.failing !== undefined && section.failing > 0;
}

/**
 * The `<summary>` line's own text — short enough to read without expanding.
 *
 * "All clear" is this document's word for a check that ran and passed, and
 * "X of N need a look" implies the other N-X are that. Neither is true of a
 * tier with no genuinely clear content in it at all — one where every
 * section is `not-recorded`, whether it happens to be the one that states
 * the shared cause in full or a repeat of it. "Hook-attested — 1 of 9 needs
 * a look" read as "8 are fine"; all 9 were unread. `allNotRecorded` catches
 * that shape regardless of which section happens to carry the disclosure,
 * rather than keying off the word "repeat" and missing the tier the
 * disclosure itself lives in.
 */
function tierStatus(total: number, attention: number, allNotRecorded: boolean): string {
  if (allNotRecorded) {
    return `${String(total)} ${plural(total, "check")}, none recorded`;
  }
  if (attention > 0) {
    return `${String(attention)} of ${String(total)} need${attention === 1 ? "s" : ""} a look`;
  }
  return `${String(total)} ${plural(total, "check")}, all clear`;
}

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
 * One section per id, first tier wins. A second, render-local lookup rather
 * than a change to `buildCard`: that function's whole contract is that a row
 * carries a section *id* and never a copy of the section's own numbers
 * (`references a section by id rather than copying its content`, asserted in
 * `witnessReport.test.ts`). Resolving the id back to its section here, at
 * render time, is not a second copy of that data — it is the one place that
 * was always going to have to read it to print anything at all.
 */
function indexSections(tiers: readonly ReportTier[]): Map<string, ReportSection> {
  const map = new Map<string, ReportSection>();
  for (const tier of tiers) {
    for (const section of tier.sections) {
      if (!map.has(section.id)) map.set(section.id, section);
    }
  }
  return map;
}

/**
 * Reasons shared by more than one card row — the ones `renderCard` states
 * once, above the table, rather than once per row. Extracted so the flags
 * list (below) can apply the identical dedup rule instead of re-deciding it,
 * which is exactly the kind of second copy that drifted from the first one
 * three times over in this file's own history.
 */
function sharedReasonsOf(card: Card): ReadonlySet<string> {
  const byReason = new Map<string, number>();
  for (const row of card.rows) {
    if (row.reason === undefined) continue;
    byReason.set(row.reason, (byReason.get(row.reason) ?? 0) + 1);
  }
  return new Set([...byReason.entries()].filter(([, n]) => n > 1).map(([reason]) => reason));
}

/** A short label for a card row, standing alone in a bulleted flags list
 *  rather than beside a `tier` column — the row's own question is written to
 *  read in a table, not as a flag. Falls back to the question itself for any
 *  row id this map does not name, so a new card row is never silently
 *  omitted from the list for lacking a bespoke phrase. */
const FLAG_LABEL: Readonly<Record<string, string>> = {
  grounded: "evidence anchors",
  graders: "oracle conservation",
  record: "this run's own record",
  probe: "review probe",
  reviewed: "agent review",
  concurrent: "review round",
  reported: "review outcomes",
};

/**
 * The flags list: every card row that is not clear, as one short line each.
 * Deliberately not a new judgment — every flag here is a row `buildCard`
 * already computed and this file's own tests already cover; this only
 * chooses shorter words for the same fact, for a reader who wants the
 * headline before the table.
 */
function buildFlags(report: RunReport): string[] {
  const card = buildCard(report);
  const sections = indexSections(report.tiers);
  const shared = sharedReasonsOf(card);
  return card.rows
    .filter((row) => row.mark !== "clear")
    .map((row) => {
      const label = FLAG_LABEL[row.id] ?? row.question;
      const detail = cardDetail(row, sections.get(row.section), shared);
      const glyph = row.mark === "attention" ? "⚠️" : "⚪";
      return `${glyph} **${escapeCell(label)}** — ${escapeCell(detail)}`;
    });
}

/**
 * The distinct model names a run used, read back out of the "usage" section
 * `hookAttestedSections` already built — not recomputed from raw records,
 * which this renderer never sees. A light regex over that section's own
 * generated note rather than a new structured field on `ReportSection` for
 * one caller: the note's shape ("Over N report record(s). Models: a, b.") is
 * this file's own format, produced two dozen lines away, not contributor
 * text — parsing it back is safe for the same reason escaping it would be
 * unnecessary work.
 */
function extractModels(report: RunReport): string[] | null {
  const usage = indexSections(report.tiers).get("usage");
  if (usage === undefined || usage.status !== "data") return null;
  const note = usage.notes.find((line) => line.startsWith("Over "));
  const match = note === undefined ? null : /Models: (.+)\.$/.exec(note);
  if (match === null) return null;
  const list = match[1];
  return list === undefined ? null : list.split(", ");
}

/**
 * The figure that belongs next to a card row's glyph — "10 anchors passed" is
 * a process log, not a status. A reader should not have to open the tiered
 * document below to learn that six of them failed; the row should say so.
 *
 * Branches on `row.mark`, already computed by `buildCard`, rather than
 * recomputing clear/attention from the section here — a second copy of that
 * that would be exactly the duplicated judgment call `markOf` exists to make
 * once. This function only chooses *words* for a mark already decided.
 */
/** A reason long enough to derail the table's one-line rows gets cut, with
 *  the full text still one click away in the tiered section below. */
function truncateForCell(text: string, max = 64): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function cardDetail(
  row: CardRow,
  section: ReportSection | undefined,
  sharedReasons: ReadonlySet<string>,
): string {
  if (section === undefined || row.mark === "not-recorded") {
    // A reason **shared** by several rows is stated once, above the table
    // (`names a cause once when it makes several rows unanswerable`) —
    // printing it again per row here would restate it, just one column to
    // the right. A reason unique to THIS row was never stated anywhere
    // else, so the generic "not recorded" that used to sit here regardless
    // of cause is the tautology a maintainer actually called out: it never
    // told a reader why, even when the document already knew.
    if (row.reason !== undefined && !sharedReasons.has(row.reason)) {
      return row.reason;
    }
    return "not recorded";
  }
  const total = section.count ?? 0;
  const failing = section.failing ?? 0;
  switch (row.id) {
    case "grounded":
      return row.mark === "clear"
        ? `${String(total)}/${String(total)} verified`
        : `${String(failing)} of ${String(total)} unverified`;
    case "graders":
      // Never "N changes" here: `total` is `oracle.findings.length`, which
      // counts violations, not every change to a declared oracle file — an
      // advisory change touches one without ever becoming a finding. Saying
      // "0 changes" over a run that logged an advisory change is the same
      // false zero the oracle's own `not-recorded` branch exists to refuse
      // elsewhere; this row only ever asserts the figure it actually has.
      return row.mark === "clear"
        ? "no unjustified changes"
        : `${String(failing)} unjustified ${plural(failing, "change")}`;
    case "record":
      return row.mark === "clear"
        ? `${String(total)}/${String(total)} valid`
        : `${String(failing)} of ${String(total)} invalid`;
    case "probe":
      return row.mark === "clear" ? "none planted" : "planted — clear before merge";
    case "reviewed":
      return total === 1 ? "1 dispatch" : `${String(total)} dispatches`;
    case "concurrent":
      return total === 1 ? "1 round" : `${String(total)} rounds`;
    case "reported":
      return row.mark === "clear"
        ? `${String(total)}/${String(total)} reported`
        : `${String(failing)} of ${String(total)} missing`;
    default:
      return "";
  }
}

/**
 * The card, as the lines that lead the document.
 *
 * The glyph, question, section id and tier are exactly what `buildCard`
 * returned: an id, a question, a section id, a tier and a mark, every one of
 * them a constant declared in this file. No contributor-controlled string
 * reaches those cells, which is a stronger property than escaping one would
 * be — it survives someone deleting an escape call. `escapeCell` is still
 * applied, because a constant that stops being one should not silently
 * become an injection. The detail cell is the one exception: it is
 * *computed* from a section's own `count`/`failing`, both plain numbers with
 * nothing to escape.
 */
export function renderCard(report: RunReport): string[] {
  const card = buildCard(report);
  const sections = indexSections(report.tiers);
  const out: string[] = [];
  out.push("## How this run was produced");
  out.push("");

  const total = card.rows.length;
  if (card.unanswerable === 0) {
    // `total` is the number of rows rendered, which `omitted` has already
    // shrunk. Saying "all N" over a denominator something was removed from
    // would be true of the table and misleading about the report, so the
    // omission is stated on its own line below rather than folded in here.
    out.push(`All ${String(total)} checks below have an answer.`);
  } else {
    out.push(
      `**${String(card.unanswerable)} of ${String(total)}** checks could not be answered — ` +
        "the sections they read recorded nothing. A row with a hollow mark is a question this run " +
        "cannot answer, which is not the same as a clean result.",
    );
  }
  // A cause that makes several rows unanswerable is stated once, here, with
  // how many rows it accounts for. Without this the card showed four hollow
  // marks and no reason — the reader had to open the tiered document to learn
  // that one missing file explained all of them, which is exactly the work a
  // card exists to save. Grouped by the section's own reason text, so two rows
  // grey for two reasons are never summarised as one.
  const byReason = new Map<string, number>();
  for (const row of card.rows) {
    if (row.reason === undefined) continue;
    byReason.set(row.reason, (byReason.get(row.reason) ?? 0) + 1);
  }
  const shared = [...byReason.entries()].filter(([, n]) => n > 1);
  const sharedReasons = sharedReasonsOf(card);
  if (shared.length > 0) {
    out.push("");
    for (const [reason, n] of shared) {
      out.push(`- **${String(n)} rows, one cause:** ${escapeCell(reason)}`);
    }
    // The unanswerable count above this list and the row count this list
    // explains can differ by design — a row whose own detail cell already
    // states a distinct (if related) reason is never folded into someone
    // else's shared-cause bullet, on purpose (`cardDetail`'s whole point is
    // that a unique reason gets said once, in its own cell, rather than
    // reduced to a duplicate of the shared line). Left unbridged, that gap
    // reads as arithmetic the reader has to explain to themselves; said once
    // here, it is a fact instead of a puzzle.
    const leftover = card.rows.filter((row) => row.mark === "not-recorded" && !sharedReasons.has(row.reason ?? ""));
    if (leftover.length > 0) {
      out.push(
        // Never "own reason" here: a leftover row's cause is often the same
        // underlying fact as the shared bullet above, worded differently
        // because it says something additional too (`journal-validation`'s
        // "no journal to validate — no bundle at …" is the shared "no bundle
        // at …" plus a clause). Claiming independence a reader can disprove
        // by opening the cell reads as more wrong than the gap it replaces.
        // "below", not "above": this bullet sits above the table its cells
        // are in. A reader who follows a wrong direction on the one sentence
        // written to be followed does not trust the next one either.
        `- **${String(leftover.length)} more ${plural(leftover.length, "row")}** ${plural(leftover.length, "is", "are")} also unanswered — see ${plural(leftover.length, "its", "their")} own detail ${plural(leftover.length, "cell", "cells")} below.`,
      );
    }
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
  out.push("| | check | detail | tier |");
  out.push("| --- | --- | --- | --- |");
  for (const row of card.rows) {
    // Truncated here, at the table, and nowhere else: a long detail derails
    // a one-line row in a fixed-width column, which is a table's problem,
    // not the underlying fact's. `buildFlags` reads the same `cardDetail`
    // for a plain bullet list, where a bundle path has nothing to derail and
    // truncating it would only make an already-short list less useful.
    const detail = truncateForCell(cardDetail(row, sections.get(row.section), sharedReasons));
    out.push(
      `| ${MARK_GLYPH[row.mark]} ${MARK_WORD[row.mark]} | ${escapeCell(row.question)} | ${escapeCell(detail)} | ${escapeCell(row.tier)} |`,
    );
  }

  if (card.omitted.length > 0) {
    out.push("");
    out.push(
      `${String(card.omitted.length)} ${plural(card.omitted.length, "row")} ${plural(card.omitted.length, "is", "are")} not shown because no section in this ` +
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
  const disclosures = computeDisclosures(report.tiers);
  // A title's job is letting someone triaging ten open PRs decide, from
  // notification text alone, whether to click in. A commit range — two
  // 40-character hashes — answers a question nobody asked at that moment;
  // it moved below, next to the short refs a reader might actually check.
  // The glyph is the other half of that job: the same fixed name on every
  // PR would still leave a reader unable to tell "needs a look" from "clean"
  // without opening the comment, which is the one thing a notification
  // preview cannot do.
  // A glyph alone says "something", not "what" — a reader still has to open
  // the comment and read the table to learn there's anything to look at, let
  // alone how much. The count is the same figure the card already computed;
  // repeating it here is the title finally answering the question its own
  // presence raises.
  // "Not clear" — not just `mark === "attention"` — for the same reason a
  // tier defaults open over a `not-recorded` section and not only a failing
  // one (`sectionNeedsAttention`): a hollow mark is a question this run
  // could not answer, and counting it as "clear" here while every section
  // summary below already counts it as "needs a look" is the split-count
  // shape this report has had to fix twice already, one level down.
  const needsLookRows = buildCard(report).rows.filter((row) => row.mark !== "clear").length;
  const suffix =
    needsLookRows > 0
      ? ` (${String(needsLookRows)} ${plural(needsLookRows, "check")} ${plural(needsLookRows, "needs", "need")} a look)`
      : "";
  out.push(`# ${needsLookRows > 0 ? "⚠️ " : ""}Nullius Report — How this PR was made${suffix}`);
  out.push("");
  // No commit range, no counts: GitHub's own PR page already states both
  // (the Commits and Files-changed tabs, the compare header) on the same
  // page this comment sits on. Restating them here was never information —
  // it was the same fact told twice, and it was told first.
  out.push(
    "This report renders what happened; it does not gate. Every section shows its data or says why it has none.",
  );

  const models = extractModels(report);
  if (models !== null && models.length > 0) {
    out.push("");
    // Backticked, not `escapeCell`-escaped: a code span is already inert to
    // markdown, and `escapeCell` is table-cell escaping — it would print a
    // literal backslash in front of the bracket in a name like
    // `claude-opus-5[1m]`, which is a display bug, not safety. The deep
    // "Model and tokens" note this is pulled from renders the same names the
    // same way, unescaped.
    out.push(`**Models:** ${models.map((model) => `\`${model}\``).join(", ")}`);
  }

  const flags = buildFlags(report);
  if (flags.length > 0) {
    out.push("");
    out.push("**Flags:**");
    for (const flag of flags) out.push(`- ${flag}`);
  }

  // Moved ahead of the card, at the top of the document rather than the
  // bottom: a diagram that shows what actually happened — who did what, when
  // — is the thing worth seeing before a table of check marks, not after
  // twenty sections of it.
  if (report.flowchart !== null) {
    out.push("");
    out.push("## Timeline");
    out.push("");
    out.push("```mermaid");
    out.push(report.flowchart.mermaid);
    out.push("```");
    out.push("");
    // A color has no meaning without a key — the classDefs above are legible
    // once rendered, but nothing in the fence itself tells a reader which
    // color is which actor. Order matches the classDefs: human, system,
    // round, burst, commit.
    out.push(
      // Ordered to match the diagram's own left-to-right flow — a prompt
      // starts it, edits and a commit follow, then a round of agents, then
      // their reports back — rather than the classDef declaration order,
      // which a reader has no reason to already know.
      "**Legend:** 🟦 human prompt · 🟧 edit burst · 🟪 commit (rounded ends: co-authored by an agent, per its trailer) · 🟩 agent (grouped by round) · 🔳 agent reported back",
    );
    out.push("");
    // Rounds only exist in the diagram when a bundle recorded dispatches to
    // group into one — a commit-only fallback (no bundle) has none, and the
    // grouping-window sentence would be explaining a rule for a node kind
    // that is not in the picture. `subgraph s` is the one string only a
    // round ever emits (see `buildFlowchart`'s subgraph branch) — commit,
    // burst, and prompt nodes are never grouped — so its presence is a
    // precise, already-computed signal, not a reason for a new field.
    const hasRounds = report.flowchart.mermaid.includes("\n  subgraph s");
    const timelineNotes: string[] = [];
    if (hasRounds) {
      timelineNotes.push(
        `Rounds group dispatches starting within ${formatDuration(report.flowchart.windowMs)} of the first.`,
      );
    }
    if (report.flowchart.dropped > 0) {
      timelineNotes.push(
        `${String(report.flowchart.dropped)} later ${plural(report.flowchart.dropped, "node")} ${plural(report.flowchart.dropped, "is", "are")} not shown; the JSON form carries them all.`,
      );
    }
    if (timelineNotes.length > 0) out.push(timelineNotes.join(" "));
    // A uniform diagram — every commit the same shape, in either direction —
    // is the one case where shape draws no contrast to read: nothing
    // distinguishes "uniformly agent co-authored" from "the tool always
    // draws it this way", and the mirror case has the same problem in the
    // other direction. State the fact once in prose. An actual mix needs no
    // such line: the contrast itself already carries the information.
    if (report.flowchart.totalCommits > 0) {
      if (report.flowchart.agentCommits === report.flowchart.totalCommits) {
        out.push(
          `All ${String(report.flowchart.totalCommits)} ${plural(report.flowchart.totalCommits, "commit")} shown ` +
            `${plural(report.flowchart.totalCommits, "carries", "carry")} a Claude co-author trailer — the stadium shape above is real signal, not a rendering default.`,
        );
      } else if (report.flowchart.agentCommits === 0) {
        out.push(
          `None of the ${String(report.flowchart.totalCommits)} ${plural(report.flowchart.totalCommits, "commit")} shown ` +
            `${plural(report.flowchart.totalCommits, "carries", "carry")} a Claude co-author trailer — the plain rectangle above is the whole set, not a partial render.`,
        );
      }
    }
  }

  // Rebuilt from `report.tiers` rather than read from `report.card`, and the
  // difference matters. The tiers are the source; a `card` handed in by a
  // caller is a claim about them. Deriving here means the rendered card cannot
  // disagree with the document it sits on top of, even for a report assembled
  // by hand — which is the same reason every verdict in this project re-reads
  // the artefact instead of trusting a field. For a report from
  // `buildRunReport` the two are identical, and a test asserts it.
  out.push("");
  out.push(...renderCard(report));

  for (const tier of report.tiers) {
    out.push("");
    // A tier with nothing needing attention opens collapsed — the wall of
    // `##`/`###` headings this report used to be, all the way down, regardless
    // of whether any of it was worth reading. A tier is expanded by default
    // exactly when something inside it does need a look, so scanning the
    // rendered comment top to bottom answers "what should I actually read"
    // without opening anything.
    const attention = tier.sections.filter((section) => sectionNeedsAttention(section, disclosures)).length;
    const allNotRecorded = tier.sections.every((section) => section.status === "not-recorded");
    out.push(`<details${attention > 0 ? " open" : ""}>`);
    out.push(
      // `<h3>`, not `<strong>` — the same size jump `###` headings get inside
      // an open tier. Without it, a tier's own summary and the section
      // summaries nested inside it render as identical bold text, and the
      // one visual cue that distinguishes "this collapses a whole tier" from
      // "this collapses one subsection" is gone the moment either is closed.
      `<summary><h3>${escapeCell(tier.title)} — ${escapeCell(tierStatus(tier.sections.length, attention, allNotRecorded))}</h3></summary>`,
    );
    out.push("");
    out.push(`## ${tier.title}`);
    out.push("");
    out.push(`_${tier.provenance}_`);
    for (const section of tier.sections) {
      out.push("");
      // Nested inside the tier's own `<details>`. A tier that is open because
      // ONE of six sections needs a look used to dump all six flat — a reader
      // still had to wade past four clean subsections to find the two that
      // mattered. Per-section collapsing puts the same judgment one level
      // deeper: only the sections actually worth reading default open.
      const sectionAttention = sectionNeedsAttention(section, disclosures);
      out.push(`<details${sectionAttention ? " open" : ""}>`);
      const countSuffix = section.count === undefined ? "" : ` — ${formatCount(section.count)}`;
      out.push(`<summary><strong>${escapeCell(`${section.title}${countSuffix}`)}</strong></summary>`);
      out.push("");
      out.push(`### ${section.title}${countSuffix}`);
      out.push("");
      out.push(section.statement);
      if (section.status === "not-recorded") {
        out.push("");
        if (disclosures.first.has(section.id)) {
          out.push(`**Not recorded:** ${escapeCell(section.reason ?? "")}`);
        } else {
          // One cause blocking fourteen sections is one fact. Restating it
          // under each of them is how a 21 KB comment spent 6 KB saying the
          // same sentence thirty times, and buried the one section that could
          // be acted on. The JSON form still carries every reason in full.
          const first = disclosures.titleByReason.get(section.reason ?? "") ?? "";
          out.push(`**Not recorded:** as above, under "${escapeCell(first)}".`);
        }
      } else {
        if (section.table !== undefined) {
          out.push("");
          out.push(...renderTable(section.table));
        }
        for (const note of section.notes) {
          out.push("");
          out.push(escapeCell(note));
        }
      }
      out.push("");
      out.push("</details>");
    }
    out.push("");
    out.push("</details>");
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
      out.push(`- **${String(wheres.length)} ${plural(wheres.length, "section")}** — ${escapeCell(reason)}`);
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
  // The card is re-derived here for the same reason `renderMarkdown` derives
  // it: the tiers are the source, and a `card` on the object handed in is a
  // claim about them. Emitting the stored one would have left the two
  // renderings able to disagree — the markdown deriving, the JSON trusting —
  // which is the drift the "a card value never disagrees with the section
  // behind it" test exists to forbid, holding for only one of the two outputs.
  return `${JSON.stringify({ ...report, card: buildCard(report) }, null, 2)}\n`;
}
