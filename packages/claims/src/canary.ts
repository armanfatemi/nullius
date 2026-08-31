/**
 * Canary probes — mutation testing for the review layer (spec/canary.md).
 *
 * `plant` inserts one plausibly-false, bare-prose claim into a document and
 * registers it OUTSIDE the working tree, under `.git/nullius/` — an
 * in-document marker (or an in-tree registry) would be visible to the very
 * reviewer the probe measures, and a tipped-off reviewer produces the exact
 * false confidence this tool exists to prevent. `verify` deterministically
 * scans review output; `clear` restores the document byte-identically.
 *
 * The claim is false BY CONSTRUCTION: it names a real symbol and a real file
 * that verifiably lacks that symbol (checked at plant time), so a diligent
 * reviewer refutes it with one grep. No model is called anywhere.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

import { globSync } from "glob";

import { normalize, type ClaimResult } from "./checkClaims";
import { isSafeRepoPath } from "./pathSafety";

export interface CanaryEntry {
  /** Repo-relative path of the planted document. */
  doc: string;
  /** 1-based line the claim was inserted at. */
  line: number;
  /** The exact inserted line. */
  text: string;
  plantedAt: string;
}

export type VerifyOutcome = "caught" | "missed" | "tainted";

/**
 * The one place a registered canary is rendered for a human to read.
 *
 * The probe measures whether a reviewer found a planted claim by *reading* the
 * document. Any command that prints the plant's location answers that question
 * for them, so the location is omitted by default and every message that
 * mentions a registered canary comes through here.
 *
 * This is a function parameter rather than a CLI flag on purpose. A
 * `--reveal`-style flag would be reachable from the shell by the very reviewer
 * the redaction exists to stop, which would make it a documented bypass rather
 * than a control. `plant` is the sole caller that passes `reveal`, at the one
 * moment the coordinator legitimately records where the claim went.
 *
 * The two forms answer different questions and are not parallel by accident.
 * Redacted answers "is one planted, and since when" — enough for the scriptable
 * guard and for a human checking environment state. Revealed answers "where",
 * which only `plant` is entitled to ask.
 *
 * The rule is deliberately not enforced by a lint. A check for `entry.doc`
 * access outside this function would fire on `clearCanary`'s splice and on the
 * guard's own comparison, both of which need the location and neither of which
 * prints it. So adoption is a review property, and the reason it is written
 * down here is that nothing else will catch a site that bypasses it.
 */
export function describeCanary(
  entry: CanaryEntry,
  options: { reveal?: boolean } = {},
): string {
  return options.reveal === true
    ? `${entry.doc}:${entry.line}`
    : `planted ${entry.plantedAt}`;
}

const REGISTRY_REL = join("nullius", "canaries.json");

/**
 * Tokens whose presence in review output means the probe leaked — see
 * spec/canary.md. `CANARY-` covers every verdict token, present and future.
 */
const TAINT_TOKENS = ["canaries.json", ".git/nullius", "CANARY-"];

const SOURCE_GLOB = "**/*.{ts,tsx,js,jsx,mjs,py,go,rs,java,rb}";
// `**/` prefixes: nested build output and dependency trees (monorepos) are
// not review jurisdiction — a claim about vendored code measures nothing.
const SOURCE_IGNORE = [
  "**/node_modules/**",
  "**/.git/**",
  "**/dist/**",
  "**/build/**",
  "**/vendor/**",
];

const SYMBOL_PATTERN =
  /(?:export\s+(?:const|function|class)|def|func|class)\s+([A-Za-z_][A-Za-z0-9_]{2,})/;

/**
 * One spelling per document path, or the merge guard's equality checks can be
 * bypassed by planting `./docs/x.md` and checking `docs/x.md`.
 */
export function normalizeRepoPath(path: string): string {
  return path
    .replace(/\\/g, "/")
    .replace(/^(\.\/)+/, "")
    .replace(/\/{2,}/g, "/");
}

const PATH_CHAR = /[A-Za-z0-9_./\\-]/;

/** A citation may carry a `./` prefix; anything longer is a different path. */
function boundaryBefore(report: string, at: number): boolean {
  const before = at === 0 ? undefined : report[at - 1];
  if (before === undefined || !PATH_CHAR.test(before)) return true;
  if (report.slice(Math.max(0, at - 2), at) === "./") {
    const prior = at - 3 < 0 ? undefined : report[at - 3];
    return prior === undefined || !PATH_CHAR.test(prior);
  }
  return false;
}

