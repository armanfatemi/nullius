import { describe, expect, it } from "vitest";

import { checkClaims, isFailure, type CheckDeps } from "./checkClaims";
import { parseClaims, type Claim } from "./parseClaims";

const FILE = [
  "extend schema",
  '  @link(url: "https://specs.apollo.dev/federation/v2.0")',
  "",
  "enum ProcessorTaskStatus {",
  "  PENDING",
  "}",
  "",
  "type ProcessorTask {",
  "  status: ProcessorTaskStatus! @shareable",
  "}",
];

function deps(overrides: Partial<CheckDeps> = {}): CheckDeps {
  return {
    readFileLines: (path) => (path === "schema.graphqls" ? FILE : null),
    runSearch: () => ({ ok: true, count: 0 }),
    ...overrides,
  };
}

function presence(path: string, line: number, text: string): Claim {
  return {
    kind: "presence",
    path,
    line,
    text,
    source: { doc: "design.md", line: 1 },
  };
}

describe("checkClaims — presence", () => {
  it("passes a citation that matches the cited line", () => {
    const [result] = checkClaims(
      [
        presence(
          "schema.graphqls",
          9,
          "  status: ProcessorTaskStatus! @shareable",
        ),
      ],
      deps(),
    );

    expect(result?.verdict).toBe("ok");
  });

  it("ignores indentation differences between the doc and the file", () => {
    const [result] = checkClaims(
      [
        presence(
          "schema.graphqls",
          9,
          "status: ProcessorTaskStatus! @shareable",
        ),
      ],
      deps(),
    );

    expect(result?.verdict).toBe("ok");
  });

  it("reports drift when the text moved a couple of lines", () => {
    const [result] = checkClaims(
      [
        presence(
          "schema.graphqls",
          11,
          "status: ProcessorTaskStatus! @shareable",
        ),
      ],
      deps(),
    );

    expect(result?.verdict).toBe("drift");
    expect(result?.detail).toContain("line 9");
  });

  it("reports a wrong line when the text is far from where it was cited", () => {
    const [result] = checkClaims(
      [
        presence(
          "schema.graphqls",
          1,
          "status: ProcessorTaskStatus! @shareable",
        ),
      ],
      deps(),
    );

    expect(result?.verdict).toBe("wrong-line");
    expect(result?.detail).toContain("line 9");
  });

  it("catches the grounding case — a directive claimed on the enum", () => {
    const [result] = checkClaims(
      [presence("schema.graphqls", 4, "enum ProcessorTaskStatus @shareable {")],
      deps(),
    );

    expect(result?.verdict).toBe("fabricated");
  });

  it("reports a missing file rather than throwing", () => {
    const [result] = checkClaims(
      [presence("does/not/exist.ts", 3, "anything")],
      deps(),
    );

    expect(result?.verdict).toBe("missing-file");
  });

  it("refuses to read a path that escapes the repo, without touching the fs", () => {
    let read = false;
    const [result] = checkClaims([presence("/etc/passwd", 1, "root")], {
      readFileLines: () => {
        read = true;
        return ["root:x:0:0"];
      },
      runSearch: () => ({ ok: true, count: 0 }),
    });

    expect(result?.verdict).toBe("unsafe-path");
    expect(read).toBe(false);
  });

  it("refuses a traversal path", () => {
    const [result] = checkClaims(
      [presence("../../../etc/shadow", 1, "root")],
      deps(),
    );

    expect(result?.verdict).toBe("unsafe-path");
    expect(isFailure("unsafe-path")).toBe(true);
  });

  it("does not crash when the cited line is past the end of the file", () => {
    const [result] = checkClaims(
      [presence("schema.graphqls", 9999, "PENDING")],
      deps(),
    );

    expect(result?.verdict).toBe("wrong-line");
  });

  it("honours a custom drift window", () => {
    // Text is on line 9; cited at 11 — within the default window of 3, but
    // outside a window of 1.
    const [result] = checkClaims(
      [
        presence(
          "schema.graphqls",
          11,
          "status: ProcessorTaskStatus! @shareable",
        ),
      ],
      deps(),
      { driftWindow: 1 },
    );

    expect(result?.verdict).toBe("wrong-line");
  });
});

