import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  VERSIONS,
  isJournalFailure,
  surveyJournals,
  validateJournal,
  type JournalVerdict,
} from "./witness";

// fileURLToPath, not URL.pathname: the latter is a URL component, and on a
// path containing a space it is not a filesystem path.
const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));

function fixture(name: string): string {
  return readFileSync(`${REPO_ROOT}spec/fixtures/${name}`, "utf8");
}

function journal(...records: object[]): string {
  return records.map((record) => JSON.stringify(record)).join("\n");
}

function verdicts(content: string): JournalVerdict[] {
  return validateJournal(content).findings.map((finding) => finding.verdict);
}

const DISPATCH = { kind: "dispatch", id: "d1", task: "search the consumers" };

describe("invariant 1 — three states, never two", () => {
  it("accepts a dispatch that found something", () => {
    const report = validateJournal(
      journal(DISPATCH, {
        kind: "report",
        id: "r1",
        dispatch: "d1",
        outcome: "found",
        findings: ["services/billing consumes it"],
      }),
    );

    expect(report.findings).toEqual([]);
    expect(report.outcomes).toEqual({ found: 1, empty: 0, noReport: 0 });
  });

  it("accepts an explicit empty", () => {
    const report = validateJournal(
      journal(DISPATCH, {
        kind: "report",
        id: "r1",
        dispatch: "d1",
        outcome: "empty",
        statement: "None.",
      }),
    );

    expect(report.findings).toEqual([]);
    expect(report.outcomes.empty).toBe(1);
  });

  it("fails a dispatch that never reported", () => {
    expect(verdicts(journal(DISPATCH))).toEqual(["no-terminal"]);
  });

  it("counts an explicit empty and a missing report as different results", () => {
    const report = validateJournal(
      journal(
        DISPATCH,
        { kind: "report", id: "r1", dispatch: "d1", outcome: "empty", statement: "None." },
        { kind: "dispatch", id: "d2" },
        {
          kind: "report",
          id: "r2",
          dispatch: "d2",
          outcome: "no-report",
          statement: "agent exited before answering",
        },
      ),
    );

    expect(report.findings).toEqual([]);
    expect(report.outcomes).toEqual({ found: 0, empty: 1, noReport: 1 });
  });

  it("refuses an outcome outside the three states", () => {
    expect(
      verdicts(journal(DISPATCH, { kind: "report", id: "r1", dispatch: "d1", ok: true })),
    ).toEqual(["collapsed-state"]);
  });

  it("refuses a 'found' with nothing found", () => {
    expect(
      verdicts(
        journal(DISPATCH, {
          kind: "report",
          id: "r1",
          dispatch: "d1",
          outcome: "found",
          findings: [],
        }),
      ),
    ).toEqual(["collapsed-state"]);
  });

  it("refuses a silent empty — the explicit 'None.' IS the record", () => {
    expect(
      verdicts(journal(DISPATCH, { kind: "report", id: "r1", dispatch: "d1", outcome: "empty" })),
    ).toEqual(["silent-empty"]);
  });

  it("refuses two terminal records for one dispatch", () => {
    expect(
      verdicts(
        journal(
          DISPATCH,
          { kind: "report", id: "r1", dispatch: "d1", outcome: "empty", statement: "None." },
          { kind: "report", id: "r2", dispatch: "d1", outcome: "found", findings: ["x"] },
        ),
      ),
    ).toEqual(["duplicate-terminal"]);
  });

  it("refuses a report for a dispatch that is not in the journal", () => {
    expect(
      verdicts(
        journal({ kind: "report", id: "r1", dispatch: "ghost", outcome: "empty", statement: "None." }),
      ),
    ).toEqual(["dangling-reference"]);
  });
});

describe("invariant 2 — verified once is not verified", () => {
  const verification = {
    kind: "verification",
    id: "v1",
    target: { path: "src/probe.ts", hash: "aaaa1111" },
    verdict: "safe",
  };

  it("accepts reliance while the artifact is unchanged", () => {
    expect(
      verdicts(journal(verification, { kind: "reliance", id: "c1", relies_on: "v1" })),
    ).toEqual([]);
  });

  it("fails reliance on a verification whose artifact changed since", () => {
    const report = validateJournal(
      journal(
        verification,
        { kind: "verification", id: "v2", target: { path: "src/probe.ts", hash: "bbbb2222" } },
        { kind: "reliance", id: "c1", relies_on: "v1" },
      ),
    );

    expect(report.findings.map((finding) => finding.verdict)).toEqual([
      "stale-verification",
    ]);
    expect(report.findings[0]?.detail).toContain("src/probe.ts");
  });

  it("still accepts reliance on the newer verification", () => {
    expect(
      verdicts(
        journal(
          verification,
          { kind: "verification", id: "v2", target: { path: "src/probe.ts", hash: "bbbb2222" } },
          { kind: "reliance", id: "c1", relies_on: "v2" },
        ),
      ),
    ).toEqual([]);
  });

  it("notices a change recorded by an append", () => {
    expect(
      verdicts(
        journal(
          verification,
          {
            kind: "append",
            id: "a1",
            corrections_since_last_append: "None.",
            target: { path: "src/probe.ts", hash: "cccc3333" },
          },
          { kind: "reliance", id: "c1", relies_on: "v1" },
        ),
      ),
    ).toEqual(["stale-verification"]);
  });

  it("refuses a verification that does not name what it verified", () => {
    expect(verdicts(journal({ kind: "verification", id: "v1", verdict: "safe" }))).toEqual([
      "malformed",
    ]);
  });
});

describe("invariant 3 — omission is invalid", () => {
  it("accepts an explicit 'None.'", () => {
    expect(
      verdicts(journal({ kind: "append", id: "a1", corrections_since_last_append: "None." })),
    ).toEqual([]);
  });

  it("fails an append that leaves the field out", () => {
    expect(verdicts(journal({ kind: "append", id: "a1", text: "…" }))).toEqual([
      "omitted-corrections",
    ]);
  });

  it("fails an append whose field is present but empty", () => {
    expect(
      verdicts(journal({ kind: "append", id: "a1", corrections_since_last_append: "   " })),
    ).toEqual(["omitted-corrections"]);
  });
});

describe("journal shape", () => {
  it("reports an unparseable line rather than skipping it", () => {
    const report = validateJournal("{not json}");

    expect(report.findings[0]?.verdict).toBe("malformed");
    expect(report.findings[0]?.line).toBe(1);
  });

  it("ignores blank lines", () => {
    expect(
      verdicts(
        ["", JSON.stringify({ kind: "append", id: "a1", corrections_since_last_append: "None." }), ""].join(
          "\n",
        ),
      ),
    ).toEqual([]);
  });

  it("refuses an unknown record kind", () => {
    expect(verdicts(journal({ kind: "musing", id: "m1" }))).toEqual(["malformed"]);
  });

  it("refuses a duplicate id, which would make references ambiguous", () => {
    expect(
      verdicts(journal({ kind: "dispatch", id: "d1" }, { kind: "dispatch", id: "d1" })),
      // Journal order: the dispatch on line 1 is the one left unterminated,
      // and the clashing record on line 2 is refused.
    ).toEqual(["no-terminal", "duplicate-id"]);
  });

  it("reports findings in journal order", () => {
    const report = validateJournal(
      journal(
        { kind: "append", id: "a1" },
        { kind: "append", id: "a2", corrections_since_last_append: "None." },
        { kind: "append", id: "a3" },
      ),
    );

    expect(report.findings.map((finding) => finding.line)).toEqual([1, 3]);
  });

  it("treats every verdict but ok as a failure", () => {
    expect(isJournalFailure("ok")).toBe(false);
    expect(isJournalFailure("no-terminal")).toBe(true);
    expect(isJournalFailure("stale-verification")).toBe(true);
  });
});

