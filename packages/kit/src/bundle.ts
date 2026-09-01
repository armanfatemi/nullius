/**
 * `nullius-kit witness bundle` — the envelope a pull request carries.
 *
 * A journal lives in `.nullius/runs/`, which is gitignored and local to the
 * machine that recorded it. CI has no way to read it, so nothing downstream can
 * re-validate a claim about how a change was made. This command writes the one
 * artefact that closes that gap: a committed JSON envelope holding the *source
 * lines* of the journals that produced a range, which CI reconstructs by
 * joining them and hands straight to `validateJournal`.
 *
 * Two rules decide everything in this file, and both are load-bearing.
 *
 * **The envelope carries every source line; redaction rewrites a line's fields
 * and never drops a line.** Not records — lines. The validator's first pass
 * rejects five classes of line (unparseable JSON, non-object, misplaced header,
 * unknown kind, missing or duplicate id) and none of them ever becomes a
 * record, so a bundler serialising `records` would drop exactly those lines
 * *and the `malformed` and `duplicate-id` verdicts about them*, in the
 * direction that makes a bad journal look clean. And the verdicts that read
 * across records — `stale-verification` in particular — are computed by two
 * different partitions of the same lines (by path through a hash map, by id
 * through `byId`), so no removal rule reproduces the source: a reference
 * closure silences `stale-verification`, a path closure manufactures
 * `dangling-reference`, and there is no third order. Carrying every line is not
 * conservatism, it is the only rule under which the reconstruction is worth
 * validating at all.
 *
 * **Selection is three-way, never a boolean.** A session that overlaps the
 * range in time and mutated nothing inside it is `inconclusive` — a review-only
 * session is exactly that shape, and it is exactly the session whose rounds and
 * findings a report is for. Dropping it would render its work as a smaller
 * count, which is this repository's own definition of the wrong answer.
 *
 * Range scoping is deliberately absent here. It belongs to whoever renders the
 * envelope: a filter that changes what the validator sees changes what the
 * validation is worth.
 */

import { spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep as pathSep } from "node:path";

import { hashText } from "./record";
import { RUNS_DIR } from "./journalFile";

/**
 * The envelope's schema. Independent of the journal's version and of the
 * check report's: three documents on one CLI that break on different events.
 */
export const BUNDLE_VERSION = 1;

/** Where the envelope goes by default. Outside `.nullius/`, which is the
 *  recording opt-in — a directory whose mere existence switches recording on
 *  for anyone who clones the repository. */
export const BUNDLE_DIR = "nullius.runs";

/**
 * Caps applied to contributor-controlled prose on its way into a public,
 * committed file. They are the bundler's, not the producer's: the producer's
 * own excerpt limit is larger because a local journal is not a published one.
 */
export const EXCERPT_CAP = 800;
export const STATEMENT_CAP = 800;

/**
 * The flag set when the bundler caps a `report.statement`.
 *
 * A NEW key, deliberately. `truncated` and `response_chars` describe the
 * clipped *findings* entry the producer wrote, so reusing either would assert a
 * long agent response behind a statement the bundler shortened — two different
 * facts under one name, and the reader has no way to tell which one is being
 * claimed. Those two are carried exactly as recorded and never synthesised.
 */
export const STATEMENT_CAP_FLAG = "bundle_statement_capped";

/** How far outside the range's commit window a record may fall and still
 *  count as overlapping. Recording starts before the first commit and outlives
 *  the last one; zero slack would exclude the session that made the range. */
export const DEFAULT_SLACK_MINUTES = 30;

/** Bounded like every other git call the kit makes. A hook that hangs is worse
 *  than one that records nothing, and the same holds for a bundler. */
export const GIT_TIMEOUT_MS = 10_000;

/**
 * The selection rule, in words, stored in the envelope.
 *
 * Verbatim rather than paraphrased at render time: a report that states the
 * rule it applied is checkable against the code that applied it, and a
 * paraphrase written somewhere else is the second copy that drifts.
 */