describe("checkClaims — absence", () => {
  const claim: Claim = {
    kind: "absence",
    command: "grep -rn '@shareable' services/",
    expectedCount: 0,
    source: { doc: "design.md", line: 1 },
  };

  it("passes when the search returns the claimed count", () => {
    const [result] = checkClaims(
      [claim],
      deps({ runSearch: () => ({ ok: true, count: 0 }) }),
    );

    expect(result?.verdict).toBe("ok");
  });

  it("fails when the claimed count is stale", () => {
    const [result] = checkClaims(
      [claim],
      deps({ runSearch: () => ({ ok: true, count: 8 }) }),
    );

    expect(result?.verdict).toBe("count-mismatch");
    expect(result?.detail).toBe("claimed 0, actual 8");
  });

  it("refuses to run an unsafe command", () => {
    let ran = false;
    const [result] = checkClaims(
      [{ ...claim, command: "grep -rn 'x' . && rm -rf /" }],
      deps({
        runSearch: () => {
          ran = true;
          return { ok: true, count: 0 };
        },
      }),
    );

    expect(result?.verdict).toBe("unsafe");
    expect(ran).toBe(false);
  });

  it("surfaces a command failure", () => {
    const [result] = checkClaims(
      [claim],
      deps({
        runSearch: () => ({ ok: false, error: "exited 2: bad pattern" }),
      }),
    );

    expect(result?.verdict).toBe("command-error");
  });
});

describe("checkClaims — binding moment", () => {
  function moment(value: string): Claim {
    return {
      kind: "moment",
      moment: value,
      source: { doc: "design.md", line: 1 },
    };
  }

  it("accepts a moment from the default closed list", () => {
    expect(checkClaims([moment("rollout-window")], deps())[0]?.verdict).toBe(
      "ok",
    );
  });

  it("rejects an invented moment and lists the valid ones", () => {
    const [result] = checkClaims([moment("partial-composition")], deps());

    expect(result?.verdict).toBe("unknown-moment");
    expect(result?.detail).toContain("rollout-window");
  });

  it("flags build-time as CI-caught rather than a runtime risk", () => {
    const [result] = checkClaims([moment("build-time")], deps());

    expect(result?.verdict).toBe("advisory");
    expect(isFailure("advisory")).toBe(false);
  });

  it("accepts a project-defined moment vocabulary", () => {
    const options = {
      moments: ["app-store-review", "client-version-skew"],
      ciCaughtMoments: [],
    };

    expect(
      checkClaims([moment("client-version-skew")], deps(), options)[0]?.verdict,
    ).toBe("ok");
    expect(
      checkClaims([moment("rollout-window")], deps(), options)[0]?.verdict,
    ).toBe("unknown-moment");
  });

  it("applies the advisory to project-defined CI-caught moments", () => {
    const [result] = checkClaims([moment("compile-step")], deps(), {
      moments: ["compile-step", "client-version-skew"],
      ciCaughtMoments: ["compile-step"],
    });

    expect(result?.verdict).toBe("advisory");
  });
});

describe("checkClaims — malformed", () => {
  it("fails an Evidence line that is not a citation", () => {
    const claims = parseClaims("design.md", "**Evidence:** trust me");
    const [result] = checkClaims(claims, deps());

    expect(result?.verdict).toBe("malformed");
    expect(isFailure("malformed")).toBe(true);
  });
});

describe("isFailure", () => {
  it("treats ok, advisory and drift as passing", () => {
    expect(isFailure("ok")).toBe(false);
    expect(isFailure("advisory")).toBe(false);
    expect(isFailure("drift")).toBe(false);
  });

  it("treats every unverified verdict as failing", () => {
    for (const verdict of [
      "wrong-line",
      "fabricated",
      "missing-file",
      "count-mismatch",
      "unsafe-path",
      "unsafe",
      "command-error",
      "unknown-moment",
      "malformed",
    ] as const) {
      expect(isFailure(verdict)).toBe(true);
    }
  });
});

function ledgerClaim(
  expected: string[],
  delivered: { name: string; outcome: string; findingsPath?: string }[],
): Claim {
  return {
    kind: "ledger",
    cycle: "entry-review",
    expected: expected.map((name, index) => ({
      name,
      source: { doc: "evidence.md", line: 2 + index },
    })),
    delivered: delivered.map((entry, index) => ({
      ...entry,
      source: { doc: "evidence.md", line: 10 + index },
    })),
    source: { doc: "evidence.md", line: 1 },
  };
}

