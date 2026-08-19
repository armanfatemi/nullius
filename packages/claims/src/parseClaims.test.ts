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

describe("parseClaims — fence delimiters", () => {
  it("does not let a ``` inside a ~~~ block toggle the fence", () => {
    // Getting this wrong flips the rest of the document into 'asserting' mode,
    // so a quoted example becomes a claim the checker enforces.
    const claims = parseClaims(
      "doc.md",
      [
        "~~~",
        "an example block that shows a fence:",
        "```",
        "**Evidence:** `not/a/real/claim.ts:1` — `quoted example`",
        "~~~",
        "",
        "**Evidence:** `real/file.ts:2` — `real claim`",
      ].join("\n"),
    );

    expect(claims).toHaveLength(1);
    expect(claims[0]).toMatchObject({ kind: "presence", path: "real/file.ts" });
  });

  it("treats an unterminated fence as swallowing the rest of the document", () => {
    const claims = parseClaims(
      "doc.md",
      ["```", "**Evidence:** `a.ts:1` — `example`"].join("\n"),
    );

    expect(claims).toEqual([]);
  });
});

describe("parseClaims — block form", () => {
  it("accepts a citation whose quote follows in a fenced block", () => {
    const claims = parseClaims(
      "doc.md",
      [
        "**Evidence:** `src/app.ts:12`",
        "",
        "```ts",
        "const x = compute();",
        "```",
      ].join("\n"),
    );

    expect(claims).toEqual([
      {
        kind: "presence",
        path: "src/app.ts",
        line: 12,
        text: "const x = compute();",
        source: { doc: "doc.md", line: 1 },
      },
    ]);
  });

  it("keeps further lines of the block as part of the assertion", () => {
    const claims = parseClaims(
      "doc.md",
      ["**Evidence:** `src/app.ts:12`", "```", "const a = 1;", "const b = 2;", "```"].join("\n"),
    );

    expect(claims[0]).toMatchObject({
      kind: "presence",
      text: "const a = 1;",
      extraLines: ["const b = 2;"],
    });
  });

  it("does not re-parse the block body as prose", () => {
    const claims = parseClaims(
      "doc.md",
      [
        "**Evidence:** `src/app.ts:12`",
        "```",
        "**Evidence:** `other.ts:1` — `not a separate claim`",
        "```",
      ].join("\n"),
    );

    // Asserting only the length would pass against the old parser too, which
    // produced a single `malformed` claim here — so assert the shape.
    expect(claims).toHaveLength(1);
    expect(claims[0]).toMatchObject({
      kind: "presence",
      path: "src/app.ts",
      line: 12,
      text: "**Evidence:** `other.ts:1` — `not a separate claim`",
    });
  });

  it("still reports a bare marker with no block as malformed", () => {
    const claims = parseClaims("doc.md", "**Evidence:** `src/app.ts:12`\n\nprose");
    expect(claims[0]?.kind).toBe("malformed");
  });
});

describe("parseClaims — fence length", () => {
  it("does not let ``` close a ```` block", () => {
    // CommonMark: a closer must be at least as long as its opener. The spec and
    // the plugin skill both use ````markdown blocks containing ``` fences, so
    // getting this wrong makes the repo fail its own CI on an edit.
    const claims = parseClaims(
      "doc.md",
      [
        "````markdown",
        "```",
        "**Evidence:** `not/a/claim.ts:1` — `example`",
        "````",
        "",
        "**Evidence:** `real/file.ts:2` — `real claim`",
      ].join("\n"),
    );

    expect(claims).toHaveLength(1);
    expect(claims[0]).toMatchObject({ kind: "presence", path: "real/file.ts" });
  });

  it("closes a ``` block with a longer run", () => {
    const claims = parseClaims(
      "doc.md",
      ["```", "example", "`````", "**Evidence:** `real/file.ts:2` — `real claim`"].join("\n"),
    );

    expect(claims).toHaveLength(1);
  });
});

describe("parseClaims — blank lines in a block quote", () => {
  it("keeps an interior blank line as part of the quote", () => {
    // Dropping it made the surviving lines non-consecutive in the source, so a
    // correctly copy-pasted quote was reported FABRICATED — the most
    // accusatory verdict the tool has, against an honest author.
    const claims = parseClaims(
      "doc.md",
      [
        "**Evidence:** `src/app.ts:1`",
        "```ts",
        "function a() {",
        "",
        "  return 1;",
        "```",
      ].join("\n"),
    );

    expect(claims[0]).toMatchObject({
      kind: "presence",
      text: "function a() {",
      extraLines: ["", "  return 1;"],
    });
  });

  it("trims blank padding at the edges of the block", () => {
    const claims = parseClaims(
      "doc.md",
      ["**Evidence:** `src/app.ts:1`", "```", "", "const a = 1;", "", "```"].join("\n"),
    );

    expect(claims[0]).toMatchObject({ kind: "presence", text: "const a = 1;" });
    expect((claims[0] as { extraLines?: string[] }).extraLines).toBeUndefined();
  });
});
