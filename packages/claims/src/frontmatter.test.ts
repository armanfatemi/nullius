import { describe, expect, it } from "vitest";

import { declaredList, hasUnclosedFrontmatter, parseFrontmatter } from "./frontmatter";

describe("parseFrontmatter", () => {
  it("returns null when the file has no fence on line 1", () => {
    expect(parseFrontmatter("# Just a heading\n")).toBeNull();
  });

  it("reads a scalar and its line", () => {
    const front = parseFrontmatter("---\nname: rule-auditor\n---\nbody\n");
    expect(front?.scalars.get("name")).toEqual({ value: "rule-auditor", line: 2 });
  });

  it("reads a block list, one line per item", () => {
    const front = parseFrontmatter(
      "---\ndispatches:\n  - rule-auditor\n  - retro-writer\n---\n",
    );
    expect(front?.lists.get("dispatches")).toEqual([
      { value: "rule-auditor", line: 3 },
      { value: "retro-writer", line: 4 },
    ]);
  });

  it("reads an inline flow list, all items on the declaring line", () => {
    const front = parseFrontmatter("---\ndispatches: [a-agent, b-agent]\n---\n");
    expect(front?.lists.get("dispatches")).toEqual([
      { value: "a-agent", line: 2 },
      { value: "b-agent", line: 2 },
    ]);
  });

  it("strips matching quotes from scalars and list items", () => {
    const front = parseFrontmatter("---\nreads: \"CLAUDE.md\"\n---\n");
    expect(front?.scalars.get("reads")?.value).toBe("CLAUDE.md");
  });

  it("reports where the body starts", () => {
    const front = parseFrontmatter("---\nname: x\n---\nfirst body line\n");
    expect(front?.bodyLine).toBe(4);
  });

  it("returns null when the fence is never closed", () => {
    expect(parseFrontmatter("---\nname: x\nno closing fence\n")).toBeNull();
  });
});

describe("hasUnclosedFrontmatter", () => {
  it("returns true when the fence opens and never closes", () => {
    expect(hasUnclosedFrontmatter("---\nname: x\nno closing fence\n")).toBe(true);
  });

  it("returns false when there is no frontmatter at all", () => {
    expect(hasUnclosedFrontmatter("# Just a heading\n")).toBe(false);
  });

  it("returns false when the fence closes normally", () => {
    expect(hasUnclosedFrontmatter("---\nname: x\n---\nbody\n")).toBe(false);
  });
});

describe("declaredList", () => {
  it("reads a block list through declaredList", () => {
    const front = parseFrontmatter(
      "---\ndispatches:\n  - rule-auditor\n  - retro-writer\n---\n",
    );
    expect(declaredList(front, "dispatches")).toEqual([
      { value: "rule-auditor", line: 3 },
      { value: "retro-writer", line: 4 },
    ]);
  });

  it("reads an inline flow list through declaredList", () => {
    const front = parseFrontmatter("---\ndispatches: [a-agent, b-agent]\n---\n");
    expect(declaredList(front, "dispatches")).toEqual([
      { value: "a-agent", line: 2 },
      { value: "b-agent", line: 2 },
    ]);
  });

  it("reads a bare scalar as a single-item list through declaredList", () => {
    const front = parseFrontmatter("---\ndispatches: rule-auditor\n---\n");
    expect(declaredList(front, "dispatches")).toEqual([
      { value: "rule-auditor", line: 2 },
    ]);
  });

  it("returns an empty array for an absent key", () => {
    const front = parseFrontmatter("---\nname: x\n---\n");
    expect(declaredList(front, "dispatches")).toEqual([]);
  });

  it("returns an empty array for null frontmatter", () => {
    expect(declaredList(null, "dispatches")).toEqual([]);
  });
});
