import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { looseCandidates, scanHarnessRoot } from "./wiringScan";

describe("looseCandidates", () => {
  it("finds a backticked repo-relative path", () => {
    expect(looseCandidates("see `src/wiring.ts` for the rules", 1)).toEqual([
      { value: "src/wiring.ts", line: 1 },
    ]);
  });

  it("counts lines from the offset it was given", () => {
    expect(looseCandidates("first\nsee `src/wiring.ts`", 10)).toEqual([
      { value: "src/wiring.ts", line: 11 },
    ]);
  });

  it("ignores prose, URLs, globs, and absolute paths", () => {
    const body = "`just words` `https://example.com/a.md` `src/**/*.ts` `/etc/passwd`";
    expect(looseCandidates(body, 1)).toEqual([]);
  });

  it("ignores a bare filename with no directory", () => {
    expect(looseCandidates("`README.md`", 1)).toEqual([]);
  });

  it("ignores a path inside a fenced block", () => {
    expect(looseCandidates("```\n`src/wiring.ts`\n```\n", 1)).toEqual([]);
  });
});

describe("scanHarnessRoot hook resolution", () => {
  it("drops a hook command hookTarget cannot resolve, instead of recording a meaningless entry", () => {
    const root = mkdtempSync(join(tmpdir(), "wiring-scan-"));
    try {
      mkdirSync(join(root, "plugin", "hooks"), { recursive: true });
      writeFileSync(
        join(root, "plugin", "hooks", "hooks.json"),
        JSON.stringify(
          {
            hooks: {
              Stop: [
                {
                  hooks: [
                    // No "/" in any token — hookTarget finds zero candidates and
                    // returns null. This must not become a hooks[] entry.
                    { type: "command", command: "echo hello" },
                    // Exactly one qualifying token — hookTarget resolves it.
                    { type: "command", command: "node ${CLAUDE_PLUGIN_ROOT}/hooks/check.sh" },
                  ],
                },
              ],
            },
          },
          null,
          2,
        ),
      );

      const artifacts = scanHarnessRoot(root);
      const hooksArtifact = artifacts.find((artifact) => artifact.kind === "hooks");

      expect(hooksArtifact?.hooks).toEqual([
        { value: "plugin/hooks/check.sh", line: expect.any(Number) },
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
