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
  /**
   * Indices into `args` of the file operands. The runner re-checks these
   * against the filesystem (symlink resolution), which this module cannot do.
   */
  pathIndices: number[];
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
/**
 * Flags that must NEVER be allowlisted, with the reason, so that a later
 * contributor extending the tables below cannot quietly reopen the hole.
 *
 * Denials are PER BINARY, because the same letter means different things to
 * the two tools: `rg -L` is `--follow` (escapes the repo) but `grep -L` is
 * `--files-without-match` (harmless), and `rg -z` is `--search-zip` (execs a
 * decompressor) but `grep -z` is `--null-data`. A shared table refuses those
 * grep flags with a reason that is simply false, which is not something this
 * tool gets to do.
 */
const DENIED_COMMON: ReadonlyMap<string, string> = new Map([
  ["file", "reads patterns from an arbitrary file"],
  ["f", "reads patterns from an arbitrary file"],
  ["quiet", "suppresses output, so every absence claim trivially counts zero"],
  ["silent", "suppresses output, so every absence claim trivially counts zero"],
  ["q", "suppresses output, so every absence claim trivially counts zero"],
]);

const DENIED_GREP: ReadonlyMap<string, string> = new Map([
  ...DENIED_COMMON,
  ["exclude-from", "reads an arbitrary file"],
  // grep's -R is --dereference-recursive: it follows symlinks during the walk,
  // so a committed `evil -> /etc` escapes the repo and grep prints host paths
  // to stderr, which the Action posts into a PR comment. Plain -r is allowed.
  ["R", "follows symlinks during recursion (use -r, which does not)"],
  ["dereference-recursive", "follows symlinks during recursion (use -r, which does not)"],
]);

const DENIED_RG: ReadonlyMap<string, string> = new Map([
  ...DENIED_COMMON,
  ["pre", "runs an arbitrary command against every searched file"],
  ["pre-glob", "selects files for --pre"],
  ["hostname-bin", "executes an arbitrary binary"],
  ["search-zip", "shells out to external decompressors"],
  ["z", "shells out to external decompressors"],
  ["ignore-file", "reads an arbitrary file"],
  ["follow", "follows symlinks out of the repository"],
  ["L", "follows symlinks out of the repository"],
  ["files", "lists files rather than searching, turning the check into a directory oracle"],
]);

const GREP_SHORT: ReadonlyMap<string, Arity> = new Map([
  ["r", "none"], ["n", "none"], ["i", "none"], ["w", "none"],
  ["x", "none"], ["c", "none"], ["l", "none"], ["L", "none"], ["h", "none"],
  ["H", "none"], ["o", "none"], ["v", "none"], ["E", "none"], ["F", "none"],
  ["G", "none"], ["P", "none"], ["s", "none"], ["a", "none"], ["I", "none"],
  ["b", "none"], ["T", "none"],
  // grep's -z is --null-data (rg's is --search-zip, denied for rg only).
  ["z", "none"],
  ["e", "value"], ["m", "value"], ["A", "value"], ["B", "value"],
  ["C", "value"], ["D", "value"], ["d", "value"],
]);

const GREP_LONG: ReadonlyMap<string, Arity> = new Map([
  ["recursive", "none"],
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
  // --color[=WHEN]: the value is OPTIONAL, so grep never consumes the next
  // word. Treating it as "value" swallowed the following operand past the
  // path guard while grep read it as a file.
  ["color", "none"], ["colour", "none"], ["devices", "value"],
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
  ["sort", "value"], ["sortr", "value"], ["color", "none"],
  ["colors", "value"], ["encoding", "value"], ["engine", "value"],
]);

/** Flags that supply the pattern, so that every positional becomes a path. */
const PATTERN_FLAGS = new Set(["e", "regexp"]);

/**
 * Flags whose value is OPTIONAL. getopt only accepts an optional value in the
 * `--flag=value` form, so the binary never consumes the following word — and a
 * validator that thinks otherwise hands the next word straight past the path
 * guard as if it were a flag value. `grep -e root --color /etc/shadow` was
 * exactly that bug. These are arity `none` with an inline value permitted.
 */
const OPTIONAL_VALUE_FLAGS = new Set(["color", "colour"]);

/**
 * Flags whose value can make a search match nothing at all, independent of the
 * pattern — the same defect that gets `-q` refused. `rg -m 0 <secret> src/`
 * returns zero because it was told to stop at zero matches, not because the
 * secret is absent.
 */