describe("schema version header", () => {
  const HEADER = {
    kind: "journal",
    version: "0.2",
    origin: "hooks",
    session: "sess-abc",
    source: "startup",
  };
  const TERMINAL = {
    kind: "report",
    id: "r1",
    dispatch: "d1",
    outcome: "empty",
    statement: "None.",
  };

  it("reads a headerless journal as v0.1", () => {
    const report = validateJournal(journal(DISPATCH, TERMINAL));

    expect(report.findings).toEqual([]);
    expect(report.version).toBe("0.1");
    expect(report.header).toBeNull();
  });

  it("accepts a v0.2 header and carries its provenance", () => {
    const report = validateJournal(journal(HEADER, DISPATCH, TERMINAL));

    expect(report.findings).toEqual([]);
    expect(report.version).toBe("0.2");
    expect(report.header).toEqual({
      version: "0.2",
      origin: "hooks",
      session: "sess-abc",
      source: "startup",
      // v0.4's identity fields are read at every version and absent here.
      branch: null,
      head: null,
      worktree: null,
    });
  });

  it("counts the header as a record, because it is one", () => {
    expect(validateJournal(journal(HEADER, DISPATCH, TERMINAL)).records).toBe(3);
  });

  it("reads a self-reported origin as itself", () => {
    const report = validateJournal(
      journal({ kind: "journal", version: "0.2", origin: "self-reported" }, DISPATCH, TERMINAL),
    );

    expect(report.findings).toEqual([]);
    expect(report.header?.origin).toBe("self-reported");
  });

  it("fails an unknown version once, without a cascade of malformed records", () => {
    const report = validateJournal(
      journal(
        { kind: "journal", version: "9.0", origin: "hooks" },
        { kind: "nonsense-from-the-future", id: "n1" },
        { kind: "also-nonsense", id: "n2" },
      ),
    );

    expect(report.findings.map((finding) => finding.verdict)).toEqual(["unsupported-version"]);
    expect(report.findings[0]?.line).toBe(1);
  });

  it("fails a header that omits its version — the schema is then unknowable", () => {
    expect(verdicts(journal({ kind: "journal", origin: "hooks" }, DISPATCH))).toEqual([
      "unsupported-version",
    ]);
  });

  it("refuses a header that is not the first record", () => {
    const report = validateJournal(journal(DISPATCH, TERMINAL, HEADER));

    expect(report.findings.map((finding) => finding.verdict)).toEqual(["malformed"]);
    expect(report.findings[0]?.detail).toContain("first record");
  });

  it("refuses an unknown origin, and keeps validating the rest", () => {
    const report = validateJournal(
      journal({ kind: "journal", version: "0.2", origin: "vibes" }, DISPATCH),
    );

    expect(report.findings.map((finding) => finding.verdict)).toEqual([
      "malformed",
      "no-terminal",
    ]);
    expect(report.header?.origin).toBeNull();
  });

  it("refuses a header with no origin — provenance is the point", () => {
    expect(
      verdicts(journal({ kind: "journal", version: "0.2" }, DISPATCH, TERMINAL)),
    ).toEqual(["malformed"]);
  });
});

describe("mutation records (v0.2)", () => {
  const HEADER = { kind: "journal", version: "0.2", origin: "hooks" };
  const VERIFICATION = {
    kind: "verification",
    id: "v1",
    target: { path: "src/a.ts", hash: "aaaa1111" },
    verdict: "safe",
  };

  it("advances the hash map, so an edit invalidates an earlier verification", () => {
    const report = validateJournal(
      journal(
        HEADER,
        VERIFICATION,
        { kind: "mutation", id: "m1", target: { path: "src/a.ts", hash: "bbbb2222" } },
        { kind: "reliance", id: "x1", relies_on: "v1" },
      ),
    );

    expect(report.findings.map((finding) => finding.verdict)).toEqual(["stale-verification"]);
    expect(report.mutations).toBe(1);
  });

  it("leaves an untouched path's verification usable", () => {
    expect(
      verdicts(
        journal(
          HEADER,
          VERIFICATION,
          { kind: "mutation", id: "m1", target: { path: "src/b.ts", hash: "bbbb2222" } },
          { kind: "reliance", id: "x1", relies_on: "v1" },
        ),
      ),
    ).toEqual([]);
  });

  it("refuses reliance on a mutation — a change is not a check", () => {
    const report = validateJournal(
      journal(
        HEADER,
        { kind: "mutation", id: "m1", target: { path: "src/a.ts", hash: "bbbb2222" } },
        { kind: "reliance", id: "x1", relies_on: "m1" },
      ),
    );

    expect(report.findings.map((finding) => finding.verdict)).toEqual(["dangling-reference"]);
    expect(report.findings[0]?.detail).toContain("mutation");
  });

  it("refuses a mutation that does not name what it changed", () => {
    expect(verdicts(journal(HEADER, { kind: "mutation", id: "m1" }))).toEqual(["malformed"]);
  });

  it("is not a kind a v0.1 journal may use", () => {
    const report = validateJournal(
      journal({ kind: "mutation", id: "m1", target: { path: "src/a.ts", hash: "bbbb2222" } }),
    );

    expect(report.findings.map((finding) => finding.verdict)).toEqual(["malformed"]);
    expect(report.findings[0]?.detail).toContain("0.2");
  });
});

describe("ledger records (v0.3) — version plumbing", () => {
  const V02 = { kind: "journal", version: "0.2", origin: "self-reported" };
  const V03 = { kind: "journal", version: "0.3", origin: "self-reported" };
  const STAGE = { kind: "stage", id: "s1", phase: "pre-review", iteration: 1 };

  it("accepts a stage under 0.3", () => {
    expect(verdicts(journal(V03, STAGE))).toEqual([]);
  });

  it("is not a vocabulary a v0.2 journal may use", () => {
    const report = validateJournal(journal(V02, STAGE));

    expect(report.findings.map((finding) => finding.verdict)).toEqual(["malformed"]);
    expect(report.findings[0]?.detail).toContain("0.3");
  });

  it("is not a vocabulary a headerless journal may use", () => {
    const report = validateJournal(journal(STAGE));

    expect(report.findings.map((finding) => finding.verdict)).toEqual(["malformed"]);
    expect(report.findings[0]?.detail).toContain("0.3");
  });

  it("still names 0.2 for a mutation, not the newest schema", () => {
    const report = validateJournal(
      journal({ kind: "mutation", id: "m1", target: { path: "src/a.ts", hash: "bbbb2222" } }),
    );

    expect(report.findings[0]?.detail).toContain("0.2");
    expect(report.findings[0]?.detail).not.toContain("0.3");
  });
});

