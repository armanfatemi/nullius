/**
 * Absence citations in a checked document carry a search command that this tool
 * re-runs. The document is untrusted input — in CI it is PR-controlled content —
 * so this module is the gate between that content and process execution.
 *
 * The gate has three parts, and all three are load-bearing:
 *
 *  1. **No shell, ever.** The command is tokenised here and handed to the runner
 *     as an argv vector (see `SearchPlan`). Nothing downstream reconstructs a
 *     string for `/bin/sh`, so metacharacter escaping is not a defence we have
 *     to get right — there is no interpreter left to escape from.
 *  2. **A closed flag allowlist.** Allowlisting the *binary* is not enough:
 *     `rg --pre <cmd>` runs `<cmd>` against every searched file, which is
 *     arbitrary code execution behind a command that still starts with `rg`.
 *     `--hostname-bin` is a second exec flag, `-z` shells out to decompressors,
 *     and `-f`/`--exclude-from` read attacker-named files. Every flag must be
 *     named in ALLOWED_* below; an unknown flag is refused rather than passed
 *     through.
 *  3. **Path safety on operands.** The file operands of a search are checked
 *     with the same `isSafeRepoPath` guard presence citations use, so an
 *     absence claim cannot probe outside the repo either. A search that reports
 *     `claimed 0, actual 1` against `/etc/shadow` is a file-probe oracle whose
 *     answer gets posted to a PR comment.
 *
 * See spec/evidence-anchors.md → "Security model".
 */

import { isSafeRepoPath } from "./pathSafety";

/** Only these binaries may start a pipeline segment. */
const ALLOWED_BINARIES = ["grep", "rg"] as const;

export type SearchBinary = (typeof ALLOWED_BINARIES)[number];

/** One `binary arg arg` stage of a pipeline, ready to spawn without a shell. */
export interface SearchSegment {
  binary: SearchBinary;
  args: string[];
  /**
   * Index into `args` of the operand carrying the search pattern, or null when
   * the segment has none. Used to derive a relaxed control search — see
   * {@link relaxPlan}.
   */
  patternIndex: number | null;
}

/** A fully parsed, fully validated command: what the runner is allowed to run. */
export interface SearchPlan {
  segments: SearchSegment[];
}

export type SafetyVerdict = { safe: true } | { safe: false; reason: string };

export type ParseResult =
  | { safe: true; plan: SearchPlan }
  | { safe: false; reason: string };

type Arity = "none" | "value";

/**
 * Flags that must NEVER be allowlisted, with the reason, so that a later
 * contributor extending the tables below cannot quietly reopen the hole. These
 * are checked explicitly as well as being absent from the allowlists.
 */
const DENIED_FLAGS: ReadonlyMap<string, string> = new Map([
  ["pre", "runs an arbitrary command against every searched file"],
  ["pre-glob", "selects files for --pre"],
  ["hostname-bin", "executes an arbitrary binary"],
  ["search-zip", "shells out to external decompressors"],
  ["z", "shells out to external decompressors"],
  ["file", "reads patterns from an arbitrary file"],
  ["f", "reads patterns from an arbitrary file"],
  ["exclude-from", "reads an arbitrary file"],
  ["ignore-file", "reads an arbitrary file"],
  ["follow", "follows symlinks out of the repository"],
  ["L", "follows symlinks out of the repository"],
  ["files", "lists files rather than searching, turning the check into a directory oracle"],
  ["quiet", "suppresses output, so every absence claim trivially counts zero"],
  ["silent", "suppresses output, so every absence claim trivially counts zero"],
  ["q", "suppresses output, so every absence claim trivially counts zero"],
]);

const GREP_SHORT: ReadonlyMap<string, Arity> = new Map([
  ["r", "none"], ["R", "none"], ["n", "none"], ["i", "none"], ["w", "none"],
  ["x", "none"], ["c", "none"], ["l", "none"], ["L", "none"], ["h", "none"],
  ["H", "none"], ["o", "none"], ["v", "none"], ["E", "none"], ["F", "none"],
  ["G", "none"], ["P", "none"], ["s", "none"], ["a", "none"], ["I", "none"],
  ["b", "none"], ["T", "none"],
  ["e", "value"], ["m", "value"], ["A", "value"], ["B", "value"],
  ["C", "value"], ["D", "value"], ["d", "value"],
]);

