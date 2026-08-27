import { describe, expect, it } from "vitest";

import type { CheckDeps, RevRead } from "./checkClaims";
import {
  appliesToMatches,
  checkRule,
  isRuleFailure,
  parseRuleHeader,
  selectRules,
  type RuleFile,
} from "./rules";

function rule(id: string, body = ""): string {
  return `---\nid: ${id}\napplies_to:\n  - src/**/*.ts\nseverity: blocker\n---\n\n${body}`;
}

function deps(overrides: Partial<CheckDeps> = {}): CheckDeps {
  return {
    readFileLines: () => null,
    runSearch: () => ({ ok: true, count: 0 }),
    ...overrides,
  };
}

describe("parseRuleHeader", () => {
  it("parses a well-formed header", () => {
    const result = parseRuleHeader(
      "---\nid: my-rule\napplies_to:\n  - src/**/*.ts\nseverity: blocker\n---\n\nbody\n",
      ".claude/rules/my-rule.md",
    );

    expect(result).toEqual({
      verdict: "ok",
      id: "my-rule",
      appliesTo: ["src/**/*.ts"],
      severity: "blocker",
      bodyLine: 7,
    });
  });

  it("unifies a scalar applies_to into a one-element list", () => {
    const result = parseRuleHeader(
      "---\nid: my-rule\napplies_to: src/**/*.ts\nseverity: concern\n---\n",
      ".claude/rules/my-rule.md",
    );

    expect(result.verdict).toBe("ok");
    expect(result.verdict === "ok" && result.appliesTo).toEqual(["src/**/*.ts"]);
  });

  it("rejects an unknown frontmatter key", () => {
    const result = parseRuleHeader(
      "---\nid: my-rule\napplies_to:\n  - src/**/*.ts\nseverity: blocker\nnotes: nope\n---\n",
      ".claude/rules/my-rule.md",
    );

    expect(result).toMatchObject({
      verdict: "malformed-rule-header",
      detail: expect.stringContaining("unknown key 'notes'"),
    });
  });

  it("rejects a missing id", () => {
    const result = parseRuleHeader(
      "---\napplies_to:\n  - src/**/*.ts\nseverity: blocker\n---\n",
      ".claude/rules/my-rule.md",
    );

    expect(result).toMatchObject({
      verdict: "malformed-rule-header",
      detail: expect.stringContaining("missing required 'id'"),
    });
  });

  it("rejects a missing severity", () => {
    const result = parseRuleHeader(
      "---\nid: my-rule\napplies_to:\n  - src/**/*.ts\n---\n",
      ".claude/rules/my-rule.md",
    );

    expect(result).toMatchObject({
      verdict: "malformed-rule-header",
      detail: expect.stringContaining("missing required 'severity'"),
    });
  });

  it("rejects a severity outside the known enum", () => {
    const result = parseRuleHeader(
      "---\nid: my-rule\napplies_to:\n  - src/**/*.ts\nseverity: catastrophic\n---\n",
      ".claude/rules/my-rule.md",
    );

    expect(result).toMatchObject({
      verdict: "malformed-rule-header",
      detail: expect.stringContaining("'severity' must be one of"),
    });
  });

  it("rejects a missing applies_to", () => {
    const result = parseRuleHeader(
      "---\nid: my-rule\nseverity: blocker\n---\n",
      ".claude/rules/my-rule.md",
    );

    expect(result).toMatchObject({
      verdict: "malformed-rule-header",
      detail: expect.stringContaining("missing required 'applies_to'"),
    });
  });

  it("rejects a file with no frontmatter at all, rather than throwing", () => {
    expect(() => parseRuleHeader("# just a heading\n", ".claude/rules/my-rule.md")).not.toThrow();
    const result = parseRuleHeader("# just a heading\n", ".claude/rules/my-rule.md");
    expect(result.verdict).toBe("malformed-rule-header");
  });
});

describe("isRuleFailure", () => {
  it("treats ok, ungrounded-rule and rule-rot as passing, and malformed-rule-header as failing", () => {
    expect(isRuleFailure("ok")).toBe(false);
    expect(isRuleFailure("ungrounded-rule")).toBe(false);
    expect(isRuleFailure("rule-rot")).toBe(false);
    expect(isRuleFailure("malformed-rule-header")).toBe(true);
  });
});

describe("checkRule — ok", () => {
  it("verifies clean when every incident anchor passes", () => {
    const file: RuleFile = {
      path: ".claude/rules/clean.md",
      content: rule(
        "clean-rule",
        "## The incident\n\n**Evidence:** `src/thing.ts:3` — `export const value = 1;`\n",
      ),
    };
    const result = checkRule(
      file,
      deps({ readFileLines: (path) => (path === "src/thing.ts" ? ["a", "b", "export const value = 1;"] : null) }),
    );

    expect(result.verdict).toBe("ok");
    expect(result.id).toBe("clean-rule");
  });
});

describe("checkRule — ungrounded-rule", () => {
  it("fires when the rule body carries no Evidence Anchor at all", () => {
    const file: RuleFile = {
      path: ".claude/rules/no-anchor.md",
      content: rule("no-anchor-rule", "This rule explains itself in prose only.\n"),
    };
    const result = checkRule(file, deps());

    expect(result.verdict).toBe("ungrounded-rule");
    expect(result.anchors).toEqual([]);
  });
});