export const SELECTION_RULE =
  "A journal is INCLUDED when at least one of its record timestamps falls within " +
  "[first commit author time − slack, last commit author time + slack] AND at least one " +
  "mutation.target.path is in the range's changed files. It is INCONCLUSIVE when it " +
  "overlaps in time but touches no changed file. It is EXCLUDED when no record timestamp " +
  "falls in the window. The header's `branch` is never consulted: it names where the " +
  "session started, and a session that produced a feature branch routinely started on main.";

/** Why a converted prompt hash is not an identity. Stated in the envelope
 *  because a reader who recomputed one elsewhere would otherwise read a benign
 *  difference as tampering. */
export const PROMPT_HASH_NOTE =
  "Converted prompt hashes are computed over the excerpt the producer stored, not over the " +
  "operator's original text, so they will not match a hash computed from the prompt itself. " +
  "The validator checks no derivation; the hash records that a prompt occurred, and nothing else.";

// ---------------------------------------------------------------------------
// Range
// ---------------------------------------------------------------------------

export interface BundleRange {
  /** Exactly what the user typed, carried for the envelope. */
  spec: string;
  base: string;
  head: string;
  sep: ".." | "...";
}

const RANGE_SEPARATOR = /\.\.\.?/;
const REVISION_SHAPE = /^[A-Za-z0-9._/-]+$/;

/**
 * Validate the SHAPE of a range and split it, and nothing more.
 *
 * This is not the kernel's `parseRange` and does not try to be its semantics:
 * it decides only what this command needs to know before handing operands to a
 * subprocess — that neither side is option-shaped, that there is exactly one
 * separator, and that both sides are plausible revisions. Everything about what
 * the range *means* is left to git, which is the one parser that cannot drift
 * from itself.
 *
 * The kernel's `parseRange` is not exported from `@nullius-inverba/claims`, and
 * adding it there to reach it from here would grow the published API for one
 * consumer — the exact trade the renderer was put in the kernel to avoid. So
 * this validates shape and defers meaning, which is the resolution the tasks
 * file names as preferred; the report verb hands its range string through
 * unparsed, so the semantic parser stays single and internal.
 */
export function parseBundleRange(spec: string): BundleRange | { error: string } {
  if (spec.length === 0) return { error: "a range is required: <base>..<head>, or a bare revision" };
  if (spec.startsWith("-")) return { error: `'${spec}' is option-shaped, not a range` };

  const match = RANGE_SEPARATOR.exec(spec);
  if (match === null) {
    if (!REVISION_SHAPE.test(spec)) {
      return { error: `'${spec}' is not a range this command will pass to git` };
    }
    // A bare revision is that commit against its parent — `git show`'s reading.
    return { spec, base: `${spec}~1`, head: spec, sep: ".." };
  }

  const sep = match[0] === "..." ? "..." : "..";
  const index = spec.indexOf(sep);
  const base = spec.slice(0, index);
  const head = spec.slice(index + sep.length);
  if (base === "" || head === "") return { error: `'${spec}' is missing one end of the range` };
  for (const [side, value] of [
    ["base", base],
    ["head", head],
  ] as const) {
    if (value.startsWith("-")) {
      return { error: `the ${side} of '${spec}' is option-shaped, not a revision` };
    }
    if (value.includes("..")) return { error: `'${spec}' has more than one range separator` };
    if (!REVISION_SHAPE.test(value)) {
      return { error: `the ${side} of '${spec}' is not a revision this command will pass to git` };
    }
  }
  return { spec, base, head, sep };
}

export type GitResult = { status: "ok"; stdout: string } | { status: "failed"; reason: string };

/**
 * One git call, bounded, with no shell and no inherited stdin.
 *
 * Modelled on `identity.ts`'s `runGit` — same argument vector, same timeout
 * discipline, same `input: ""` so a subcommand that decides to prompt cannot
 * hold the process open for its whole timeout — but it returns a result rather
 * than `string | null`, and that difference is the reason it is a second
 * function rather than an import. `identity.ts` collapses empty stdout into
 * `null` because every one of its callers answers "omit the field" to all four
 * kinds of no. Here empty stdout is a real answer: a range with no changed
 * files, or no commits, is a range, and reading it as a failure would let the
 * bundler classify every candidate `excluded` and report that as the rule
 * working.
 */