describe("ledger records (v0.3) — the five kinds", () => {
  const V03 = { kind: "journal", version: "0.3", origin: "self-reported" };
  const STAGE = { kind: "stage", id: "s1", phase: "pre-review", iteration: 1 };
  const BLOCKER = {
    kind: "finding",
    id: "f1",
    stage: "s1",
    severity: "blocker",
    author: "rule-auditor",
    ref: "B1",
    text: "the precheck uses exit 1, which does not block",
  };
  const answering = (outcome: string, extra: object = {}) => ({
    kind: "resolution",
    id: "r1",
    finding: "f1",
    outcome,
    text: "flipped both exit paths to exit 2",
    ...extra,
  });

  describe("stage", () => {
    it("accepts an unconventional phase — the enum is open on purpose", () => {
      expect(verdicts(journal(V03, { kind: "stage", id: "s1", phase: "docker-smoke" }))).toEqual([]);
    });

    it("refuses a blank phase", () => {
      expect(verdicts(journal(V03, { kind: "stage", id: "s1", phase: "  " }))).toEqual(["malformed"]);
    });

    it("refuses a non-positive iteration", () => {
      expect(
        verdicts(journal(V03, { kind: "stage", id: "s1", phase: "verify", iteration: 0 })),
      ).toEqual(["malformed"]);
    });

    it("carries the change it belongs to", () => {
      expect(
        verdicts(journal(V03, { ...STAGE, change: "add-run-ledger" })),
      ).toEqual([]);
    });

    it("refuses a blank change rather than treating it as absent", () => {
      expect(verdicts(journal(V03, { ...STAGE, change: "" }))).toEqual(["malformed"]);
    });
  });

  describe("finding", () => {
    it("accepts a corroborated blocker", () => {
      expect(
        verdicts(
          journal(V03, STAGE, { ...BLOCKER, convergence: ["architecture-reviewer"] }, answering("fixed")),
        ),
      ).toEqual([]);
    });

    it("refuses a severity outside the three", () => {
      expect(
        verdicts(journal(V03, STAGE, { ...BLOCKER, severity: "critical" })),
      ).toEqual(["malformed"]);
    });

    it("refuses a blank author", () => {
      expect(verdicts(journal(V03, STAGE, { ...BLOCKER, author: "   " }))).toEqual(["malformed"]);
    });

    it("refuses a finding whose dispatch reference goes nowhere", () => {
      expect(verdicts(journal(V03, { ...BLOCKER, dispatch: "d9" }))).toContain("dangling-reference");
    });

    it("refuses corroboration by nobody", () => {
      const report = validateJournal(journal(V03, STAGE, { ...BLOCKER, convergence: [] }));

      expect(report.findings.map((f) => f.verdict)).toEqual(["malformed"]);
      expect(report.findings[0]?.detail).toContain("corroboration by nobody");
    });

    it("takes any author — agent names are one project's org chart", () => {
      expect(
        verdicts(
          journal(V03, STAGE, { ...BLOCKER, author: "kubernetes-architect" }, answering("resolved")),
        ),
      ).toEqual([]);
    });

    it("refuses a finding with no prose", () => {
      expect(verdicts(journal(V03, STAGE, { ...BLOCKER, text: "" }))).toEqual(["malformed"]);
    });

    it("refuses convergence that is not a list of names", () => {
      expect(
        verdicts(journal(V03, STAGE, { ...BLOCKER, convergence: "architecture-reviewer" })),
      ).toEqual(["malformed"]);
    });

    it("refuses a stage reference that is not in the journal", () => {
      expect(verdicts(journal(V03, { ...BLOCKER, stage: "s9" }))).toContain("dangling-reference");
    });

    // The bug this pins: registration used to happen after the optional
    // reference checks, so one typo in an unrelated field made a blocker
    // vanish from SUPPRESSED-FINDING and made its author look silent.
    it("keeps a blocker accountable even when an unrelated optional ref is a typo", () => {
      expect(verdicts(journal(V03, { ...BLOCKER, stage: "s9" }))).toEqual([
        "dangling-reference",
        "suppressed-finding",
      ]);
    });

    it("does not accuse a reviewer of silence over a typo elsewhere in its finding", () => {
      expect(
        verdicts(
          journal(
            V03,
            STAGE,
            DISPATCH,
            { kind: "report", id: "rep1", dispatch: "d1", outcome: "found", findings: ["x"] },
            { ...BLOCKER, stage: "s9", dispatch: "d1" },
            answering("fixed"),
          ),
        ),
      ).toEqual(["dangling-reference"]);
    });

    it("refuses a finding that names a stage the run had not reached", () => {
      const report = validateJournal(
        journal(V03, { ...BLOCKER, stage: "s2" }, { kind: "stage", id: "s2", phase: "verify" }),
      );

      expect(report.findings.map((f) => f.verdict)).toContain("dangling-reference");
      expect(report.findings[0]?.detail).toContain("declared later");
    });
  });

  describe("resolution", () => {
    it("accepts a merge that names its survivor", () => {
      expect(
        verdicts(
          journal(
            V03,
            STAGE,
            BLOCKER,
            { ...BLOCKER, id: "f2", ref: "B2" },
            answering("folded-in", { finding: "f2", merges_into: "f1" }),
            { ...answering("fixed"), id: "r2" },
          ),
        ),
      ).toEqual([]);
    });

    it("refuses a resolution that names no finding", () => {
      expect(
        verdicts(journal(V03, STAGE, BLOCKER, { kind: "resolution", id: "r1", outcome: "fixed", text: "t" })),
      ).toContain("malformed");
    });

    it("refuses a merge with nowhere to go", () => {
      expect(
        verdicts(journal(V03, STAGE, BLOCKER, answering("duplicate"))),
      ).toContain("malformed");
    });

    it("refuses a merge into something that is not a finding", () => {
      expect(
        verdicts(journal(V03, STAGE, BLOCKER, answering("duplicate", { merges_into: "s1" }))),
      ).toContain("dangling-reference");
    });

    it("refuses an outcome outside the derived vocabulary", () => {
      expect(
        verdicts(journal(V03, STAGE, BLOCKER, answering("escalated"))),
      ).toContain("malformed");
    });

    it("refuses a resolution answering nothing", () => {
      expect(
        verdicts(journal(V03, STAGE, BLOCKER, answering("fixed", { finding: "f9" }))),
      ).toContain("dangling-reference");
    });

    it("refuses a resolution with no reason", () => {
      expect(
        verdicts(journal(V03, STAGE, BLOCKER, answering("fixed", { text: "" }))),
      ).toContain("malformed");
    });
  });

  describe("check", () => {
    it("records a failing suite with counts", () => {
      expect(
        verdicts(
          journal(V03, {
            kind: "check",
            id: "c1",
            command: "pnpm test",
            outcome: "fail",
            counts: { failed: 3, passed: 331 },
            text: "three flag-conformance tests fail on ugrep",
          }),
        ),
      ).toEqual([]);
    });

    it("refuses a check that names no command", () => {
      expect(
        verdicts(journal(V03, { kind: "check", id: "c1", outcome: "pass", text: "ran something" })),
      ).toEqual(["malformed"]);
    });

    it("refuses a check with no prose", () => {
      expect(
        verdicts(
          journal(V03, { kind: "check", id: "c1", command: "pnpm test", outcome: "pass", text: "" }),
        ),
      ).toEqual(["malformed"]);
    });

    it("refuses an outcome that is not pass or fail", () => {
      expect(
        verdicts(
          journal(V03, { kind: "check", id: "c1", command: "pnpm test", outcome: "green", text: "ok" }),
        ),
      ).toEqual(["malformed"]);
    });

    it("refuses negative counts", () => {
      expect(
        verdicts(
          journal(V03, {
            kind: "check",
            id: "c1",
            command: "pnpm test",
            outcome: "pass",
            counts: { failed: -1 },
            text: "ok",
          }),
        ),
      ).toEqual(["malformed"]);
    });

    // The check carries a `target` on the SAME path the verification covers,
    // with a DIFFERENT hash. If `check` shared `mutation`'s code path this
    // would move the hash map and the reliance below would go stale — so the
    // empty result is now evidence, not an artefact of an inert input.
    it("is not a verification — nothing can go stale against it", () => {
      const report = validateJournal(
        journal(
          V03,
          {
            kind: "verification",
            id: "v1",
            target: { path: "src/a.ts", hash: "aaaa1111" },
            verdict: "safe",
          },
          {
            kind: "check",
            id: "c1",
            command: "pnpm test",
            outcome: "pass",
            text: "860 pass",
            target: { path: "src/a.ts", hash: "ffff9999" },
          },
          { kind: "reliance", id: "x1", relies_on: "v1" },
        ),
      );

      expect(report.findings).toEqual([]);
      expect(report.verifications).toBe(1);
      expect(report.mutations).toBe(0);
    });

    it("proves the contrast — a mutation on that path DOES go stale", () => {
      expect(
        verdicts(
          journal(
            V03,
            {
              kind: "verification",
              id: "v1",
              target: { path: "src/a.ts", hash: "aaaa1111" },
              verdict: "safe",
            },
            { kind: "mutation", id: "m1", target: { path: "src/a.ts", hash: "ffff9999" } },
            { kind: "reliance", id: "x1", relies_on: "v1" },
          ),
        ),
      ).toEqual(["stale-verification"]);
    });
  });

  describe("decision", () => {
    it("accepts a choice with its reason", () => {
      expect(
        verdicts(
          journal(V03, {
            kind: "decision",
            id: "d1",
            choice: "gate SUPPRESSED-FINDING to blockers",
            rationale: "ungated it fires on 60.8% of findings and becomes noise",
            departed_from: "the proposal, which left it ungated",
            resolves: "Decision 6",
          }),
        ),
      ).toEqual([]);
    });

    it("refuses a decision with no choice", () => {
      expect(
        verdicts(journal(V03, { kind: "decision", id: "d1", rationale: "a reason, no choice" })),
      ).toEqual(["malformed"]);
    });

    it("refuses a blank departed_from rather than reading it as absent", () => {
      expect(
        verdicts(
          journal(V03, {
            kind: "decision",
            id: "d1",
            choice: "x",
            rationale: "y",
            departed_from: "",
          }),
        ),
      ).toEqual(["malformed"]);
    });

    it("refuses a decision with no reason", () => {
      expect(
        verdicts(journal(V03, { kind: "decision", id: "d1", choice: "do the thing" })),
      ).toEqual(["malformed"]);
    });
  });
});

