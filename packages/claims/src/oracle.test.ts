import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  HARD_CHANGES,
  checkOracles,
  globMatches,
  isHardChange,
  isOracleFailure,
  type DiffEntry,
  type OracleDeps,
  type OracleVerdict,
  type RawJustification,
} from "./oracle";

/**
 * The whole suite runs on plain data. The design's injected seam is what makes
 * that possible: no fixture repo, no `.git` directory, no test-time history
 * synthesis for a verb whose unit is a commit range.
 */
function deps(
  diff: DiffEntry[] | null,
  files: Record<string, { base?: string; head?: string }> = {},
  justifications: RawJustification[] = [],
): OracleDeps {
  return {
    diff: () => diff,
    readAt: (path, side) => {
      const content = files[path]?.[side];
      return content === undefined
        ? { status: "absent" }
        : { status: "read", content };
    },
    justifications: () => justifications,
  };
}

const TESTS = [{ glob: "test/**/*.test.ts", weakening: "\\bexpect\\(", skipMarker: "\\.skip\\(" }];

describe("the hard vocabulary is closed", () => {
  it("has exactly three members", () => {
    expect(HARD_CHANGES).toEqual(["deleted", "skipped", "weakened"]);
  });

  it("refuses an invented class", () => {
    expect(isHardChange("tweaked")).toBe(false);
    expect(isHardChange("adjusted")).toBe(false);
  });
});

describe("OracleVerdict calibration", () => {
  // The blocker this union nearly shipped with: every member inside PASSING
  // makes the predicate constant-false and hands the decision back to --strict.
  it("PASSING has a complement, so the predicate is not constant-false", () => {
    const all: OracleVerdict[] = [
      "ok",
      "unjustified-oracle-change",
      "malformed-justification",
    ];
    expect(all.some((v) => isOracleFailure(v))).toBe(true);
    expect(all.some((v) => !isOracleFailure(v))).toBe(true);
  });

  it("unjustified-oracle-change passes — advisory in v1", () => {
    expect(isOracleFailure("unjustified-oracle-change")).toBe(false);
  });

  it("malformed-justification fails with no flag set", () => {
    expect(isOracleFailure("malformed-justification")).toBe(true);
  });
});

describe("globMatches", () => {
  it("matches a ** segment across directories", () => {
    expect(globMatches("test/**/*.test.ts", "test/a/b/retry.test.ts")).toBe(true);
    expect(globMatches("test/**/*.test.ts", "test/retry.test.ts")).toBe(true);
  });

  it("does not match outside the prefix", () => {
    expect(globMatches("test/**/*.test.ts", "src/retry.test.ts")).toBe(false);
  });

  it("does not let * cross a slash", () => {
    expect(globMatches("test/*.ts", "test/a/b.ts")).toBe(false);
  });
});

describe("classification — deleted", () => {
  it("classifies a deletion hard and reports it unjustified", () => {
    const report = checkOracles(
      TESTS,
      deps([{ path: "test/retry.test.ts", status: "D" }]),
    );
    expect(report.findings).toHaveLength(1);
    expect(report.findings[0]?.verdict).toBe("unjustified-oracle-change");
    expect(report.findings[0]?.change).toBe("deleted");
  });

  // The change's whole premise: git sees deletions no hook witnessed. The deps
  // here supply no journal at all, standing in for a `rm` that emitted no
  // mutation record — and the deletion is still caught.
  it("catches a deletion with no journal record behind it", () => {
    const report = checkOracles(
      TESTS,
      deps([{ path: "test/retry.test.ts", status: "D" }], {}, []),
    );
    expect(
      report.findings.map((f) => `${f.verdict}:${f.change}`),
    ).toEqual(["unjustified-oracle-change:deleted"]);
  });

  it("a justified deletion produces no finding", () => {
    const report = checkOracles(
      TESTS,
      deps([{ path: "test/retry.test.ts", status: "D" }], {}, [
        { record: "dec1", path: "test/retry.test.ts", change: "deleted" },
      ]),
    );
    expect(report.findings).toEqual([]);
    expect(report.justified).toEqual([
      { path: "test/retry.test.ts", change: "deleted" },
    ]);
  });
});

