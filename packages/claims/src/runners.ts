/**
 * The two real-world dependencies `checkClaims` needs: reading a cited file
 * and re-running an absence search. Shared by `check` (against the current
 * working directory) and `demo` (against a sandbox fixture root).
 */

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { type SearchOutcome } from './checkClaims';
import { type SearchPlan } from './commandSafety';

/** Wall-clock budget for a whole absence search, in milliseconds. */
export const DEFAULT_SEARCH_TIMEOUT_MS = 10_000;

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
      const resolved = root === undefined ? path : join(root, path);
      return readFileSync(resolved, 'utf8').split('\n');
    } catch {
      return null;
    }
  };
}

export function searchRunner(root?: string, timeoutMs = DEFAULT_SEARCH_TIMEOUT_MS) {
  return (plan: SearchPlan): SearchOutcome => {
    const env = childEnv();
    const started = Date.now();

    // The pipeline runs stage by stage, each stage's stdout becoming the next
    // stage's stdin. No shell is involved at any point: `commandSafety` hands
    // over an argv vector and that vector is what runs, so there is no string
    // for an injected metacharacter to live in. The first stage is fed an
    // empty stdin so a pattern-only search can never block on the terminal.
    let input = '';

    for (let index = 0; index < plan.segments.length; index += 1) {
      const segment = plan.segments[index];
      if (segment === undefined) continue;

      const remaining = timeoutMs - (Date.now() - started);
      if (remaining <= 0) {
        return { ok: false, error: `search exceeded ${timeoutMs}ms` };
      }

      const result = spawnSync(segment.binary, segment.args, {
        shell: false,
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024,
        timeout: remaining,
        killSignal: 'SIGKILL',
        input,
        env,
        ...(root === undefined ? {} : { cwd: root }),
      });

      if (result.error) {
        const error = result.error as NodeJS.ErrnoException;
        if (error.code === 'ETIMEDOUT') {
          return { ok: false, error: `search exceeded ${timeoutMs}ms` };
        }
        return { ok: false, error: error.message };
      }

      if (result.signal !== null) {
        return { ok: false, error: `search killed by ${result.signal} (limit ${timeoutMs}ms)` };
      }

      // grep exits 1 for "no matches" — that is a valid result, not an error.
      const status = result.status ?? -1;
      if (status > 1) {
        return {
          ok: false,
          error: `exited ${status}: ${(result.stderr ?? '').trim()}`,
        };
      }

      input = result.stdout ?? '';
    }

    const count = input
      .split('\n')
      .filter((line) => line.trim().length > 0).length;
    return { ok: true, count };
  };
}
