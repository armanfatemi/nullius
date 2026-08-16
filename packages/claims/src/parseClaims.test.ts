import { describe, expect, it } from "vitest";

import { parseClaims } from "./parseClaims";

describe("parseClaims", () => {
  it("parses a presence citation", () => {
    const claims = parseClaims(
      "design.md",
      "**Evidence:** `k8s/base/settings/deployment.yaml:12` — `  replicas: 2`",
    );

    expect(claims).toEqual([
      {
        kind: "presence",
        path: "k8s/base/settings/deployment.yaml",
        line: 12,
        text: "  replicas: 2",
        source: { doc: "design.md", line: 1 },
      },
    ]);
  });

  it("parses an absence citation with either arrow form", () => {
    const claims = parseClaims(
      "design.md",
      [
        "**Evidence:** `grep -rn 'x' services/` → 0 results",
        "**Evidence:** `grep -rn 'y' libs/` -> 3 results",
      ].join("\n"),
    );

    expect(claims).toEqual([
      {
        kind: "absence",
        command: "grep -rn 'x' services/",
        expectedCount: 0,
        source: { doc: "design.md", line: 1 },
      },
      {
        kind: "absence",
        command: "grep -rn 'y' libs/",
        expectedCount: 3,
        source: { doc: "design.md", line: 2 },
      },
    ]);
  });

  it('accepts the singular "1 result"', () => {
    const claims = parseClaims(
      "design.md",
      "**Evidence:** `grep -rn 'x' services/` → 1 result",
    );

    expect(claims[0]).toMatchObject({ kind: "absence", expectedCount: 1 });
  });

  it("parses a binding moment with or without backticks", () => {
    const claims = parseClaims(
      "design.md",
      ["**Binds at:** `rollout-window`", "**Binds at:** data-at-rest"].join(
        "\n",
      ),
    );

    expect(claims).toEqual([
      {
        kind: "moment",
        moment: "rollout-window",
        source: { doc: "design.md", line: 1 },
      },
      {
        kind: "moment",
        moment: "data-at-rest",
        source: { doc: "design.md", line: 2 },
      },
    ]);
  });

  it("preserves cited text containing a backtick, via a double-backtick span", () => {
    // A single-backtick code span cannot contain a backtick in Markdown, so
    // source text with one (a TS template literal here) must be double-spanned.
    const claims = parseClaims(
      "design.md",
      "**Evidence:** `libs/x.ts:4` — ``const q = `query {}`;``",
    );

    expect(claims[0]).toMatchObject({
      kind: "presence",
      path: "libs/x.ts",
      line: 4,
      text: "const q = `query {}`;",
    });
  });

  it("does not leave delimiters in the text when the double form is used", () => {
    const claims = parseClaims(
      "design.md",
      "**Evidence:** `docs/x.md:4` — ``plain text``",
    );

    expect(claims[0]).toMatchObject({ kind: "presence", text: "plain text" });
  });

  it("still parses the ordinary single-backtick span", () => {
    const claims = parseClaims(
      "design.md",
      "**Evidence:** `docs/x.md:4` — `status: Foo! @shareable`",
    );

    expect(claims[0]).toMatchObject({
      kind: "presence",
      text: "status: Foo! @shareable",
    });
  });

  it("flags an Evidence line that matches neither citation shape", () => {
    const claims = parseClaims(
      "design.md",
      "**Evidence:** the enum is shareable, trust me",
    );

    expect(claims).toEqual([
      {
        kind: "malformed",
        raw: "**Evidence:** the enum is shareable, trust me",
        source: { doc: "design.md", line: 1 },
      },
    ]);
  });

  it("flags a presence citation missing its quoted text", () => {
    const claims = parseClaims(
      "design.md",
      "**Evidence:** `services/alert/schema.graphqls:42`",
    );

    expect(claims[0]?.kind).toBe("malformed");
  });

  it("ignores prose and unrelated bold markers", () => {
    const claims = parseClaims(
      "design.md",
      [
        "# Design",
        "The enum is used in both positions.",
        "**Chosen:** add the value.",
        "**Rationale:** it is cheap.",
      ].join("\n"),
    );

    expect(claims).toEqual([]);
  });

  it("records 1-based line numbers within the document", () => {
    const claims = parseClaims(
      "proposal.md",
      ["intro", "", "**Binds at:** `event-consumption`"].join("\n"),
    );

    expect(claims[0]?.source).toEqual({ doc: "proposal.md", line: 3 });
  });

  it("ignores citations quoted inside fenced code blocks", () => {
    // A spec or review log that QUOTES a citation as an example is not
    // asserting it — only markers outside fences are claims.
    const claims = parseClaims(
      "spec.md",
      [
        "A citation looks like this:",
        "```markdown",
        "**Evidence:** `some/fictional/file.ts:1` — `example text`",
        "**Binds at:** `rollout-window`",
        "```",
        "**Binds at:** `data-at-rest`",
      ].join("\n"),
    );

    expect(claims).toEqual([
      {
        kind: "moment",
        moment: "data-at-rest",
        source: { doc: "spec.md", line: 6 },
      },
    ]);
  });

  it("handles tilde fences and resumes parsing after the block closes", () => {
    const claims = parseClaims(
      "doc.md",
      [
        "~~~",
        "**Evidence:** `inside/fence.ts:1` — `ignored`",
        "~~~",
        "**Evidence:** `real/file.ts:2` — `counted`",
      ].join("\n"),
    );

    expect(claims).toEqual([
      {
        kind: "presence",
        path: "real/file.ts",
        line: 2,
        text: "counted",
        source: { doc: "doc.md", line: 4 },
      },
    ]);
  });
});
