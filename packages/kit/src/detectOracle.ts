/**
 * Candidate Oracle globs, for a human to accept, edit, or skip.
 *
 * The kernel's own rule is "declared, never inferred" — a checker that guessed
 * which files were oracles from path conventions would be confidently wrong on
 * every project that names them differently. This module does not change
 * that: it never writes `nullius.config.json` itself, and every candidate it
 * returns is a proposal `init --interactive` presents, not a value it acts on.
 * The distinction that matters is authoring assistance versus inference —
 * only the first is what this file does.
 *
 * Filesystem facts only, on the same footing as `detect.ts`: nothing here is
 * guessed from a project's name or shape, only observed from files that are
 * actually present.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface OracleCandidate {
  /** Repo-relative glob proposed as a declared Oracle. */
  glob: string;
  /** What was observed that suggested this glob, shown alongside the prompt. */
  reason: string;
}

function firstExisting(root: string, names: readonly string[]): string | null {
  return names.find((name) => existsSync(join(root, name))) ?? null;
}

function packageTestScript(root: string): string | null {
  const path = join(root, "package.json");
  if (!existsSync(path)) return null;
  try {
    const pkg = JSON.parse(readFileSync(path, "utf8")) as {
      scripts?: Record<string, unknown>;
    };
    const test = pkg.scripts?.["test"];
    // npm's own placeholder for "no test script configured" — present but not
    // a signal, and proposing an Oracle from it would be worse than proposing
    // nothing.
    if (typeof test === "string" && test.trim().length > 0 && !test.includes("no test specified")) {
      return test;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Every candidate this build knows how to look for, in the order checked.
 *
 * Each entry is independent — a repo with both `vitest.config.ts` and
 * `pytest.ini` (a mixed-language monorepo) gets both candidates, and the
 * human chooses which, all, or none to accept.
 */
export function detectOracleCandidates(root: string): OracleCandidate[] {
  const candidates: OracleCandidate[] = [];

  const vitestConfig = firstExisting(root, [
    "vitest.config.ts",
    "vitest.config.js",
    "vitest.config.mts",
    "vitest.config.mjs",
  ]);
  if (vitestConfig !== null) {
    candidates.push({ glob: "**/*.test.ts", reason: `${vitestConfig} present` });
  }

  const jestConfig = firstExisting(root, [
    "jest.config.js",
    "jest.config.ts",
    "jest.config.json",
    "jest.config.mjs",
  ]);
  if (jestConfig !== null) {
    candidates.push({ glob: "**/*.test.js", reason: `${jestConfig} present` });
  }

  const pytestConfig = firstExisting(root, ["pytest.ini", "setup.cfg"]);
  if (pytestConfig !== null) {
    candidates.push({ glob: "**/test_*.py", reason: `${pytestConfig} present` });
  }

  const testScript = packageTestScript(root);
  if (testScript !== null && vitestConfig === null && jestConfig === null) {
    // Only offered when neither framework config already produced a more
    // specific candidate — a repo with `vitest.config.ts` does not also need
    // the generic script-based guess, which would just be a broader glob
    // covering ground the specific one already covers.
    candidates.push({
      glob: "**/*.test.*",
      reason: `package.json "scripts.test" is declared (${testScript})`,
    });
  }

  return candidates;
}