const ZERO_MEANS_VACUOUS = new Set([
  "m",
  "max-count",
  "max-depth",
  "maxdepth",
  "max-filesize",
]);

function refusesZero(flag: string, value: string): boolean {
  if (!ZERO_MEANS_VACUOUS.has(flag)) return false;
  const leading = /^\d+/.exec(value.trim());
  return leading !== null && Number.parseInt(leading[0], 10) === 0;
}

/**
 * Refuses a token that names a location outside the repository, wherever it
 * appears — operand, pattern, or flag value.
 *
 * The per-flag arity table decides which words are operands, and a single
 * wrong entry in it silently turns a path into an unchecked "flag value". This
 * check does not consult the table at all, so the containment guarantee does
 * not depend on the table being perfect. The cost is that a regex which looks
 * like an absolute path (`grep -rn '/api/v1/users' src/`) is refused; that is
 * a loud, fixable refusal rather than a silent file probe.
 */
function refuseEscapingToken(token: string): string | null {
  if (token.includes("\0")) return "contains a null byte";
  if (token.startsWith("/") || /^[A-Za-z]:[\\/]/.test(token)) {
    return `'${token}' looks like an absolute path — citations may only reach repo-relative locations`;
  }
  if (token.startsWith("~")) {
    return `'${token}' is home-relative — citations may only reach repo-relative locations`;
  }
  if (token.split(/[\\/]/).some((segment) => segment === "..")) {
    return `'${token}' traverses out of the repository`;
  }
  return null;
}

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

function denialReason(binary: SearchBinary, flag: string): string | null {
  const table = binary === "grep" ? DENIED_GREP : DENIED_RG;
  const reason = table.get(flag);
  return reason === undefined ? null : reason;
}