function runGit(root: string, args: readonly string[], timeoutMs: number): GitResult {
  let result;
  try {
    result = spawnSync("git", ["-C", root, ...args], {
      shell: false,
      encoding: "utf8",
      timeout: timeoutMs,
      killSignal: "SIGKILL",
      input: "",
      // Larger than `identity.ts`'s 64 KiB: a name-only diff over a wide range
      // legitimately runs to thousands of paths, and an ENOBUFS here would read
      // as "the range changed nothing".
      maxBuffer: 8 * 1024 * 1024,
    });
  } catch (error) {
    return { status: "failed", reason: error instanceof Error ? error.message : String(error) };
  }
  if (result.error !== undefined) return { status: "failed", reason: result.error.message };
  if (result.status !== 0) {
    const stderr = (result.stderr ?? "").trim();
    return { status: "failed", reason: stderr === "" ? `git exited ${String(result.status)}` : stderr };
  }
  return { status: "ok", stdout: result.stdout ?? "" };
}

export interface RangeCommit {
  sha: string;
  /** Author time, ISO 8601. The side of a commit that survives a rebase. */
  at: string;
}

export interface RangeFacts {
  /** The revision `head` is actually compared against — the merge base when
   *  the user typed `...`, so a commit that landed on the base after the fork
   *  point is not read as part of the range. */
  resolvedBase: string;
  /** Sorted, deduplicated. */
  changedFiles: string[];
  /** Oldest first. */
  commits: RangeCommit[];
}

export function readRangeFacts(
  root: string,
  range: BundleRange,
  timeoutMs: number = GIT_TIMEOUT_MS,
  run: (root: string, args: readonly string[], timeoutMs: number) => GitResult = runGit,
): RangeFacts | { error: string } {
  let resolvedBase = range.base;
  if (range.sep === "...") {
    const merged = run(root, ["merge-base", range.base, range.head], timeoutMs);
    if (merged.status === "failed") {
      return { error: `could not resolve merge-base of ${range.base} and ${range.head}: ${merged.reason}` };
    }
    resolvedBase = merged.stdout.trim();
    if (resolvedBase === "") {
      return { error: `${range.base} and ${range.head} have no merge base` };
    }
  }

  const diff = run(root, ["diff", "--name-only", "-z", resolvedBase, range.head, "--"], timeoutMs);
  if (diff.status === "failed") {
    return { error: `could not read the changed files of ${range.spec}: ${diff.reason}` };
  }
  const changedFiles = [...new Set(diff.stdout.split("\0").filter((path) => path !== ""))].sort();

  const log = run(
    root,
    ["log", "--reverse", "--no-show-signature", "--format=%H%x09%aI", `${resolvedBase}..${range.head}`, "--"],
    timeoutMs,
  );
  if (log.status === "failed") {
    return { error: `could not read the commits of ${range.spec}: ${log.reason}` };
  }
  const commits: RangeCommit[] = [];
  for (const line of log.stdout.split("\n")) {
    if (line.trim() === "") continue;
    const [sha, at] = line.split("\t");
    if (sha === undefined || at === undefined) continue;
    commits.push({ sha, at });
  }

  return { resolvedBase, changedFiles, commits };
}

/** The current branch, for the default envelope name. `HEAD` when detached,
 *  which is a name and not a failure. */
export function currentBranch(
  root: string,
  timeoutMs: number = GIT_TIMEOUT_MS,
  run: (root: string, args: readonly string[], timeoutMs: number) => GitResult = runGit,
): string | null {
  const out = run(root, ["rev-parse", "--abbrev-ref", "HEAD"], timeoutMs);
  if (out.status === "failed") return null;
  const branch = out.stdout.trim();
  return branch === "" ? null : branch;
}

/** A branch name reaches a file path, so anything not plainly a name is
 *  replaced rather than escaped. */
export function branchSlug(branch: string | null): string {
  const cleaned = (branch ?? "").replace(/[^A-Za-z0-9._-]/g, "-").replace(/^[.-]+/, "");
  return cleaned.length > 0 ? cleaned.slice(0, 120) : "bundle";
}

// ---------------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------------

export type Classification = "included" | "inconclusive" | "excluded";

