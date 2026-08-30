/**
 * `nullius oracle` — conservation of the thing that grades the work.
 *
 * An agent's work is graded by an artifact the agent can edit. When a change
 * makes a test fail there are two ways back to green and they produce identical
 * output: fix the code, or fix the test. The tractable question is not whether
 * the oracle changed — it frequently should — but **whether the change was
 * accounted for.** A machine cannot decide that an assertion *should* have been
 * loosened; it can decide, completely, whether anybody said why.
 *
 * Git is the source rather than the witness journal's `mutation` records,
 * because mutations come from tool-call hooks that watch editing tools only.
 * A `rm`, a `git rm`, a `mv` or any script-driven deletion leaves no record —
 * and deletion is the highest-risk edit there is. A diff over a range sees all
 * of them.
 *
 * This module is pure. Every read of the repository arrives through injected
 * deps so the classifier can be tested on plain data, with no fixture repo and
 * no test-time history synthesis.
 */

import type { OracleGlob } from "./config";

/**
 * The three hard classes, closed.
 *
 * Reduction of what the oracle can detect is the *reason* these three are hard.
 * It is not a universal property of every instance — `skipped` on a file added
 * within the range reduces nothing, and is still hard rather than special-cased
 * against a base that has nothing to compare — and it is not an exhaustive
 * account of the reductions that exist: a rename out of a declared glob, and
 * the removal of a glob from the config, both reduce detection and are both
 * deliberately unclassified in v1.
 */
export const HARD_CHANGES = ["deleted", "skipped", "weakened"] as const;
export type HardChange = (typeof HARD_CHANGES)[number];

export function isHardChange(value: unknown): value is HardChange {
  return (
    typeof value === "string" &&
    (HARD_CHANGES as readonly string[]).includes(value)
  );
}

/**
 * A second, narrower verdict union, kept apart from the kernel's exported
 * `Verdict`, whose growth is breaking public API. Follows `RuleVerdict`.
 */
export type OracleVerdict =
  /** A hard change with a decision naming the same (path, change) pair. */
  | "ok"
  /** A hard change no decision justifies. */
  | "unjustified-oracle-change"
  /** A `justifies` present but unusable: blank path, or a class outside the three. */
  | "malformed-justification";

/**
 * `unjustified-oracle-change` passes in v1, deliberately and advisorily: the
 * verdict is young, `weakened` is a counted pattern with known false positives,
 * and a fuzzy heuristic that hard-fails a build is how a gate gets disabled.
 * `--strict` widens what fails from here.
 *
 * `malformed-justification` is the excluded member, on the same ground that
 * excludes `malformed-rule-header` from the rule verdicts: a mistyped key is an
 * authoring error rather than a finding about the codebase, and an author who
 * mistyped one should see it fail rather than watch it be silently inert.
 *
 * The exclusion is not decoration. A `PASSING` set containing every member of
 * its union makes `isOracleFailure` constant-false, which would hand the whole
 * pass/fail decision back to `--strict` — the no-op predicate this union exists
 * to avoid.
 */
const PASSING: ReadonlySet<OracleVerdict> = new Set<OracleVerdict>([
  "ok",
  "unjustified-oracle-change",
]);

export function isOracleFailure(verdict: OracleVerdict): boolean {
  return !PASSING.has(verdict);
}

/**
 * One finding, over a heterogeneous subject.
 *
 * `unjustified-oracle-change` attaches to a changed path; `malformed-justification`
 * attaches to a journal record. `WiringFinding` already unifies agents, paths,
 * globs and hook commands the same way — a heterogeneous subject is normal in
 * this kernel rather than a departure from it.
 */
export interface OracleFinding {
  verdict: OracleVerdict;
  /** The changed path, or the journal path for a malformed justification. */
  subject: string;
  /** The hard class, when the finding is about a change. */
  change?: HardChange;
  /** The record id, when the finding is about a journal record. */
  record?: string;
  detail: string;
}

/** One entry from `git diff --name-status`, already parsed. */
export interface DiffEntry {
  path: string;
  /** Git's status letter: A added, M modified, D deleted, R renamed. */
  status: "A" | "M" | "D" | "R";
  /** For a rename, where it came from. */
  from?: string;
}

/** A `justifies` object as it appeared in a journal, before validation. */
export interface RawJustification {
  record: string;
  path: unknown;
  change: unknown;
}

export interface OracleDeps {
  /**
   * The range's changed files. `null` means git could not be read at all —
   * which is a different fact from "nothing changed" and must not be collapsed
   * into it.
   */
  diff: () => DiffEntry[] | null;
  /**
   * File content at a revision.
   *
   * `{ status: "absent" }` means the path genuinely is not there at that side.
   * `{ status: "unreadable" }` means git could not answer. Distinguishing them
   * is the whole point: an unreadable base makes every file look added, which
   * silently skips `weakened` on all of them and produces a clean run.
   */
  readAt: (path: string, side: "base" | "head") => RevRead;
  /** Every `justifies` found on a `decision` record in the journal. */
  justifications: () => RawJustification[];
}

