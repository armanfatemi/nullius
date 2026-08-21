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