describe("classification — weakened", () => {
  it("fires when the declared pattern's count decreases", () => {
    const report = checkOracles(
      TESTS,
      deps([{ path: "test/retry.test.ts", status: "M" }], {
        "test/retry.test.ts": {
          base: "expect(a); expect(b); expect(c);",
          head: "expect(a);",
        },
      }),
    );
    expect(report.findings[0]?.change).toBe("weakened");
  });

  // A false positive has to be dismissible in seconds or the gate gets ignored.
  it("names the pattern and both counts", () => {
    const report = checkOracles(
      TESTS,
      deps([{ path: "test/retry.test.ts", status: "M" }], {
        "test/retry.test.ts": {
          base: "expect(a); expect(b); expect(c);",
          head: "expect(a);",
        },
      }),
    );
    expect(report.findings[0]?.detail).toContain("expect");
    expect(report.findings[0]?.detail).toContain("3");
    expect(report.findings[0]?.detail).toContain("1");
  });

  it("an edit that adds assertions is advisory, not hard", () => {
    const report = checkOracles(
      TESTS,
      deps([{ path: "test/retry.test.ts", status: "M" }], {
        "test/retry.test.ts": { base: "expect(a);", head: "expect(a); expect(b);" },
      }),
    );
    expect(report.findings).toEqual([]);
    expect(report.advisory).toEqual(["test/retry.test.ts"]);
  });

  it("an added file raises nothing, since it has no base to weaken from", () => {
    const report = checkOracles(
      TESTS,
      deps([{ path: "test/new.test.ts", status: "A" }], {
        "test/new.test.ts": { head: "expect(a);" },
      }),
    );
    expect(report.findings).toEqual([]);
    expect(report.advisory).toEqual(["test/new.test.ts"]);
  });
});

describe("classification — skipped", () => {
  it("fires when the declared skip marker's count increases", () => {
    const report = checkOracles(
      TESTS,
      deps([{ path: "test/retry.test.ts", status: "M" }], {
        "test/retry.test.ts": {
          base: "it('a', ...); expect(x);",
          head: "it.skip('a', ...); expect(x);",
        },
      }),
    );
    expect(report.findings[0]?.change).toBe("skipped");
  });
});

describe("one decision does not discharge two classes", () => {
  it("leaves the weakening unjustified when only the skip is named", () => {
    const report = checkOracles(
      TESTS,
      deps(
        [{ path: "test/retry.test.ts", status: "M" }],
        {
          "test/retry.test.ts": {
            base: "it('a'); expect(a); expect(b);",
            head: "it.skip('a'); expect(a);",
          },
        },
        [{ record: "dec1", path: "test/retry.test.ts", change: "skipped" }],
      ),
    );
    expect(report.findings.map((f) => f.change)).toEqual(["weakened"]);
    expect(report.justified).toEqual([
      { path: "test/retry.test.ts", change: "skipped" },
    ]);
  });
});

