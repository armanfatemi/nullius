import { describe, expect, it } from "vitest";

import {
  checkWiring,
  isWiringFailure,
  type HarnessArtifact,
  type WiringDeps,
} from "./wiring";

function artifact(over: Partial<HarnessArtifact> = {}): HarnessArtifact {
  return {
    path: ".claude/skills/demo/SKILL.md",
    kind: "skill",
    name: "demo",
    dispatches: [],
    skills: [],
    reads: [],
    globs: [],
    hooks: [],
    tokens: [],
    loose: [],
    ...over,
  };
}

/** Every path missing unless named. Tests declare only what exists. */
function deps(present: string[] = [], matches: Record<string, string[]> = {}): WiringDeps {
  const set = new Set(present);
  return {
    exists: (path) => set.has(path),
    isExecutable: (path) => set.has(path),
    glob: (pattern) => matches[pattern] ?? [],
  };
}

describe("dangling-agent", () => {
  it("fails a dispatch naming an agent with no definition file", () => {
    const report = checkWiring(
      [artifact({ dispatches: [{ value: "ghost-reviewer", line: 4 }] })],
      deps(),
    );

    expect(report.findings).toHaveLength(1);
    expect(report.findings[0]?.verdict).toBe("dangling-agent");
    expect(report.findings[0]?.subject).toBe("ghost-reviewer");
    expect(report.findings[0]?.line).toBe(4);
  });

  it("passes a dispatch whose agent file exists", () => {
    const report = checkWiring(
      [artifact({ dispatches: [{ value: "rule-auditor", line: 4 }] })],
      deps([".claude/agents/rule-auditor.md"]),
    );

    expect(report.findings).toEqual([]);
    expect(report.references).toBe(1);
  });
});

describe("dangling-skill", () => {
  it("fails a reference to a skill with no SKILL.md", () => {
    const report = checkWiring(
      [artifact({ skills: [{ value: "retro-rollup", line: 7 }] })],
      deps(),
    );

    expect(report.findings[0]?.verdict).toBe("dangling-skill");
  });

  it("passes a reference whose skill directory exists", () => {
    const report = checkWiring(
      [artifact({ skills: [{ value: "retro-rollup", line: 7 }] })],
      deps([".claude/skills/retro-rollup/SKILL.md"]),
    );

    expect(report.findings).toEqual([]);
  });
});

describe("isWiringFailure", () => {
  it("treats loose-reference as advisory and the rest as failures", () => {
    expect(isWiringFailure("loose-reference")).toBe(false);
    expect(isWiringFailure("ok")).toBe(false);
    expect(isWiringFailure("dangling-agent")).toBe(true);
    expect(isWiringFailure("dead-hook")).toBe(true);
  });
});
