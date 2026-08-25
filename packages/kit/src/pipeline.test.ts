import { describe, expect, it } from "vitest";

import { classifyCompareStatus, isSafeChangeName, parseDependsOn, KERNEL_MODULES, routeAgents, touchedPaths } from "./pipeline";

describe("parseDependsOn — the blockquote intent-to-proposal writes", () => {
  it("extracts backticked change names", () => {
    const doc = "# Proposal\n\n> **Depends on:** `add-rules-compliance`, `add-probe-visibility` — one line each.\n";
    expect(parseDependsOn(doc)).toEqual(["add-rules-compliance", "add-probe-visibility"]);
  });

  it("reads None as no dependencies", () => {
    expect(parseDependsOn("> **Depends on:** None\n")).toEqual([]);
  });

  it("does not lose a dependency whose name contains a word boundary hit", () => {
    // Hyphens are word boundaries, so a `\bnone\b` guard applied to the whole
    // segment swallows this dependency — failing open on a fail-closed gate.
    expect(parseDependsOn("> **Depends on:** `add-none-checking`")).toEqual(["add-none-checking"]);
  });

  it("does not mistake the template's trailing prose for a dependency", () => {
    // The template sentence contains the word None *after* the em-dash. A
    // parser that scans the whole line returns [] for a real dependency list.
    const doc = '> **Depends on:** `add-journal-sealing` — write "None" if there are no hard prerequisites.\n';
    expect(parseDependsOn(doc)).toEqual(["add-journal-sealing"]);
  });

  it("returns empty when the blockquote is absent", () => {
    expect(parseDependsOn("# Proposal\n\n## Problem\n")).toEqual([]);
  });
});

describe("classifyCompareStatus — MERGED is not proof of reaching main", () => {
  it("treats identical and behind as landed", () => {
    expect(classifyCompareStatus("identical")).toBe("landed");
    expect(classifyCompareStatus("behind")).toBe("landed");
  });

  it("treats ahead and diverged as orphaned", () => {
    expect(classifyCompareStatus("ahead")).toBe("orphaned");
    expect(classifyCompareStatus("diverged")).toBe("orphaned");
  });

  it("treats anything else as unknown, never as landed", () => {
    for (const value of ["", "weird", "MERGED"]) {
      expect(classifyCompareStatus(value)).toBe("unknown");
    }
  });
});

describe("isSafeChangeName — a change name reaches a filesystem path", () => {
  it("accepts ordinary change names", () => {
    expect(isSafeChangeName("add-wiring-malformed-input")).toBe(true);
  });

  it("refuses traversal and separators", () => {
    for (const value of ["../etc", "a/b", "", ".", "..", "a\0b"]) {
      expect(isSafeChangeName(value), value).toBe(false);
    }
  });
});

describe("touchedPaths — repo-relative paths a change names", () => {
  it("finds backticked source and spec paths", () => {
    const doc = "Touches `packages/claims/src/wiring.ts` and `spec/wiring.md` today.";
    expect(touchedPaths(doc)).toEqual(["packages/claims/src/wiring.ts", "spec/wiring.md"]);
  });

  it("deduplicates and sorts", () => {
    const doc = "`spec/a.md` `packages/kit/src/doctor.ts` `spec/a.md`";
    expect(touchedPaths(doc)).toEqual(["packages/kit/src/doctor.ts", "spec/a.md"]);
  });

  it("ignores prose that is not a path", () => {
    expect(touchedPaths("the `Verdict` union and `isFailure`")).toEqual([]);
  });
});

describe("routeAgents — one assertion per row, by name", () => {
  it("always dispatches rule-auditor, because rule selection is the kernel's job", () => {
    expect(routeAgents([])).toEqual(["rule-auditor"]);
  });

  it("dispatches checker-engineer for each kernel module and no others", () => {
    for (const module of KERNEL_MODULES) {
      expect(routeAgents([module]), module).toContain("checker-engineer");
    }
    expect(routeAgents(["packages/claims/src/parseClaims.ts"])).not.toContain("checker-engineer");
  });

  it("dispatches test-engineer for package sources", () => {
    expect(routeAgents(["packages/kit/src/doctor.ts"])).toContain("test-engineer");
    expect(routeAgents(["packages/claims/src/parseClaims.ts"])).toContain("test-engineer");
  });

  it("dispatches test-engineer for fixtures and workflows", () => {
    expect(routeAgents(["spec/fixtures/valid-run.jsonl"])).toContain("test-engineer");
    expect(routeAgents([".github/workflows/ci.yml"])).toContain("test-engineer");
  });

  it("dispatches architecture-reviewer for the spec family and openspec", () => {
    for (const path of ["spec/wiring.md", "CLAUDE.md", "README.md", "openspec/project.md"]) {
      expect(routeAgents([path]), path).toContain("architecture-reviewer");
    }
  });

  it("dispatches all four for a kernel change", () => {
    expect(routeAgents(["packages/claims/src/wiring.ts", "spec/wiring.md"])).toEqual([
      "architecture-reviewer",
      "checker-engineer",
      "rule-auditor",
      "test-engineer",
    ]);
  });

  it("dispatches only two for a docs-only change", () => {
    expect(routeAgents(["docs/adopting-the-pipeline.md", "openspec/project.md"])).toEqual([
      "architecture-reviewer",
      "rule-auditor",
    ]);
  });
});

describe("touchedPaths + routeAgents composed — the seam Task 5 wires", () => {
  it("dispatches architecture-reviewer for a change touching only root docs", () => {
    const doc = "This change rewrites `CLAUDE.md` and `README.md` only.";
    expect(routeAgents(touchedPaths(doc))).toEqual(["architecture-reviewer", "rule-auditor"]);
  });

  it("dispatches all four from prose naming a kernel module and a spec", () => {
    const doc = "Touches `packages/claims/src/wiring.ts` and `spec/wiring.md`.";
    expect(routeAgents(touchedPaths(doc))).toEqual([
      "architecture-reviewer",
      "checker-engineer",
      "rule-auditor",
      "test-engineer",
    ]);
  });
});
