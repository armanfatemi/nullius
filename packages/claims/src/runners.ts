/**
 * The two real-world dependencies `checkClaims` needs: reading a cited file
 * and re-running an absence search. Shared by `check` (against the current
 * working directory) and `demo` (against a sandbox fixture root).
 */

import { spawnSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';

import { type RevRead, type SearchOutcome } from './checkClaims';
import { type SearchBinary, type SearchPlan } from './commandSafety';

/** Wall-clock budget for a single `git show`, in milliseconds. */
export const DEFAULT_GIT_TIMEOUT_MS = 10_000;

/** Wall-clock budget for a single absence search, in milliseconds. */
export const DEFAULT_SEARCH_TIMEOUT_MS = 10_000;

/**
 * Wall-clock budget for ALL searches in one run. The per-search timeout bounds
 * one anchor; without a run-wide budget a document can simply carry more
 * anchors, and a document may carry unlimited anchors.
 */
export const DEFAULT_RUN_BUDGET_MS = 120_000;

/**
 * Intermediate pipeline stages are buffered in this process, so this cap
 * applies to a stage's whole output rather than only to the final result the
 * way a streaming shell pipeline did. It is deliberately generous: the
 * documented idiom `grep -rn <pattern> services/ | grep enum` can produce a
 * very large first stage on a monorepo, and turning that into a hard
 * COMMAND-ERROR would fail an anchor that is perfectly correct.
 */
const STAGE_MAX_BUFFER = 256 * 1024 * 1024;

/**
 * Arguments injected into every search to prune `.git` from the recursive walk.
 *
 * Refusing `.git` as a written path operand is not enough, and assuming it was
 * is the same mistake as guarding one lane and not the other: `grep -r` never
 * needs the directory NAMED to descend into it. `grep -rn AUTHORIZATION .` — or
 * with no operand at all, since grep defaults to `.` — walks straight into
 * `.git/config`, where `actions/checkout` leaves an
 * `AUTHORIZATION: basic <token>` header by default. The count difference
 * between a matching and non-matching guess is one clean bit, the Action posts
 * it into a PR comment, and a document may carry unlimited anchors.
 *
 * So the prune happens where the walk happens. ripgrep skips `.git` by default
 * but not under `--hidden`, `--no-ignore` or `-uuu`; an explicit negated glob
 * beats all of those, and beats a re-including user glob in either order.
 */
function gitPruningArgs(binary: SearchBinary): string[] {
  return binary === 'grep' ? ['--exclude-dir=.git'] : ['--glob', '!.git/'];
}

/**
 * Resolves a repo-relative path and confirms it stays inside the root after
 * symlinks are followed, and outside `.git`.
 *
 * `isSafeRepoPath` is a string check, and a string check cannot see a symlink:
 * a committed `evil-link -> /etc/passwd` is a textually blameless
 * repo-relative path that both the reader and the search binaries follow
 * straight out of the repository. Returns null when the path escapes or cannot
 * be resolved.
 */
export type Containment =
  | { contained: true; path: string }
  | { contained: false; reason: string };

export function containPath(root: string, path: string): Containment {
  const base = realpathSync.native(resolve(root));
  const target = resolve(base, path);

  const judge = (candidate: string): Containment => {
    if (candidate !== base && !candidate.startsWith(base + sep)) {
      return { contained: false, reason: 'resolves outside the repository (symlink)' };
    }
    // A symlink `gitdir -> .git` resolves to a path that IS inside the repo,
    // so containment alone does not keep the credentials store out of reach.
    const inner = candidate.slice(base.length);
    if (inner.split(/[\\/]/).some((segment) => segment === '.git')) {
      return { contained: false, reason: "resolves into '.git', which holds the CI token" };
    }
    return { contained: true, path: candidate };
  };

  try {
    return judge(realpathSync.native(target));
  } catch {
    // A path that does not exist cannot escape by symlink; let the caller
    // report the ordinary missing-file outcome.
    return judge(target);
  }
}

/** Convenience wrapper: the resolved path, or null when it is not contained. */
export function resolveInsideRoot(root: string, path: string): string | null {
  const verdict = containPath(root, path);
  return verdict.contained ? verdict.path : null;
}

/**
 * The child's environment, stripped of the variables that turn a validated
 * argv back into an execution surface: ripgrep reads `--pre` and friends from
 * the config file named by RIPGREP_CONFIG_PATH, and historic greps read flags
 * from GREP_OPTIONS. Neither is under this tool's control, so neither is
 * inherited.
 */
function childEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env['RIPGREP_CONFIG_PATH'];
  delete env['GREP_OPTIONS'];
  delete env['GREP_COLORS'];
  delete env['LD_PRELOAD'];
  return env;
}

