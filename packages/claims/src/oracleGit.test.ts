import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  collectJustifications,
  gitOracleDeps,
  parseNameStatus,
  parseRange,
  type GitResult,
  type ParsedRange,
} from "./oracleGit";

describe("parseRange", () => {
  it("splits a two-dot range", () => {
    expect(parseRange("main..HEAD")).toEqual({ base: "main", head: "HEAD", sep: ".." });
  });

  it("splits a three-dot range", () => {
    expect(parseRange("main...HEAD")).toEqual({
      base: "main",
      head: "HEAD",
      sep: "...",
    });
  });

  // CI's negated arm runs an empty range, because MALFORMED-JUSTIFICATION is
  // read from the journal and must be reachable with nothing changed. An empty
  // range is a supported input, not a degenerate one.
  it("accepts base == head rather than rejecting an empty range", () => {
    expect(parseRange("abc1234..abc1234")).toEqual({
      base: "abc1234",
      head: "abc1234",
      sep: "..",
    });
  });

  it("reads a bare revision as that commit against its parent", () => {
    expect(parseRange("abc1234")).toEqual({
      base: "abc1234~1",
      head: "abc1234",
      sep: "..",
    });
  });

  it("refuses anything flag-shaped", () => {
    expect(parseRange("--upload-pack=evil")).toHaveProperty("error");
  });

  it("refuses a range with a missing end", () => {
    expect(parseRange("main..")).toHaveProperty("error");
  });

  it("refuses shell metacharacters", () => {
    expect(parseRange("main..HEAD;rm -rf /")).toHaveProperty("error");
  });
});

describe("parseNameStatus", () => {
  it("reads added, modified and deleted", () => {
    const raw = "A\0test/a.test.ts\0M\0test/b.test.ts\0D\0test/c.test.ts\0";
    expect(parseNameStatus(raw)).toEqual([
      { path: "test/a.test.ts", status: "A" },
      { path: "test/b.test.ts", status: "M" },
      { path: "test/c.test.ts", status: "D" },
    ]);
  });

  it("reads a rename's two paths", () => {
    const raw = "R100\0test/old.test.ts\0test/new.test.ts\0";
    expect(parseNameStatus(raw)).toEqual([
      { path: "test/new.test.ts", status: "R", from: "test/old.test.ts" },
    ]);
  });

  it("returns nothing for empty output", () => {
    expect(parseNameStatus("")).toEqual([]);
  });
});

describe("collectJustifications", () => {
  it("finds justifies on decision records only", () => {
    const journal = [
      '{"kind":"journal","version":"0.5","origin":"hooks","session":"s"}',
      '{"kind":"decision","id":"dec1","choice":"c","rationale":"r","justifies":{"path":"test/a.test.ts","change":"deleted"}}',
      '{"kind":"decision","id":"dec2","choice":"c","rationale":"r"}',
      '{"kind":"finding","id":"f1","justifies":{"path":"x","change":"deleted"}}',
    ].join("\n");
    expect(collectJustifications(journal)).toEqual([
      { record: "dec1", path: "test/a.test.ts", change: "deleted" },
    ]);
  });

  // The malformed value has to survive collection unvalidated, or the verdict
  // that reports it never sees the record that earned it.
  it("carries a malformed justifies through rather than dropping it", () => {
    const journal =
      '{"kind":"decision","id":"dec1","choice":"c","rationale":"r","justifies":{"path":"a","change":"tweaked"}}';
    expect(collectJustifications(journal)).toEqual([
      { record: "dec1", path: "a", change: "tweaked" },
    ]);
  });

  it("reports a non-object justifies as fully malformed", () => {
    const journal =
      '{"kind":"decision","id":"dec1","choice":"c","rationale":"r","justifies":"nope"}';
    expect(collectJustifications(journal)).toEqual([
      { record: "dec1", path: undefined, change: undefined },
    ]);
  });

  // An unparseable line is witness validate's finding, not this command's.
  // Counting it twice in two vocabularies helps nobody.
  it("skips an unparseable line without erroring", () => {
    const journal = ['{ not json', '{"kind":"decision","id":"d","justifies":{"path":"a","change":"deleted"}}'].join("\n");
    expect(collectJustifications(journal)).toHaveLength(1);
  });
});

// Both of these parsed successfully before the endpoints were validated
// individually. Neither reached a dangerous outcome — git errors on an
// option-shaped rev and the read returns null — but "the subprocess rejected it
// for us" is not a boundary, and the second silently produced a head nobody
// typed.
describe("parseRange validates each endpoint, not just the whole string", () => {
  it("refuses an option-shaped head", () => {
    // `--upload-pack=evil` carries an `=`, which the character class already
    // refuses, so it never reaches the endpoint check. `--x` does.
    const result = parseRange("a..--x");
    expect(result).toHaveProperty("error");
    expect((result as { error: string }).error).toContain("option-shaped");
  });

  it("refuses an option-shaped base", () => {
    expect(parseRange("--x..b")).toHaveProperty("error");
  });

  it("refuses more than one range separator", () => {
    const result = parseRange("a..b..c");
    expect(result).toHaveProperty("error");
    expect((result as { error: string }).error).toContain("more than one");
  });

  it("still accepts an ordinary three-dot range", () => {
    expect(parseRange("main...HEAD")).toEqual({
      base: "main",
      head: "HEAD",
      sep: "...",
    });
  });
});

