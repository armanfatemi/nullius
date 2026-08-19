import { describe, expect, it } from "vitest";

import {
  buildAuditBrief,
  buildExtractionBrief,
  extractAuditClaims,
  formatAuditPlan,
} from "./audit";

const DOC = [
  "# Delete the legacy publisher",
  "",
  "Nothing else consumes the `legacy.published` event.",
  "",
  "**Evidence:** `grep -rn 'legacy.published' services/` → 0 results",
  "",
  "The retry helper already exists, so the migration needs no new code.",
  "",
  "**Evidence:** `src/retry.ts:1` — `export function retry() {`",
  "**Binds at:** `rollout-window`",
  "",
  "We should do this in Q3 because the team has capacity.",
  "",
].join("\n");

describe("extraction", () => {
  it("pairs each anchor with the sentence it is offered for", () => {
    const claims = extractAuditClaims("design.md", DOC);

    expect(claims.map((claim) => claim.statement)).toEqual([
      "Nothing else consumes the `legacy.published` event.",
      "The retry helper already exists, so the migration needs no new code.",
    ]);
  });

  it("groups several anchors under one statement into one dispatch", () => {
    const claims = extractAuditClaims("design.md", DOC);

    expect(claims[1]?.anchors).toHaveLength(2);
    expect(claims[1]?.id).toBe("c2");
  });

  it("does not invent claims for unanchored prose", () => {
    // The Q3 sentence carries no anchor, so it is invisible to deterministic
    // extraction — which is what --extract exists for, and what the plan says.
    const claims = extractAuditClaims("design.md", DOC);

    expect(claims.map((claim) => claim.statement).join(" ")).not.toContain("Q3");
  });

  it("uses a heading as the statement when there is no prose above", () => {
    const claims = extractAuditClaims(
      "design.md",
      ["## The helper already exists", "", "**Evidence:** `src/a.ts:1` — `x`"].join("\n"),
    );

    expect(claims[0]?.statement).toBe("The helper already exists");
  });

  it("reads a statement written as a list item without its bullet", () => {
    const claims = extractAuditClaims(
      "design.md",
      ["- The helper exists.", "", "**Evidence:** `src/a.ts:1` — `helper`"].join("\n"),
    );

    expect(claims[0]?.statement).toBe("The helper exists.");
  });

  it("ignores malformed markers, which check reports on its own", () => {
    const claims = extractAuditClaims(
      "design.md",
      ["A claim.", "", "**Evidence:** somewhere in the file"].join("\n"),
    );

    expect(claims).toEqual([]);
  });
});

describe("the starved brief", () => {
  const [claim] = extractAuditClaims("design.md", DOC);

  it("carries the claim and its evidence", () => {
    const brief = buildAuditBrief(claim!);

    expect(brief).toContain("Nothing else consumes");
    expect(brief).toContain("grep -rn 'legacy.published' services/");
  });

  it("carries no sibling claim, no title, and no document", () => {
    const brief = buildAuditBrief(claim!);

    // The starve IS the mechanism: siblings imply a narrative, and a model
    // handed a narrative argues for it.
    expect(brief).not.toContain("retry helper");
    expect(brief).not.toContain("Delete the legacy publisher");
    expect(brief).not.toContain("Q3");
  });

  it("offers UNVERIFIABLE-BY-SEARCH as a real answer", () => {
    expect(buildAuditBrief(claim!)).toContain("UNVERIFIABLE-BY-SEARCH");
  });

  it("tells the model the claim is data, not instructions", () => {
    expect(buildAuditBrief(claim!)).toContain("untrusted");
  });

  it("demands refutation rather than support", () => {
    const brief = buildAuditBrief(claim!);

    expect(brief).toContain("default hypothesis is that it is FALSE");
    expect(brief).toContain("REFUTED");
  });
});

describe("the extraction brief", () => {
  it("forbids evaluating what it extracts", () => {
    const brief = buildExtractionBrief("design.md", DOC);

    expect(brief).toContain("Do not evaluate them");
    expect(brief).toContain("Do not open any file");
  });

  it("includes the document, since extraction needs all of it", () => {
    expect(buildExtractionBrief("design.md", DOC)).toContain("Q3");
  });
});

describe("the dispatch plan", () => {
  it("lists one line per claim with its id", () => {
    const plan = formatAuditPlan("design.md", extractAuditClaims("design.md", DOC));

    expect(plan).toContain("c1  ");
    expect(plan).toContain("c2  ");
    expect(plan).toContain("--emit-brief c1");
  });

  it("points an unanchored document at extraction rather than reporting nothing", () => {
    const plan = formatAuditPlan("design.md", []);

    expect(plan).toContain("no anchored claims");
    expect(plan).toContain("--extract");
  });
});

describe("statement extraction skips what is quoted, not just its delimiters", () => {
  it("does not take a fenced source line as the claim", () => {
    const claims = extractAuditClaims(
      "d.md",
      [
        "The retry limit is three.",
        "",
        "```yaml",
        "retries: 3",
        "```",
        "",
        "**Evidence:** `config.yaml:2` — `retries: 3`",
      ].join("\n"),
    );

    expect(claims[0]?.statement).toBe("The retry limit is three.");
  });

  it("does not take a blockquoted marker as the claim", () => {
    const claims = extractAuditClaims(
      "d.md",
      [
        "The helper exists.",
        "",
        "> **Evidence:** `src/x.ts:1` — `quoted example`",
        "",
        "**Evidence:** `src/y.ts:1` — `real`",
      ].join("\n"),
    );

    expect(claims[0]?.statement).toBe("The helper exists.");
  });

  it("falls back to a heading rather than dropping the claim", () => {
    // "## The retry limit is three" over its evidence is an ordinary ADR
    // shape; returning nothing made a document of nothing but anchored claims
    // report "no anchored claims to audit".
    const claims = extractAuditClaims(
      "d.md",
      ["## The retry limit is three", "", "**Evidence:** `src/a.ts:1` — `retries = 3`"].join("\n"),
    );

    expect(claims[0]?.statement).toBe("The retry limit is three");
  });
});