describe("SUPPRESSED-FINDING — a blocker nobody answered", () => {
  const V03 = { kind: "journal", version: "0.3", origin: "self-reported" };
  const finding = (severity: string) => ({
    kind: "finding",
    id: "f1",
    severity,
    author: "rule-auditor",
    text: "the tripwire omits its own carve-out",
  });

  it("fires on an unanswered blocker", () => {
    const report = validateJournal(journal(V03, finding("blocker")));

    expect(report.findings.map((f) => f.verdict)).toEqual(["suppressed-finding"]);
    expect(isJournalFailure("suppressed-finding")).toBe(true);
  });

  it("is silent once a resolution answers it", () => {
    expect(
      verdicts(
        journal(V03, finding("blocker"), {
          kind: "resolution",
          id: "r1",
          finding: "f1",
          outcome: "accepted",
          text: "accepted as a known deviation",
        }),
      ),
    ).toEqual([]);
  });

  it("does not police an unanswered concern", () => {
    expect(verdicts(journal(V03, finding("concern")))).toEqual([]);
  });

  it("does not police an unanswered looks-good", () => {
    expect(verdicts(journal(V03, finding("looks-good")))).toEqual([]);
  });
});

describe("SILENT-REVIEWER — returned, and filed nothing", () => {
  const V03 = { kind: "journal", version: "0.3", origin: "hooks" };
  const FOUND = {
    kind: "report",
    id: "r1",
    dispatch: "d1",
    outcome: "found",
    findings: ["the precheck does not block"],
  };

  it("fires on a found report that no finding speaks for", () => {
    const report = validateJournal(journal(V03, DISPATCH, FOUND));

    expect(report.findings.map((f) => f.verdict)).toEqual(["silent-reviewer"]);
    expect(isJournalFailure("silent-reviewer")).toBe(true);
  });

  it("is discharged by a looks-good finding", () => {
    expect(
      verdicts(
        journal(V03, DISPATCH, FOUND, {
          kind: "finding",
          id: "f1",
          dispatch: "d1",
          severity: "looks-good",
          author: "security-reviewer",
          text: "looked at the hook contract, nothing to raise",
        }),
      ),
    ).toEqual([]);
  });

  it("leaves an empty report alone — SILENT-EMPTY already governs it", () => {
    expect(
      verdicts(
        journal(V03, DISPATCH, {
          kind: "report",
          id: "r1",
          dispatch: "d1",
          outcome: "empty",
          statement: "None.",
        }),
      ),
    ).toEqual([]);
  });

  it("leaves a no-terminal dispatch to NO-TERMINAL alone", () => {
    expect(verdicts(journal(V03, DISPATCH))).toEqual(["no-terminal"]);
  });
});

