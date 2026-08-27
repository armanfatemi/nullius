/**
 * Rule files as checkable objects.
 *
 * A rule file's frontmatter (`id`, `applies_to`, `severity`) is already
 * machine-read by `wiringScan.ts` through the shared `parseFrontmatter` — but
 * nothing enforces it as a closed schema. `parseRuleHeader` is that
 * enforcement layer, in the style of `config.ts:parseConfig`: closed keys,
 * a required `id`, a `severity` restricted to a known enum. Unlike
 * `parseConfig`, it never throws — a directory scan across
 * `.claude/rules/*.md` must report every bad file, not abort on the first.
 *
 * The incident-anchor convention (a `**Evidence:**` anchor somewhere in the
 * rule's body, naming the motivating incident) already exists, unenforced.
 * `checkRule` verifies it by reusing the existing citation checker
 * (`parseClaims` + `checkClaims`) rather than building a second one — the
 * anchor grammar is one shared contract across every document class in this
 * repo, and a rule file using a different one would be its own
 * inconsistency for `rules select` to explain away later.
 *
 * `RuleVerdict` is a second, narrower verdict union, kept apart from both
 * `checkClaims.ts`'s exported `Verdict` and `wiring.ts`'s `WiringVerdict` —
 * the kernel's public `Verdict` union is public API whose growth is a
 * breaking change, and `WiringVerdict` is the existing precedent for solving
 * that the same way a second time.
 *
 * This module is pure core: no filesystem access. `rulesScan.ts` is the only
 * module that reads `.claude/rules/*.md` off disk, mirroring the existing
 * `wiring.ts` / `wiringScan.ts` split for harness artifacts generally.
 */

import {
  checkClaims,
  isFailure,
  type CheckDeps,
  type CheckOptions,
  type ClaimResult,
} from "./checkClaims";
import { declaredList, parseFrontmatter } from "./frontmatter";
import { parseClaims, type Claim } from "./parseClaims";
import { isSafeRepoPath } from "./pathSafety";

export type RuleVerdict =
  /** Header parses, and every incident anchor (if any) verifies. */
  | "ok"
  /** Header parses, but the rule body carries no incident anchor at all. */
  | "ungrounded-rule"
  /** Header parses, but at least one incident anchor fails verification. */
  | "rule-rot"
  /** Frontmatter carries an unknown key, no `id`, or an invalid `severity`. */
  | "malformed-rule-header";

/**
 * Advisory verdicts pass. `ungrounded-rule` flags folklore without accusing
 * an author who wrote a deliberately-ungrounded rule; `rule-rot` flags drift
 * without hard-failing a run over a rule whose content may still be sound
 * even though its cited incident moved. `malformed-rule-header` is the only
 * excluded member — an author who mistyped a key should see it fail, the
 * same way `config.ts` fails loud today.
 */
const PASSING: ReadonlySet<RuleVerdict> = new Set<RuleVerdict>([
  "ok",
  "ungrounded-rule",
  "rule-rot",
]);

export function isRuleFailure(verdict: RuleVerdict): boolean {
  return !PASSING.has(verdict);
}

export type RuleSeverity = "blocker" | "concern";

const KNOWN_KEYS: ReadonlySet<string> = new Set(["id", "applies_to", "severity"]);
const KNOWN_SEVERITIES: ReadonlySet<string> = new Set<RuleSeverity>(["blocker", "concern"]);

export interface ParsedRuleHeader {
  verdict: "ok";
  id: string;
  /** Every declared `applies_to` glob, whichever way the author wrote it. */
  appliesTo: string[];
  severity: RuleSeverity;
  /** 1-based line where the body begins, after the closing frontmatter fence. */
  bodyLine: number;
}

export interface MalformedRuleHeader {
  verdict: "malformed-rule-header";
  /** Best-effort attribution — the declaring line when one is known, else 1. */
  line: number;
  detail: string;
}

export type RuleHeaderResult = ParsedRuleHeader | MalformedRuleHeader;

/**
 * Wraps the existing `parseFrontmatter`; does not re-parse frontmatter.
 * Never throws — an unknown key, a missing `id`, a missing or invalid
 * `severity`, or a missing `applies_to` all produce
 * `{ verdict: "malformed-rule-header", ... }` instead.
 */
