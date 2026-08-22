import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { checkWiring, type WiringVerdict } from "./wiring";
import { fsWiringDeps, looseCandidates, scanHarnessRoot } from "./wiringScan";
import type { Located } from "./frontmatter";

/**
 * Writes `content` as `plugin/hooks/hooks.json` under a fresh temp root,
 * scans it, and returns the resolved `hooks` array for that artifact —
 * cleaning up the temp root whether the scan throws or not.
 */
function scanHooksFile(content: string): Located[] {
  const root = mkdtempSync(join(tmpdir(), "wiring-scan-"));
  try {
    mkdirSync(join(root, "plugin", "hooks"), { recursive: true });
    writeFileSync(join(root, "plugin", "hooks", "hooks.json"), content);

    const artifacts = scanHarnessRoot(root);
    const hooksArtifact = artifacts.find((artifact) => artifact.kind === "hooks");
    return hooksArtifact?.hooks ?? [];
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

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

  it("resolves the same hooks whether the file is minified or pretty-printed", () => {
    const hooksObj = {
      hooks: {
        Stop: [{ hooks: [{ type: "command", command: "node ${CLAUDE_PLUGIN_ROOT}/hooks/check.sh" }] }],
      },
    };

    const pretty = scanHooksFile(JSON.stringify(hooksObj, null, 2));
    const minified = scanHooksFile(JSON.stringify(hooksObj));

    expect(minified.map((hook) => hook.value)).toEqual(["plugin/hooks/check.sh"]);
    expect(minified.map((hook) => hook.value)).toEqual(pretty.map((hook) => hook.value));
  });

  it("resolves two command entries condensed onto a single line", () => {
    const content = [
      "{",
      '  "hooks": {',
      '    "Stop": [',
      "      {",
      '        "hooks": [',
      '          { "command": "node ${CLAUDE_PLUGIN_ROOT}/hooks/check.sh" }, { "command": "node ${CLAUDE_PLUGIN_ROOT}/hooks/other.sh" }',
      "        ]",
      "      }",
      "    ]",
      "  }",
      "}",
    ].join("\n");

    const hooks = scanHooksFile(content);

    expect(hooks.map((hook) => hook.value).sort()).toEqual([
      "plugin/hooks/check.sh",
      "plugin/hooks/other.sh",
    ]);
  });

  it("finds a command nested at hooks.PreToolUse[].hooks[].command depth", () => {
    const content = JSON.stringify(
      {
        hooks: {
          PreToolUse: [
            {
              matcher: "ExitPlanMode",
              hooks: [{ type: "command", command: '"${CLAUDE_PLUGIN_ROOT}/hooks/check-plan.sh"' }],
            },
          ],
        },
      },
      null,
      2,
    );

    const hooks = scanHooksFile(content);

    expect(hooks.map((hook) => hook.value)).toEqual(["plugin/hooks/check-plan.sh"]);
  });

  it("attributes a sensible line number for the normal pretty-printed case", () => {
    const content = JSON.stringify(
      { hooks: { Stop: [{ hooks: [{ type: "command", command: "node ${CLAUDE_PLUGIN_ROOT}/hooks/check.sh" }] }] } },
      null,
      2,
    );
    const lines = content.split("\n");
    const expectedLine = lines.findIndex((line) => line.includes("check.sh")) + 1;

    const hooks = scanHooksFile(content);

    expect(expectedLine).toBeGreaterThan(1);
    expect(hooks).toEqual([{ value: "plugin/hooks/check.sh", line: expectedLine }]);
  });

  it("returns no hooks for a file that fails to parse, instead of throwing", () => {
    expect(() => scanHooksFile("{ this is not json")).not.toThrow();
    expect(scanHooksFile("{ this is not json")).toEqual([]);
  });
});

// fileURLToPath, not URL.pathname: the latter is a URL component, and on a
// path containing a space or a drive letter it is not a filesystem path.
const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));

describe("fixtures", () => {
  it("the valid fixture has no findings at all", () => {
    const root = `${REPO_ROOT}spec/fixtures/wiring-valid`;
    const report = checkWiring(scanHarnessRoot(root), fsWiringDeps(root));
    expect(report.findings).toEqual([]);
  });

  it("the broken fixture trips every hard verdict", () => {
    const root = `${REPO_ROOT}spec/fixtures/wiring-broken`;
    const report = checkWiring(scanHarnessRoot(root), fsWiringDeps(root));
    const seen = new Set<WiringVerdict>(report.findings.map((finding) => finding.verdict));

    expect(seen).toEqual(
      new Set<WiringVerdict>([
        "dangling-agent",
        "dangling-skill",
        "missing-path",
        "empty-glob",
        "dead-hook",
        "unsubstituted-token",
        "loose-reference",
      ]),
    );
  });
});