describe("v0.3 leaves earlier schemas untouched", () => {
  it("does not apply the ledger verdicts to a v0.2 journal", () => {
    expect(
      verdicts(
        journal({ kind: "journal", version: "0.2", origin: "hooks" }, DISPATCH, {
          kind: "report",
          id: "r1",
          dispatch: "d1",
          outcome: "found",
          findings: ["something"],
        }),
      ),
    ).toEqual([]);
  });

  it("names every readable schema when refusing one from the future", () => {
    const report = validateJournal(journal({ kind: "journal", version: "9.0" }));

    expect(report.findings.map((f) => f.verdict)).toEqual(["unsupported-version"]);
    expect(report.findings[0]?.detail).toContain("0.1, 0.2, 0.3, 0.4");
  });

  it("does not apply them to a headerless journal", () => {
    expect(
      verdicts(
        journal(DISPATCH, {
          kind: "report",
          id: "r1",
          dispatch: "d1",
          outcome: "found",
          findings: ["something"],
        }),
      ),
    ).toEqual([]);
  });
});

// Every case here was a working exploit before the review that found them: a
// blocker discharged while nothing answered it. They are the reason
// SUPPRESSED-FINDING follows merge chains instead of trusting one edge.
describe("SUPPRESSED-FINDING — merges transfer the obligation, never end it", () => {
  const V03 = { kind: "journal", version: "0.3", origin: "self-reported" };
  const finding = (id: string, severity: string) => ({
    kind: "finding",
    id,
    severity,
    author: "rule-auditor",
    text: `the finding ${id}`,
  });
  const merge = (id: string, from: string, into: string) => ({
    kind: "resolution",
    id,
    finding: from,
    outcome: "folded-in",
    merges_into: into,
    text: `tracked under ${into}`,
  });

  it("refuses a finding merged into itself", () => {
    const report = validateJournal(
      journal(V03, finding("f1", "blocker"), merge("r1", "f1", "f1")),
    );

    expect(report.findings.map((f) => f.verdict)).toContain("malformed");
    expect(report.findings.some((f) => f.detail?.includes("into itself"))).toBe(true);
  });

  it("does not let a merge cycle discharge either end", () => {
    const report = validateJournal(
      journal(
        V03,
        finding("f1", "blocker"),
        finding("f2", "blocker"),
        merge("r1", "f1", "f2"),
        merge("r2", "f2", "f1"),
      ),
    );

    expect(report.findings.map((f) => f.verdict)).toEqual([
      "suppressed-finding",
      "suppressed-finding",
    ]);
    expect(report.findings[0]?.detail).toContain("closes on itself");
  });

  it("does not let a blocker hide inside an unpoliced concern", () => {
    const report = validateJournal(
      journal(V03, finding("f2", "concern"), finding("f1", "blocker"), merge("r1", "f1", "f2")),
    );

    expect(report.findings.map((f) => f.verdict)).toEqual(["suppressed-finding"]);
    expect(report.findings[0]?.detail).toContain("merged into 'f2'");
  });

  it("discharges a blocker when the chain ends somewhere answered", () => {
    expect(
      verdicts(
        journal(
          V03,
          finding("f1", "blocker"),
          finding("f2", "blocker"),
          merge("r1", "f1", "f2"),
          {
            kind: "resolution",
            id: "r2",
            finding: "f2",
            outcome: "fixed",
            text: "fixed at the root",
          },
        ),
      ),
    ).toEqual([]);
  });

  it("refuses a resolution that answers a finding raised later", () => {
    const report = validateJournal(
      journal(
        V03,
        { kind: "resolution", id: "r1", finding: "f1", outcome: "fixed", text: "answered early" },
        finding("f1", "blocker"),
      ),
    );

    expect(report.findings.map((f) => f.verdict)).toEqual([
      "dangling-reference",
      "suppressed-finding",
    ]);
    expect(report.findings[0]?.detail).toContain("raised later");
  });

  // D1: the property the whole verdict rests on, asserted directly rather
  // than left to a fixture nothing reads.
  it("is not discharged by a resolution that failed to parse", () => {
    for (const broken of [
      { outcome: "escalated", text: "not in the vocabulary" },
      { outcome: "fixed", text: "" },
      { outcome: "duplicate", text: "no survivor named" },
    ]) {
      const report = validateJournal(
        journal(V03, finding("f1", "blocker"), {
          kind: "resolution",
          id: "r1",
          finding: "f1",
          ...broken,
        }),
      );

      expect(report.findings.map((f) => f.verdict)).toContain("suppressed-finding");
    }
  });

  it("names the wrong kind honestly when a resolution points at a stage", () => {
    const report = validateJournal(
      journal(V03, { kind: "stage", id: "s1", phase: "verify" }, {
        kind: "resolution",
        id: "r1",
        finding: "s1",
        outcome: "fixed",
        text: "points at a stage",
      }),
    );

    expect(report.findings[0]?.verdict).toBe("dangling-reference");
    expect(report.findings[0]?.detail).toContain("is a stage");
  });
});

describe("SILENT-REVIEWER does not pile onto another verdict's remedy", () => {
  const V03 = { kind: "journal", version: "0.3", origin: "hooks" };

  // Both verdicts used to fire here, and their advice contradicted:
  // "file a finding" against "report empty instead".
  it("stays quiet when the report already collapsed", () => {
    const report = validateJournal(
      journal(V03, DISPATCH, {
        kind: "report",
        id: "r1",
        dispatch: "d1",
        outcome: "found",
        findings: [],
      }),
    );

    expect(report.findings.map((f) => f.verdict)).toEqual(["collapsed-state"]);
  });
});

// The version→behaviour mapping lives in more than one place. These do not
// test behaviour; they fail when the places stop agreeing, which is the
// failure mode nothing else here would catch.
describe("version tables stay in sync", () => {
  it("gives every readable version a vocabulary", () => {
    // A version in VERSIONS with no VOCABULARY entry silently falls back to
    // v0.1, and every later kind becomes MALFORMED with misleading advice.
    for (const version of VERSIONS) {
      const report = validateJournal(
        journal({ kind: "journal", version, origin: "hooks" }, DISPATCH, {
          kind: "report",
          id: "r1",
          dispatch: "d1",
          outcome: "empty",
          statement: "None.",
        }),
      );
      expect(report.findings.map((f) => f.verdict)).toEqual([]);
      expect(report.version).toBe(version);
    }
  });

  it("names the introducing schema for every kind beyond v0.1", () => {
    const cases: ReadonlyArray<readonly [object, string]> = [
      [{ kind: "mutation", id: "m1", target: { path: "a.ts", hash: "aa11" } }, "0.2"],
      [{ kind: "stage", id: "s1", phase: "verify" }, "0.3"],
      [{ kind: "finding", id: "f1", severity: "concern", author: "a", text: "t" }, "0.3"],
      [{ kind: "resolution", id: "r1", finding: "f1", outcome: "fixed", text: "t" }, "0.3"],
      [{ kind: "check", id: "c1", command: "x", outcome: "pass", text: "t" }, "0.3"],
      [{ kind: "decision", id: "d1", choice: "x", rationale: "y" }, "0.3"],
    ];

    for (const [record, version] of cases) {
      const report = validateJournal(journal(record));
      expect(report.findings[0]?.verdict).toBe("malformed");
      expect(report.findings[0]?.detail).toContain(`arrived in schema ${version}`);
      expect(report.findings[0]?.detail).not.toContain("unknown kind");
    }
  });
});

