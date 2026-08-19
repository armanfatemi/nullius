/**
 * The two real-world dependencies `checkClaims` needs: reading a cited file
 * and re-running an absence search. Shared by `check` (against the current
 * working directory) and `demo` (against a sandbox fixture root).
 */

import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';

import { type RevRead, type SearchOutcome } from './checkClaims';
import { type SearchBinary, type SearchPlan } from './commandSafety';

/** Wall-clock budget for a single git read, in milliseconds. */
export const DEFAULT_GIT_TIMEOUT_MS = 10_000;

/**
 * Wall-clock budget for ALL git reads in one run. The per-read timeout bounds
 * one anchor; without a run-wide budget a document simply carries more stamped
 * anchors, and a document may carry unlimited anchors.
 */
export const DEFAULT_GIT_RUN_BUDGET_MS = 60_000;

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
 * Buffer cap for one git read. Far smaller than the search lane's, because a
 * cited SOURCE file is being read rather than a repository's grep output — and
 * every byte read here is a byte the checker may retain.
 */
const GIT_MAX_BUFFER = 32 * 1024 * 1024;

/**
 * Total characters the read cache may retain across a whole run.
 *
 * The cache is an optimisation, never a correctness requirement, so it stops
 * growing rather than growing without bound. A document stamping many anchors
 * against large files otherwise pins every one of them in memory for the life
 * of the process: git deduplicates a repeated blob on disk, so a repository
 * whose `.git` is a few hundred kilobytes can be re-expanded per cache key
 * into gigabytes of retained JS strings. That is a denial of service written
 * in a document.
 */
const GIT_CACHE_MAX_CHARS = 8 * 1024 * 1024;

/**
 * Reads `path` as of `rev`, for `path:line@rev` anchors.
 *
 * Both operands come from PR-controlled document content, so both are checked
 * before any spawn: the rev must be hex (a ref NAME would be both mutable and
 * a place to hide `--upload-pack=`-style trickery), and the path must already
 * have passed `isSafeRepoPath`. Three further decisions are load-bearing:
 *
 *  1. **Existence is asked directly, never inferred from an error string.**
 *     `git cat-file -e <rev>^{commit}` answers "is this commit here?" with an
 *     exit status. Reading `git show`'s stderr instead looked equivalent and
 *     was not: git reports `invalid object name` only when the rev is SHORTER
 *     than 40 hex, because at 40 it is already a syntactically complete object
 *     id — so it skips ahead to a *path* error. A full SHA, which is exactly
 *     what `git rev-parse HEAD` and `$GITHUB_SHA` produce, was therefore read
 *     as "that commit exists and lacks this file" and hard-failed an honest
 *     citation on every shallow clone.
 *  2. **The path is resolved relative to the root, with `./`.** In
 *     `<rev>:<path>` a bare path resolves from the TOP of the repository, not
 *     from `-C`'s directory. Running the checker in a subdirectory of a larger
 *     repository therefore let a citation read files ABOVE the root that the
 *     working-tree lane refuses — the same content oracle by another door.
 *     `./` makes git resolve from the given directory, matching
 *     `fileLinesReader`.
 *  3. **Blobs only.** `git show <rev>:<dir>` prints a directory listing and
 *     exits 0, so a quote could "verify" against a tree and turn the checker
 *     into a directory enumerator. `cat-file blob` refuses anything that is
 *     not a file.
 */