describe("malformed-justification", () => {
  it("fires by name on a class outside the three, naming the valid ones", () => {
    const report = checkOracles(
      TESTS,
      deps([], {}, [
        { record: "dec1", path: "test/a.test.ts", change: "tweaked" },
      ]),
    );
    expect(report.findings[0]?.verdict).toBe("malformed-justification");
    expect(report.findings[0]?.record).toBe("dec1");
    for (const cls of HARD_CHANGES) {
      expect(report.findings[0]?.detail).toContain(cls);
    }
  });

  it("fires on a blank path", () => {
    const report = checkOracles(
      TESTS,
      deps([], {}, [{ record: "dec1", path: "   ", change: "deleted" }]),
    );
    expect(report.findings[0]?.verdict).toBe("malformed-justification");
  });

  // This is the property CI's negated arm depends on: the verdict is raised by
  // reading the journal, so it fires over an empty range with nothing changed.
  // A verdict conditional on a matching change would be unreachable in exactly
  // the case the typo caused.
  it("fires over an empty range, with no diff entries at all", () => {
    const report = checkOracles(
      TESTS,
      deps([], {}, [
        { record: "dec1", path: "test/a.test.ts", change: "tweaked" },
      ]),
    );
    expect(report.findings).toHaveLength(1);
    expect(report.findings[0]?.verdict).toBe("malformed-justification");
    expect(report.findings.some((f) => isOracleFailure(f.verdict))).toBe(true);
  });

  it("a malformed justification discharges nothing", () => {
    const report = checkOracles(
      TESTS,
      deps([{ path: "test/retry.test.ts", status: "D" }], {}, [
        { record: "dec1", path: "test/retry.test.ts", change: "tweaked" },
      ]),
    );
    expect(report.findings.map((f) => f.verdict).sort()).toEqual([
      "malformed-justification",
      "unjustified-oracle-change",
    ]);
  });
});

describe("an unconfigured project is told, not reassured", () => {
  it("reports unconfigured rather than a clean zero", () => {
    const report = checkOracles(
      undefined,
      deps([{ path: "test/retry.test.ts", status: "D" }]),
    );
    expect(report.unconfigured).toBe(true);
    expect(report.findings).toEqual([]);
  });

  it("treats an empty array the same way", () => {
    expect(checkOracles([], deps([])).unconfigured).toBe(true);
  });
});

describe("a glob with no weakening says so", () => {
  it("names the glob whose weakened class went unchecked", () => {
    const report = checkOracles(
      [{ glob: "test/**/*.test.ts" }],
      deps([{ path: "test/retry.test.ts", status: "M" }], {
        "test/retry.test.ts": { base: "expect(a); expect(b);", head: "expect(a);" },
      }),
    );
    expect(report.weakeningUnchecked).toEqual(["test/**/*.test.ts"]);
    // Unchecked means unchecked: the weakening above is real and goes unreported.
    expect(report.findings).toEqual([]);
  });
});

describe("an absent journal is a reported state", () => {
  it("flags journalAbsent when no journal was provided", () => {
    expect(checkOracles(TESTS, deps([])).journalAbsent).toBe(true);
  });

  it("clears it when one was", () => {
    const report = checkOracles(TESTS, deps([]), { journalProvided: true });
    expect(report.journalAbsent).toBe(false);
  });
});

describe("files outside every declared glob are ignored entirely", () => {
  // Asserting only that the out-of-glob path produces nothing would pass
  // against a checkOracles that returned an empty report unconditionally. The
  // in-glob deletion in the same call is what makes the silence meaningful:
  // one path is classified, the other is not, in a single invocation.
  it("classifies an in-glob deletion and ignores an out-of-glob one", () => {
    const report = checkOracles(
      TESTS,
      deps([
        { path: "src/retry.ts", status: "D" },
        { path: "test/retry.test.ts", status: "D" },
      ]),
    );
    expect(report.findings).toHaveLength(1);
    expect(report.findings[0]?.subject).toBe("test/retry.test.ts");
    expect(report.advisory).toEqual([]);
  });
});

/**
 * A guard for a defect that shipped once and was caught only because a reviewer
 * noticed `Bin` in a diffstat.
 *
 * `globMatches` used NUL as an internal sentinel, and the discharge key joined
 * `path` and `change` with one. Both worked, every test passed, and the file
 * became binary to git — so the entire diff was unreviewable in a PR. Nothing
 * else in the suite would have noticed: NUL is a valid JavaScript string
 * character and a perfectly good separator.
 *
 * The check is over the whole source tree rather than this module, because the
 * mistake is not oracle-specific — it is what any "separator that cannot appear
 * in the data" reaches for.
 */