// parseRange computed the separator and threw it away, so `main...HEAD` ran
// `git diff main..HEAD`. Those are different questions: `a...b` is
// merge-base(a,b)..b, so a commit landing on `a` after the fork point is not in
// the range. The documented invocation was the one that misread — every test
// added on main since the branch point would have read as `deleted`.
describe("parseRange carries the separator", () => {
  it("keeps ... distinct from ..", () => {
    const two = parseRange("main..HEAD");
    const three = parseRange("main...HEAD");
    expect(two).toHaveProperty("sep", "..");
    expect(three).toHaveProperty("sep", "...");
  });

  it("gives a bare revision a two-dot separator", () => {
    expect(parseRange("abc1234")).toHaveProperty("sep", "..");
  });
});

/**
 * The absent/unreadable default, which is the whole safety property.
 *
 * These run against real git in this repository, because the classification
 * keys off git's own stderr wording and a hand-written fake would only assert
 * that the regex matches the string I wrote for it.
 */
describe("gitOracleDeps distinguishes absent from unreadable", () => {
  const root = fileURLToPath(new URL("../../..", import.meta.url));

  it("reports a genuinely missing path as absent", () => {
    const range = parseRange("HEAD..HEAD") as ParsedRange;
    const deps = gitOracleDeps(range, root, null);
    expect(deps.readAt("does/not/exist.ts", "head").status).toBe("absent");
  });

  it("reads a path that is there", () => {
    const range = parseRange("HEAD..HEAD") as ParsedRange;
    const deps = gitOracleDeps(range, root, null);
    expect(deps.readAt("README.md", "head").status).toBe("read");
  });

  // The direction that matters. An unresolvable revision must never be reported
  // as "the file is not there" — that is the fail-open this module was fixed to
  // remove, and defaulting to `absent` for unrecognised stderr rebuilds it one
  // layer down, keyed to a list of strings nobody can promise is complete.
  it("reports an unresolvable revision as unreadable, not absent", () => {
    const range = parseRange("deadbeefdeadbeef..deadbeefdeadbeef") as ParsedRange;
    const deps = gitOracleDeps(range, root, null);
    const read = deps.readAt("README.md", "head");
    expect(read.status).toBe("unreadable");
  });

  it("reports a diff over an unresolvable range as null, not empty", () => {
    const range = parseRange("deadbeefdeadbeef..deadbeefdeadbeef") as ParsedRange;
    expect(gitOracleDeps(range, root, null).diff()).toBeNull();
  });
});

/**
 * The three-dot path, end to end.
 *
 * The original defect was `diff()` ignoring the separator, and no test that
 * inspects only `parseRange`'s return value can see it — the bug lives in what
 * reaches the subprocess. Asserting the argv is what closes that gap. CI runs
 * only `HEAD..HEAD`, where merge-base(HEAD, HEAD) is HEAD and the two
 * separators are indistinguishable, so CI is structurally blind to it too.
 */
describe("the range separator reaches git", () => {
  function spy(results: Record<string, GitResult> = {}) {
    const calls: string[][] = [];
    const run = (args: string[]): GitResult => {
      calls.push(args);
      const key = args[0] ?? "";
      return results[key] ?? { status: "ok", stdout: "" };
    };
    return { calls, run: run as (a: string[], r: string, t: number) => GitResult };
  }

  it("passes ... to git diff, not ..", () => {
    const { calls, run } = spy();
    const range = parseRange("main...HEAD") as ParsedRange;
    gitOracleDeps(range, ".", null, 1000, run).diff();
    expect(calls[0]).toEqual([
      "diff",
      "--name-status",
      "-z",
      "main...HEAD",
    ]);
  });

  it("passes .. through unchanged", () => {
    const { calls, run } = spy();
    const range = parseRange("main..HEAD") as ParsedRange;
    gitOracleDeps(range, ".", null, 1000, run).diff();
    expect(calls[0]?.[3]).toBe("main..HEAD");
  });

  // For `a...b` the base side must be the fork point, not the tip of `a`.
  // Reading at `main` instead would report every commit that landed on main
  // after the branch point as a change on the branch.
  it("resolves the base of a three-dot range via merge-base", () => {
    const { calls, run } = spy({
      "merge-base": { status: "ok", stdout: "abc1234\n" },
    });
    const range = parseRange("main...HEAD") as ParsedRange;
    gitOracleDeps(range, ".", null, 1000, run).readAt("a.ts", "base");
    expect(calls[0]).toEqual(["merge-base", "main", "HEAD"]);
    expect(calls[1]).toEqual(["show", "abc1234:a.ts"]);
  });

  it("does not call merge-base for a two-dot range", () => {
    const { calls, run } = spy();
    const range = parseRange("main..HEAD") as ParsedRange;
    gitOracleDeps(range, ".", null, 1000, run).readAt("a.ts", "base");
    expect(calls.map((c) => c[0])).not.toContain("merge-base");
    expect(calls[0]).toEqual(["show", "main:a.ts"]);
  });

  it("reports an unresolvable merge-base as unreadable rather than guessing", () => {
    const { run } = spy({
      "merge-base": { status: "failed", reason: "no merge base" },
    });
    const range = parseRange("main...HEAD") as ParsedRange;
    const read = gitOracleDeps(range, ".", null, 1000, run).readAt("a.ts", "base");
    expect(read.status).toBe("unreadable");
  });
});