export interface JournalCandidate {
  session: string;
  /** The journal's source lines, in order, exactly as read. */
  lines: readonly string[];
}

export interface SelectionWindow {
  /** Author time of the range's first commit, in ms. Null when the range has
   *  no commits — then nothing can overlap and every candidate is excluded,
   *  which is the honest answer rather than a reason to widen the rule. */
  firstMs: number | null;
  lastMs: number | null;
  slackMs: number;
  changedFiles: ReadonlySet<string>;
}

export interface SelectionOverrides {
  include?: ReadonlySet<string>;
  exclude?: ReadonlySet<string>;
}

export interface ClassifiedJournal {
  session: string;
  classification: Classification;
  reason: string;
  /** The rule's two inputs, kept so a reader can check the classification
   *  rather than take it. */
  overlap: boolean;
  touches: boolean;
  /** Mutation paths this journal has inside the range, sorted. */
  matched_paths: string[];
  /** Present only when a flag overrode the rule. Absent is not "no override
   *  applied and here is a null" — it is the rule speaking for itself. */
  override?: "include" | "exclude";
}

interface CandidateFacts {
  timestamps: number[];
  mutationPaths: string[];
}

function candidateFacts(lines: readonly string[]): CandidateFacts {
  const timestamps: number[] = [];
  const mutationPaths: string[] = [];
  for (const line of lines) {
    const record = readObject(line);
    if (record === null) continue;
    const at = record["at"];
    if (typeof at === "string") {
      const ms = Date.parse(at);
      if (Number.isFinite(ms)) timestamps.push(ms);
    }
    if (record["kind"] !== "mutation") continue;
    const target = record["target"];
    if (typeof target !== "object" || target === null || Array.isArray(target)) continue;
    const path = (target as Record<string, unknown>)["path"];
    if (typeof path === "string" && path.length > 0) mutationPaths.push(path);
  }
  return { timestamps, mutationPaths };
}

/**
 * Classify every candidate. Pure: no filesystem, no git, no clock.
 *
 * Three outcomes, not two. `inconclusive` is the case this function exists for
 * — a session that overlapped the range and mutated nothing inside it is
 * ambiguous, and rendering it as ambiguous is the point. A two-way rule makes a
 * session the rule excluded and a session that was never on the machine
 * indistinguishable in the envelope, which is the one distinction a maintainer
 * cannot reconstruct from anywhere else.
 */
export function classifyJournals(
  candidates: readonly JournalCandidate[],
  window: SelectionWindow,
  overrides: SelectionOverrides = {},
): ClassifiedJournal[] {
  const include = overrides.include ?? new Set<string>();
  const exclude = overrides.exclude ?? new Set<string>();

  return candidates.map((candidate) => {
    const facts = candidateFacts(candidate.lines);
    const overlap =
      window.firstMs !== null &&
      window.lastMs !== null &&
      facts.timestamps.some(
        (ms) => ms >= (window.firstMs as number) - window.slackMs && ms <= (window.lastMs as number) + window.slackMs,
      );
    const matched = [...new Set(facts.mutationPaths.filter((path) => window.changedFiles.has(path)))].sort();
    const touches = matched.length > 0;

    const ruled = ruleFor(overlap, touches, matched, facts, window);
    const base: ClassifiedJournal = {
      session: candidate.session,
      classification: ruled.classification,
      reason: ruled.reason,
      overlap,
      touches,
      matched_paths: matched,
    };

    // Overrides are applied on top of the rule and RECORDED as overrides, with
    // the rule's own verdict left in the reason. A silent override is a
    // selection nobody can audit, which is the same defect as no selection.
    if (exclude.has(candidate.session)) {
      return {
        ...base,
        classification: "excluded",
        override: "exclude",
        reason: `excluded by --exclude ${candidate.session}; the rule said ${ruled.classification} — ${ruled.reason}`,
      };
    }
    if (include.has(candidate.session)) {
      return {
        ...base,
        classification: "included",
        override: "include",
        reason: `included by --include ${candidate.session}; the rule said ${ruled.classification} — ${ruled.reason}`,
      };
    }
    return base;
  });
}

