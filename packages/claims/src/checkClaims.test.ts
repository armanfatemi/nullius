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
