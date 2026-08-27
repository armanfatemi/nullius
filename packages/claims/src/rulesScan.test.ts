import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { fileLinesReader, revFileReader, searchRunner } from "./runners";
import { checkRule, isRuleFailure, selectRules, type RuleCheckResult } from "./rules";
import { scanRules } from "./rulesScan";

// fileURLToPath, not URL.pathname: the latter is a URL component, and on a
// path containing a space or a drive letter it is not a filesystem path.
const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));

function checkFixture(root: string): RuleCheckResult[] {
  const deps = {
    readFileLines: fileLinesReader(root),
    readFileAtRev: revFileReader(root),
    runSearch: searchRunner(root),
  };
  return scanRules(root).map((file) => checkRule(file, deps));
}

function resultFor(results: RuleCheckResult[], id: string): RuleCheckResult {
  const found = results.find((result) => result.id === id);
  if (found === undefined) {
    throw new Error(`no result for rule id '${id}' — fixture drifted from the test`);
  }
  return found;
}

describe("scanRules", () => {
  it("reads every .claude/rules/*.md file under a root, in sorted order", () => {
    const root = `${REPO_ROOT}spec/fixtures/rules-valid`;
    const files = scanRules(root);

    expect(files.map((file) => file.path)).toEqual([
      ".claude/rules/grounded.md",
      ".claude/rules/rotted.md",
      ".claude/rules/ungrounded.md",
    ]);
  });
});

// One test per RuleVerdict member, each asserting that specific verdict
// fires BY NAME against its own task-1.5 fixture — not just that a directory
// scan's exit code goes non-zero. Required by
// .claude/rules/verdict-needs-fixture-and-test.md: a fixture alone is not
// coverage.
describe("RuleVerdict — fixtures", () => {
  it("ok: the grounded fixture's incident anchor verifies clean", () => {
    const results = checkFixture(`${REPO_ROOT}spec/fixtures/rules-valid`);
    const result = resultFor(results, "grounded-example");

    expect(result.verdict).toBe("ok");
    expect(isRuleFailure(result.verdict)).toBe(false);
  });

  it("ungrounded-rule: the frozen no-anchor fixture is flagged as folklore, not failed", () => {
    const results = checkFixture(`${REPO_ROOT}spec/fixtures/rules-valid`);
    const result = resultFor(results, "ungrounded-example");

    expect(result.verdict).toBe("ungrounded-rule");
    expect(isRuleFailure(result.verdict)).toBe(false);
  });

  it("rule-rot: the rotted fixture's incident anchor fails verification, but the run still passes", () => {
    const results = checkFixture(`${REPO_ROOT}spec/fixtures/rules-valid`);
    const result = resultFor(results, "rotted-example");

    expect(result.verdict).toBe("rule-rot");
    expect(isRuleFailure(result.verdict)).toBe(false);
  });

  it("malformed-rule-header: the broken fixture's unknown key is rejected, and this is a hard failure", () => {
    const results = checkFixture(`${REPO_ROOT}spec/fixtures/rules-broken`);
    // A malformed header cannot even produce an id — checkRule reports
    // `id: null` for exactly this verdict — so this fixture is found by
    // path, not by id, unlike the three passing cases above.
    const result = results.find((entry) => entry.path === ".claude/rules/malformed.md");
    if (result === undefined) {
      throw new Error("no result for .claude/rules/malformed.md — fixture drifted from the test");
    }

    expect(result.verdict).toBe("malformed-rule-header");
    expect(result.id).toBeNull();
    expect(isRuleFailure(result.verdict)).toBe(true);
  });
});

describe("fixtures — whole-directory summary", () => {
  it("the valid fixture carries no hard failures", () => {
    const results = checkFixture(`${REPO_ROOT}spec/fixtures/rules-valid`);
    expect(results.some((result) => isRuleFailure(result.verdict))).toBe(false);
  });

  it("the broken fixture trips the hard-failing verdict", () => {
    const results = checkFixture(`${REPO_ROOT}spec/fixtures/rules-broken`);
    expect(results.some((result) => isRuleFailure(result.verdict))).toBe(true);
  });
});

describe("selectRules against the real .claude/rules/ tree", () => {
  it("selects only rules whose applies_to matches a claims-kernel path", () => {
    const files = scanRules(REPO_ROOT);
    const result = selectRules(files, ["packages/claims/src/cli.ts"]);

    const ids = result.selected.map((rule) => rule.id);
    expect(ids).toContain("build-before-cli");
    expect(ids).toContain("model-proposes-code-verifies");
    expect(ids).not.toContain("openspec-shall-first-line");
    expect(result.excludedCount).toBeGreaterThan(0);
  });
});