// ---------------------------------------------------------------------------
// v0.4 — place. Three optional header fields, one optional `verification.rev`,
// and the two rejections that made this a version bump rather than additive
// metadata.
// ---------------------------------------------------------------------------

const V04 = { kind: "journal", version: "0.4", origin: "hooks" };
const V03 = { kind: "journal", version: "0.3", origin: "hooks" };

describe("v0.4 header identity — branch, head, worktree", () => {
  it("parses all three onto the report header", () => {
    const report = validateJournal(
      journal({
        ...V04,
        branch: "feat/add-journal-identity",
        head: "8c71f46",
        worktree: "3f9c1e0a44b27d51",
      }),
    );

    expect(report.findings).toEqual([]);
    expect(report.header?.branch).toBe("feat/add-journal-identity");
    expect(report.header?.head).toBe("8c71f46");
    expect(report.header?.worktree).toBe("3f9c1e0a44b27d51");
  });

  it("reports nothing when all three are absent", () => {
    const report = validateJournal(journal(V04));

    expect(report.findings).toEqual([]);
    expect(report.header?.branch).toBeNull();
    expect(report.header?.head).toBeNull();
    expect(report.header?.worktree).toBeNull();
  });

  it("omits branch on a detached HEAD without complaining", () => {
    const report = validateJournal(journal({ ...V04, head: "8c71f46" }));

    expect(report.findings).toEqual([]);
    expect(report.header?.head).toBe("8c71f46");
    expect(report.header?.branch).toBeNull();
  });

  // The regression test for the promise that keeps a newer producer readable:
  // a key this build has never heard of is ignored, not reported.
  it("ignores header keys it does not recognise", () => {
    const report = validateJournal(journal({ ...V04, remote: "origin", clock_skew_ms: 12 }));

    expect(report.findings).toEqual([]);
  });

  it("changes no other finding by being present", () => {
    const records = [
      DISPATCH,
      { kind: "report", id: "r1", dispatch: "d1", outcome: "empty" },
    ];
    const without = validateJournal(journal(V04, ...records));
    const with_ = validateJournal(
      journal({ ...V04, branch: "main", head: "8c71f46", worktree: "3f9c1e0a" }, ...records),
    );

    expect(with_.findings).toEqual(without.findings);
  });

  it("refuses an empty identity field and names it", () => {
    for (const field of ["branch", "head", "worktree"]) {
      const report = validateJournal(journal({ ...V04, [field]: "" }));

      expect(report.findings.map((f) => f.verdict)).toEqual(["malformed"]);
      expect(report.findings[0]?.detail).toContain(`"${field}"`);
    }
  });

  // `nonEmptyString`, not `optionalString`: whitespace is an empty answer
  // wearing a costume.
  it("refuses a whitespace-only identity field", () => {
    expect(verdicts(journal({ ...V04, branch: "   " }))).toEqual(["malformed"]);
  });

  it("refuses an identity field that is not a string", () => {
    const report = validateJournal(journal({ ...V04, head: 8471 }));

    expect(report.findings.map((f) => f.verdict)).toEqual(["malformed"]);
    expect(report.findings[0]?.detail).toContain('"head"');
  });

  it("names every offending field when more than one is empty", () => {
    const report = validateJournal(journal({ ...V04, branch: "", worktree: "" }));

    expect(report.findings.map((f) => f.verdict)).toEqual(["malformed", "malformed"]);
    expect(report.findings[0]?.detail).toContain('"branch"');
    expect(report.findings[1]?.detail).toContain('"worktree"');
  });

  // The asymmetry, pinned so it stays a decision rather than an oversight:
  // session and source label one journal and nothing correlates journals by
  // them, so a blank one is uninformative rather than misleading. Tightening
  // them would be a further tightening and would take its own bump.
  it("leaves an empty session and source alone at 0.4", () => {
    const report = validateJournal(journal({ ...V04, session: "", source: "" }));

    expect(report.findings).toEqual([]);
    expect(report.header?.session).toBeNull();
    expect(report.header?.source).toBeNull();
  });

  // Identity is readable at every version — only the rejection is 0.4.
  it("still parses the fields on a 0.2 journal", () => {
    const report = validateJournal(
      journal({ kind: "journal", version: "0.2", origin: "hooks", branch: "main" }),
    );

    expect(report.findings).toEqual([]);
    expect(report.header?.branch).toBe("main");
  });
});

describe("v0.4 — a verification may pin the revision it was checked at", () => {
  const target = { path: "src/retry.ts", hash: "9f2c4a1b8e7d" };

  it("accepts a stamp", () => {
    expect(verdicts(journal(V04, { kind: "verification", id: "v1", target, rev: "541ae94" }))).toEqual(
      [],
    );
  });

  it("reports nothing when rev is absent", () => {
    expect(verdicts(journal(V04, { kind: "verification", id: "v1", target }))).toEqual([]);
  });

  it("refuses a ref name, and the detail names rev", () => {
    const report = validateJournal(
      journal(V04, { kind: "verification", id: "v1", target, rev: "main" }),
    );

    expect(report.findings.map((f) => f.verdict)).toEqual(["malformed"]);
    expect(report.findings[0]?.detail).toContain('"rev"');
    expect(report.findings[0]?.detail).toContain("lower-case hex");
  });

  // One canonical spelling, so two stamps naming one commit compare equal by
  // string equality. A journal is machine-written and has no author to be
  // lenient toward — this is deliberately stricter than the anchor grammar,
  // which folds mixed case on the way in.
  it("refuses upper-case hex", () => {
    expect(verdicts(journal(V04, { kind: "verification", id: "v1", target, rev: "541AE94" }))).toEqual(
      ["malformed"],
    );
  });

  it("refuses a stamp shorter than seven characters", () => {
    expect(verdicts(journal(V04, { kind: "verification", id: "v1", target, rev: "541ae9" }))).toEqual(
      ["malformed"],
    );
  });

  it("refuses a rev that is not a string", () => {
    expect(verdicts(journal(V04, { kind: "verification", id: "v1", target, rev: 541 }))).toEqual([
      "malformed",
    ]);
  });

  // The rejection must not cost invariant 2 its evidence: a validator that
  // drops a well-formed target over a bad extra key trades one loud verdict
  // for a silent one.
  it("still lets the verification go stale", () => {
    expect(
      verdicts(
        journal(
          V04,
          { kind: "verification", id: "v1", target, rev: "main" },
          { kind: "mutation", id: "m1", target: { ...target, hash: "7ab2c40de915" } },
          { kind: "reliance", id: "x1", relies_on: "v1" },
        ),
      ),
    ).toEqual(["malformed", "stale-verification"]);
  });
});

