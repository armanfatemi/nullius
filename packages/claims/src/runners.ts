/**
 * The two real-world dependencies `checkClaims` needs: reading a cited file
 * and re-running an absence search. Shared by `check` (against the current
 * working directory) and `demo` (against a sandbox fixture root).
 */

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { type SearchOutcome } from './checkClaims';

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

export function searchRunner(root?: string) {
  return (command: string): SearchOutcome => {
    // Safe only because `checkClaims` gates every command through
    // `isSafeSearchCommand` (grep/rg pipelines, no chaining or redirection)
    // before this runner is ever called.
    const result = spawnSync(command, {
      shell: true,
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
      ...(root === undefined ? {} : { cwd: root }),
    });

    if (result.error) {
      return { ok: false, error: result.error.message };
    }

    // grep exits 1 for "no matches" — that is a valid result, not an error.
    const status = result.status ?? -1;
    if (status > 1) {
      return {
        ok: false,
        error: `exited ${status}: ${(result.stderr ?? '').trim()}`,
      };
    }

    const count = (result.stdout ?? '')
      .split('\n')
      .filter((line) => line.trim().length > 0).length;
    return { ok: true, count };
  };
}