function ruleFor(
  overlap: boolean,
  touches: boolean,
  matched: readonly string[],
  facts: CandidateFacts,
  window: SelectionWindow,
): { classification: Classification; reason: string } {
  if (!overlap) {
    if (window.firstMs === null || window.lastMs === null) {
      return { classification: "excluded", reason: "the range has no commits, so nothing can overlap it" };
    }
    if (facts.timestamps.length === 0) {
      return {
        classification: "excluded",
        reason: "no record in this journal carries a timestamp, so it cannot be placed against the range",
      };
    }
    return {
      classification: "excluded",
      reason:
        `every record falls outside [${new Date(window.firstMs - window.slackMs).toISOString()}, ` +
        `${new Date(window.lastMs + window.slackMs).toISOString()}]`,
    };
  }
  if (touches) {
    const shown = matched.slice(0, 3).join(", ");
    return {
      classification: "included",
      reason:
        `overlaps the range in time and mutates ${String(matched.length)} file(s) in it` +
        (shown === "" ? "" : `: ${shown}${matched.length > 3 ? ", …" : ""}`),
    };
  }
  return {
    classification: "inconclusive",
    reason:
      "overlaps the range in time but mutates no file in it — a review-only session has this shape; " +
      "include it with --include <session> if it belongs",
  };
}

// ---------------------------------------------------------------------------
// Redaction
// ---------------------------------------------------------------------------

export interface RedactOptions {
  /** `true` carries prompt text (capped); `false` converts each prompt to the
   *  producer's hashed shape. */
  prompts: boolean;
}

/**
 * Rewrite fields on the lines that carry them. Pure, and line-preserving.
 *
 * Returns exactly as many lines as it was given, in the same order, always.
 * That is the invariant every downstream verdict depends on: the dangling
 * checks compare `record.line`, and `malformed` and `duplicate-id` are reported
 * against lines that never become records at all. A line is rewritten only when
 * it parses as a JSON object AND carries a valid non-empty `id`; every other
 * line is copied byte-for-byte, including the header, blank lines, and lines
 * the validator will reject.
 *
 * The `id` gate is not caution. A line rejected for a missing id is reported
 * with *its own text* as the subject of its `malformed` finding, so rewriting
 * it would move the subject of that finding and make source and reconstruction
 * disagree about a verdict neither of them got wrong. Every other pass-1
 * subject is an id, which redaction never touches.
 */
export function redactLines(lines: readonly string[], options: RedactOptions): string[] {
  return lines.map((line) => redactLine(line, options));
}

function redactLine(line: string, options: RedactOptions): string {
  const record = readObject(line);
  if (record === null) return line;
  const id = record["id"];
  if (typeof id !== "string" || id.length === 0) return line;

  let changed = false;
  const kind = record["kind"];

  if (kind === "report") {
    const findings = record["findings"];
    if (Array.isArray(findings)) {
      // Length preserved, entries capped. Arity is what the validator reads —
      // an `outcome: "found"` with an emptied array trips the hard
      // `collapsed-state` verdict, so emptying would manufacture a failure the
      // source journal does not have. The entries are plain strings and carry
      // no ids; there is nothing here to look one up by.
      const capped = findings.map((entry) => (typeof entry === "string" ? clip(entry, EXCERPT_CAP) : entry));
      if (capped.some((entry, index) => entry !== findings[index])) {
        record["findings"] = capped;
        changed = true;
      }
    }
    const statement = record["statement"];
    if (typeof statement === "string" && statement.length > STATEMENT_CAP) {
      record["statement"] = clip(statement, STATEMENT_CAP);
      // The bundler's own flag. `truncated` and `response_chars` describe the
      // producer's clipped findings entry and are carried untouched.
      record[STATEMENT_CAP_FLAG] = true;
      changed = true;
    }
  }

  if (kind === "finding") {
    const text = record["text"];
    if (typeof text === "string" && text.length > EXCERPT_CAP) {
      record["text"] = clip(text, EXCERPT_CAP);
      changed = true;
    }
  }

  if (kind === "prompt") {
    if (options.prompts) {
      const text = record["text"];
      if (typeof text === "string" && text.length > EXCERPT_CAP) {
        record["text"] = clip(text, EXCERPT_CAP);
        changed = true;
      }
    } else {
      changed = convertPrompt(record) || changed;
    }
  }

  return changed ? JSON.stringify(record) : line;
}