describe("checkRule — rule-rot", () => {
  it("fires when an incident anchor fails verification against the working tree", () => {
    const file: RuleFile = {
      path: ".claude/rules/rotted.md",
      content: rule(
        "rotted-rule",
        "## The incident\n\n**Evidence:** `src/thing.ts:3` — `this text is nowhere in the file`\n",
      ),
    };
    const result = checkRule(
      file,
      deps({ readFileLines: (path) => (path === "src/thing.ts" ? ["a", "b", "c"] : null) }),
    );

    expect(result.verdict).toBe("rule-rot");
  });

  // The single most load-bearing distinction in this module: `rule-rot` must
  // fire on `isFailure`, the per-claim `Verdict` predicate from
  // `checkClaims.ts` — never a bare `verdict !== "ok"`. A rev-stamped anchor
  // whose gate (the commit it names) passed, but whose text has since moved
  // in the working tree, reports `stale` — a PASSING `Verdict` — and several
  // of this repo's real rule files are in exactly that state today from
  // ordinary line drift. A naive inequality check would misreport every one
  // of them as rotted; `checkRule` must not.
  it("does NOT fire on a stale (but passing) rev-stamped anchor", () => {
    const file: RuleFile = {
      path: ".claude/rules/stale-ok.md",
      content: rule(
        "stale-ok-rule",
        "## The incident\n\n**Evidence:** `src/thing.ts:3@abc1234` — `export const value = 1;`\n",
      ),
    };
    const atRev: RevRead = { status: "ok", lines: ["a", "b", "export const value = 1;"] };
    const result = checkRule(
      file,
      deps({
        // The gate: the quote WAS there at the stamped commit.
        readFileAtRev: () => atRev,
        // The working tree has since moved on — the quote is gone entirely,
        // which checkStamped reports as "stale", a passing Verdict.
        readFileLines: (path) => (path === "src/thing.ts" ? ["a", "b", "c"] : null),
      }),
    );

    // Prove the underlying per-claim verdict really was "stale" and really
    // is passing, so this test is not vacuous.
    expect(result.anchors[0]?.verdict).toBe("stale");
    expect(result.verdict).toBe("ok");
  });
});

describe("checkRule — malformed-rule-header", () => {
  it("fires on a header with an unknown key, without evaluating any anchor", () => {
    const file: RuleFile = {
      path: ".claude/rules/bad.md",
      content:
        "---\nid: bad-rule\napplies_to:\n  - src/**/*.ts\nseverity: blocker\nnotes: nope\n---\n\n## The incident\n\n**Evidence:** `src/thing.ts:1` — `a`\n",
    };
    const result = checkRule(file, deps());

    expect(result.verdict).toBe("malformed-rule-header");
    expect(result.anchors).toEqual([]);
    expect(result.id).toBeNull();
  });
});

describe("appliesToMatches", () => {
  it("matches a literal path segment", () => {
    expect(appliesToMatches("README.md", "README.md")).toBe(true);
    expect(appliesToMatches("README.md", "OTHER.md")).toBe(false);
  });

  it("matches * within one path segment", () => {
    expect(appliesToMatches(".claude/*.json", ".claude/settings.json")).toBe(true);
    expect(appliesToMatches(".claude/*.json", ".claude/nested/settings.json")).toBe(false);
  });

  it("matches ** across zero segments — packages/*/src/**/*.ts matches packages/claims/src/cli.ts", () => {
    expect(appliesToMatches("packages/*/src/**/*.ts", "packages/claims/src/cli.ts")).toBe(true);
  });

  it("matches ** across several segments too", () => {
    expect(
      appliesToMatches("packages/*/src/**/*.ts", "packages/claims/src/deep/nested/cli.ts"),
    ).toBe(true);
  });

  it("does not match when a literal segment differs", () => {
    expect(appliesToMatches("packages/*/src/**/*.ts", "apps/claims/src/cli.ts")).toBe(false);
  });

  it("rejects a traversing candidate path without matching", () => {
    expect(appliesToMatches("**/*.md", "../../etc/passwd.md")).toBe(false);
  });

  it("rejects a traversing pattern without matching", () => {
    expect(appliesToMatches("../../etc/**", "etc/passwd")).toBe(false);
  });
});

describe("selectRules", () => {
  function file(id: string, appliesTo: string): RuleFile {
    return {
      path: `.claude/rules/${id}.md`,
      content: `---\nid: ${id}\napplies_to:\n  - ${appliesTo}\nseverity: blocker\n---\n`,
    };
  }

  it("selects only rules whose applies_to matches a given path, in id-sorted order", () => {
    const files = [
      file("zeta-graphql", "src/graphql/**"),
      file("alpha-graphql", "src/graphql/**"),
      file("infra", "infra/**"),
    ];

    const result = selectRules(files, ["src/graphql/schema.ts"]);

    expect(result.selected).toEqual([
      { id: "alpha-graphql", path: ".claude/rules/alpha-graphql.md" },
      { id: "zeta-graphql", path: ".claude/rules/zeta-graphql.md" },
    ]);
    expect(result.excludedCount).toBe(1);
  });

  it("excludes a rule with a malformed header, folded into the excluded count", () => {
    const files = [
      file("good", "src/**"),
      {
        path: ".claude/rules/bad.md",
        content: "---\nid: bad\napplies_to:\n  - src/**\nseverity: blocker\nnotes: nope\n---\n",
      },
    ];

    const result = selectRules(files, ["src/thing.ts"]);

    expect(result.selected).toEqual([{ id: "good", path: ".claude/rules/good.md" }]);
    expect(result.excludedCount).toBe(1);
  });

  it("counts a rule that matches no given path as excluded, never silently dropped", () => {
    const files = [file("only-graphql", "src/graphql/**")];

    const result = selectRules(files, ["src/infra/deploy.ts"]);

    expect(result.selected).toEqual([]);
    expect(result.excludedCount).toBe(1);
  });
});