/**
 * Validates one pipeline segment and returns its argv.
 *
 * The returned argv is CANONICAL, not the author's tokens: short clusters are
 * split (`-rn` becomes `-r -n`), inline flag values are separated (`-ePAT`
 * becomes `-e PAT`), and a `--` precedes the file operands. Two things follow.
 * The argv that runs is exactly the argv that was validated, in one shape
 * rather than four — and every pattern operand is a standalone token, so the
 * relaxed control search can always find it. Before this, `-ePAT` left the
 * pattern fused to its flag, and a forged absence claim written that way
 * skipped the control and passed as SEARCH-CLEAN.
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

  // Checked before the arity table is consulted, so containment does not
  // depend on the table being right about any particular flag.
  for (const word of words.slice(1)) {
    const escaping = refuseEscapingToken(word);
    if (escaping !== null) return { reason: escaping };
  }

  /** Canonical flag tokens, in order. */
  const flags: string[] = [];
  const positionals: string[] = [];
  let patternFromFlag = false;
  let patternFlagValueIndex: number | null = null;
  let endOfFlags = false;

  /** Records a flag's value as its own token, tracking the pattern operand. */
  const pushValue = (flag: string, value: string): string | null => {
    if (refusesZero(flag, value)) {
      return `flag '${flag}' with value '${value}' makes the search match nothing regardless of the pattern`;
    }
    if (PATTERN_FLAGS.has(flag)) {
      patternFromFlag = true;
      if (patternFlagValueIndex === null) patternFlagValueIndex = flags.length;
    }
    flags.push(value);
    return null;
  };

  for (let index = 1; index < words.length; index += 1) {
    const word = words[index] as string;

    if (endOfFlags || word === "-" || !word.startsWith("-") || word === "") {
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

      const denied = denialReason(typed, name);
      if (denied !== null) {
        return { reason: `flag '--${name}' is refused — it ${denied}` };
      }
      const arity = longFlags.get(name);
      if (arity === undefined) {
        return {
          reason: `flag '--${name}' is not on the ${typed} allowlist — only a fixed set of search flags may run`,
        };
      }

      if (arity === "none") {
        if (inlineValue !== null && !OPTIONAL_VALUE_FLAGS.has(name)) {
          return { reason: `flag '--${name}' does not take a value` };
        }
        // An optional-value flag keeps its inline form; it never consumes the
        // following word, and neither do we.
        flags.push(word);
        continue;
      }

      flags.push(`--${name}`);
      let value = inlineValue;
      if (value === null) {
        index += 1;
        value = words[index] ?? null;
        if (value === null) {
          return { reason: `flag '--${name}' requires a value` };
        }
      }
      const bad = pushValue(name, value);
      if (bad !== null) return { reason: bad };
      continue;
    }

    // A short-flag cluster: -rn, -m5, -e PATTERN.
    const cluster = word.slice(1);
    if (cluster.length === 0) return { reason: "'-' is not a flag" };

    for (let position = 0; position < cluster.length; position += 1) {
      const letter = cluster[position] as string;
      const denied = denialReason(typed, letter);
      if (denied !== null) {
        return { reason: `flag '-${letter}' is refused — it ${denied}` };
      }
      const arity = shortFlags.get(letter);
      if (arity === undefined) {
        return {
          reason: `flag '-${letter}' is not on the ${typed} allowlist — only a fixed set of search flags may run`,
        };
      }

      if (arity === "none") {
        flags.push(`-${letter}`);
        continue;
      }

      flags.push(`-${letter}`);
      // The value is the rest of the cluster (-m5) or the next word (-m 5).
      let value: string | null;
      if (position < cluster.length - 1) {
        value = cluster.slice(position + 1);
      } else {
        index += 1;
        value = words[index] ?? null;
      }
      if (value === null) {
        return { reason: `flag '-${letter}' requires a value` };
      }
      const bad = pushValue(letter, value);
      if (bad !== null) return { reason: bad };
      break;
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

  // `--` before the operands so a path can never be re-read as a flag.
  const args = positionals.length > 0 ? [...flags, "--", ...positionals] : [...flags];
  const firstPositional = flags.length + 1;
  const pathIndices = paths.map(
    (_path, offset) => firstPositional + (patternFromFlag ? offset : offset + 1),
  );

  return {
    segment: {
      binary: typed,
      args,
      patternIndex: patternFromFlag ? patternFlagValueIndex : (positionals.length > 0 ? firstPositional : null),
      pathIndices,
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

/**
 * Flags that narrow what the PATTERN can match. The reachability control drops
 * them, because it substitutes a pattern of its own and needs it to behave as a
 * regex that matches any non-empty line.
 */
const PATTERN_SEMANTIC_FLAGS = new Set([
  "-F", "--fixed-strings",
  "-w", "--word-regexp",
  "-x", "--line-regexp",
  "-v", "--invert-match",
]);

/** A regex that matches every non-empty line, in both binaries' default dialect. */
const MATCH_ANY = ".";

/**
 * Derives a control search that tests whether the cited search REACHED
 * anything, used when an absence claim reports zero matches.
 *
 * A search that finds nothing is indistinguishable, from the outside, from a
 * search pointed at nothing — the wrong directory, a stale `--include`, a glob
 * that expanded to no files. The control keeps the scope of the original
 * (same paths, same include/exclude filters, same type filters) and replaces
 * only the pattern with one that matches any non-empty line. If THAT returns
 * zero, the search examined no content at all and the zero it reported says
 * nothing about the codebase.
 *
 * An earlier version instead truncated the pattern to a fragment of its longest
 * identifier. That premise was inverted: a prefix of a genuinely absent
 * identifier is usually also absent, so it fired on correct absence claims —
 * noise on the tool's headline output, which trains readers to skim past
 * advisories. Reachability has the premise the right way round.
 *
 * Returns null when the segment has no substitutable pattern operand.
 */
export function reachabilityPlan(plan: SearchPlan): SearchPlan | null {
  const first = plan.segments[0];
  if (first === undefined || first.patternIndex === null) return null;

  const args: string[] = [];
  let patternIndex: number | null = null;
  for (let index = 0; index < first.args.length; index += 1) {
    const arg = first.args[index] as string;
    if (index === first.patternIndex) {
      patternIndex = args.length;
      args.push(MATCH_ANY);
      continue;
    }
    if (PATTERN_SEMANTIC_FLAGS.has(arg)) continue;
    args.push(arg);
  }
  if (patternIndex === null) return null;

  // Only the first stage runs: later stages narrow the result, and the question
  // is whether the source of the pipeline saw any content at all.
  return {
    segments: [
      {
        binary: first.binary,
        args,
        patternIndex,
        // Operand positions shift when a semantic flag is dropped, and the
        // runner re-checks paths, so recompute rather than reuse.
        pathIndices: first.pathIndices.map(
          (original) => original - (first.args.length - args.length),
        ),
      },
    ],
  };
}
