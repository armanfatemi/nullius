import { describe, expect, it } from "vitest";

import {
  checkRuleCoverage,
  isRuleCoverageFailure,
  type RuleCoverageVerdict,
} from "./ruleCoverage";
import { TERMINAL_RECORD_KINDS } from "./witness";

function journal(...records: object[]): string {
  return records.map((record) => JSON.stringify(record)).join("\n");
}

const COVERED_REPORT = {
  kind: "report",
  id: "r1",
  dispatch: "d1",
  outcome: "found",
  findings: ["Read the rule. COMPLIANT — the anchor matches the cited line."],
};

describe("checkRuleCoverage — full coverage produces no findings", () => {
  it("reports nothing when every expected rule has a dispatch-with-terminal", () => {
    const content = journal(
      { kind: "dispatch", id: "d1", task: "build-before-cli" },
      COVERED_REPORT,
    );

    expect(checkRuleCoverage(content, ["build-before-cli"])).toEqual([]);
  });

  it("recognizes VIOLATION as a delivered verdict too", () => {
    const content = journal(
      { kind: "dispatch", id: "d1", task: "merge-never-squash" },
      { kind: "report", id: "r1", dispatch: "d1", outcome: "found", findings: ["VIOLATION — squashed anyway."] },
    );

    expect(checkRuleCoverage(content, ["merge-never-squash"])).toEqual([]);
  });

  it("recognizes NOT-APPLICABLE as a delivered verdict too", () => {
    const content = journal(
      { kind: "dispatch", id: "d1", task: "openspec-shall-first-line" },
      {
        kind: "report",
        id: "r1",
        dispatch: "d1",
        outcome: "found",
        findings: ["NOT-APPLICABLE — this change touches no OpenSpec requirement."],
      },
    );

    expect(checkRuleCoverage(content, ["openspec-shall-first-line"])).toEqual([]);
  });
});

describe("checkRuleCoverage — task 4.1: silent-rule fires by name", () => {
  it("(a) fires for a rule id with no matching dispatch at all", () => {
    const content = journal(
      { kind: "dispatch", id: "d1", task: "some-other-rule" },
      COVERED_REPORT,
    );

    const findings = checkRuleCoverage(content, ["build-before-cli"]);

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      ruleId: "build-before-cli",
      verdict: "silent-rule",
    });
  });

  it("(b) fires for a rule id whose dispatch exists but has no terminal record", () => {
    const content = journal({ kind: "dispatch", id: "d1", task: "build-before-cli" });

    const findings = checkRuleCoverage(content, ["build-before-cli"]);

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      ruleId: "build-before-cli",
      verdict: "silent-rule",
    });
  });

  it("reports ok (no finding) when every expected id has a dispatch-with-terminal", () => {
    const content = journal(
      { kind: "dispatch", id: "d1", task: "build-before-cli" },
      { kind: "dispatch", id: "d2", task: "merge-never-squash" },
      { ...COVERED_REPORT, id: "r1", dispatch: "d1" },
      { ...COVERED_REPORT, id: "r2", dispatch: "d2" },
    );

    expect(checkRuleCoverage(content, ["build-before-cli", "merge-never-squash"])).toEqual([]);
  });
});

describe("checkRuleCoverage — Decision 5: a terminal's mere existence is not enough", () => {
  it("fires silent-rule when the terminal outcome is 'no-report', even though a terminal exists", () => {
    const content = journal(
      { kind: "dispatch", id: "d1", task: "build-before-cli" },
      {
        kind: "report",
        id: "r1",
        dispatch: "d1",
        outcome: "no-report",
        statement: "agent exited before answering",
      },
    );

    const findings = checkRuleCoverage(content, ["build-before-cli"]);

    expect(findings).toHaveLength(1);
    expect(findings[0]?.verdict).toBe("silent-rule");
  });

  it("fires silent-rule when the terminal outcome is 'empty', even though a terminal exists", () => {
    const content = journal(
      { kind: "dispatch", id: "d1", task: "build-before-cli" },
      { kind: "report", id: "r1", dispatch: "d1", outcome: "empty", statement: "None." },
    );

    const findings = checkRuleCoverage(content, ["build-before-cli"]);

    expect(findings).toHaveLength(1);
    expect(findings[0]?.verdict).toBe("silent-rule");
  });

  it("fires silent-rule when outcome is 'found' but the excerpt carries none of the three verdict strings", () => {
    const content = journal(
      { kind: "dispatch", id: "d1", task: "build-before-cli" },
      {
        kind: "report",
        id: "r1",
        dispatch: "d1",
        outcome: "found",
        findings: ["Looked at the code. Seems fine I guess."],
      },
    );

    const findings = checkRuleCoverage(content, ["build-before-cli"]);

    expect(findings).toHaveLength(1);
    expect(findings[0]?.verdict).toBe("silent-rule");
  });
});

describe("checkRuleCoverage — task 4.2: re-dispatch convention", () => {
  // Decided per design.md's open question: covered if ANY matching dispatch
  // (matched by exact task === ruleId equality) reached a delivered verdict —
  // a re-dispatch after a timeout is a legitimate recovery path, not a defect,
  // so an earlier failed attempt for the same rule id must not poison a later
  // one that succeeded.
  it("counts a rule covered if ANY matching dispatch reached a delivered verdict", () => {
    const content = journal(
      { kind: "dispatch", id: "d1", task: "build-before-cli" },
      {
        kind: "report",
        id: "r1",
        dispatch: "d1",
        outcome: "no-report",
        statement: "agent exited before answering; re-dispatched as d2",
      },
      { kind: "dispatch", id: "d2", task: "build-before-cli" },
      { ...COVERED_REPORT, id: "r2", dispatch: "d2" },
    );

    expect(checkRuleCoverage(content, ["build-before-cli"])).toEqual([]);
  });

  it("still fires silent-rule when NONE of several re-dispatches reached a delivered verdict", () => {
    const content = journal(
      { kind: "dispatch", id: "d1", task: "build-before-cli" },
      { kind: "report", id: "r1", dispatch: "d1", outcome: "empty", statement: "None." },
      { kind: "dispatch", id: "d2", task: "build-before-cli" },
    );

    const findings = checkRuleCoverage(content, ["build-before-cli"]);

    expect(findings).toHaveLength(1);
    expect(findings[0]?.verdict).toBe("silent-rule");
  });
});

