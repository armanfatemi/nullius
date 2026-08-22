import { describe, expect, it } from "vitest";

import {
  checkWiring,
  hookTarget,
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

describe("missing-path", () => {
  it("fails a declared read path that does not exist", () => {
    const report = checkWiring(
      [artifact({ reads: [{ value: "docs/architecture/events.md", line: 5 }] })],
      deps(),
    );

    expect(report.findings[0]?.verdict).toBe("missing-path");
    expect(report.findings[0]?.subject).toBe("docs/architecture/events.md");
  });

  it("passes a declared read path that exists", () => {
    const report = checkWiring(
      [artifact({ reads: [{ value: "CLAUDE.md", line: 5 }] })],
      deps(["CLAUDE.md"]),
    );

    expect(report.findings).toEqual([]);
  });

  it("fails an unsafe declared path without touching the filesystem", () => {
    const report = checkWiring(
      [artifact({ reads: [{ value: "../../etc/passwd", line: 5 }] })],
      deps(["../../etc/passwd"]),
    );

    expect(report.findings[0]?.verdict).toBe("missing-path");
    expect(report.findings[0]?.detail).toContain("traversal");
  });
});

describe("empty-glob", () => {
  it("fails a glob that matches nothing", () => {
    const report = checkWiring(
      [artifact({ kind: "rule", globs: [{ value: "src/legacy/**/*.ts", line: 3 }] })],
      deps(),
    );

    expect(report.findings[0]?.verdict).toBe("empty-glob");
  });

  it("passes a glob with at least one match", () => {
    const report = checkWiring(
      [artifact({ kind: "rule", globs: [{ value: "src/**/*.ts", line: 3 }] })],
      deps([], { "src/**/*.ts": ["src/wiring.ts"] }),
    );

    expect(report.findings).toEqual([]);
  });
});

describe("loose-reference", () => {
  it("reports an unresolvable prose path as advisory", () => {
    const report = checkWiring(
      [artifact({ loose: [{ value: "src/example/Thing.ts", line: 40 }] })],
      deps(),
    );

    expect(report.findings[0]?.verdict).toBe("loose-reference");
    expect(isWiringFailure(report.findings[0]!.verdict)).toBe(false);
  });

  it("does not count prose references as declared references", () => {
    const report = checkWiring(
      [artifact({ loose: [{ value: "src/example/Thing.ts", line: 40 }] })],
      deps(),
    );

    expect(report.references).toBe(0);
  });
});

describe("hookTarget", () => {
  it("expands the plugin root and strips quotes", () => {
    expect(hookTarget('"${CLAUDE_PLUGIN_ROOT}/hooks/check-plan.sh"', "plugin")).toBe(
      "plugin/hooks/check-plan.sh",
    );
  });

  it("takes the first path-shaped token of a command line", () => {
    expect(hookTarget("node packages/kit/dist/cli.js witness record", "plugin")).toBe(
      "packages/kit/dist/cli.js",
    );
  });

  it("returns null for a bare command with no path", () => {
    expect(hookTarget("echo hello", "plugin")).toBeNull();
  });

  it("returns null for an absolute path, which is not ours to judge", () => {
    expect(hookTarget("/usr/local/bin/thing", "plugin")).toBeNull();
  });

  it("resolves a quoted path containing a space whole", () => {
    expect(hookTarget('"plugin/hooks/my hook.sh"', "plugin")).toBe(
      "plugin/hooks/my hook.sh",
    );
  });

  it("does not mistake a loader flag argument for the script", () => {
    expect(hookTarget("node --require dotenv/config packages/kit/dist/cli.js", "plugin")).toBe(
      "packages/kit/dist/cli.js",
    );
  });

  it("does not mistake a scoped package name for the script", () => {
    expect(hookTarget("npx --yes @myorg/mytool packages/kit/dist/cli.js", "plugin")).toBe(
      "packages/kit/dist/cli.js",
    );
  });

  it("skips an absolute interpreter and continues the search", () => {
    expect(hookTarget("/usr/bin/env node hooks/run.js", "plugin")).toBe(
      "hooks/run.js",
    );
  });

  it("returns null for an extensionless script — a deliberate coverage gap", () => {
    expect(hookTarget("plugin/hooks/checkplan", "plugin")).toBeNull();
  });

  it("refuses a flag=value argument even if it ends in an extension", () => {
    expect(hookTarget("node --loader=./loader.mjs packages/kit/dist/cli.js", "plugin")).toBe(
      "packages/kit/dist/cli.js",
    );
  });

  it("declines when two candidates are found — ambiguous command, not a bug", () => {
    expect(hookTarget("node --experimental-loader ./register.mjs packages/kit/dist/cli.js", "plugin")).toBeNull();
  });

  it("does not search past multiple candidates to find the real script", () => {
    expect(hookTarget("/usr/bin/env node --require packages/kit/dist/setup.js packages/kit/hooks/run.js", "plugin")).toBeNull();
  });

  it("refuses a URL token, which is not a repo path", () => {
    expect(hookTarget("curl -o data.json https://example.com/hooks/evil.sh", "plugin")).toBeNull();
  });

  it("refuses path traversal, which isSafeRepoPath rejects", () => {
    expect(hookTarget("../../etc/passwd.js", "plugin")).toBeNull();
  });
});

describe("dead-hook", () => {
  it("fails a hook whose script is missing", () => {
    const report = checkWiring(
      [artifact({ kind: "hooks", path: "plugin/hooks/hooks.json", hooks: [{ value: "plugin/hooks/gone.sh", line: 9 }] })],
      deps(),
    );

    expect(report.findings[0]?.verdict).toBe("dead-hook");
  });

  it("fails a hook whose script exists but is not executable", () => {
    const present = new Set(["plugin/hooks/check-plan.sh"]);
    const report = checkWiring(
      [artifact({ kind: "hooks", path: "plugin/hooks/hooks.json", hooks: [{ value: "plugin/hooks/check-plan.sh", line: 9 }] })],
      {
        exists: (path) => present.has(path),
        isExecutable: () => false,
        glob: () => [],
      },
    );

    expect(report.findings[0]?.verdict).toBe("dead-hook");
    expect(report.findings[0]?.detail).toContain("not executable");
  });

  it("passes a hook that exists and is executable", () => {
    const report = checkWiring(
      [artifact({ kind: "hooks", path: "plugin/hooks/hooks.json", hooks: [{ value: "plugin/hooks/check-plan.sh", line: 9 }] })],
      deps(["plugin/hooks/check-plan.sh"]),
    );

    expect(report.findings).toEqual([]);
  });
});

describe("unsubstituted-token", () => {
  it("fails a placeholder that survived a port", () => {
    const report = checkWiring(
      [artifact({ tokens: [{ value: "{{VERIFY_TEST}}", line: 22 }] })],
      deps(),
    );

    expect(report.findings[0]?.verdict).toBe("unsubstituted-token");
    expect(report.findings[0]?.subject).toBe("{{VERIFY_TEST}}");
  });
});
