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
  /**
   * Glob patterns, matched against the full repo-relative path, for documents
   * to skip (e.g. review logs that QUOTE findings rather than assert them).
   * Use `**\/name.md` to skip a basename anywhere in the tree.
   */
  exclude?: string[];
  /** How far from the cited line a match still counts as drift. Default 3. */
  driftWindow?: number;
  /** The project's closed list of binding moments. Default: the six for replicated services. */
  moments?: string[];
  /** Moments already caught by CI (pass as advisory). Default: ["build-time"]. */
  ciCaughtMoments?: string[];
  /**
   * Shortest quote that counts as distinctive. Shorter quotes still verify,
   * but pass as `weak-anchor` rather than `ok`. Default 8.
   */
  minAnchorChars?: number;
  /**
   * Re-run a zero-result absence search with a broadened pattern, as a control
   * against a search that is simply pointed at nothing. Default true.
   */
  relaxedControl?: boolean;
  /** Wall-clock budget for a single absence search, in milliseconds. Default 10000. */
  searchTimeoutMs?: number;
}

const KNOWN_KEYS = new Set([
  "docs",
  "exclude",
  "driftWindow",
  "moments",
  "ciCaughtMoments",
  "minAnchorChars",
  "relaxedControl",
  "searchTimeoutMs",
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
  ] as const) {
    const value = record[key];
    if (value === undefined) continue;
    if (!isStringArray(value)) {
      throw new Error(`${path}: '${key}' must be an array of strings`);
    }
    config[key] = value;
  }

  for (const key of ["driftWindow", "minAnchorChars"] as const) {
    const value = record[key];
    if (value === undefined) continue;
    if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
      throw new Error(`${path}: '${key}' must be a non-negative integer`);
    }
    config[key] = value;
  }

  // A budget of 0 is not "unlimited" here — it is a budget every search
  // instantly exceeds, so it must be rejected rather than silently poisoning
  // every absence claim in the run.
  const searchTimeoutMs = record["searchTimeoutMs"];
  if (searchTimeoutMs !== undefined) {
    if (
      typeof searchTimeoutMs !== "number" ||
      !Number.isInteger(searchTimeoutMs) ||
      searchTimeoutMs < 1
    ) {
      throw new Error(
        `${path}: 'searchTimeoutMs' must be a positive integer (milliseconds); there is no value that disables the budget`,
      );
    }
    config.searchTimeoutMs = searchTimeoutMs;
  }

  const relaxedControl = record["relaxedControl"];
  if (relaxedControl !== undefined) {
    if (typeof relaxedControl !== "boolean") {
      throw new Error(`${path}: 'relaxedControl' must be a boolean`);
    }
    config.relaxedControl = relaxedControl;
  }

  return config;
}
