/**
 * `nullius.config.json` — optional per-repo configuration for the CLI.
 *
 * Validation is strict (unknown keys are rejected) because a typo'd key —
 * `momments`, `exclde` — would otherwise silently fall back to defaults, and a
 * checker that silently checks less than you configured is exactly the kind of
 * quiet failure this tool exists to prevent.
 */

export interface ClaimsConfig {
  /** Glob patterns for the documents to check, relative to the repo root. */
  docs?: string[];
  /** Basenames to skip (e.g. review logs that QUOTE findings rather than assert them). */
  exclude?: string[];
  /** How far from the cited line a match still counts as drift. Default 3. */
  driftWindow?: number;
  /** The project's closed list of binding moments. Default: the six for replicated services. */
  moments?: string[];
  /** Moments already caught by CI (pass as advisory). Default: ["build-time"]. */
  ciCaughtMoments?: string[];
  /** Closed vocabulary for ledger `**Expected:**` names. Unset = free-form. */
  reviewers?: string[];
}

const KNOWN_KEYS = new Set([
  "docs",
  "exclude",
  "driftWindow",
  "moments",
  "ciCaughtMoments",
  "reviewers",
]);

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((entry) => typeof entry === "string")
  );
}

export function parseConfig(json: unknown, path: string): ClaimsConfig {
  if (typeof json !== "object" || json === null || Array.isArray(json)) {
    throw new Error(`${path}: config must be a JSON object`);
  }

  const record = json as Record<string, unknown>;

  for (const key of Object.keys(record)) {
    if (!KNOWN_KEYS.has(key)) {
      throw new Error(
        `${path}: unknown key '${key}' — allowed keys: ${[...KNOWN_KEYS].join(", ")}`,
      );
    }
  }

  const config: ClaimsConfig = {};

  for (const key of [
    "docs",
    "exclude",
    "moments",
    "ciCaughtMoments",
    "reviewers",
  ] as const) {
    const value = record[key];
    if (value === undefined) continue;
    if (!isStringArray(value)) {
      throw new Error(`${path}: '${key}' must be an array of strings`);
    }
    config[key] = value;
  }

  const driftWindow = record["driftWindow"];
  if (driftWindow !== undefined) {
    if (
      typeof driftWindow !== "number" ||
      !Number.isInteger(driftWindow) ||
      driftWindow < 0
    ) {
      throw new Error(`${path}: 'driftWindow' must be a non-negative integer`);
    }
    config.driftWindow = driftWindow;
  }

  return config;
}