describe("source files are text, not binary", () => {
  it("contains no NUL byte in any kernel source file", () => {
    const dir = fileURLToPath(new URL(".", import.meta.url));
    const offenders = readdirSync(dir)
      .filter((name) => name.endsWith(".ts"))
      .filter((name) => readFileSync(join(dir, name), "utf8").includes("\0"));
    expect(offenders).toEqual([]);
  });
});

/**
 * Three defects found in post-review, each asserted here by name.
 *
 * All three shared a shape: the code produced a confident answer from an
 * incomplete or misread input, and every existing gate stayed green.
 */
describe("post-review regressions", () => {
  // countMatches' zero-width guard tested `lastIndex === 0`, which catches an
  // empty match only at offset 0. `a|x*` matches "a" first, then zero-width at
  // offset 1, and the loop never advanced — verified spinning past 50M
  // iterations. A checker that hangs is worse than one that is wrong, because
  // nothing in the output says which it is doing.
  it("terminates on a zero-width-capable pattern AND counts it correctly", () => {
    // `a|x*` matches "a" (non-empty), then zero-width everywhere else. Two "a"s
    // at the base and one at the head is a real reduction, so the classifier
    // must both terminate and call it `weakened`.
    //
    // Asserting only that the call returns would leave the fix half-checked:
    // `countMatches` is unexported, so a guard that terminated by breaking out
    // of the loop early — losing counts — would look identical to one that
    // advances correctly. The verdict is the observable that distinguishes them.
    const report = checkOracles(
      [{ glob: "test/**/*.test.ts", weakening: "a|x*" }],
      deps([{ path: "test/a.test.ts", status: "M" }], {
        "test/a.test.ts": { base: "aba", head: "ab" },
      }),
    );
    expect(report.findings.map((f) => f.change)).toEqual(["weakened"]);
  });

  it("does not report a reduction when a zero-width-capable pattern holds steady", () => {
    const report = checkOracles(
      [{ glob: "test/**/*.test.ts", weakening: "a|x*" }],
      deps([{ path: "test/a.test.ts", status: "M" }], {
        "test/a.test.ts": { base: "aba", head: "aab" },
      }),
    );
    expect(report.findings).toEqual([]);
  });

  // git returning null for every failure was mapped onto "the path is absent at
  // that side", so an unreadable base made every file look newly added —
  // skipping `weakened` on all of them and exiting 0 clean.
  it("records an unreadable side instead of treating it as absent", () => {
    const report = checkOracles(
      [{ glob: "test/**/*.test.ts", weakening: "\\bexpect\\(" }],
      {
        diff: () => [{ path: "test/a.test.ts", status: "M" }],
        readAt: (_path, side) =>
          side === "base"
            ? { status: "unreadable", reason: "bad object" }
            : { status: "read", content: "expect(a);" },
        justifications: () => [],
      },
    );
    expect(report.unreadable).toHaveLength(1);
    expect(report.unreadable[0]).toContain("base");
  });

  // A diff git could not produce is not an empty diff. Returning [] for both
  // meant a broken range reported zero findings and passed.
  it("reports an unreadable diff rather than an empty one", () => {
    const report = checkOracles(
      [{ glob: "test/**/*.test.ts" }],
      deps(null),
    );
    expect(report.unreadable).toHaveLength(1);
    expect(report.findings).toEqual([]);
  });

  // The absent case must still behave as before: a file with no base is new,
  // not unreadable, and raises nothing.
  it("still treats a genuinely absent base as an added file", () => {
    const report = checkOracles(
      [{ glob: "test/**/*.test.ts", weakening: "\\bexpect\\(" }],
      deps([{ path: "test/new.test.ts", status: "A" }], {
        "test/new.test.ts": { head: "expect(a);" },
      }),
    );
    expect(report.unreadable).toEqual([]);
    expect(report.findings).toEqual([]);
  });
});
