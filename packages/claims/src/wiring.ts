/**
 * References that must resolve.
 *
 * A skill naming an agent that has no definition file does not error: the
 * dispatch no-ops and the run reports a completed review having reviewed
 * nothing. That silence is a filesystem fact, so it belongs to a checker.
 *
 * Only DECLARED fields fail. A path in prose might be a live pointer or an
 * illustrative example, and nothing here can tell them apart — so an
 * unresolvable one is advisory. The hard half reads frontmatter, where the
 * author committed to the reference.
 *
 * Its own verdict union on purpose: the kernel's exported `Verdict` is public
 * API, and growing it is a breaking change.
 *
 * See spec/wiring.md.
 */

import type { Located } from "./frontmatter";
import { isSafeRepoPath } from "./pathSafety";

export type WiringVerdict =
  /** The reference resolves. */
  | "ok"
  /** A declared dispatch names an agent with no definition file. */
  | "dangling-agent"
  /** A declared skill reference names a skill with no SKILL.md. */
  | "dangling-skill"
  /** A declared read path does not exist. */
  | "missing-path"
  /** A declared glob matches no file. */
  | "empty-glob"
  /** A hook command does not resolve, or is not executable. */
  | "dead-hook"
  /** A `{{TOKEN}}` placeholder survived a port. */
  | "unsubstituted-token"
  /** A backticked path in prose that does not resolve. Advisory. */
  | "loose-reference";

export type ArtifactKind = "agent" | "skill" | "rule" | "hooks" | "settings" | "command";

export interface HarnessArtifact {
  /** Repo-relative path of the file these references came from. */
  path: string;
  kind: ArtifactKind;
  /** The `name:` this artifact declares for itself, when it has one. */
  name: string | null;
  dispatches: Located[];
  skills: Located[];
  reads: Located[];
  globs: Located[];
  hooks: Located[];
  tokens: Located[];
  loose: Located[];
}

export interface WiringDeps {
  exists(repoPath: string): boolean;
  isExecutable(repoPath: string): boolean;
  glob(pattern: string): string[];
}

export interface WiringFinding {
  /** Repo-relative path of the artifact carrying the reference. */
  artifact: string;
  /** 1-based line of the reference within that artifact. */
  line: number;
  verdict: WiringVerdict;
  /** The reference itself — the agent name, path, or glob. */
  subject: string;
  detail: string;
}

export interface WiringReport {
  findings: WiringFinding[];
  artifacts: number;
  /** Declared references examined. Advisory prose references are not counted. */
  references: number;
}

/**
 * Advisory verdicts pass. `loose-reference` is heuristic by construction, and
 * a heuristic that fails a build is a check people delete.
 */
const PASSING: ReadonlySet<WiringVerdict> = new Set<WiringVerdict>(["ok", "loose-reference"]);

export function isWiringFailure(verdict: WiringVerdict): boolean {
  return !PASSING.has(verdict);
}

export function agentPath(name: string): string {
  return `.claude/agents/${name}.md`;
}

export function skillPath(name: string): string {
  return `.claude/skills/${name}/SKILL.md`;
}

/** Extensions a hook script plausibly ends in. Nothing else is claimed as a target. */
const SCRIPT_EXTENSIONS: ReadonlySet<string> = new Set([
  ".sh", ".bash", ".zsh", ".js", ".mjs", ".cjs", ".ts", ".mts", ".cts", ".py", ".rb", ".pl", ".cmd", ".ps1", ".bat",
]);