export function fileLinesReader(root?: string) {
  return (path: string): string[] | null => {
    try {
      const base = root ?? process.cwd();
      // Containment is re-checked here because readFileSync follows symlinks:
      // without this, `**Evidence:** `evil-link:1` — `root:x:0:0`` is a
      // content oracle over any file the runner can read, and its OK/FABRICATED
      // verdict is the answer.
      const resolved = resolveInsideRoot(base, path);
      if (resolved === null) return null;
      return readFileSync(resolved, 'utf8').split('\n');
    } catch {
      return null;
    }
  };
}

/** Lower-case hex, 7-40 chars. Anything else never reaches `git`. */
const REV_PATTERN = /^[0-9a-f]{7,40}$/;

/**
 * Reads `path` as of `rev` with `git show`.
 *
 * Both operands come from PR-controlled document content, so both are checked
 * before the spawn: the rev must be hex (a ref NAME would be both mutable and
 * a place to hide `--upload-pack=`-style trickery), and the path must already
 * have passed `isSafeRepoPath`. `git show <rev>:<path>` takes one argument, so
 * there is no operand position for a path to be re-read as a flag — but a
 * leading `-` is refused anyway rather than relying on that.
 */
export function revFileReader(root?: string, timeoutMs = DEFAULT_GIT_TIMEOUT_MS) {
  // One `git show` per (rev, path), not per anchor. A document commonly stamps
  // many claims against the same commit and the same file, and each of those
  // would otherwise be its own process.
  const cache = new Map<string, RevRead>();

  return (path: string, rev: string): RevRead => {
    const key = `${rev}:${path}`;
    const cached = cache.get(key);
    if (cached !== undefined) return cached;
    const result = read(path, rev);
    cache.set(key, result);
    return result;
  };

  function read(path: string, rev: string): RevRead {
    if (!REV_PATTERN.test(rev)) {
      return { status: "unavailable", reason: `'${rev}' is not a commit hash` };
    }
    if (path.startsWith("-") || path.includes("\0")) {
      return { status: "unavailable", reason: `'${path}' is not a readable path` };
    }

    const base = root ?? process.cwd();
    const result = spawnSync("git", ["-C", base, "show", `${rev}:${path}`], {
      shell: false,
      encoding: "utf8",
      maxBuffer: STAGE_MAX_BUFFER,
      timeout: timeoutMs,
      killSignal: "SIGKILL",
      input: "",
      env: childEnv(),
    });

    if (result.error) {
      const error = result.error as NodeJS.ErrnoException;
      return {
        status: "unavailable",
        reason: error.code === "ENOENT" ? "git is not installed" : error.message,
      };
    }
    if (result.status === 0) {
      return { status: "ok", lines: (result.stdout ?? "").split("\n") };
    }

    const stderr = (result.stderr ?? "").toLowerCase();
    // git distinguishes "I have never heard of this commit" from "that commit
    // exists and does not contain that file", and the two verdicts differ:
    // one fails open, the other fails. The revision check runs FIRST, because
    // an unresolvable rev is the ambiguous case and must not be reported as a
    // fact about the file.
    if (stderr.includes("not a git repository")) {
      return { status: "unavailable", reason: "not a git repository" };
    }
    if (
      stderr.includes("unknown revision") ||
      stderr.includes("invalid object name") ||
      stderr.includes("not a valid object name") ||
      stderr.includes("bad object") ||
      stderr.includes("ambiguous argument")
    ) {
      return { status: "unknown-rev" };
    }
    if (
      stderr.includes("exists on disk, but not in") ||
      stderr.includes("does not exist in")
    ) {
      return { status: "no-file" };
    }
    return {
      status: "unavailable",
      reason: (result.stderr ?? "").trim().split("\n")[0] ?? "git show failed",
    };
  }
}

/**
 * The short hash of HEAD, or null when there is nothing to name.
 *
 * Read once per run, not per anchor: every stamp a run writes is a claim
 * about the same commit. Null covers git missing, not a repository, an empty
 * repository, a timeout, and output that is not a hash — and a caller holding
 * null has nothing to claim, because a stamp is a claim about a commit and
 * there is no commit. It must not fall back to stamping against the working
 * tree; the stamp is the one part of an anchor that becomes a HARD failure
 * when it is wrong.
 */