export function parseRuleHeader(content: string, path: string): RuleHeaderResult {
  const front = parseFrontmatter(content);

  const declaredKeys = new Set<string>();
  if (front !== null) {
    for (const key of front.scalars.keys()) declaredKeys.add(key);
    for (const key of front.lists.keys()) declaredKeys.add(key);
  }
  for (const key of declaredKeys) {
    if (KNOWN_KEYS.has(key)) continue;
    const line = front?.scalars.get(key)?.line ?? front?.lists.get(key)?.[0]?.line ?? 1;
    return {
      verdict: "malformed-rule-header",
      line,
      detail: `${path}: unknown key '${key}' — allowed keys: ${[...KNOWN_KEYS].join(", ")}`,
    };
  }

  const idField = front?.scalars.get("id");
  if (idField === undefined || idField.value.length === 0) {
    return {
      verdict: "malformed-rule-header",
      line: 1,
      detail: `${path}: missing required 'id'`,
    };
  }

  const severityField = front?.scalars.get("severity");
  if (severityField === undefined || severityField.value.length === 0) {
    return {
      verdict: "malformed-rule-header",
      line: idField.line,
      detail: `${path}: missing required 'severity'`,
    };
  }
  if (!KNOWN_SEVERITIES.has(severityField.value)) {
    return {
      verdict: "malformed-rule-header",
      line: severityField.line,
      detail: `${path}: 'severity' must be one of: ${[...KNOWN_SEVERITIES].join(", ")} — got '${severityField.value}'`,
    };
  }

  const appliesTo = declaredList(front, "applies_to");
  if (appliesTo.length === 0) {
    return {
      verdict: "malformed-rule-header",
      line: idField.line,
      detail: `${path}: missing required 'applies_to'`,
    };
  }

  return {
    verdict: "ok",
    id: idField.value,
    appliesTo: appliesTo.map((entry) => entry.value),
    severity: severityField.value as RuleSeverity,
    bodyLine: front?.bodyLine ?? 1,
  };
}

export interface RuleFile {
  /** Repo-relative path of the rule file. */
  path: string;
  /** Full file content, as read from disk. */
  content: string;
}

export interface RuleCheckResult {
  path: string;
  /** `null` only when the header itself is malformed. */
  id: string | null;
  severity: RuleSeverity | null;
  appliesTo: string[];
  verdict: RuleVerdict;
  detail: string;
  /** Per-anchor results of the incident-anchor check. Empty for ungrounded or malformed rules. */
  anchors: ClaimResult[];
}

/** Every `**Evidence:**`-shaped claim `parseClaims` can produce — not `moment` or `canary`. */
function isEvidenceAnchor(
  claim: Claim,
): claim is Extract<Claim, { kind: "presence" | "absence" | "malformed" }> {
  return claim.kind === "presence" || claim.kind === "absence" || claim.kind === "malformed";
}

/**
 * `parseRuleHeader`, then the incident-anchor check, combined into the rule's
 * overall `RuleVerdict`.
 *
 * Any `**Evidence:**`-shaped anchor anywhere in the body counts — no heading
 * match required, since a deliberate exception (`openspec-shall-first-line.md`'s
 * `## Why this rule carries no anchor`) is titled differently and must not be
 * penalized by a heading-keyed lookup. Zero anchors → `ungrounded-rule`. One
 * or more → each is run through the same `checkClaims` every other document
 * in this repo is checked with, and `rule-rot` fires on `isFailure` — the
 * per-claim `Verdict` predicate from `checkClaims.ts`, never a bare
 * `verdict !== "ok"` and never `isRuleFailure` (that wraps the *outer*
 * `RuleVerdict` this function returns, a different union). Several of this
 * repo's real rule files report `stale` today from ordinary line drift —
 * `stale` is a passing `Verdict`, and `isFailure` is exactly what keeps that
 * from misreporting as `rule-rot`.
 */
export function checkRule(
  file: RuleFile,
  deps: CheckDeps,
  options: CheckOptions = {},
): RuleCheckResult {
  const header = parseRuleHeader(file.content, file.path);

  if (header.verdict === "malformed-rule-header") {
    return {
      path: file.path,
      id: null,
      severity: null,
      appliesTo: [],
      verdict: "malformed-rule-header",
      detail: header.detail,
      anchors: [],
    };
  }

  const claims = parseClaims(file.path, file.content).filter(isEvidenceAnchor);

  if (claims.length === 0) {
    return {
      path: file.path,
      id: header.id,
      severity: header.severity,
      appliesTo: header.appliesTo,
      verdict: "ungrounded-rule",
      detail: "no Evidence Anchor found anywhere in the rule body — folklore, not grounded",
      anchors: [],
    };
  }

  const anchors = checkClaims(claims, deps, options);
  const failing = anchors.find((result) => isFailure(result.verdict));

  return {
    path: file.path,
    id: header.id,
    severity: header.severity,
    appliesTo: header.appliesTo,
    verdict: failing === undefined ? "ok" : "rule-rot",
    detail:
      failing === undefined
        ? ""
        : `${failing.verdict} at ${failing.claim.source.doc}:${failing.claim.source.line} — ${failing.detail}`,
    anchors,
  };
}