/**
 * The producer's hashed shape, applied after the fact: drop `text`, add `hash`,
 * keep `chars`, drop `truncated`.
 *
 * Not emptied. With `text` absent the validator *requires* `chars` and a
 * non-empty `hash`, so a blanked `text` manufactures `malformed` — a redaction
 * flag that produces a verdict the source journal never had. Not removed
 * either, though removal would validate clean: a converted record still says a
 * prompt occurred and how long it was, and a removed one is indistinguishable
 * from a run where the human never spoke.
 *
 * Only a non-empty `text` is converted. A prompt already in hashed shape has
 * nothing to convert, and one whose `text` is present but blank is already
 * `malformed` in the source — converting it would *repair* it, which is a
 * verdict change in the flattering direction.
 *
 * `chars` is derived from the stored text only when the source carried none.
 * The producer always writes it, but a journal that does not would otherwise
 * lose its last valid shape at the moment `text` is dropped.
 */
function convertPrompt(record: Record<string, unknown>): boolean {
  const text = record["text"];
  if (typeof text !== "string" || text.length === 0) return false;
  const chars = record["chars"];
  delete record["text"];
  delete record["truncated"];
  record["hash"] = hashText(text);
  if (typeof chars !== "number" || !Number.isInteger(chars) || chars < 0) {
    record["chars"] = text.length;
  }
  return true;
}

/**
 * The 1-based numbers of lines this bundler could not read as a JSON object.
 *
 * `--no-prompts` refuses on any of these. Rewriting a field requires parsing
 * the line, so a prompt line the bundler cannot read cannot be converted — and
 * a flag that shipped its text anyway would be a consent control failing
 * exactly where nobody can inspect the result. Blank lines are not counted:
 * they carry nothing and the validator skips them.
 */
export function unreadableLines(lines: readonly string[]): number[] {
  const out: number[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (line.trim().length === 0) continue;
    if (readObject(line) === null) out.push(index + 1);
  }
  return out;
}

function readObject(line: string): Record<string, unknown> | null {
  const trimmed = line.trim();
  if (trimmed.length === 0) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
  return parsed as Record<string, unknown>;
}

function clip(text: string, limit: number): string {
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}

// ---------------------------------------------------------------------------
// Envelope
// ---------------------------------------------------------------------------

export interface BundleEnvelope {
  version: number;
  range: {
    spec: string;
    base: string;
    head: string;
    sep: ".." | "...";
    resolved_base: string;
    commits: RangeCommit[];
  };
  selection: {
    rule: string;
    slack_minutes: number;
    prompts: "text" | "hashed";
    prompt_hash_note?: string;
    caps: { excerpt: number; statement: number; statement_flag: string };
    changed_files: string[];
    candidates: ClassifiedJournal[];
  };
  journals: { session: string; lines: string[] }[];
}

export interface EnvelopeInput {
  range: BundleRange;
  facts: RangeFacts;
  slackMinutes: number;
  prompts: boolean;
  candidates: readonly ClassifiedJournal[];
  /** Only the journals actually carried, in candidate order. */
  journals: readonly { session: string; lines: string[] }[];
}

export function buildEnvelope(input: EnvelopeInput): BundleEnvelope {
  return {
    version: BUNDLE_VERSION,
    range: {
      spec: input.range.spec,
      base: input.range.base,
      head: input.range.head,
      sep: input.range.sep,
      resolved_base: input.facts.resolvedBase,
      commits: input.facts.commits,
    },
    selection: {
      rule: SELECTION_RULE,
      slack_minutes: input.slackMinutes,
      prompts: input.prompts ? "text" : "hashed",
      ...(input.prompts ? {} : { prompt_hash_note: PROMPT_HASH_NOTE }),
      caps: { excerpt: EXCERPT_CAP, statement: STATEMENT_CAP, statement_flag: STATEMENT_CAP_FLAG },
      changed_files: input.facts.changedFiles,
      candidates: [...input.candidates],
    },
    journals: input.journals.map((journal) => ({ session: journal.session, lines: [...journal.lines] })),
  };
}