describe("checkClaims — attestation ledger", () => {
  it("reports UNDELIVERED for a declared dispatch with no delivery entry", () => {
    const results = checkClaims(
      [ledgerClaim(["security-review"], [])],
      deps(),
    );

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      verdict: "undelivered",
      claim: {
        kind: "dispatch",
        name: "security-review",
        source: { doc: "evidence.md", line: 2 },
      },
    });
    expect(results[0]?.detail).toContain("no delivery entry");
    expect(isFailure("undelivered")).toBe(true);
  });

  it("names a near-match candidate in the UNDELIVERED detail", () => {
    const results = checkClaims(
      [
        ledgerClaim(
          ["secruity-review"],
          [{ name: "security-review", outcome: "None" }],
        ),
      ],
      deps(),
    );

    const undelivered = results.find((r) => r.verdict === "undelivered");
    expect(undelivered?.detail).toContain("security-review");
  });

  it("passes an explicit None outcome, with or without the trailing period", () => {
    const results = checkClaims(
      [
        ledgerClaim(
          ["rule-audit", "schema-review"],
          [
            { name: "rule-audit", outcome: "None" },
            { name: "schema-review", outcome: "None." },
          ],
        ),
      ],
      deps(),
    );

    expect(results.map((r) => r.verdict)).toEqual(["ok", "ok"]);
  });

  it("reports EMPTY-DELIVERY for an entry with no outcome, quoting the literal", () => {
    const results = checkClaims(
      [ledgerClaim(["rule-audit"], [{ name: "rule-audit", outcome: "" }])],
      deps(),
    );

    expect(results[0]?.verdict).toBe("empty-delivery");
    expect(results[0]?.detail).toContain("None");
    expect(isFailure("empty-delivery")).toBe(true);
  });

  it("validates a findings path through path safety and existence", () => {
    const results = checkClaims(
      [
        ledgerClaim(
          ["a", "b", "c"],
          [
            {
              name: "a",
              outcome: "2 findings",
              findingsPath: "schema.graphqls",
            },
            { name: "b", outcome: "1 finding", findingsPath: "missing.md" },
            { name: "c", outcome: "1 finding", findingsPath: "/etc/passwd" },
          ],
        ),
      ],
      deps(),
    );

    expect(results.map((r) => r.verdict)).toEqual([
      "ok",
      "missing-file",
      "unsafe-path",
    ]);
  });

  it("reports UNDECLARED as a passing verdict for an extra report", () => {
    const results = checkClaims(
      [
        ledgerClaim(
          ["rule-audit"],
          [
            { name: "rule-audit", outcome: "None" },
            { name: "extra-review", outcome: "None" },
          ],
        ),
      ],
      deps(),
    );

    expect(results.map((r) => r.verdict)).toEqual(["ok", "undeclared"]);
    expect(isFailure("undeclared")).toBe(false);
  });

  it("counts multiplicity — a name expected twice needs two delivery entries", () => {
    const results = checkClaims(
      [
        ledgerClaim(
          ["worker", "worker"],
          [{ name: "worker", outcome: "None" }],
        ),
      ],
      deps(),
    );

    expect(results.map((r) => r.verdict).sort()).toEqual([
      "ok",
      "undelivered",
    ]);
  });

  it("reports UNKNOWN-REVIEWER when a vocabulary is configured", () => {
    const results = checkClaims(
      [ledgerClaim(["vibes-review"], [])],
      deps(),
      { reviewers: ["rule-audit", "schema-review"] },
    );

    expect(results).toHaveLength(1);
    expect(results[0]?.verdict).toBe("unknown-reviewer");
    expect(results[0]?.detail).toContain("rule-audit");
    expect(isFailure("unknown-reviewer")).toBe(true);
  });

  it("leaves reviewer names free-form when no vocabulary is configured", () => {
    const results = checkClaims(
      [ledgerClaim(["anything-goes"], [{ name: "anything-goes", outcome: "None" }])],
      deps(),
    );

    expect(results[0]?.verdict).toBe("ok");
  });

  it("uses a malformed claim's expected text as the detail when present", () => {
    const results = checkClaims(
      [
        {
          kind: "malformed",
          raw: "- rule-audit came back clean",
          source: { doc: "evidence.md", line: 4 },
          expected: "invalid ledger line — expected - `name` — <outcome>",
        },
      ],
      deps(),
    );

    expect(results[0]?.verdict).toBe("malformed");
    expect(results[0]?.detail).toContain("invalid ledger line");
  });
});