/** Split a command line into words, treating a quoted run — spaces and all — as one word. */
function shellWords(command: string): string[] {
  const words: string[] = [];
  let current = "";
  let quote: string | null = null;

  for (const char of command) {
    if (quote !== null) {
      if (char === quote) quote = null;
      else current += char;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current.length > 0) words.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  if (current.length > 0) words.push(current);
  return words;
}

function hasScriptExtension(token: string): boolean {
  const dot = token.lastIndexOf(".");
  return dot !== -1 && SCRIPT_EXTENSIONS.has(token.slice(dot).toLowerCase());
}

/** A `word:` prefix — mailto:, data:, urn:, https:. Refused as a class, not case by case. */
const SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/**
 * Ordinary whitespace, plus U+200B–U+200D (zero-width space, ZWNJ, ZWJ) —
 * three code points JS `\s` does not match, so a token fused by one of them
 * (two path segments glued together by an invisible character instead of a
 * real space) would otherwise slip past the guard below unsplit and
 * unrefused. U+FEFF (zero-width no-break space / BOM) is included too for
 * clarity, but it is redundant: `\s` already matches it.
 */
const WHITESPACE_LIKE = /[\s\u200B-\u200D\uFEFF]/;

/**
 * Does this token name a repo-relative script we are willing to check?
 *
 * Every clause is a refusal, not a match. A leading `-` means a flag, and
 * `--loader=./x.mjs` is a flag whether or not it ends in an extension. A URL is
 * not a path. `isSafeRepoPath` refuses absolute paths, `~`, `..` traversal and
 * anything inside `.git`, which is the same containment the `reads` loop
 * applies — a hook target had been escaping it.
 */
function isHookScript(token: string): boolean {
  if (token.startsWith("-")) return false;
  // A candidate containing whitespace is a command line that survived quoting
  // — `sh -c "node hooks/run.js"` fuses into one word — not a path. This does
  // refuse a real path with a space in it, deliberately: the two are not
  // distinguishable here, and returning the fused command line as though it
  // were a script is the failure this function must not have.
  if (WHITESPACE_LIKE.test(token)) return false;
  if (SCHEME.test(token)) return false;
  if (!token.includes("/")) return false;
  if (!isSafeRepoPath(token).safe) return false;
  return hasScriptExtension(token);
}

/**
 * The repo-relative script a hook command runs, or null when the command line
 * does not unambiguously name exactly one.
 *
 * The previous rule took the first plausible token, and every refinement of
 * "plausible" lost to an ordinary command form: a flag's argument, a scoped
 * package name, a loader flag carrying a real extension, an interpreter
 * followed by both a preload and a script. Each miss returned a WRONG path,
 * which fails a hook that works — and that is how a check earns its way into
 * someone's ignore list.
 *
 * So this does not pick. It collects every token that qualifies and answers
 * only when there is exactly one. Two candidates is a command line this
 * function cannot read, and saying so is the honest answer; the cost is that
 * such a hook goes unchecked, which is the direction a fail-open artifact
 * should be wrong in.
 *
 * `pluginRoot` is taken on faith: it is expected to already be a resolved,
 * repo-relative path, and substituted in verbatim wherever `${CLAUDE_PLUGIN_ROOT}`
 * or `$CLAUDE_PLUGIN_ROOT` appears in a token. A caller that passes a root
 * which itself still contains that literal placeholder, or an absolute
 * install path, gets a result this function has no way to detect or correct
 * — resolving the root is the caller's job, done before this call, not
 * inside it.
 */
export function hookTarget(command: string, pluginRoot: string): string | null {
  // Backslash quoting is where four attempts at reading these command lines
  // went wrong, each returning a confident wrong path rather than declining.
  // A partial shell parser's real failure mode is not the cases it rejects,
  // it is the cases it thinks it understood. So this does not parse backslash
  // quoting — it refuses to read a command line that uses it.
  if (command.includes("\\")) return null;

  const words = shellWords(command);
  const expanded = words.map((word) =>
    word
      .replaceAll("${CLAUDE_PLUGIN_ROOT}", pluginRoot)
      .replaceAll("$CLAUDE_PLUGIN_ROOT", pluginRoot),
  );

  const candidates = expanded.filter(isHookScript);
  return candidates.length === 1 ? (candidates[0] ?? null) : null;
}

export function checkWiring(
  artifacts: HarnessArtifact[],
  deps: WiringDeps,
): WiringReport {
  const findings: WiringFinding[] = [];
  let references = 0;

  for (const item of artifacts) {
    for (const ref of item.dispatches) {
      references += 1;
      const target = agentPath(ref.value);
      if (deps.exists(target)) continue;
      findings.push({
        artifact: item.path,
        line: ref.line,
        verdict: "dangling-agent",
        subject: ref.value,
        detail: `no ${target} — this dispatch would silently no-op, and the run would report a review that never happened`,
      });
    }

    for (const ref of item.skills) {
      references += 1;
      const target = skillPath(ref.value);
      if (deps.exists(target)) continue;
      findings.push({
        artifact: item.path,
        line: ref.line,
        verdict: "dangling-skill",
        subject: ref.value,
        detail: `no ${target}`,
      });
    }

    for (const ref of item.reads) {
      references += 1;
      // Checked before the filesystem is touched: a declared path is
      // repo-controlled, but the same containment rule applies as to a
      // citation, and an escaping path is a defect regardless of what is there.
      const safety = isSafeRepoPath(ref.value);
      if (!safety.safe) {
        findings.push({
          artifact: item.path,
          line: ref.line,
          verdict: "missing-path",
          subject: ref.value,
          detail: safety.reason,
        });
        continue;
      }
      if (deps.exists(ref.value)) continue;
      findings.push({
        artifact: item.path,
        line: ref.line,
        verdict: "missing-path",
        subject: ref.value,
        detail: "declared as read, but no such file",
      });
    }

    for (const ref of item.globs) {
      references += 1;
      if (deps.glob(ref.value).length > 0) continue;
      findings.push({
        artifact: item.path,
        line: ref.line,
        verdict: "empty-glob",
        subject: ref.value,
        detail: "matches no file — this artifact applies to nothing",
      });
    }

    // Advisory, and not counted as a reference: prose is allowed to be prose,
    // and a heuristic that fails a build is a check people delete.
    for (const ref of item.loose) {
      if (deps.exists(ref.value)) continue;
      findings.push({
        artifact: item.path,
        line: ref.line,
        verdict: "loose-reference",
        subject: ref.value,
        detail: "looks like a repo path but does not resolve — an example, or a pointer that moved",
      });
    }

    for (const ref of item.hooks) {
      references += 1;
      if (!deps.exists(ref.value)) {
        findings.push({
          artifact: item.path,
          line: ref.line,
          verdict: "dead-hook",
          subject: ref.value,
          detail: "hook command does not resolve — if this is a build output, run `pnpm build` first",
        });
        continue;
      }
      if (deps.isExecutable(ref.value)) continue;
      findings.push({
        artifact: item.path,
        line: ref.line,
        verdict: "dead-hook",
        subject: ref.value,
        detail: "exists but is not executable — the harness fails this open, so it would never run and never say so",
      });
    }

    for (const ref of item.tokens) {
      references += 1;
      findings.push({
        artifact: item.path,
        line: ref.line,
        verdict: "unsubstituted-token",
        subject: ref.value,
        detail: "placeholder survived a port — the instruction containing it is not addressed to this repo",
      });
    }
  }

  return { findings, artifacts: artifacts.length, references };
}
