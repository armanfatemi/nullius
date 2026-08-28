import { describe, expect, it } from "vitest";

import { isFailure, type ClaimResult, type Verdict } from "./checkClaims";
import {
  countFailures,
  exitCode,
  label,
  renderJson,
  summarize,
  type CheckedDocument,
  type CheckReport,
} from "./checkReport";
import type { RewritePlan } from "./rewrite";

/**
 * The collect/render split exists so that both renderers, and the exit code,
 * read one structure. These tests pin that structure over a FIXED result set
 * — nothing is read from disk — so a renderer regression is caught by name
 * rather than by a subprocess suite diffing whole transcripts.
 */

const DOC = "docs/a.md";

function presence(
  line: number,
  verdict: Verdict,
  detail: string,
  extra: { foundLine?: number; rev?: string } = {},
): ClaimResult {
  const claim = {
    kind: "presence" as const,
    path: "src/a.ts",
    line: 88,
    text: "const x = 1;",
    source: { doc: DOC, line },
    ...(extra.rev === undefined ? {} : { rev: extra.rev }),
  };
  return extra.foundLine === undefined
    ? { claim, verdict, detail }
    : { claim, verdict, detail, foundLine: extra.foundLine };
}

const OK = presence(5, "ok", "", { rev: "a1b2c3d" });
const DRIFT = presence(9, "drift", "text is on line 90, not 88 — update the citation", {
  foundLine: 90,
});
const FABRICATED = presence(13, "fabricated", "text does not appear anywhere in src/a.ts");
const ABSENCE_OK: ClaimResult = {
  claim: {
    kind: "absence",
    command: "grep -rn 'x' src/",
    expectedCount: 0,
    source: { doc: DOC, line: 17 },
  },
  verdict: "ok",
  detail: "",
};
const GUARD: ClaimResult = {
  claim: { kind: "canary", source: { doc: DOC, line: 21 } },
  verdict: "canary-present",
  detail: "a registered canary is planted in this document",
};

const PARSED = [OK, DRIFT, FABRICATED, ABSENCE_OK];

function anchored(guard: ClaimResult | null = null, plan: RewritePlan | null = null): CheckedDocument {
  return {
    doc: DOC,
    lines: 24,
    claims: PARSED.map((result) => result.claim),
    results: PARSED,
    guard,
    plan,
  };
}

const UNANCHORED: CheckedDocument = {
  doc: "docs/b.md",
  lines: 57,
  claims: [],
  results: [],
  guard: null,
  plan: null,
};

const PLAN: RewritePlan = {
  content: "",
  applied: [
    {
      source: { doc: DOC, line: 9 },
      kind: "fix",
      before: "**Evidence:** `src/a.ts:88` — `const x = 1;`",
      after: "**Evidence:** `src/a.ts:90` — `const x = 1;`",
      claim: { kind: "presence", path: "src/a.ts", line: 90, text: "const x = 1;", source: { doc: DOC, line: 9 } },
    },
  ],
  skipped: [{ source: { doc: DOC, line: 5 }, kind: "stamp", reason: "not-at-rev" }],
};

describe("summarize — the collected structure", () => {
  it("counts failures over parsed results with isFailure, not by naming verdicts", () => {
    const run = summarize([anchored(), UNANCHORED], false);

    expect(run.failures).toBe(1);
    expect(run.failures).toBe(countFailures(PARSED));
    expect(run.failures).toBe(PARSED.filter((result) => isFailure(result.verdict)).length);
  });

  it("counts the canary guard as a failure alongside the parsed results", () => {
    const run = summarize([anchored(GUARD), UNANCHORED], false);

    expect(run.failures).toBe(2);
    expect(run.guardFired).toBe(true);
    expect(summarize([anchored(), UNANCHORED], false).guardFired).toBe(false);
  });

  it("raises the marker floor only under --require-markers, and only for unanchored docs", () => {
    expect(summarize([anchored(), UNANCHORED], false).markerFloorFailed).toBe(false);
    expect(summarize([anchored(), UNANCHORED], true).markerFloorFailed).toBe(true);
    expect(summarize([anchored()], true).markerFloorFailed).toBe(false);
  });

  it("lists unanchored documents by name and line count, and never counts the guard as a marker", () => {
    const guardOnly: CheckedDocument = { ...UNANCHORED, guard: GUARD };
    const run = summarize([anchored(), guardOnly], false);

    expect(run.unanchored).toEqual([{ doc: "docs/b.md", lines: 57 }]);
    expect(run.checked).toBe(4);
  });

  it("counts presence and absence anchors apart", () => {
    const run = summarize([anchored(), UNANCHORED], false);

    expect(run.presenceAnchors).toBe(3);
    expect(run.absenceAnchors).toBe(1);
  });

  it("leaves next null — the funnel is a later task's to fill", () => {
    expect(summarize([UNANCHORED], false).next).toBeNull();
  });

  it("computes the exit code from the same fields both renderers read", () => {
    expect(exitCode(summarize([anchored(), UNANCHORED], false))).toBe(1);
    expect(exitCode(summarize([UNANCHORED], false))).toBe(0);
    expect(exitCode(summarize([UNANCHORED], true))).toBe(1);
    const passing: CheckedDocument = { ...anchored(), results: [OK, DRIFT, ABSENCE_OK] };
    expect(exitCode(summarize([passing], true))).toBe(0);
  });
});