describe("checkRuleCoverage — task 4.3: coupled to witness.ts's real TERMINAL_RECORD_KINDS", () => {
  // Imported, not re-hardcoded: this loop uses the real exported constant, so
  // it stays coupled to what witness.ts actually treats as terminal rather
  // than pinning checkRuleCoverage's own guess about it.
  it("recognizes every kind in TERMINAL_RECORD_KINDS as a terminal", () => {
    expect(TERMINAL_RECORD_KINDS.length).toBeGreaterThan(0);

    for (const kind of TERMINAL_RECORD_KINDS) {
      const content = journal(
        { kind: "dispatch", id: "d1", task: "build-before-cli" },
        { kind, id: "r1", dispatch: "d1", outcome: "found", findings: ["COMPLIANT."] },
      );

      expect(checkRuleCoverage(content, ["build-before-cli"])).toEqual([]);
    }
  });

  it("does not treat an unrelated record kind as a terminal", () => {
    const content = journal(
      { kind: "dispatch", id: "d1", task: "build-before-cli" },
      {
        kind: "verification",
        id: "v1",
        dispatch: "d1",
        outcome: "found",
        findings: ["COMPLIANT."],
        target: { path: "x.ts", hash: "aaaa" },
      },
    );

    const findings = checkRuleCoverage(content, ["build-before-cli"]);

    expect(findings).toHaveLength(1);
    expect(findings[0]?.verdict).toBe("silent-rule");
  });
});

describe("checkRuleCoverage — task 4.4: two independent scanners over the same file", () => {
  // A malformed record (bad JSON or a missing id) must not be silently
  // treated as a valid dispatch/terminal — it is skipped by this scan, the
  // same as it would be excluded from validateJournal's own successful reads.
  // (Documenting the choice per task 4.4: skipped, not turned into its own
  // finding — RuleCoverageVerdict has no member for "malformed record", and
  // validateJournal already reports MALFORMED for the same line separately.)
  it("does not let a bad-JSON report line accidentally satisfy coverage", () => {
    const content = [
      JSON.stringify({ kind: "dispatch", id: "d1", task: "build-before-cli" }),
      '{"kind":"report","id":"r1","dispatch":"d1","outcome":"found","findings":["COMPLIANT"',
    ].join("\n");

    const findings = checkRuleCoverage(content, ["build-before-cli"]);

    expect(findings).toHaveLength(1);
    expect(findings[0]?.verdict).toBe("silent-rule");
  });

  it("does not treat a dispatch record with no id as a valid dispatch", () => {
    const content = journal({ kind: "dispatch", task: "build-before-cli" });

    const findings = checkRuleCoverage(content, ["build-before-cli"]);

    expect(findings).toHaveLength(1);
    expect(findings[0]?.verdict).toBe("silent-rule");
  });

  it("does not treat a report record missing its dispatch reference as covering anything", () => {
    const content = journal(
      { kind: "dispatch", id: "d1", task: "build-before-cli" },
      { kind: "report", id: "r1", outcome: "found", findings: ["COMPLIANT"] },
    );

    const findings = checkRuleCoverage(content, ["build-before-cli"]);

    expect(findings).toHaveLength(1);
    expect(findings[0]?.verdict).toBe("silent-rule");
  });
});

describe("checkRuleCoverage — task 4.5: EXCERPT_LIMIT / near-top-of-excerpt assumption", () => {
  it("recognizes a verdict string near the top of the excerpt, matching buildComplianceBrief's template", () => {
    const preamble =
      "Read .claude/rules/build-before-cli.md and the cited file. ";
    const excerpt = `${preamble}COMPLIANT — the cited line matches the working tree.` +
      " ".repeat(10) +
      "additional padding prose that follows the verdict line ".repeat(20);

    expect(excerpt.indexOf("COMPLIANT")).toBeLessThan(500);

    const content = journal(
      { kind: "dispatch", id: "d1", task: "build-before-cli" },
      { kind: "report", id: "r1", dispatch: "d1", outcome: "found", findings: [excerpt] },
    );

    expect(checkRuleCoverage(content, ["build-before-cli"])).toEqual([]);
  });
});

describe("isRuleCoverageFailure", () => {
  it("treats silent-rule as a failure and ok as passing", () => {
    expect(isRuleCoverageFailure("silent-rule" satisfies RuleCoverageVerdict)).toBe(true);
    expect(isRuleCoverageFailure("ok" satisfies RuleCoverageVerdict)).toBe(false);
  });
});

describe("checkRuleCoverage — findings carry no line field", () => {
  it("shape is { ruleId, verdict, detail } — no line, unlike JournalFinding", () => {
    const content = journal({ kind: "dispatch", id: "d1", task: "unrelated" });

    const findings = checkRuleCoverage(content, ["build-before-cli"]);

    expect(findings[0]).not.toHaveProperty("line");
    expect(Object.keys(findings[0] ?? {}).sort()).toEqual(["detail", "ruleId", "verdict"]);
  });
});
