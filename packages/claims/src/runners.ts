/**
 * The two real-world dependencies `checkClaims` needs: reading a cited file
 * and re-running an absence search. Shared by `check` (against the current
 * working directory) and `demo` (against a sandbox fixture root).
 */

import { spawnSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';

import { type SearchOutcome } from './checkClaims';
import { type SearchPlan } from './commandSafety';

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
 * Resolves a repo-relative path and confirms it stays inside the root after
 * symlinks are followed.
 *
 * `isSafeRepoPath` is a string check, and a string check cannot see a symlink:
 * a committed `evil-link -> /etc/passwd` is a textually blameless
 * repo-relative path that both the reader and the search binaries follow
 * straight out of the repository. Returns null when the path escapes or cannot
 * be resolved.
 */
export function resolveInsideRoot(root: string, path: string): string | null {
  const base = realpathSync.native(resolve(root));
  const target = resolve(base, path);
  let real: string;
  try {
    real = realpathSync.native(target);
  } catch {
    // A path that does not exist cannot escape by symlink; let the caller
    // report the ordinary missing-file outcome.
    return target.startsWith(base + sep) || target === base ? target : null;
  }
  return real === base || real.startsWith(base + sep) ? real : null;
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
        if (resolveInsideRoot(base, operand) === null) {
          return {
            ok: false,
            error: `search path '${operand}' resolves outside the repository (symlink)`,
          };
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

      const result = spawnSync(segment.binary, segment.args, {
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
