import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { detectOracleCandidates } from "./detectOracle";

function scratch(): string {
  return mkdtempSync(join(tmpdir(), "nullius-detect-oracle-"));
}

describe("detectOracleCandidates — proposes, never infers a default", () => {
  it("proposes a vitest glob when vitest.config.ts is present", () => {
    const root = scratch();
    writeFileSync(join(root, "vitest.config.ts"), "export default {}");

    const candidates = detectOracleCandidates(root);

    expect(candidates).toContainEqual({
      glob: "**/*.test.ts",
      reason: "vitest.config.ts present",
    });
  });

  it("proposes a jest glob when jest.config.js is present", () => {
    const root = scratch();
    writeFileSync(join(root, "jest.config.js"), "module.exports = {}");

    const candidates = detectOracleCandidates(root);

    expect(candidates).toContainEqual({
      glob: "**/*.test.js",
      reason: "jest.config.js present",
    });
  });

  it("proposes a pytest glob when pytest.ini is present", () => {
    const root = scratch();
    writeFileSync(join(root, "pytest.ini"), "[pytest]\n");

    const candidates = detectOracleCandidates(root);

    expect(candidates).toContainEqual({
      glob: "**/test_*.py",
      reason: "pytest.ini present",
    });
  });

  it("proposes a generic glob from a plain package.json test script", () => {
    const root = scratch();
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({ scripts: { test: "node run-tests.js" } }),
    );

    const candidates = detectOracleCandidates(root);

    expect(candidates).toContainEqual({
      glob: "**/*.test.*",
      reason: 'package.json "scripts.test" is declared (node run-tests.js)',
    });
  });

  it("does not propose from npm's own no-test-specified placeholder", () => {
    const root = scratch();
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({ scripts: { test: 'echo "Error: no test specified" && exit 1' } }),
    );

    expect(detectOracleCandidates(root)).toEqual([]);
  });

  it("skips the generic script guess when a specific framework config already matched", () => {
    const root = scratch();
    writeFileSync(join(root, "vitest.config.ts"), "export default {}");
    writeFileSync(join(root, "package.json"), JSON.stringify({ scripts: { test: "vitest run" } }));

    const candidates = detectOracleCandidates(root);

    expect(candidates).toEqual([{ glob: "**/*.test.ts", reason: "vitest.config.ts present" }]);
  });

  it("proposes nothing when no test configuration is detected", () => {
    const root = scratch();

    expect(detectOracleCandidates(root)).toEqual([]);
  });

  it("proposes multiple independent candidates for a mixed-language repo", () => {
    const root = scratch();
    writeFileSync(join(root, "vitest.config.ts"), "export default {}");
    writeFileSync(join(root, "pytest.ini"), "[pytest]\n");

    const candidates = detectOracleCandidates(root);

    expect(candidates).toHaveLength(2);
    expect(candidates.map((c) => c.glob).sort()).toEqual(["**/*.test.ts", "**/test_*.py"]);
  });
});
