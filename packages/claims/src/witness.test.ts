import { describe, expect, it } from "vitest";

import { isJournalFailure, validateJournal, type JournalVerdict } from "./witness";

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

describe("journal order is load-bearing", () => {
  it("refuses a report that terminates a dispatch appearing later", () => {
    // Order is the whole basis of invariant 2, so a lookup that ignores it
    // validates a journal in which an answer was recorded before its question.
    const report = validateJournal(
      journal(
        { kind: "report", id: "r1", dispatch: "d1", outcome: "empty", statement: "None." },
        { kind: "dispatch", id: "d1" },
      ),
    );

    expect(report.findings.map((finding) => finding.verdict)).toEqual([
      "dangling-reference",
      "no-terminal",
    ]);
  });

  it("reports an append that names a target without a hash", () => {
    const report = validateJournal(
      journal(
        { kind: "verification", id: "v1", target: { path: "a.ts", hash: "h1" } },
        {
          kind: "append",
          id: "a1",
          corrections_since_last_append: "None.",
          target: { path: "a.ts" },
        },
        { kind: "reliance", id: "x1", relies_on: "v1" },
      ),
    );

    expect(report.findings.map((finding) => finding.verdict)).toEqual(["malformed"]);
  });

  it("leaves an append with no target at all alone", () => {
    expect(
      verdicts(journal({ kind: "append", id: "a1", corrections_since_last_append: "None." })),
    ).toEqual([]);
  });
});