describe("renderJson — the Decision 5 schema", () => {
  function render(documents: CheckedDocument[], requireMarkers = false): CheckReport {
    const text = renderJson(summarize(documents, requireMarkers));
    expect(text.endsWith("\n")).toBe(true);
    return JSON.parse(text) as CheckReport;
  }

  it("emits version 1 and one entry per document", () => {
    const report = render([anchored(), UNANCHORED]);

    expect(report.version).toBe(1);
    expect(report.documents.map((entry) => entry.doc)).toEqual([DOC, "docs/b.md"]);
    expect(report.documents[0]?.lines).toBe(24);
    expect(report.documents[1]?.results).toEqual([]);
  });

  it("sets failing exactly where isFailure does", () => {
    const report = render([anchored(GUARD)]);
    const results = report.documents[0]?.results ?? [];

    expect(results.length).toBe(5);
    for (const entry of results) {
      expect(entry.failing, entry.verdict).toBe(isFailure(entry.verdict));
    }
    expect(results.filter((entry) => entry.failing).map((entry) => entry.verdict)).toEqual([
      "canary-present",
      "fabricated",
    ]);
  });

  it("carries the human label, so SEARCH-CLEAN is what a passing absence claim says", () => {
    const report = render([anchored()]);
    const results = report.documents[0]?.results ?? [];

    expect(results.find((entry) => entry.claim.kind === "absence")?.label).toBe("SEARCH-CLEAN");
    expect(results.find((entry) => entry.verdict === "drift")?.label).toBe("DRIFT");
    expect(label(ABSENCE_OK)).toBe("SEARCH-CLEAN");
  });

  it("hoists source and keeps the rest of the claim, with foundLine only where it was set", () => {
    const report = render([anchored()]);
    const results = report.documents[0]?.results ?? [];
    const drift = results.find((entry) => entry.verdict === "drift");

    expect(drift?.source).toEqual({ doc: DOC, line: 9 });
    expect(drift?.claim).toEqual({ kind: "presence", path: "src/a.ts", line: 88, text: "const x = 1;" });
    expect(drift?.claim).not.toHaveProperty("source");
    expect(drift?.foundLine).toBe(90);
    for (const entry of results) {
      if (entry.verdict !== "drift") expect(entry).not.toHaveProperty("foundLine");
    }
    expect(results.find((entry) => entry.verdict === "ok")?.claim).toMatchObject({ rev: "a1b2c3d" });
  });

  it("summarises counts, verdicts, unanchored docs, and the marker floor", () => {
    const report = render([anchored(GUARD), UNANCHORED], true);

    expect(report.summary).toEqual({
      documents: 2,
      anchoredDocuments: 1,
      unanchored: [{ doc: "docs/b.md", lines: 57 }],
      presenceAnchors: 3,
      absenceAnchors: 1,
      verdicts: { ok: 2, drift: 1, fabricated: 1, "canary-present": 1 },
      failures: 2,
      markerFloorFailed: true,
      next: null,
    });
  });

  it("omits rewrites when no rewrite ran, and flattens them with a doc when one did", () => {
    expect(render([anchored()])).not.toHaveProperty("rewrites");

    const report = render([anchored(null, PLAN)]);
    expect(report.rewrites).toEqual({
      applied: [{ doc: DOC, ...PLAN.applied[0] }],
      skipped: [{ doc: DOC, ...PLAN.skipped[0] }],
    });
  });

  it("is a single document with a trailing newline and nothing else", () => {
    const text = renderJson(summarize([anchored()], false));

    expect(text).toBe(`${JSON.stringify(JSON.parse(text), null, 2)}\n`);
  });
});