/**
 * Boundary-aware scan for `doc:line` — still a literal search (the character
 * classes are fixed, nothing is built from registry or report content), but
 * `docs/x.md:4` must not score a hit inside `docs/x.md:41` or a longer path.
 */
function citesLocation(report: string, doc: string, line: number): boolean {
  const needle = `${doc}:${line}`;
  let from = 0;
  for (;;) {
    const at = report.indexOf(needle, from);
    if (at === -1) return false;
    const after = report[at + needle.length];
    const afterOk = after === undefined || !/[0-9]/.test(after);
    if (boundaryBefore(report, at) && afterOk) return true;
    from = at + 1;
  }
}

/** Resolves the `.git` directory for a repo root, following worktree gitfiles. */
function resolveGitDir(root: string): string | null {
  const dotGit = join(root, ".git");
  try {
    const stat = statSync(dotGit);
    if (stat.isDirectory()) return dotGit;
    const pointer = /^gitdir:\s*(.+)\s*$/m.exec(readFileSync(dotGit, "utf8"));
    if (pointer?.[1] === undefined) return null;
    const target = pointer[1];
    const isAbsolute = target.startsWith("/") || /^[A-Za-z]:[\\/]/.test(target);
    return isAbsolute ? target : join(root, target);
  } catch {
    return null;
  }
}

function registryPath(gitDir: string): string {
  return join(gitDir, REGISTRY_REL);
}

function isValidEntry(value: unknown): value is CanaryEntry {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry["doc"] === "string" &&
    typeof entry["line"] === "number" &&
    Number.isInteger(entry["line"]) &&
    entry["line"] >= 1 &&
    typeof entry["text"] === "string" &&
    entry["text"].length > 0 &&
    typeof entry["plantedAt"] === "string"
  );
}

/**
 * Loads the active canary, if any. Registry content is untrusted input:
 * unparseable or unsafe entries surface as a warning, never as a crash and
 * never as a file read.
 */
export function loadActiveCanary(root: string): {
  entry: CanaryEntry | null;
  warning?: string;
} {
  const gitDir = resolveGitDir(root);
  if (gitDir === null) return { entry: null };

  const path = registryPath(gitDir);
  if (!existsSync(path)) return { entry: null };

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return { entry: null, warning: `canary registry is unparseable: ${path}` };
  }

  const canaries = (parsed as { canaries?: unknown })?.canaries;
  if (!Array.isArray(canaries) || canaries.length === 0) {
    return { entry: null };
  }

  const entry = canaries[0];
  if (!isValidEntry(entry)) {
    return { entry: null, warning: `canary registry entry is invalid: ${path}` };
  }
  if (!isSafeRepoPath(entry.doc).safe) {
    return {
      entry: null,
      warning: "canary registry entry has an unsafe path and was ignored",
    };
  }

  return { entry: { ...entry, doc: normalizeRepoPath(entry.doc) } };
}

/**
 * Harvests a false-by-construction claim: a symbol defined in one real file,
 * asserted to also live in another real file that verifiably lacks it.
 */
function harvestFalseClaim(
  root: string,
): { symbol: string; fileB: string } | null {
  const candidates = globSync(SOURCE_GLOB, {
    cwd: root,
    ignore: SOURCE_IGNORE,
    nodir: true,
  }).sort();

  for (const fileA of candidates) {
    let content: string;
    try {
      content = readFileSync(join(root, fileA), "utf8");
    } catch {
      continue;
    }
    const symbol = SYMBOL_PATTERN.exec(content)?.[1];
    if (symbol === undefined) continue;

    const topDir = fileA.split("/")[0];
    const others = candidates
      .filter((file) => file !== fileA)
      .sort((a, b) => {
        const aSame = a.split("/")[0] === topDir ? 1 : 0;
        const bSame = b.split("/")[0] === topDir ? 1 : 0;
        return aSame - bSame || a.localeCompare(b);
      });

    for (const fileB of others) {
      try {
        // The falseness invariant: fileB must NOT contain the symbol.
        if (!readFileSync(join(root, fileB), "utf8").includes(symbol)) {
          return { symbol, fileB };
        }
      } catch {
        continue;
      }
    }
  }

  return null;
}

/**
 * First prose line of the document — the claim joins an existing paragraph.
 * Skips YAML front matter and fenced code: a claim planted where the parser
 * (and every renderer) treats text as quoted is an invalid probe, not prose.
 */