describe("v0.4 — a mutation may not carry rev", () => {
  const target = { path: "src/retry.ts", hash: "7ab2c40de915" };

  it("refuses it even when the value is a well-formed stamp", () => {
    const report = validateJournal(
      journal(V04, { kind: "mutation", id: "m1", target, rev: "541ae94" }),
    );

    expect(report.findings.map((f) => f.verdict)).toEqual(["malformed"]);
    expect(report.findings[0]?.detail).toContain("must not carry");
  });

  // Distinguishable from the malformed-rev finding above, which is the point
  // of giving each rejection its own detail rather than one indistinct verdict.
  it("says something different from the malformed-rev finding", () => {
    const bad = validateJournal(
      journal(V04, {
        kind: "verification",
        id: "v1",
        target: { path: "a.ts", hash: "aa11" },
        rev: "main",
      }),
    ).findings[0]?.detail;
    const extra = validateJournal(
      journal(V04, { kind: "mutation", id: "m1", target, rev: "541ae94" }),
    ).findings[0]?.detail;

    expect(bad).not.toBe(extra);
  });

  it("still advances the hash map", () => {
    expect(
      verdicts(
        journal(
          V04,
          { kind: "verification", id: "v1", target: { path: "src/retry.ts", hash: "9f2c" } },
          { kind: "mutation", id: "m1", target, rev: "541ae94" },
          { kind: "reliance", id: "x1", relies_on: "v1" },
        ),
      ),
    ).toEqual(["malformed", "stale-verification"]);
  });

  it("leaves every other misplaced key alone", () => {
    // The criterion is the false belief `rev` encodes on a mutation, not "a
    // known key on a record that cannot carry it". Nothing here proposes to
    // reject these, and a future author must not derive that from the rule.
    expect(
      verdicts(
        journal(
          V04,
          { ...DISPATCH, target: { path: "a.ts", hash: "aa11" } },
          { kind: "report", id: "r1", dispatch: "d1", outcome: "empty", statement: "None." },
        ),
      ),
    ).toEqual([]);
  });
});

// The one test in this change that fails if the version predicate is written
// backwards. Neither pre-existing 0.3 fixture carries a `verification` or a
// `mutation` at all, so "the 0.3 fixtures still validate identically" is
// satisfiable by running the unchanged suite.
describe("0.3 journals do not acquire 0.4's rejections", () => {
  it("reports none of the three for the compat fixture", () => {
    const report = validateJournal(fixture("v0.3-compat-run.jsonl"));

    expect(report.findings).toEqual([]);
    expect(report.version).toBe("0.3");
    expect(report.header?.branch).toBeNull();
  });

  it("is the same journal that fails at 0.4", () => {
    // Identical bytes apart from the declared version — so the difference in
    // outcome is the version predicate and nothing else.
    const compat = fixture("v0.3-compat-run.jsonl");
    const broken = fixture("v0.4-broken-run.jsonl");

    expect(compat.replace('"version":"0.3"', "X")).toBe(broken.replace('"version":"0.4"', "X"));
    expect(validateJournal(broken).findings).toHaveLength(3);
  });

  it("keeps the rejections off an inline 0.3 journal too", () => {
    expect(
      verdicts(
        journal(
          { ...V03, branch: "" },
          { kind: "verification", id: "v1", target: { path: "a.ts", hash: "aa11" }, rev: "main" },
          { kind: "mutation", id: "m1", target: { path: "b.ts", hash: "bb22" }, rev: "541ae94" },
        ),
      ),
    ).toEqual([]);
  });
});

// The bump's real hazard: the ledger gate was `scan.version === "0.3"`, so
// adding 0.4 to VERSIONS and stopping there would have left every 0.4 journal
// ungated for both verdicts below, with CI green and every fixture exiting as
// its table says.
describe("the ledger gate is a floor, not an equality", () => {
  const BLOCKER = {
    kind: "finding",
    id: "f1",
    severity: "blocker",
    author: "rule-auditor",
    text: "a blocker nothing answers",
  };
  const FOUND = {
    kind: "report",
    id: "r1",
    dispatch: "d1",
    outcome: "found",
    findings: ["the precheck does not block"],
  };

  it("gives a 0.4 journal both verdicts the gate guards", () => {
    const report = validateJournal(journal(V04, DISPATCH, FOUND, BLOCKER));
    const found = report.findings.map((f) => f.verdict);

    // Both, in one test: the gate wraps both loops, so pinning one leaves the
    // other exactly as unprotected as it was.
    expect(found).toContain("suppressed-finding");
    expect(found).toContain("silent-reviewer");
  });

  it("gives a 0.3 journal the same two", () => {
    const found = validateJournal(journal(V03, DISPATCH, FOUND, BLOCKER)).findings.map(
      (f) => f.verdict,
    );

    expect(found).toContain("suppressed-finding");
    expect(found).toContain("silent-reviewer");
  });

  // The lower boundary, which is what proves it is a floor: a gate wrongly
  // written as `!== "0.1"` passes the two tests above and fails this one.
  it("gives a 0.2 journal neither", () => {
    const found = validateJournal(
      journal({ kind: "journal", version: "0.2", origin: "hooks" }, DISPATCH, FOUND, BLOCKER),
    ).findings.map((f) => f.verdict);

    expect(found).not.toContain("suppressed-finding");
    expect(found).not.toContain("silent-reviewer");
    // The blocker is a v0.3 kind, so a 0.2 journal reports it as MALFORMED —
    // which is the version header doing its job, not the ledger gate.
    expect(found).toContain("malformed");
  });

  it("gives a headerless journal neither", () => {
    const found = validateJournal(journal(DISPATCH, FOUND)).findings.map((f) => f.verdict);

    expect(found).not.toContain("silent-reviewer");
  });
});

// VERSIONS is compared by index, so its order is behaviour. The constant's own
// comment used to describe it only as "schemas this build can read", which
// would not warn an author inserting "0.5" in the wrong place.
describe("VERSIONS is ordered, and the order is load-bearing", () => {
  it("is ascending", () => {
    const rank = (version: string): number[] => version.split(".").map(Number);
    const ascending = (left: number[], right: number[]): boolean => {
      for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
        const a = left[index] ?? 0;
        const b = right[index] ?? 0;
        if (a !== b) return a < b;
      }
      return false;
    };

    for (let index = 1; index < VERSIONS.length; index += 1) {
      expect(rank(String(VERSIONS[index - 1])).every(Number.isFinite)).toBe(true);
      expect(ascending(rank(String(VERSIONS[index - 1])), rank(String(VERSIONS[index])))).toBe(true);
    }
  });

  it("is not merely lexicographic, which is why the floor uses indices", () => {
    // The trap this ordering exists to survive: "0.10" sorts before "0.3" as a
    // string. A floor written as a string comparison would ungate every gated
    // verdict at the first two-digit minor.
    expect("0.10" >= "0.3").toBe(false);
  });
});

