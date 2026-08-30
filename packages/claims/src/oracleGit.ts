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

import type { DiffEntry, OracleDeps, RawJustification, RevRead } from "./oracle";

const DEFAULT_GIT_TIMEOUT_MS = 10_000;

/** Room for a large golden file or a generated corpus; Node's default is 1 MiB. */
const MAX_GIT_OUTPUT_BYTES = 64 * 1024 * 1024;

/**
 * git's wording for "that path is not in that tree" — the one failure that is
 * an answer rather than an absence of one.
 *
 * Observed forms:
 *   fatal: path 'x' does not exist in 'HEAD'
 *   fatal: path 'x' exists on disk, but not in 'HEAD'
 *
 * Anything not matching this is `unreadable`. The list is deliberately the
 * narrow side of the default: a shape missing from here costs a spurious
 * exit 2, while a shape wrongly admitted costs a silent clean pass.
 */
const PATH_ABSENT = /does not exist in|exists on disk, but not in/i;

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
  /**
   * The separator the user typed, carried rather than discarded.
   *
   * `..` and `...` are different questions. `a...b` is merge-base(a,b)..b, so a
   * commit that landed on `a` after the fork point is NOT part of the range.
   * An earlier draft computed this and threw it away, running `..` for both —
   * which meant the documented invocation, `main...HEAD`, reported every test
   * added on `main` since the branch point as `deleted` on the branch.
   */
  sep: ".." | "...";
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
    // Each endpoint is checked on its own, not just the whole string. The
    // pattern above admits `a..--x`, whose head is option-shaped and reaches
    // `git show --x:path` — an argument git parses as an option rather than a
    // revision. It happens to fail closed today because git errors and the read
    // returns null, but "the subprocess rejected it for us" is not a boundary.
    // The pattern also admits `a..b..c`, which would silently become the head
    // `b..c` rather than being refused.
    for (const [side, value] of [
      ["base", base],
      ["head", head],
    ] as const) {
      if (value.startsWith("-")) {
        return { error: `the ${side} of '${range}' is option-shaped, not a revision` };
      }
      if (value.includes("..")) {
        return { error: `'${range}' has more than one range separator` };
      }
    }
    return { base, head, sep };
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
    return { base: `${range}~1`, head: range, sep: ".." };
  }
  return { error: `'${range}' is not a range this command will pass to git` };
}

export type GitResult =
  | { status: "ok"; stdout: string }
  | { status: "failed"; reason: string };

/**
 * Run git, distinguishing "ran and said no" from "could not run".
 *
 * An earlier draft returned `null` for both, and the caller mapped that onto
 * "the path is absent at that side". The consequence was the failure this
 * repository exists to prevent: a base that could not be read made every file
 * look newly added, which skips `weakened` on all of them, and the command
 * exited 0 with nothing to report. A green result standing in for a check that
 * never happened.
 */
function git(args: string[], root: string, timeoutMs: number): GitResult {
  const result = spawnSync("git", ["-C", root, ...args], {
    shell: false,
    encoding: "utf8",
    timeout: timeoutMs,
    // Node's default is 1 MiB, which an oracle file can plausibly exceed — a
    // generated conformance corpus or a large golden file. Under the
    // fail-closed default an ENOBUFS would become `unreadable` and exit 2 on
    // every run: a permanent red enforcing a size limit nobody declared.
    maxBuffer: MAX_GIT_OUTPUT_BYTES,
  });
  if (result.error !== undefined) {
    return { status: "failed", reason: result.error.message };
  }
  if (result.status !== 0) {
    const stderr = (result.stderr ?? "").trim();
    return {
      status: "failed",
      reason: stderr === "" ? `git exited ${String(result.status)}` : stderr,
    };
  }
  return { status: "ok", stdout: result.stdout };
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

/**
 * Live deps, reading the repository through git.
 *
 * `run` is injectable so a test can assert the argv git is actually handed.
 * That is not ceremony: the defect this module shipped was `diff()` ignoring
 * the range separator, and no test that inspects only `parseRange`'s return
 * value can see it — the bug lives in what reaches the subprocess.
 */
export function gitOracleDeps(
  range: ParsedRange,
  root: string,
  journal: string | null,
  timeoutMs = DEFAULT_GIT_TIMEOUT_MS,
  run: (args: string[], root: string, timeoutMs: number) => GitResult = git,
): OracleDeps {
  const cache = new Map<string, RevRead>();

  /**
   * `a...b` is merge-base(a, b)..b, so the base a file is compared against is
   * the fork point rather than the tip of `a`. Resolving it here keeps the
   * distinction the separator makes: without this, a test added on `main` after
   * the branch point reads as `deleted` on the branch.
   */
  let resolvedBase: string | null = null;
  function baseRev(): { rev: string } | { error: string } {
    if (range.sep === "..") return { rev: range.base };
    if (resolvedBase !== null) return { rev: resolvedBase };
    const merged = run(["merge-base", range.base, range.head], root, timeoutMs);
    if (merged.status === "failed") {
      return {
        error: `could not resolve merge-base of ${range.base} and ${range.head}: ${merged.reason}`,
      };
    }
    resolvedBase = merged.stdout.trim();
    return { rev: resolvedBase };
  }

  const readAt = (path: string, side: "base" | "head"): RevRead => {
    if (path.startsWith("-") || path.includes("\0")) {
      return { status: "unreadable", reason: `'${path}' is not a readable path` };
    }
    let rev: string;
    if (side === "head") {
      rev = range.head;
    } else {
      const resolved = baseRev();
      if ("error" in resolved) {
        return { status: "unreadable", reason: resolved.error };
      }
      rev = resolved.rev;
    }

    const key = `${rev}:${path}`;
    const cached = cache.get(key);
    if (cached !== undefined) return cached;

    const out = run(["show", `${rev}:${path}`], root, timeoutMs);
    let read: RevRead;
    if (out.status === "ok") {
      read = { status: "read", content: out.stdout };
    } else if (PATH_ABSENT.test(out.reason)) {
      // The only shape that means "the path is genuinely not in that tree".
      // That is a real answer about the repository, not a failure to get one.
      read = { status: "absent" };
    } else {
      // Everything else is unreadable, and the default direction matters more
      // than the regex does. An earlier draft defaulted the other way — absent
      // unless the reason matched a known bad-revision shape — which meant a
      // timeout (`ETIMEDOUT`), a missing git binary, or any stderr wording the
      // patterns did not anticipate was silently read as "the file is not
      // there". That is the fail-open this whole change exists to remove,
      // rebuilt one layer down and keyed to a list of strings nobody can
      // promise is complete.
      read = { status: "unreadable", reason: out.reason };
    }
    cache.set(key, read);
    return read;
  };

  return {
    diff: () => {
      const raw = run(
        ["diff", "--name-status", "-z", `${range.base}${range.sep}${range.head}`],
        root,
        timeoutMs,
      );
      // null, not [] — "git could not answer" and "nothing changed" are
      // different facts and the classifier refuses to conflate them.
      if (raw.status === "failed") return null;
      return parseNameStatus(raw.stdout);
    },
    readAt,
    justifications: () =>
      journal === null ? [] : collectJustifications(journal),
  };
}