const GREP_LONG: ReadonlyMap<string, Arity> = new Map([
  ["recursive", "none"], ["dereference-recursive", "none"],
  ["line-number", "none"], ["ignore-case", "none"], ["no-ignore-case", "none"],
  ["word-regexp", "none"], ["line-regexp", "none"], ["count", "none"],
  ["files-with-matches", "none"], ["files-without-match", "none"],
  ["only-matching", "none"], ["invert-match", "none"],
  ["extended-regexp", "none"], ["fixed-strings", "none"],
  ["basic-regexp", "none"], ["perl-regexp", "none"],
  ["no-filename", "none"], ["with-filename", "none"], ["no-messages", "none"],
  ["text", "none"], ["byte-offset", "none"], ["initial-tab", "none"],
  ["null-data", "none"],
  ["regexp", "value"], ["max-count", "value"], ["after-context", "value"],
  ["before-context", "value"], ["context", "value"], ["include", "value"],
  ["exclude", "value"], ["exclude-dir", "value"], ["binary-files", "value"],
  ["color", "value"], ["colour", "value"], ["devices", "value"],
  ["directories", "value"], ["label", "value"],
]);

const RG_SHORT: ReadonlyMap<string, Arity> = new Map([
  ["i", "none"], ["s", "none"], ["S", "none"], ["w", "none"], ["x", "none"],
  ["v", "none"], ["n", "none"], ["N", "none"], ["c", "none"], ["l", "none"],
  ["o", "none"], ["H", "none"], ["I", "none"], ["F", "none"], ["P", "none"],
  ["U", "none"], ["u", "none"], ["a", "none"], ["p", "none"], ["b", "none"],
  ["e", "value"], ["g", "value"], ["t", "value"], ["T", "value"],
  ["m", "value"], ["A", "value"], ["B", "value"], ["C", "value"],
]);

const RG_LONG: ReadonlyMap<string, Arity> = new Map([
  ["ignore-case", "none"], ["case-sensitive", "none"], ["smart-case", "none"],
  ["word-regexp", "none"], ["line-regexp", "none"], ["invert-match", "none"],
  ["line-number", "none"], ["no-line-number", "none"], ["count", "none"],
  ["count-matches", "none"], ["files-with-matches", "none"],
  ["files-without-match", "none"], ["only-matching", "none"],
  ["with-filename", "none"], ["no-filename", "none"], ["no-heading", "none"],
  ["heading", "none"], ["hidden", "none"], ["no-hidden", "none"],
  ["no-ignore", "none"], ["no-ignore-vcs", "none"], ["no-ignore-parent", "none"],
  ["no-ignore-dot", "none"], ["fixed-strings", "none"], ["pcre2", "none"],
  ["multiline", "none"], ["multiline-dotall", "none"], ["text", "none"],
  ["unrestricted", "none"], ["stats", "none"], ["null-data", "none"],
  ["crlf", "none"], ["no-unicode", "none"], ["one-file-system", "none"],
  ["no-require-git", "none"], ["vimgrep", "none"], ["byte-offset", "none"],
  ["column", "none"], ["no-messages", "none"], ["no-config", "none"],
  ["regexp", "value"], ["glob", "value"], ["iglob", "value"],
  ["type", "value"], ["type-not", "value"], ["max-count", "value"],
  ["after-context", "value"], ["before-context", "value"], ["context", "value"],
  ["max-depth", "value"], ["maxdepth", "value"], ["max-filesize", "value"],
  ["sort", "value"], ["sortr", "value"], ["color", "value"],
  ["colors", "value"], ["encoding", "value"], ["engine", "value"],
]);

/** Flags that supply the pattern, so that every positional becomes a path. */
const PATTERN_FLAGS = new Set(["e", "regexp"]);

interface Word {
  value: string;
  /** True when a `|` separator, not a word. */
  pipe: boolean;
}

/**
 * Splits the command into words the way a POSIX shell would — honouring single
 * quotes, double quotes and backslash escapes — while refusing every character
 * whose only purpose is to reach beyond a single search: chaining, expansion,
 * substitution, redirection. `$` is refused outside single quotes because an
 * author who writes `$SECRET_FILE` means expansion, and silently searching for
 * the literal text would be a confusing lie; inside single quotes it is an
 * ordinary regex anchor and passes through.
 */