export type RevRead =
  | { status: "read"; content: string }
  | { status: "absent" }
  | { status: "unreadable"; reason: string };

export interface OracleReport {
  findings: OracleFinding[];
  /** Hard changes that reached a decision, listed so a pass is legible. */
  justified: { path: string; change: HardChange }[];
  /** Every other change to a declared oracle. No obligation. */
  advisory: string[];
  /** True when the project declared no oracles at all. */
  unconfigured: boolean;
  /** Globs carrying no `weakening`, so `weakened` went unchecked for them. */
  weakeningUnchecked: string[];
  /** True when no journal was read, so no justification could discharge anything. */
  journalAbsent: boolean;
  /**
   * Reasons git could not be read, if any. Non-empty means the run is
   * incomplete and its silence proves nothing — the caller must say so and must
   * not exit clean.
   */
  unreadable: string[];
}

/**
 * Minimal glob match: supports `**`, `*` and `?`, anchored whole-path.
 *
 * Built by scanning rather than by substituting placeholders. The obvious
 * implementation swaps `**` for a sentinel, rewrites `*`, then swaps back — and
 * any sentinel that cannot appear in a glob is by construction a byte that has
 * no business in a source file. An earlier draft used NUL for it, which worked
 * and made the file binary to git, so the diff could not be reviewed. Scanning
 * needs no sentinel at all.
 */
export function globMatches(glob: string, path: string): boolean {
  let pattern = "";
  for (let i = 0; i < glob.length; i += 1) {
    const ch = glob[i];
    if (ch === undefined) break;
    if (ch === "*") {
      if (glob[i + 1] === "*") {
        if (glob[i + 2] === "/") {
          // `**/` matches any number of leading directories, including none.
          pattern += "(?:.*/)?";
          i += 2;
        } else {
          pattern += ".*";
          i += 1;
        }
      } else {
        // A single star stops at a separator.
        pattern += "[^/]*";
      }
      continue;
    }
    if (ch === "?") {
      pattern += "[^/]";
      continue;
    }
    pattern += ch.replace(/[.+^${}()|[\]\\]/, "\\$&");
  }
  return new RegExp(`^${pattern}$`).test(path);
}

function countMatches(content: string, pattern: string): number {
  const re = new RegExp(pattern, "g");
  let n = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(content)) !== null) {
    n += 1;
    // Advance past a zero-width match, whatever offset it occurred at.
    //
    // An earlier guard tested `lastIndex === 0`, which catches only an empty
    // match at the very start. A pattern that matches non-empty first and
    // zero-width later — `a|x*` on "abc" — never advances `lastIndex` and spins
    // forever. It is reachable from a valid config: `config.ts` compiles the
    // pattern, which proves it is a regex, not that it always consumes input.
    // A checker that hangs is worse than one that is wrong, because nothing in
    // the output says which it is doing.
    if (match[0] === "") re.lastIndex += 1;
  }
  return n;
}

/**
 * Classify a range against the declared oracles, and match every hard change
 * against the journal's justifications.
 *
 * The join key is derived rather than assigned: both sides compute
 * `(path, change)` from the same diff, so a decision never has to reference a
 * record id — which matters because the changes most worth catching are made by
 * tools that emit no record to refer to.
 */
