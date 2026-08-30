/**
 * The binding layer for `nullius oracle`: the impure half that talks to git and
 * reads the journal, kept out of `oracle.ts` so the classifier stays testable
 * on plain data.
 *
 * `runners.ts` cannot serve this. Its `revFileReader` reads one path at one
 * revision and its `REV_PATTERN` is hex-only, so a `base..head` range string
 * cannot pass the guard — a name-status diff over a range is new plumbing
 * rather than reuse, which the design says plainly rather than pretending
 * otherwise.
 */

import { spawnSync } from "node:child_process";

import type { DiffEntry, OracleDeps, RawJustification } from "./oracle";

const DEFAULT_GIT_TIMEOUT_MS = 10_000;

/**
 * A range as the user typed it. Deliberately narrow: two revisions joined by
 * `..` or `...`, each hex or a conservative ref shape. The operands reach a
 * subprocess, so anything resembling a flag is refused rather than escaped.
 */
const RANGE_PATTERN = /^[A-Za-z0-9._/-]+(\.\.\.?)[A-Za-z0-9._/-]+$/;
const SINGLE_REV_PATTERN = /^[A-Za-z0-9._/-]+$/;

export interface ParsedRange {
  base: string;
  head: string;
}

/**
 * Split a range into its two endpoints.
 *
 * `base == head` is legal and is not a degenerate case to reject: an empty
 * range is what CI's negated arm runs, because `MALFORMED-JUSTIFICATION` comes
 * from the journal rather than the diff and must be reachable with nothing
 * changed at all.
 */
export function parseRange(range: string): ParsedRange | { error: string } {
  if (range.startsWith("-")) {
    return { error: `'${range}' is not a range` };
  }
  if (RANGE_PATTERN.test(range)) {
    const sep = range.includes("...") ? "..." : "..";
    const idx = range.indexOf(sep);
    const base = range.slice(0, idx);
    const head = range.slice(idx + sep.length);
    if (base === "" || head === "") {
      return { error: `'${range}' is missing one end of the range` };
    }
    return { base, head };
  }
  // A candidate containing `..` reached here only by failing RANGE_PATTERN,
  // which means one end is missing. The bare-revision branch below permits `.`,
  // so without this guard `main..` would be silently read as the revision
  // `main..` and diffed against `main..~1` — a malformed range answered with a
  // confident wrong result rather than refused.
  if (range.includes("..")) {
    return { error: `'${range}' is missing one end of the range` };
  }
  if (SINGLE_REV_PATTERN.test(range)) {
    // A bare revision means "this commit against its parent", the same reading
    // `git show` gives it.
    return { base: `${range}~1`, head: range };
  }
  return { error: `'${range}' is not a range this command will pass to git` };
}

function git(args: string[], root: string, timeoutMs: number): string | null {
  const result = spawnSync("git", ["-C", root, ...args], {
    shell: false,
    encoding: "utf8",
    timeout: timeoutMs,
  });
  if (result.error !== undefined || result.status !== 0) return null;
  return result.stdout;
}

/** Parse `git diff --name-status -z` output into entries. */
export function parseNameStatus(raw: string): DiffEntry[] {
  const parts = raw.split("\0").filter((p) => p !== "");
  const entries: DiffEntry[] = [];
  for (let i = 0; i < parts.length; i += 1) {
    const code = parts[i];
    if (code === undefined) break;
    const letter = code[0];
    if (letter === "R" || letter === "C") {
      // Rename and copy carry two paths.
      const from = parts[i + 1];
      const to = parts[i + 2];
      i += 2;
      if (from === undefined || to === undefined) break;
      entries.push({ path: to, status: "R", from });
      continue;
    }
    const path = parts[i + 1];
    i += 1;
    if (path === undefined) break;
    if (letter === "A" || letter === "M" || letter === "D") {
      entries.push({ path, status: letter });
    } else {
      entries.push({ path, status: "M" });
    }
  }
  return entries;
}

/** Every `justifies` on a `decision` record, unvalidated. */
export function collectJustifications(journal: string): RawJustification[] {
  const out: RawJustification[] = [];
  for (const line of journal.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "") continue;
    let record: unknown;
    try {
      record = JSON.parse(trimmed);
    } catch {
      // A malformed journal line is `witness validate`'s finding to report, not
      // this command's. Skipping keeps one defect from being counted twice, in
      // two vocabularies, by two tools.
      continue;
    }
    if (typeof record !== "object" || record === null) continue;
    const r = record as Record<string, unknown>;
    if (r["kind"] !== "decision") continue;
    const justifies = r["justifies"];
    if (justifies === undefined) continue;
    const id = typeof r["id"] === "string" ? r["id"] : "(no id)";
    if (
      typeof justifies !== "object" ||
      justifies === null ||
      Array.isArray(justifies)
    ) {
      out.push({ record: id, path: undefined, change: undefined });
      continue;
    }
    const j = justifies as Record<string, unknown>;
    out.push({ record: id, path: j["path"], change: j["change"] });
  }
  return out;
}

/** Live deps, reading the repository through git. */
export function gitOracleDeps(
  range: ParsedRange,
  root: string,
  journal: string | null,
  timeoutMs = DEFAULT_GIT_TIMEOUT_MS,
): OracleDeps {
  const cache = new Map<string, string | null>();

  const readAt = (path: string, side: "base" | "head"): string | null => {
    const rev = side === "base" ? range.base : range.head;
    const key = `${rev}:${path}`;
    const cached = cache.get(key);
    if (cached !== undefined) return cached;
    if (path.startsWith("-") || path.includes("\0")) return null;
    const out = git(["show", `${rev}:${path}`], root, timeoutMs);
    cache.set(key, out);
    return out;
  };

  return {
    diff: () => {
      const raw = git(
        ["diff", "--name-status", "-z", `${range.base}..${range.head}`],
        root,
        timeoutMs,
      );
      if (raw === null) return [];
      return parseNameStatus(raw);
    },
    readAt,
    justifications: () =>
      journal === null ? [] : collectJustifications(journal),
  };
}