export function revFileReader(
  root?: string,
  timeoutMs = DEFAULT_GIT_TIMEOUT_MS,
  runBudgetMs = DEFAULT_GIT_RUN_BUDGET_MS,
) {
  // One read per (rev, path), not per anchor: a document commonly stamps many
  // claims against the same commit and the same file.
  const cache = new Map<string, RevRead>();
  let cachedChars = 0;
  /** Memoised commit-existence answers, so N anchors on one rev cost one probe. */
  const commits = new Map<string, RevRead | null>();
  let spentMs = 0;

  /** A completed spawn, or the verdict to return instead of one. */
  type Spawned =
    | { ran: true; result: SpawnSyncReturns<string> }
    | { ran: false; read: RevRead };

  function git(args: string[]): Spawned {
    if (spentMs >= runBudgetMs) {
      return {
        ran: false,
        read: {
          status: "unavailable",
          reason: `run git budget of ${runBudgetMs}ms is exhausted — this document's stamped anchors cost too much to keep reading`,
        },
      };
    }

    const started = Date.now();
    const result: SpawnSyncReturns<string> = spawnSync("git", args, {
      shell: false,
      encoding: "utf8",
      maxBuffer: GIT_MAX_BUFFER,
      timeout: Math.min(timeoutMs, runBudgetMs - spentMs),
      killSignal: "SIGKILL",
      input: "",
      env: childEnv(),
    });
    spentMs += Date.now() - started;

    if (result.error) {
      const error = result.error as NodeJS.ErrnoException;
      const reason =
        error.code === "ENOENT"
          ? "git is not installed"
          : error.code === "ETIMEDOUT"
            ? `git read exceeded ${timeoutMs}ms`
            : error.message;
      return { ran: false, read: { status: "unavailable", reason } };
    }
    if (result.signal !== null) {
      return {
        ran: false,
        read: { status: "unavailable", reason: `git read killed by ${result.signal}` },
      };
    }
    return { ran: true, result };
  }

  /** Whether the commit is in this clone. Memoised per rev. */
  function commitProblem(base: string, rev: string): RevRead | null {
    const remembered = commits.get(rev);
    if (remembered !== undefined) return remembered;

    const probe = git(["-C", base, "cat-file", "-e", `${rev}^{commit}`]);
    // A budget or spawn failure is NOT remembered: it says nothing about the
    // commit, and a later anchor must not inherit it as an answer.
    if (!probe.ran) return probe.read;

    let verdict: RevRead | null = null;
    if (probe.result.status !== 0) {
      verdict = (probe.result.stderr ?? "").toLowerCase().includes("not a git repository")
        ? { status: "unavailable", reason: "not a git repository" }
        : { status: "unknown-rev" };
    }
    commits.set(rev, verdict);
    return verdict;
  }

  function read(path: string, rev: string): RevRead {
    if (!REV_PATTERN.test(rev)) {
      return { status: "unavailable", reason: `'${rev}' is not a commit hash` };
    }
    if (path.startsWith("-") || path.includes("\0")) {
      return { status: "unavailable", reason: `'${path}' is not a readable path` };
    }

    const base = root ?? process.cwd();

    // Asked and answered before the file is named, so "this commit is not
    // here" can never be reported as a fact about the file.
    const problem = commitProblem(base, rev);
    if (problem !== null) return problem;

    // `./` keeps the path relative to `base`; `blob` refuses trees.
    const probe = git(["-C", base, "cat-file", "blob", `${rev}:./${path}`]);
    if (!probe.ran) return probe.read;

    if (probe.result.status === 0) {
      return { status: "ok", lines: (probe.result.stdout ?? "").split("\n") };
    }

    // The commit resolved, so whatever is left concerns the path: absent, or
    // not a file. Either way the citation does not name a readable source line.
    return { status: "no-file" };
  }

  return (path: string, rev: string): RevRead => {
    const key = `${rev}:${path}`;
    const cached = cache.get(key);
    if (cached !== undefined) return cached;

    const result = read(path, rev);

    // Verdicts are tiny and always worth keeping; file contents are kept only
    // while the budget allows, after which the cache simply stops growing.
    if (result.status !== "ok") {
      cache.set(key, result);
    } else {
      const size = result.lines.reduce((total, line) => total + line.length + 1, 0);
      if (cachedChars + size <= GIT_CACHE_MAX_CHARS) {
        cachedChars += size;
        cache.set(key, result);
      }
    }
    return result;
  };
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