describe("the v0.4 fixtures", () => {
  // Exit 0 is also what an empty file scores, so the fixture is opened here
  // and its header read rather than trusted to CI's exit code.
  it("v0.4-identity-run.jsonl validates and carries all three fields", () => {
    const report = validateJournal(fixture("v0.4-identity-run.jsonl"));

    expect(report.findings).toEqual([]);
    expect(report.version).toBe("0.4");
    expect(report.header?.branch).toBe("feat/add-journal-identity");
    expect(report.header?.head).toBe("8c71f46");
    expect(report.header?.worktree).toBe("3f9c1e0a44b27d51");
    expect(report.verifications).toBe(1);
  });

  // CI only checks this fixture's exit code, which stays 1 while any one of
  // the three still fires. Naming all three is the difference between "the
  // fixture is broken" and "these three verdicts work".
  it("v0.4-broken-run.jsonl trips all three new rejections, by name", () => {
    const report = validateJournal(fixture("v0.4-broken-run.jsonl"));

    expect(report.findings.map((f) => f.verdict)).toEqual([
      "malformed",
      "malformed",
      "malformed",
    ]);
    expect(report.findings[0]?.detail).toContain('"branch"');
    expect(report.findings[1]?.detail).toContain('"rev" is "main"');
    expect(report.findings[2]?.detail).toContain('must not carry "rev"');
    expect(report.findings.every((f) => isJournalFailure(f.verdict))).toBe(true);
  });
});

describe("survey — aggregates reports, never merges journals", () => {
  /*
   * Two worktrees, one path. `src/parser.rs` in journal A and `src/parser.rs`
   * in journal B are two different files, so B's mutation says nothing about
   * A's verification. Merge the timelines and A earns a STALE-VERIFICATION for
   * an event that never happened — design.md Decision 1, and the reason this
   * verb exists rather than a caller concatenating files.
   *
   * The chronology is the load-bearing part of the fixture. B's mutation at
   * t2 falls BETWEEN A's verification at t1 and A's reliance at t3, so a merge
   * that orders the union by time does produce the false verdict. Without that
   * interleaving this test would pass against the very implementation it
   * exists to forbid, and the assertion below on `merged` is what keeps that
   * honest: it fails if the fixture ever stops being able to trip the bug.
   */
  const A_VERIFICATION = {
    kind: "verification",
    id: "a-v1",
    ts: "2026-08-29T10:00:00Z",
    target: { path: "src/parser.rs", hash: "aaaa1111" },
    verdict: "safe",
  };
  const B_MUTATION = {
    kind: "mutation",
    id: "b-m1",
    ts: "2026-08-29T10:01:00Z",
    target: { path: "src/parser.rs", hash: "bbbb2222" },
  };
  const A_RELIANCE = {
    kind: "reliance",
    id: "a-c1",
    ts: "2026-08-29T10:02:00Z",
    relies_on: "a-v1",
  };

  const HEADER = { kind: "journal", version: "0.2", origin: "hooks" };
  const journalA = journal(HEADER, A_VERIFICATION, A_RELIANCE);
  const journalB = journal(HEADER, B_MUTATION);

  it("reports no STALE-VERIFICATION when another journal mutated the same path", () => {
    const survey = surveyJournals([
      { path: "a.jsonl", content: journalA },
      { path: "b.jsonl", content: journalB },
    ]);

    expect(survey.journals.flatMap((entry) => entry.verdicts)).toEqual([]);
    expect(survey.failed).toBe(0);
    expect(survey.count).toBe(2);
  });

  it("would report one if the records were merged — the fixture can trip the bug", () => {
    // Not a test of `surveyJournals`. It pins that the test above is
    // discriminating: a merged timeline of these same three records, in time
    // order, really does invent the failure. If this ever stops being true the
    // fixture has gone decorative and the test above proves nothing.
    const merged = journal(HEADER, A_VERIFICATION, B_MUTATION, A_RELIANCE);

    expect(verdicts(merged)).toEqual(["stale-verification"]);
  });

  it("keeps each journal's verdict independent of what else was surveyed", () => {
    const alone = validateJournal(journalA);
    const surveyed = surveyJournals([
      { path: "a.jsonl", content: journalA },
      { path: "b.jsonl", content: journalB },
    ]).journals[0];

    expect(surveyed?.report.findings).toEqual(alone.findings);
  });

  it("keeps the three outcomes three numbers and counts the journals", () => {
    // One journal per terminal state. Summed, they stay three numbers for the
    // same reason one journal keeps them three: a run that dropped its agents
    // and a run where every agent reported nothing summarise identically the
    // moment these are added together — and across sixty-four journals that
    // collapse is easier to miss, not harder.
    const terminated = (outcome: string, extra: object): string =>
      journal(HEADER, { kind: "dispatch", id: "d1" }, {
        kind: "report",
        id: "r1",
        dispatch: "d1",
        outcome,
        ...extra,
      });

    const survey = surveyJournals([
      { path: "found.jsonl", content: terminated("found", { findings: ["something"] }) },
      { path: "empty.jsonl", content: terminated("empty", { statement: "None." }) },
      {
        path: "no-report.jsonl",
        content: terminated("no-report", { statement: "The agent never came back." }),
      },
    ]);

    expect(survey.outcomes).toEqual({ found: 1, empty: 1, noReport: 1 });
    expect(survey.count).toBe(3);
    expect(survey.failed).toBe(0);
    expect(survey.silent).toEqual([]);
  });

  it("names the journals that reached no terminal record at all", () => {
    const survey = surveyJournals([
      { path: "silent.jsonl", content: journal(HEADER, { kind: "dispatch", id: "d1" }) },
      {
        path: "terminated.jsonl",
        content: journal(HEADER, { kind: "dispatch", id: "d1" }, {
          kind: "report",
          id: "r1",
          dispatch: "d1",
          outcome: "empty",
          statement: "None.",
        }),
      },
    ]);

    // A dispatch with no report is a journal that reached no terminal, and the
    // survey has to say WHICH — a count alone tells you a number when what you
    // need is the file to open.
    expect(survey.silent).toEqual(["silent.jsonl"]);
    expect(survey.unreadable).toEqual([]);
  });

  it("holds an unreadable schema apart from a journal that simply went quiet", () => {
    // Its counts are zero because nothing below the header was read, not
    // because nothing happened. Filing it under "no terminal record" would be
    // a summary standing in for work the validator declined to do.
    const survey = surveyJournals([
      { path: "future.jsonl", content: fixture("future-run.jsonl") },
    ]);

    expect(survey.unreadable).toEqual(["future.jsonl"]);
    expect(survey.silent).toEqual([]);
    expect(survey.failed).toBe(1);
    expect(survey.journals[0]?.verdicts).toEqual(["unsupported-version"]);
  });

  it("fails a survey exactly when a journal in it fails", () => {
    const survey = surveyJournals([
      { path: "valid.jsonl", content: fixture("valid-run.jsonl") },
      { path: "broken.jsonl", content: fixture("broken-run.jsonl") },
    ]);

    // The same rule one journal is judged by, applied per journal — not a
    // second, survey-level notion of failure.
    expect(survey.journals[0]?.failures).toBe(0);
    expect(survey.journals[1]?.failures).toBeGreaterThan(0);
    expect(
      survey.journals[1]?.verdicts.every((verdict) => isJournalFailure(verdict)),
    ).toBe(true);
    expect(survey.failed).toBe(1);
  });

  it("surveys nothing without inventing a number", () => {
    expect(surveyJournals([])).toMatchObject({
      count: 0,
      failed: 0,
      records: 0,
      outcomes: { found: 0, empty: 0, noReport: 0 },
      silent: [],
      unreadable: [],
    });
  });
});