/**
 * Reconstruct a bundled journal. The inverse of nothing clever: a join.
 *
 * Exported because it is the operation CI performs, and a second
 * implementation of it in the reader would be the place the two halves drift.
 * There is no stored header to re-emit at the top — the header sits at its
 * original position in `lines`, because re-emitting a stored one would hand a
 * headerless or misplaced-header journal a valid header it never had.
 */
export function reconstructJournal(lines: readonly string[]): string {
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// The command
// ---------------------------------------------------------------------------

export const BUNDLE_USAGE = `nullius-kit witness bundle <base>..<head> [flags]

  --out <path>          where to write (default: ${BUNDLE_DIR}/<branch-slug>.json)
  --include <session>   carry this journal whatever the rule says (repeatable)
  --exclude <session>   omit this journal whatever the rule says (repeatable)
  --no-prompts          convert every prompt record to its hashed form
  --slack <minutes>     widen the commit-time window (default: ${String(DEFAULT_SLACK_MINUTES)})
  --root <dir>          the repository to read (default: the working directory)

Writes a committed envelope of the SOURCE LINES of every journal that produced
the range, so CI can rejoin them and re-validate what it counts. Every line of a
carried journal is present, including lines the validator rejects and records
about paths the range never touched: redaction rewrites fields, never drops a
line, and scoping the range is the report's job rather than the bundle's.`;

interface BundleOptions {
  range: string | null;
  out: string | null;
  include: Set<string>;
  exclude: Set<string>;
  prompts: boolean;
  slackMinutes: number;
  root: string;
}

function parseBundleOptions(argv: readonly string[]): BundleOptions | null {
  const options: BundleOptions = {
    range: null,
    out: null,
    include: new Set<string>(),
    exclude: new Set<string>(),
    prompts: true,
    slackMinutes: DEFAULT_SLACK_MINUTES,
    root: process.env["NULLIUS_WITNESS_ROOT"] ?? process.env["CLAUDE_PROJECT_DIR"] ?? process.cwd(),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) break;
    if (arg === "--no-prompts") {
      options.prompts = false;
      continue;
    }
    if (arg === "--include" || arg === "--exclude" || arg === "--out" || arg === "--root" || arg === "--slack") {
      const value = argv[(index += 1)];
      if (value === undefined) {
        console.error(`${arg} needs a value`);
        return null;
      }
      if (arg === "--include") options.include.add(value);
      else if (arg === "--exclude") options.exclude.add(value);
      else if (arg === "--out") options.out = value;
      else if (arg === "--root") options.root = value;
      else {
        const minutes = Number(value);
        if (!Number.isFinite(minutes) || minutes < 0) {
          console.error(`--slack must be a non-negative number of minutes, not ${value}`);
          return null;
        }
        options.slackMinutes = minutes;
      }
      continue;
    }
    if (arg.startsWith("-")) {
      console.error(`unknown flag: ${arg}\n\n${BUNDLE_USAGE}`);
      return null;
    }
    if (options.range !== null) {
      console.error(`witness bundle takes one range, and already has '${options.range}'`);
      return null;
    }
    options.range = arg;
  }

  return options;
}

/** Every journal in `.nullius/runs/`, by session id, lines unmodified. */
export function readCandidates(root: string): JournalCandidate[] {
  const dir = join(root, RUNS_DIR);
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  const candidates: JournalCandidate[] = [];
  for (const name of entries.sort()) {
    if (!name.endsWith(".jsonl")) continue;
    let content: string;
    try {
      content = readFileSync(join(dir, name), "utf8");
    } catch {
      continue;
    }
    candidates.push({ session: name.slice(0, -".jsonl".length), lines: content.split("\n") });
  }
  return candidates;
}

