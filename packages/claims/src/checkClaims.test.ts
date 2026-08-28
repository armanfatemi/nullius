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
      [presence("schema.graphqls", 9999, "enum ProcessorTaskStatus {")],
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

  it("passes when the search returns the claimed count and the control finds something", () => {
    // Call 1 is the cited search, call 2 the broadened control. A control that
    // finds matches proves the search was aimed somewhere real.
    let call = 0;
    const [result] = checkClaims(
      [claim],
      deps({
        runSearch: () => {
          call += 1;
          return { ok: true, count: call === 1 ? 0 : 7 };
        },
      }),
    );

    expect(result?.verdict).toBe("ok");
  });

  it("passes without a control when the claimed count is non-zero", () => {
    const nonZero: Claim = { ...claim, expectedCount: 3 };
    let calls = 0;
    const [result] = checkClaims(
      [nonZero],
      deps({
        runSearch: () => {
          calls += 1;
          return { ok: true, count: 3 };
        },
      }),
    );

    expect(result?.verdict).toBe("ok");
    expect(calls).toBe(1);
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
  it("treats every non-failing verdict as passing", () => {
    expect(isFailure("ok")).toBe(false);
    expect(isFailure("advisory")).toBe(false);
    expect(isFailure("drift")).toBe(false);
  });

  it("treats every unverified verdict as failing", () => {
    for (const verdict of [
      "unpinned",
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

describe("checkClaims — anchor distinctiveness", () => {
  const lines = [
    "export const MAX_RETRIES = 3;",
    "export function retry() {",
    "  return backoff();",
    "}",
  ];
  const presence = (line: number, text: string): Claim => ({
    kind: "presence",
    path: "src/app.ts",
    line,
    text,
    source: { doc: "design.md", line: 1 },
  });

  it("flags a short quote as advisory even when it is unique", () => {
    const [result] = checkClaims(
      [presence(1, "3;")],
      deps({ readFileLines: () => lines }),
    );

    expect(result?.verdict).toBe("weak-anchor");
    expect(result?.detail).toContain("character(s)");
    // Advisory only: a short quote sitting on its cited line still points
    // somewhere definite.
    expect(isFailure(result?.verdict ?? "ok")).toBe(false);
  });

  it("flags a quote that matches several lines", () => {
    const [result] = checkClaims(
      [presence(1, "export const")],
      deps({ readFileLines: () => ["export const A = 1;", "export const B = 2;"] }),
    );

    expect(result?.verdict).toBe("weak-anchor");
    expect(result?.detail).toContain("matches several lines");
  });

  it("does not call a whole-line quote ambiguous because a longer line contains it", () => {
    // The regression this rule exists to avoid: someone appends a trailing
    // comment to a copy of the cited line, and a correctly pasted 28-character
    // quote becomes "ambiguous" — failing the run on exactly the unrelated
    // refactor the drift tolerance exists to forgive.
    const withTwin = [
      "return this.store.get(key);",
      "return this.store.get(key); // no promotion",
    ];
    const [result] = checkClaims(
      [presence(1, "return this.store.get(key);")],
      deps({ readFileLines: () => withTwin }),
    );

    expect(result?.verdict).toBe("ok");
  });

  it("still passes a weak anchor — it is advisory, not a gate", () => {
    const [result] = checkClaims(
      [presence(1, "n")],
      deps({ readFileLines: () => lines }),
    );

    expect(isFailure(result?.verdict ?? "ok")).toBe(false);
  });

  it("honours a configured minimum", () => {
    const [result] = checkClaims(
      [presence(1, "export const MAX_RETRIES = 3;")],
      deps({ readFileLines: () => lines }),
      { minAnchorChars: 100 },
    );

    expect(result?.verdict).toBe("weak-anchor");
  });

  it("passes a distinctive quote as ok", () => {
    const [result] = checkClaims(
      [presence(1, "export const MAX_RETRIES = 3;")],
      deps({ readFileLines: () => lines }),
    );

    expect(result?.verdict).toBe("ok");
  });

  it("honours a configured minimum", () => {
    const [result] = checkClaims(
      [presence(3, "return backoff();")],
      deps({ readFileLines: () => lines }),
      { minAnchorChars: 100 },
    );

    expect(result?.verdict).toBe("weak-anchor");
  });
});

describe("checkClaims — multi-line block citations", () => {
  const lines = ["const a = 1;", "const b = 2;", "const c = 3;"];
  const block: Claim = {
    kind: "presence",
    path: "src/app.ts",
    line: 1,
    text: "const a = 1;",
    extraLines: ["const b = 2;"],
    source: { doc: "design.md", line: 1 },
  };

  it("verifies the cited lines consecutively", () => {
    const [result] = checkClaims([block], deps({ readFileLines: () => lines }));
    expect(result?.verdict).toBe("ok");
  });

  it("fails when the block is not consecutive in the file", () => {
    const [result] = checkClaims(
      [block],
      deps({ readFileLines: () => ["const a = 1;", "const x = 9;", "const b = 2;"] }),
    );
    expect(result?.verdict).toBe("fabricated");
  });

  it("reports drift when the whole block moved", () => {
    const [result] = checkClaims(
      [block],
      deps({ readFileLines: () => ["// header", ...lines] }),
    );
    expect(result?.verdict).toBe("drift");
  });
});

describe("checkClaims — absence path safety", () => {
  const oracle: Claim = {
    kind: "absence",
    command: "grep -rc AKIAZZTOPSECRET1 /etc/shadow",
    expectedCount: 0,
    source: { doc: "design.md", line: 1 },
  };

  it("refuses to run a search pointed outside the repo", () => {
    let ran = false;
    const [result] = checkClaims(
      [oracle],
      deps({
        runSearch: () => {
          ran = true;
          return { ok: true, count: 0 };
        },
      }),
    );

    expect(result?.verdict).toBe("unsafe");
    // The verdict itself is the oracle bit, so the search must not run at all.
    expect(ran).toBe(false);
  });
});

describe("checkClaims — the reachability control search", () => {
  const claim: Claim = {
    kind: "absence",
    command: "grep -rn legacyRetryHelper services/",
    expectedCount: 0,
    source: { doc: "design.md", line: 1 },
  };

  it("downgrades to advisory when the search examined no content at all", () => {
    const [result] = checkClaims(
      [claim],
      deps({ runSearch: () => ({ ok: true, count: 0 }) }),
    );

    expect(result?.verdict).toBe("advisory");
    expect(result?.detail).toContain("examined no content");
  });

  it("can be switched off", () => {
    const [result] = checkClaims(
      [claim],
      deps({ runSearch: () => ({ ok: true, count: 0 }) }),
      { relaxedControl: false },
    );

    expect(result?.verdict).toBe("ok");
  });
});

describe("checkClaims — the two axes of a citation", () => {
  // "This text is in this file" is a claim about the AUTHOR: it can be
  // fabricated, and once true no one else's edit can make it false.
  // "It is on line N" is a claim about the REPOSITORY, and goes stale whenever
  // someone inserts a line above it. The first is a hard gate forever; the
  // second is advisory — otherwise an honest document turns red on an unrelated
  // refactor, which is what teaches a team to add continue-on-error.
  const distinctive = "enum ProcessorTaskStatus {";

  it("passes a distinctive quote whose line has moved far", () => {
    // Text is on line 4; cited at 9, well outside the drift window.
    const [result] = checkClaims([presence("schema.graphqls", 9, distinctive)], deps());

    expect(result?.verdict).toBe("wrong-line");
    expect(isFailure(result?.verdict ?? "ok")).toBe(false);
    expect(result?.detail).toContain("stale rather than wrong");
  });

  it("still fails a quote that is nowhere in the file", () => {
    const [result] = checkClaims(
      [presence("schema.graphqls", 4, "enum ProcessorTaskStatus { INVENTED }")],
      deps(),
    );

    expect(result?.verdict).toBe("fabricated");
    expect(isFailure("fabricated")).toBe(true);
  });

  it("passes a SHORT quote off its line when it still identifies one place", () => {
    // "PENDING" is under minAnchorChars but occurs exactly once, so re-reading
    // the file can contradict it — which is the whole test of whether a
    // citation still asserts something. Failing it would have been the tool
    // claiming a citation pins nothing while naming the line it pins.
    const [result] = checkClaims([presence("schema.graphqls", 1, "PENDING")], deps());

    expect(result?.verdict).toBe("wrong-line");
    expect(isFailure(result?.verdict ?? "ok")).toBe(false);
    expect(result?.detail).toContain("worth quoting more");
  });

  it("tolerates a weak quote that IS on its cited line", () => {
    // Here the line number is doing the pinning, so the citation still points
    // somewhere definite — advisory, not a failure.
    const [result] = checkClaims([presence("schema.graphqls", 5, "PENDING")], deps());

    expect(result?.verdict).toBe("weak-anchor");
    expect(isFailure("weak-anchor")).toBe(false);
  });

  it("fails a non-distinctive quote that is not on its cited line", () => {
    const [result] = checkClaims(
      [presence("schema.graphqls", 1, "}")],
      deps(),
    );

    expect(result?.verdict).toBe("unpinned");
  });
});

describe("foundLine", () => {
  // The line `locate` identified, surfaced as a number so a fixer can move a
  // citation without parsing the checker's own English. It is set only on the
  // two verdicts where the quote matched exactly ONE place off its cited line.
  const distinctive = "status: ProcessorTaskStatus! @shareable";

  it("names the found line on drift", () => {
    // Text is on line 9; cited at 11 — inside the default window of 3.
    const [result] = checkClaims([presence("schema.graphqls", 11, distinctive)], deps());

    expect(result?.verdict).toBe("drift");
    expect(result?.foundLine).toBe(9);
    expect(result?.detail).toContain("line 9");
  });

  it("names the found line on wrong-line", () => {
    const [result] = checkClaims([presence("schema.graphqls", 1, distinctive)], deps());

    expect(result?.verdict).toBe("wrong-line");
    expect(result?.foundLine).toBe(9);
    expect(result?.detail).toContain("line 9");
  });

  it("is absent on ok", () => {
    const [result] = checkClaims([presence("schema.graphqls", 9, distinctive)], deps());

    expect(result?.verdict).toBe("ok");
    expect(result).not.toHaveProperty("foundLine");
  });

  it("is absent on fabricated", () => {
    const [result] = checkClaims(
      [presence("schema.graphqls", 4, "enum ProcessorTaskStatus @shareable {")],
      deps(),
    );

    expect(result?.verdict).toBe("fabricated");
    expect(result).not.toHaveProperty("foundLine");
  });

  it("is absent on unpinned", () => {
    const [result] = checkClaims([presence("schema.graphqls", 1, "}")], deps());

    expect(result?.verdict).toBe("unpinned");
    expect(result).not.toHaveProperty("foundLine");
  });

  it("is absent on weak-anchor", () => {
    const [result] = checkClaims([presence("schema.graphqls", 5, "PENDING")], deps());

    expect(result?.verdict).toBe("weak-anchor");
    expect(result).not.toHaveProperty("foundLine");
  });

  it("prefers the exact match outside the window over a substring match inside it", () => {
    // Edge shape 1 (design Decision 2). Line 2 CONTAINS the quote and sits
    // inside the window; line 10 IS the quote and sits outside it. `locate`
    // pins the exact line, so the verdict is measured from line 10 and the
    // number a fixer would move to agrees with the uniqueness survey. Before
    // this change the window scan reported `drift` naming line 2.
    const lines = [
      "// 1",
      "const x = 1; // trailing note",
      "// 3",
      "// 4",
      "// 5",
      "// 6",
      "// 7",
      "// 8",
      "// 9",
      "const x = 1;",
    ];
    const [result] = checkClaims(
      [presence("src/app.ts", 1, "const x = 1;")],
      deps({ readFileLines: () => lines }),
    );

    expect(result?.verdict).toBe("wrong-line");
    expect(result?.foundLine).toBe(10);
    expect(result?.detail).toContain("line 10");
  });

  it("names the exact line when a nearer line inside the window merely contains the quote", () => {
    // Edge shape 2 (design Decision 2). Both lines are inside the window, the
    // substring line is nearer, and the verdict stays `drift` — but the number
    // is the exact line, not whichever the old scan reached first.
    const lines = [
      "// 1",
      "const x = 1; // trailing note",
      "// 3",
      "const x = 1;",
    ];
    const [result] = checkClaims(
      [presence("src/app.ts", 1, "const x = 1;")],
      deps({ readFileLines: () => lines }),
    );

    expect(result?.verdict).toBe("drift");
    expect(result?.foundLine).toBe(4);
    expect(result?.detail).toContain("line 4");
  });

  it("is absent on the stamped path — a drifted stamped anchor is stale, with no line", () => {
    const atRev = ["export function retry() {", "  const attempts = 5;", "}"];
    const current = ["// header", ...atRev];
    const claim: Claim = {
      kind: "presence",
      path: "src/app.ts",
      line: 2,
      text: "  const attempts = 5;",
      rev: "a1b2c3d",
      source: { doc: "design.md", line: 1 },
    };
    const [result] = checkClaims([claim], {
      readFileLines: () => current,
      readFileAtRev: () => ({ status: "ok", lines: atRev }),
      runSearch: () => ({ ok: true, count: 0 }),
    });

    expect(result?.verdict).toBe("stale");
    expect(result).not.toHaveProperty("foundLine");
  });
});