function tokenize(command: string): { words: Word[] } | { reason: string } {
  const words: Word[] = [];
  let current = "";
  let started = false;
  let quote: "'" | '"' | null = null;

  const flush = (): void => {
    if (started) {
      words.push({ value: current, pipe: false });
      current = "";
      started = false;
    }
  };

  for (let index = 0; index < command.length; index += 1) {
    const char = command[index] as string;

    if (quote === "'") {
      if (char === "'") quote = null;
      else current += char;
      started = true;
      continue;
    }

    if (quote === '"') {
      if (char === '"') {
        quote = null;
      } else if (char === "$" || char === "`") {
        return { reason: `contains '${char}' expansion inside double quotes` };
      } else if (char === "\\") {
        const next = command[index + 1];
        if (next === undefined) return { reason: "ends with a trailing backslash" };
        current += next;
        index += 1;
      } else {
        current += char;
      }
      started = true;
      continue;
    }

    switch (char) {
      case "'":
      case '"':
        quote = char;
        started = true;
        continue;
      case "\\": {
        const next = command[index + 1];
        if (next === undefined) return { reason: "ends with a trailing backslash" };
        current += next;
        index += 1;
        started = true;
        continue;
      }
      case "|":
        flush();
        words.push({ value: "|", pipe: true });
        continue;
      case " ":
      case "\t":
        flush();
        continue;
      case ";": case "&": case ">": case "<": case "(": case ")":
      case "`": case "$": case "\n": case "\r": case "\0":
        return {
          reason: `contains forbidden character '${
            char === "\n" ? "\\n" : char === "\r" ? "\\r" : char === "\0" ? "\\0" : char
          }'`,
        };
      default:
        current += char;
        started = true;
    }
  }

  if (quote !== null) return { reason: "has an unterminated quote" };
  flush();
  return { words };
}

function denialReason(flag: string): string | null {
  const reason = DENIED_FLAGS.get(flag);
  return reason === undefined ? null : reason;
}

/**
 * Validates one pipeline segment and returns its argv. Flags are checked
 * against the binary's closed allowlist; file operands are checked against
 * `isSafeRepoPath`.
 */
function validateSegment(words: string[]): { segment: SearchSegment } | { reason: string } {
  const binary = words[0];
  if (binary === undefined) return { reason: "pipeline has an empty segment" };
  if (!ALLOWED_BINARIES.some((allowed) => allowed === binary)) {
    return { reason: `segment '${words.join(" ")}' does not begin with grep or rg` };
  }
  const typed = binary as SearchBinary;
  const shortFlags = typed === "grep" ? GREP_SHORT : RG_SHORT;
  const longFlags = typed === "grep" ? GREP_LONG : RG_LONG;

  const positionals: string[] = [];
  let patternFromFlag = false;
  let endOfFlags = false;
  /** Index into `words` of the pattern operand, if one is present. */
  let patternWord: number | null = null;
  let firstPositionalWord: number | null = null;

  for (let index = 1; index < words.length; index += 1) {
    const word = words[index] as string;

    if (endOfFlags || word === "-" || !word.startsWith("-") || word === "") {
      if (firstPositionalWord === null) firstPositionalWord = index;
      positionals.push(word);
      continue;
    }

    if (word === "--") {
      endOfFlags = true;
      continue;
    }

    if (word.startsWith("--")) {
      const body = word.slice(2);
      const equals = body.indexOf("=");
      const name = equals === -1 ? body : body.slice(0, equals);
      const inlineValue = equals === -1 ? null : body.slice(equals + 1);

      const denied = denialReason(name);
      if (denied !== null) {
        return { reason: `flag '--${name}' is refused — it ${denied}` };
      }
      const arity = longFlags.get(name);
      if (arity === undefined) {
        return {
          reason: `flag '--${name}' is not on the ${typed} allowlist — only a fixed set of search flags may run`,
        };
      }
      if (PATTERN_FLAGS.has(name)) patternFromFlag = true;
      if (arity === "value" && inlineValue === null) {
        index += 1;
        if (words[index] === undefined) {
          return { reason: `flag '--${name}' requires a value` };
        }
        if (PATTERN_FLAGS.has(name) && patternWord === null) patternWord = index;
      }
      continue;
    }

    // A short-flag cluster: -rn, -m5, -e PATTERN.
    const cluster = word.slice(1);
    for (let position = 0; position < cluster.length; position += 1) {
      const letter = cluster[position] as string;
      const denied = denialReason(letter);
      if (denied !== null) {
        return { reason: `flag '-${letter}' is refused — it ${denied}` };
      }
      const arity = shortFlags.get(letter);
      if (arity === undefined) {
        return {
          reason: `flag '-${letter}' is not on the ${typed} allowlist — only a fixed set of search flags may run`,
        };
      }
      if (PATTERN_FLAGS.has(letter)) patternFromFlag = true;
      if (arity === "value") {
        // The value is either the rest of the cluster (-m5) or the next word.
        if (position === cluster.length - 1) {
          index += 1;
          if (words[index] === undefined) {
            return { reason: `flag '-${letter}' requires a value` };
          }
          if (PATTERN_FLAGS.has(letter) && patternWord === null) patternWord = index;
        }
        // An inline cluster value (-ePATTERN) shares a word with its flag, so
        // there is no operand to substitute; relaxation simply does not apply.
        break;
      }
    }
  }

  // grep/rg operand semantics: without -e/--regexp the first positional is the
  // pattern and the rest are paths; with it, every positional is a path.
  const paths = patternFromFlag ? positionals : positionals.slice(1);
  for (const path of paths) {
    if (path === "-") continue;
    const verdict = isSafeRepoPath(path);
    if (!verdict.safe) {
      return { reason: `search path '${path}' is refused — ${verdict.reason}` };
    }
  }

  const patternAt = patternFromFlag ? patternWord : firstPositionalWord;
  return {
    segment: {
      binary: typed,
      args: words.slice(1),
      // `args` drops the binary, so operand indices shift by one.
      patternIndex: patternAt === null ? null : patternAt - 1,
    },
  };
}