function insertionIndex(lines: string[]): number {
  const NON_PROSE = /^\s*(#|-|\*|>|\||\*\*[A-Za-z-]+:\*\*|\d+\.)/;
  const FENCE = /^\s*(```|~~~)/;

  let index = 0;
  if (lines[0]?.trim() === "---") {
    for (let closing = 1; closing < lines.length; closing += 1) {
      if (lines[closing]?.trim() === "---") {
        index = closing + 1;
        break;
      }
    }
  }

  let inFence = false;
  for (; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === undefined) continue;
    if (FENCE.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (line.trim().length === 0) continue;
    if (NON_PROSE.test(line)) continue;
    return index;
  }
  return lines.length - 1;
}

export function plantCanary(root: string, rawDoc: string): CanaryEntry {
  const gitDir = resolveGitDir(root);
  if (gitDir === null) {
    throw new Error(
      "no .git directory found — canary state lives under .git/nullius, outside the working tree",
    );
  }

  const { entry: active, warning } = loadActiveCanary(root);
  if (warning !== undefined) throw new Error(warning);
  if (active !== null) {
    throw new Error(
      `an active canary is already registered (${describeCanary(active)}) — run \`canary clear\` first`,
    );
  }

  const doc = normalizeRepoPath(rawDoc);
  const docSafety = isSafeRepoPath(doc);
  if (!docSafety.safe) throw new Error(`unsafe document path — ${docSafety.reason}`);
  const docAbs = join(root, doc);
  if (!existsSync(docAbs)) throw new Error(`no such document: ${doc}`);

  const harvested = harvestFalseClaim(root);
  if (harvested === null) {
    throw new Error(
      "could not harvest a canary claim from this repository (no source files with a recognizable symbol)",
    );
  }

  const text = `Note that \`${harvested.symbol}\` is also defined in \`${harvested.fileB}\`, so the two definitions must stay in sync.`;

  const lines = readFileSync(docAbs, "utf8").split("\n");
  const index = insertionIndex(lines);
  lines.splice(index + 1, 0, text);
  writeFileSync(docAbs, lines.join("\n"));

  const entry: CanaryEntry = {
    doc,
    line: index + 2,
    text,
    plantedAt: new Date().toISOString(),
  };

  mkdirSync(join(gitDir, "nullius"), { recursive: true });
  writeFileSync(
    registryPath(gitDir),
    `${JSON.stringify({ canaries: [entry] }, null, 2)}\n`,
  );

  return entry;
}

/**
 * Deterministic scan of review output. Taint is tested BEFORE caught: a
 * reviewer that saw the probe machinery and cites the canary is an invalid
 * probe, not a healthy reviewer. Literal substring matching only — never a
 * pattern built from registry or report content.
 */
export function verifyCanary(report: string, entry: CanaryEntry): VerifyOutcome {
  for (const token of TAINT_TOKENS) {
    if (report.includes(token)) return "tainted";
  }

  const normalized = normalize(report);
  if (citesLocation(normalized, entry.doc, entry.line)) return "caught";
  if (normalized.includes(normalize(entry.text))) return "caught";

  return "missed";
}

export function clearCanary(root: string, entry: CanaryEntry): void {
  const gitDir = resolveGitDir(root);
  if (gitDir === null) {
    throw new Error("no .git directory found — nothing to clear");
  }

  const docAbs = join(root, entry.doc);
  const lines = readFileSync(docAbs, "utf8").split("\n");
  if (lines[entry.line - 1] !== entry.text) {
    throw new Error(
      `the registered line no longer carries the planted claim (${describeCanary(entry)}) — clear refused; restore the line or remove it by hand, then delete the registry`,
    );
  }

  lines.splice(entry.line - 1, 1);
  writeFileSync(docAbs, lines.join("\n"));
  rmSync(registryPath(gitDir), { force: true });
}

/**
 * The merge guard's document-level result: `canary-present` when the checked
 * document still contains the registered claim. Reads nothing — the caller
 * already holds the document content, and the guard never opens other files.
 */
export function canaryGuardResult(
  doc: string,
  content: string,
  entry: CanaryEntry,
): ClaimResult | null {
  if (doc !== entry.doc) return null;
  if (!normalize(content).includes(normalize(entry.text))) return null;

  return {
    claim: { kind: "canary", source: { doc, line: entry.line } },
    verdict: "canary-present",
    detail: `a registered canary is planted in this document (planted ${entry.plantedAt}) — run \`canary clear\` before approval, or \`check --probing\` during a probe`,
  };
}