export function checkOracles(
  oracles: OracleGlob[] | undefined,
  deps: OracleDeps,
  options: { journalProvided?: boolean } = {},
): OracleReport {
  const findings: OracleFinding[] = [];
  const justified: { path: string; change: HardChange }[] = [];
  const advisory: string[] = [];
  const weakeningUnchecked: string[] = [];

  if (oracles === undefined || oracles.length === 0) {
    // An unconfigured project and a project whose oracle genuinely held still
    // are different facts, and only one of them is evidence. Never a clean zero.
    return {
      findings,
      justified,
      advisory,
      unconfigured: true,
      weakeningUnchecked,
      journalAbsent: options.journalProvided !== true,
      unreadable: [],
    };
  }

  for (const entry of oracles) {
    if (entry.weakening === undefined) weakeningUnchecked.push(entry.glob);
  }

  // Malformed justifications are read from the journal and reported whether or
  // not any change matches them. A verdict conditional on a match would be
  // unreachable in exactly the case the typo caused.
  const usable: { path: string; change: HardChange }[] = [];
  for (const raw of deps.justifications()) {
    if (typeof raw.path !== "string" || raw.path.trim() === "") {
      findings.push({
        verdict: "malformed-justification",
        subject: "journal",
        record: raw.record,
        detail: `a justification needs a non-empty "path" naming the file it accounts for`,
      });
      continue;
    }
    if (!isHardChange(raw.change)) {
      findings.push({
        verdict: "malformed-justification",
        subject: "journal",
        record: raw.record,
        detail:
          `"${String(raw.change)}" is not a change class — ` +
          `a justification names exactly one of ${HARD_CHANGES.join(", ")}`,
      });
      continue;
    }
    usable.push({ path: raw.path, change: raw.change });
  }

  // A nested map rather than a joined string key. Joining needs a separator
  // that cannot occur in a path, and every such separator is a byte that has no
  // business in source — an earlier draft used NUL and made this file binary to
  // git. Nesting sidesteps the question.
  const discharged = new Map<string, Set<HardChange>>();
  for (const j of usable) {
    const set = discharged.get(j.path) ?? new Set<HardChange>();
    set.add(j.change);
    discharged.set(j.path, set);
  }

  const unreadable: string[] = [];

  const entries = deps.diff();
  if (entries === null) {
    // Zero findings because git could not be read is not zero findings. Say so
    // and let the caller refuse to exit clean.
    return {
      findings,
      justified,
      advisory,
      unconfigured: false,
      weakeningUnchecked,
      journalAbsent: options.journalProvided !== true,
      unreadable: ["git could not produce a diff for this range"],
    };
  }

  for (const entry of entries) {
    const matching = oracles.filter((o) => globMatches(o.glob, entry.path));
    if (matching.length === 0) continue;

    const hard: HardChange[] = [];

    if (entry.status === "D") {
      hard.push("deleted");
    } else {
      const base = deps.readAt(entry.path, "base");
      const head = deps.readAt(entry.path, "head");

      // An unreadable side is recorded rather than treated as an absent one.
      // Treating it as absent is what makes `weakened` quietly unreachable for
      // every path in a range whose base cannot be read.
      if (base.status === "unreadable") {
        unreadable.push(`${entry.path} at the base: ${base.reason}`);
      }
      if (head.status === "unreadable") {
        unreadable.push(`${entry.path} at the head: ${head.reason}`);
      }

      const baseText = base.status === "read" ? base.content : null;
      const headText = head.status === "read" ? head.content : null;

      for (const o of matching) {
        if (o.skipMarker !== undefined && headText !== null) {
          // Only compare against a base that was genuinely read. A base that is
          // absent counts as zero (the file is new); a base that could not be
          // read counts as nothing at all.
          if (base.status === "unreadable") continue;
          const before =
            baseText === null ? 0 : countMatches(baseText, o.skipMarker);
          const after = countMatches(headText, o.skipMarker);
          if (after > before && !hard.includes("skipped")) hard.push("skipped");
        }
        // A weakening needs both sides genuinely read. An added file has no base
        // to have been weakened from, and counting its assertions against zero
        // would make every new test file a reduction.
        if (o.weakening !== undefined && baseText !== null && headText !== null) {
          const before = countMatches(baseText, o.weakening);
          const after = countMatches(headText, o.weakening);
          if (after < before && !hard.includes("weakened")) {
            hard.push("weakened");
          }
        }
      }
    }

    if (hard.length === 0) {
      advisory.push(entry.path);
      continue;
    }

    for (const change of hard) {
      if (discharged.get(entry.path)?.has(change) === true) {
        justified.push({ path: entry.path, change });
        continue;
      }
      findings.push({
        verdict: "unjustified-oracle-change",
        subject: entry.path,
        change,
        detail: detailFor(entry.path, change, matching, deps),
      });
    }
  }

  return {
    findings,
    justified,
    advisory,
    unconfigured: false,
    weakeningUnchecked,
    journalAbsent: options.journalProvided !== true,
    unreadable,
  };
}

/**
 * A `weakened` message names the pattern and both counts, so a false positive
 * — a refactor merging two assertions into one — is dismissible in seconds
 * rather than being an accusation the reader has to go and disprove.
 */
function detailFor(
  path: string,
  change: HardChange,
  matching: OracleGlob[],
  deps: OracleDeps,
): string {
  if (change === "weakened") {
    const base = deps.readAt(path, "base");
    const head = deps.readAt(path, "head");
    for (const o of matching) {
      if (
        o.weakening === undefined ||
        base.status !== "read" ||
        head.status !== "read"
      ) {
        continue;
      }
      const before = countMatches(base.content, o.weakening);
      const after = countMatches(head.content, o.weakening);
      if (after < before) {
        return `/${o.weakening}/ matched ${before} time(s) at the base and ${after} at the head — no decision accounts for it`;
      }
    }
  }
  if (change === "deleted") {
    return "present at the base of the range and absent at its head — no decision accounts for it";
  }
  return "a declared skip marker's count increased across the range — no decision accounts for it";
}