/**
 * Parses an absence citation's command into an executable plan, or explains why
 * it will not be executed. This is the only way to produce a `SearchPlan`, so a
 * command that was never validated cannot reach the runner.
 */
export function parseSearchCommand(command: string): ParseResult {
  if (command.trim().length === 0) {
    return { safe: false, reason: "command is empty" };
  }

  const tokenized = tokenize(command);
  if ("reason" in tokenized) return { safe: false, reason: tokenized.reason };

  const segments: SearchSegment[] = [];
  let currentWords: string[] = [];

  for (const word of tokenized.words) {
    if (word.pipe) {
      const validated = validateSegment(currentWords);
      if ("reason" in validated) return { safe: false, reason: validated.reason };
      segments.push(validated.segment);
      currentWords = [];
      continue;
    }
    currentWords.push(word.value);
  }

  const last = validateSegment(currentWords);
  if ("reason" in last) return { safe: false, reason: last.reason };
  segments.push(last.segment);

  return { safe: true, plan: { segments } };
}

/** Back-compatible boolean form of {@link parseSearchCommand}. */
export function isSafeSearchCommand(command: string): SafetyVerdict {
  const result = parseSearchCommand(command);
  return result.safe ? { safe: true } : { safe: false, reason: result.reason };
}

/** Shortest relaxed pattern worth running as a control. */
const MIN_RELAXED_CHARS = 4;

/**
 * Derives a deliberately broader version of a search, used as a control when an
 * absence claim reports zero matches.
 *
 * A search that finds nothing is indistinguishable, from the outside, from a
 * search pointed at nothing — the wrong directory, a stale `--include`, a
 * regex dialect the binary does not speak. Re-running with the pattern cut back
 * to its longest identifier fragment separates the two: if even the fragment
 * finds nothing, the search is probably not looking where the author thinks.
 *
 * Returns null when no useful relaxation exists (no pattern operand, or a
 * pattern too short to cut). Only the first segment is relaxed: later segments
 * narrow the result, so widening the source is what tests reachability.
 */
export function relaxPlan(plan: SearchPlan): SearchPlan | null {
  const first = plan.segments[0];
  if (first === undefined || first.patternIndex === null) return null;

  const pattern = first.args[first.patternIndex];
  if (pattern === undefined) return null;

  // The longest run of identifier characters is the part of a pattern most
  // likely to be literal text rather than regex syntax.
  const runs = pattern.match(/[A-Za-z0-9_]+/g);
  if (runs === null || runs.length === 0) return null;
  const longest = runs.reduce((best, run) => (run.length > best.length ? run : best));

  const cut = Math.max(MIN_RELAXED_CHARS, Math.ceil(longest.length * 0.6));
  if (longest.length < MIN_RELAXED_CHARS + 1 || cut >= longest.length) return null;
  const relaxed = longest.slice(0, cut);

  const args = [...first.args];
  args[first.patternIndex] = relaxed;

  return {
    segments: [
      { binary: first.binary, args, patternIndex: first.patternIndex },
      ...plan.segments.slice(1),
    ],
  };
}