export function headRev(root?: string, timeoutMs = DEFAULT_GIT_TIMEOUT_MS): string | null {
  const base = root ?? process.cwd();
  const result = spawnSync("git", ["-C", base, "rev-parse", "--short", "HEAD"], {
    shell: false,
    encoding: "utf8",
    maxBuffer: STAGE_MAX_BUFFER,
    timeout: timeoutMs,
    killSignal: "SIGKILL",
    input: "",
    env: childEnv(),
  });

  if (result.error || result.status !== 0) return null;
  const rev = (result.stdout ?? "").trim();
  return REV_PATTERN.test(rev) ? rev : null;
}

export function searchRunner(
  root?: string,
  timeoutMs = DEFAULT_SEARCH_TIMEOUT_MS,
  runBudgetMs = DEFAULT_RUN_BUDGET_MS,
) {
  let spentMs = 0;

  return (plan: SearchPlan): SearchOutcome => {
    const env = childEnv();
    const started = Date.now();
    const base = root ?? process.cwd();

    if (spentMs >= runBudgetMs) {
      return {
        ok: false,
        error: `run search budget of ${runBudgetMs}ms is exhausted — this document's searches cost too much to keep running`,
      };
    }

    // Symlink containment, which the string-level guard cannot do. Checked for
    // every stage before any of them runs.
    for (const segment of plan.segments) {
      for (const index of segment.pathIndices) {
        const operand = segment.args[index];
        if (operand === undefined) continue;
        const verdict = containPath(base, operand);
        if (!verdict.contained) {
          return { ok: false, error: `search path '${operand}' ${verdict.reason}` };
        }
      }
      for (const arg of segment.args) {
        if (arg.includes('\0')) {
          return { ok: false, error: 'search argument contains a null byte' };
        }
      }
    }

    // The pipeline runs stage by stage, each stage's stdout becoming the next
    // stage's stdin. No shell is involved at any point: `commandSafety` hands
    // over an argv vector and that vector is what runs, so there is no string
    // for an injected metacharacter to live in. The first stage is fed an
    // empty stdin so a pattern-only search can never block on the terminal.
    let input = '';

    for (let index = 0; index < plan.segments.length; index += 1) {
      const segment = plan.segments[index];
      if (segment === undefined) continue;

      const remaining = Math.min(
        timeoutMs - (Date.now() - started),
        runBudgetMs - spentMs - (Date.now() - started),
      );
      if (remaining <= 0) {
        return { ok: false, error: `search exceeded ${timeoutMs}ms` };
      }

      // Pruning is prepended at spawn time rather than during parsing, so the
      // operand indices the checks above rely on stay meaningful.
      const args = [...gitPruningArgs(segment.binary), ...segment.args];

      const result = spawnSync(segment.binary, args, {
        shell: false,
        encoding: 'utf8',
        maxBuffer: STAGE_MAX_BUFFER,
        timeout: remaining,
        killSignal: 'SIGKILL',
        input,
        env,
        ...(root === undefined ? {} : { cwd: root }),
      });

      if (result.error) {
        spentMs += Date.now() - started;
        const error = result.error as NodeJS.ErrnoException;
        if (error.code === 'ETIMEDOUT') {
          return { ok: false, error: `search exceeded ${timeoutMs}ms` };
        }
        if (error.code === 'ENOBUFS') {
          return {
            ok: false,
            error: `search produced more than ${Math.round(STAGE_MAX_BUFFER / (1024 * 1024))}MB of output — narrow it with --include/-g or a more specific pattern`,
          };
        }
        return { ok: false, error: error.message };
      }

      if (result.signal !== null) {
        spentMs += Date.now() - started;
        return { ok: false, error: `search killed by ${result.signal} (limit ${timeoutMs}ms)` };
      }

      // grep exits 1 for "no matches" — that is a valid result, not an error.
      const status = result.status ?? -1;
      if (status > 1) {
        spentMs += Date.now() - started;
        return {
          ok: false,
          error: `exited ${status}: ${(result.stderr ?? '').trim()}`,
        };
      }

      input = result.stdout ?? '';
    }

    spentMs += Date.now() - started;

    const count = input
      .split('\n')
      .filter((line) => line.trim().length > 0).length;
    return { ok: true, count };
  };
}
