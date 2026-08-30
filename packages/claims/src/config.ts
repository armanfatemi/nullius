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
   * Shortest quote that reads as a real citation. Shorter quotes still verify
   * and still pass, as `weak-anchor` rather than `ok` — length alone never
   * fails a claim. What fails is a quote matching SEVERAL lines while its line
   * number is also wrong (`unpinned`), which no setting controls. Default 8.
   */
  minAnchorChars?: number;
  /**
   * Re-run a zero-result absence search with a broadened pattern, as a control
   * against a search that is simply pointed at nothing. Default true.
   */
  relaxedControl?: boolean;
  /** Wall-clock budget for a single absence search, in milliseconds. Default 10000. */
  searchTimeoutMs?: number;
  /**
   * Reserved. Accepted and ignored by every current build, so that a future
   * schema change has one key to hinge on instead of a flag day.
   *
   * The reservation has to land BEFORE anything writes it. Unknown keys are a
   * hard error here — deliberately — which means a repo initialised by a newer
   * kit would break every older kernel pinned in CI the first time this key
   * appeared. Accepting it now is what buys that compatibility later.
   */
  configVersion?: number;
  /**
   * The artifacts that grade this project — tests, golden files, snapshots,
   * fixtures, an approved-output corpus. Declared, never inferred: a checker
   * that guessed which files were oracles from path conventions would be
   * confidently wrong on every project that names them differently.
   *
   * Absent is a reported state, not an empty result. A project with no
   * `oracles` must never be told that no oracle changed, because an
   * unconfigured project and a project whose oracle genuinely held still are
   * different facts and only one of them is evidence.
   */
  oracles?: OracleGlob[];
}

/** One declared oracle glob, and what weakening looks like inside it. */
export interface OracleGlob {
  /** Repo-relative glob naming the files that grade this project. */
  glob: string;
  /**
   * A regular expression whose match count is compared across a range. A
   * decrease is `weakened`. Optional, and its absence is announced rather than
   * silently downgrading the check to two-thirds of itself.
   */
  weakening?: string;
  /** A regular expression whose match count increasing means `skipped`. */
  skipMarker?: string;
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
  "configVersion",
  "oracles",
]);

const ORACLE_KEYS = new Set(["glob", "weakening", "skipMarker"]);

/**
 * Per-entry strictness, on the same reasoning as the top-level closed-key
 * check: a typo'd `weakning` would otherwise leave the glob silently unable to
 * detect the class it was configured to detect, which is the quiet failure the
 * top-level check already refuses.
 */
function parseOracles(value: unknown, path: string): OracleGlob[] {
  if (!Array.isArray(value)) {
    throw new Error(`${path}: 'oracles' must be an array of objects`);
  }
  return value.map((entry, i) => {
    const where = `${path}: 'oracles[${i}]'`;
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      throw new Error(`${where} must be an object`);
    }
    const record = entry as Record<string, unknown>;
    for (const key of Object.keys(record)) {
      if (!ORACLE_KEYS.has(key)) {
        throw new Error(
          `${where} has unknown key '${key}' — allowed keys: ${[...ORACLE_KEYS].join(", ")}`,
        );
      }
    }
    const glob = record["glob"];
    if (typeof glob !== "string" || glob.trim() === "") {
      throw new Error(`${where} needs a non-empty 'glob'`);
    }
    const parsed: OracleGlob = { glob };
    for (const key of ["weakening", "skipMarker"] as const) {
      const pattern = record[key];
      if (pattern === undefined) continue;
      if (typeof pattern !== "string" || pattern === "") {
        throw new Error(`${where} '${key}' must be a non-empty string`);
      }
      // Compile here rather than at match time. A pattern that cannot compile
      // is an authoring error, and the run that discovers it should be the one
      // that names the file it came from.
      try {
        new RegExp(pattern);
      } catch (err) {
        throw new Error(
          `${where} '${key}' is not a valid regular expression: ${(err as Error).message}`,
        );
      }
      parsed[key] = pattern;
    }
    return parsed;
  });
}

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

  const oracles = record["oracles"];
  if (oracles !== undefined) {
    config.oracles = parseOracles(oracles, path);
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