export function runBundle(argv: readonly string[]): number {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(BUNDLE_USAGE);
    return 0;
  }
  const options = parseBundleOptions(argv);
  if (options === null) return 2;
  if (options.range === null) {
    console.error(`witness bundle needs a range\n\n${BUNDLE_USAGE}`);
    return 2;
  }

  const root = resolve(options.root);
  const range = parseBundleRange(options.range);
  if ("error" in range) {
    console.error(range.error);
    return 2;
  }

  const facts = readRangeFacts(root, range, GIT_TIMEOUT_MS);
  if ("error" in facts) {
    console.error(facts.error);
    return 2;
  }

  const out = resolve(root, options.out ?? join(BUNDLE_DIR, `${branchSlug(currentBranch(root))}.json`));
  const forbidden = refusalFor(root, out);
  if (forbidden !== null) {
    console.error(forbidden);
    return 2;
  }

  const times = facts.commits.map((commit) => Date.parse(commit.at)).filter((ms) => Number.isFinite(ms));
  const window: SelectionWindow = {
    firstMs: times.length === 0 ? null : Math.min(...times),
    lastMs: times.length === 0 ? null : Math.max(...times),
    slackMs: options.slackMinutes * 60_000,
    changedFiles: new Set(facts.changedFiles),
  };

  const candidates = readCandidates(root);
  const classified = classifyJournals(candidates, window, {
    include: options.include,
    exclude: options.exclude,
  });

  // The refusal comes before anything is written, and it is checked over every
  // journal that would be carried rather than only over its prompt lines: the
  // bundler cannot know which unreadable line was a prompt.
  if (!options.prompts) {
    const blocked: string[] = [];
    for (const entry of classified) {
      if (entry.classification !== "included") continue;
      const candidate = candidates.find((each) => each.session === entry.session);
      if (candidate === undefined) continue;
      const bad = unreadableLines(candidate.lines);
      if (bad.length > 0) blocked.push(`  ${entry.session} — line(s) ${bad.join(", ")}`);
    }
    if (blocked.length > 0) {
      console.error(
        "--no-prompts cannot be honoured: these journals carry line(s) this bundler cannot read as JSON, " +
          "and an unreadable prompt line cannot be converted to its hashed form.\n" +
          blocked.join("\n") +
          "\n\nNothing was written. Re-run without --no-prompts, or drop the journal with --exclude <session>.",
      );
      return 2;
    }
  }

  const journals = classified
    .filter((entry) => entry.classification === "included")
    .map((entry) => {
      const candidate = candidates.find((each) => each.session === entry.session);
      return {
        session: entry.session,
        lines: redactLines(candidate?.lines ?? [], { prompts: options.prompts }),
      };
    });

  for (const entry of classified) {
    console.log(`${entry.classification}\t${entry.session}\t${entry.reason}`);
  }

  if (journals.length === 0) {
    // An `inconclusive` candidate does not satisfy this. The exit says nothing
    // was selected, and that is exactly what happened.
    console.error(
      `no journal in ${join(RUNS_DIR)} was selected for ${range.spec}. ` +
        "Name one with --include <session> if a session belongs that the rule did not select.",
    );
    return 1;
  }

  const envelope = buildEnvelope({
    range,
    facts,
    slackMinutes: options.slackMinutes,
    prompts: options.prompts,
    candidates: classified,
    journals,
  });

  try {
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, `${JSON.stringify(envelope, null, 2)}\n`, "utf8");
  } catch (error) {
    console.error(`could not write ${out}: ${error instanceof Error ? error.message : String(error)}`);
    return 2;
  }

  console.log(
    `wrote ${relative(root, out)} — ${String(journals.length)} journal(s), ` +
      `${String(facts.commits.length)} commit(s), ${String(facts.changedFiles.length)} changed file(s)`,
  );
  return 0;
}

/**
 * Why this path may not be written, or null.
 *
 * `.nullius/` is refused because the directory's existence is the recording
 * opt-in: a committed envelope inside it would switch recording on for everyone
 * who clones the repository, which is a consent decision the bundler is not
 * entitled to make on their behalf.
 */
function refusalFor(root: string, out: string): string | null {
  const inside = relative(join(root, ".nullius"), out);
  if (inside !== "" && !inside.startsWith(`..${pathSep}`) && inside !== ".." && !isAbsolute(inside)) {
    return (
      `refusing to write ${out}: the envelope must not live under .nullius/. ` +
      "That directory's existence is the recording opt-in, so committing a file inside it turns " +
      "recording on for everyone who clones this repository."
    );
  }
  return null;
}