/** Strip regex metacharacters other than `*`, which `appliesToMatches` handles itself. */
function escapeRegExpLiteral(value: string): string {
  return value.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
}

/** Does one path segment match one pattern segment? `*` matches any run of non-`/` characters, including none. */
function segmentMatches(patternSegment: string, pathSegment: string): boolean {
  if (!patternSegment.includes("*")) return patternSegment === pathSegment;
  const source = patternSegment.split("*").map(escapeRegExpLiteral).join("[^/]*");
  return new RegExp(`^${source}$`).test(pathSegment);
}

// Recursive segment matcher. `**` tries every possible number of path
// segments it could consume, INCLUDING ZERO — `packages/*/src/**/*.ts` must
// match `packages/claims/src/cli.ts`, where `**` sits between two literal
// segments and contributes nothing. A matcher that requires `**` to consume
// at least one segment silently narrows every `**` in this file family.
// (Line comments here, deliberately: that pattern's `**/*` would close a
// `/** */` block comment early.)
function matchSegments(pattern: readonly string[], path: readonly string[]): boolean {
  return recurse(0, 0);

  function recurse(patternIndex: number, pathIndex: number): boolean {
    if (patternIndex === pattern.length) return pathIndex === path.length;
    const segment = pattern[patternIndex];
    if (segment === undefined) return false;

    if (segment === "**") {
      for (let skip = 0; pathIndex + skip <= path.length; skip += 1) {
        if (recurse(patternIndex + 1, pathIndex + skip)) return true;
      }
      return false;
    }

    if (pathIndex >= path.length) return false;
    const candidate = path[pathIndex];
    if (candidate === undefined || !segmentMatches(segment, candidate)) return false;
    return recurse(patternIndex + 1, pathIndex + 1);
  }
}

/**
 * A small, hand-rolled matcher — not a `minimatch` dependency — covering the
 * vocabulary actually observed across the current rule files: literal path
 * segments, `*` (single segment), and `**` (any number of segments,
 * including zero).
 *
 * Both operands are run through `isSafeRepoPath` before matching, mirroring
 * `wiring.ts`'s existing traversal check on a declared glob before it is ever
 * handed to `deps.glob` (`wiring.ts:357`). `applies_to` is repo-controlled
 * content a pull request can add, and `rules select`'s candidate paths can
 * come from a plan or diff a pull request also controls — the same
 * containment rule applies to both operands, not only the pattern side.
 */
export function appliesToMatches(pattern: string, path: string): boolean {
  if (!isSafeRepoPath(pattern).safe) return false;
  if (!isSafeRepoPath(path).safe) return false;

  const patternSegments = pattern.split("/").filter((segment) => segment.length > 0);
  const pathSegments = path.split("/").filter((segment) => segment.length > 0);

  return matchSegments(patternSegments, pathSegments);
}

export interface RuleSelection {
  id: string;
  path: string;
}

export interface SelectRulesResult {
  selected: RuleSelection[];
  /** Rules considered and not selected — a malformed header or no matching path. */
  excludedCount: number;
}

/**
 * Deterministic rule selection: exactly the rules whose `applies_to` matches
 * at least one given path, no model involved, in a stable (id-sorted) order.
 * A rule whose header is malformed cannot be matched at all, and is folded
 * into the excluded count along with every rule that parsed but did not
 * match any given path — a selection that silently narrows is the failure
 * this verb exists to prevent, so the exclusion is always counted, never
 * just dropped.
 */
export function selectRules(files: RuleFile[], paths: string[]): SelectRulesResult {
  const selected: RuleSelection[] = [];
  let excludedCount = 0;

  for (const file of files) {
    const header = parseRuleHeader(file.content, file.path);
    if (header.verdict !== "ok") {
      excludedCount += 1;
      continue;
    }
    const matches = header.appliesTo.some((pattern) =>
      paths.some((path) => appliesToMatches(pattern, path)),
    );
    if (matches) {
      selected.push({ id: header.id, path: file.path });
    } else {
      excludedCount += 1;
    }
  }

  selected.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { selected, excludedCount };
}
