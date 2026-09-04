import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

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
  renderCard,
  REPORT_VERSION,
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

const SMALLEST: CheckedDocument = { ...UNANCHORED, doc: "docs/a-zero.md", lines: 3 };
const LARGEST: CheckedDocument = { ...UNANCHORED, doc: "docs/c.md", lines: 120 };

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

  it("leaves next null when no document matched, and when any document carries a marker", () => {
    expect(summarize([], false).next).toBeNull();
    expect(summarize([anchored()], false).next).toBeNull();
    expect(summarize([anchored(), UNANCHORED], false).next).toBeNull();
    expect(summarize([anchored(), UNANCHORED, LARGEST], true).next).toBeNull();
  });

  it("names the largest matched document in the funnel when no document carries a marker", () => {
    expect(summarize([SMALLEST, UNANCHORED, LARGEST], false).next).toBe(
      "nullius audit docs/c.md --propose",
    );
    // The floor changes the exit code, not the next step.
    expect(summarize([SMALLEST, UNANCHORED, LARGEST], true).next).toBe(
      "nullius audit docs/c.md --propose",
    );
  });

  it("breaks a tie on line count by taking the first document in order", () => {
    const twin: CheckedDocument = { ...UNANCHORED, doc: "docs/z.md" };
    expect(summarize([UNANCHORED, twin], false).next).toBe("nullius audit docs/b.md --propose");
    expect(summarize([twin, UNANCHORED], false).next).toBe("nullius audit docs/z.md --propose");
  });

  it("does not let a canary guard alone lift a document out of the funnel", () => {
    const guardOnly: CheckedDocument = { ...UNANCHORED, guard: GUARD };
    expect(summarize([guardOnly], false).next).toBe("nullius audit docs/b.md --propose");
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

  it("surfaces the funnel as summary.next, and only on a zero-marker run", () => {
    expect(render([SMALLEST, UNANCHORED, LARGEST]).summary.next).toBe(
      "nullius audit docs/c.md --propose",
    );
    expect(render([anchored(), LARGEST]).summary.next).toBeNull();
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

describe("renderJson — diagnostics", () => {
  it("omits the key when there are no diagnostics", () => {
    const report = JSON.parse(renderJson(summarize([], false))) as Record<string, unknown>;
    expect(report).not.toHaveProperty("diagnostics");
    expect(report).toMatchObject({ version: 1, documents: [], summary: { documents: 0, next: null } });
  });

  it("carries the messages that also went to stderr", () => {
    const report = JSON.parse(renderJson(summarize([], true), ["no files matched: x/**/*.md"])) as {
      diagnostics: string[];
    };
    expect(report.diagnostics).toEqual(["no files matched: x/**/*.md"]);
  });
});


/* -------------------------------------------------------------------------
 * The maintainer card
 *
 * A structured rendering of the report for a pull-request comment, replacing a
 * fenced dump of human-format stdout. The checked document is PR-controlled
 * input, so every value the card interpolates is escaped, and the tests below
 * treat that as security work rather than formatting.
 * ---------------------------------------------------------------------- */

describe("renderCard", () => {
  const FIXTURES = fileURLToPath(new URL("../../../spec/fixtures/card/", import.meta.url));
  const load = (name: string): CheckReport =>
    JSON.parse(readFileSync(join(FIXTURES, name), "utf8")) as CheckReport;

  it("reports counts taken from the summary, not recomputed", () => {
    const report = load("check-report.json");
    const card = renderCard(report);

    expect(card).toContain(`${String(report.summary.presenceAnchors)} presence`);
    expect(card).toContain(`${String(report.summary.absenceAnchors)} absence`);
    for (const [verdict, count] of Object.entries(report.summary.verdicts)) {
      expect(card).toContain(verdict);
      expect(card).toContain(String(count));
    }
  });

  it("states what a passing run does not establish, and names the check it is not", () => {
    const card = renderCard(load("check-report.json"));
    expect(card).toMatch(/certif/i);
    expect(card).toContain("audit");
    expect(card).not.toMatch(/premise validity/i);
  });

  it("lists every failing anchor with the document that carries it", () => {
    const card = renderCard(load("adversarial-report.json"));
    expect(card).toContain("FABRICATED");
  });

  it("never prints a canary location, while still counting it as a failure", () => {
    const card = renderCard(load("adversarial-report.json"));
    expect(card).not.toContain("openspec/changes/secret/proposal.md");
    expect(card).not.toContain("4242");
    expect(card).not.toContain("the planted sentence that must not be printed");
    expect(card).toMatch(/canary/i);
  });

  it("renders adversarial text inertly, leaving the table structure intact", () => {
    const card = renderCard(load("adversarial-report.json"));
    const rows = card.split("\n").filter((line) => line.startsWith("|"));
    expect(rows.length).toBeGreaterThan(2);

    // Split on UNESCAPED pipes only. A naive split counts the backslash-pipe
    // that escaping produces, which would make an escaped cell look like a
    // broken one — the test would fail on the fix rather than on the defect.
    const cells = (row: string): number => row.split(/(?<!\\)\|/).length;
    const widths = new Set(rows.map(cells));
    expect(widths.size).toBe(1);
    // And the escaping is doing something: the hostile text had a raw pipe.
    expect(card).toContain("\\|");
    // Per LINE, not per document: the document is joined with newlines, and a
    // newline is itself in the control range. The hazard is a control character
    // surviving INSIDE a cell, which is what would break out of the row.
    for (const line of card.split("\n")) {
      expect(line).not.toMatch(/[\u0000-\u001F\u007F]/);
      expect(line.trimStart()).not.toMatch(/^::/);
    }
  });

  it("says zero rather than rendering an empty card", () => {
    const card = renderCard(load("zero-anchor-report.json"));
    expect(card).toContain("0 presence");
    expect(card).toContain("README.md");
  });

  it("links a failing anchor into the repository when given somewhere to link", () => {
    const card = renderCard(load("adversarial-report.json"), {
      linkBase: "https://github.com/o/r/blob/abc123",
    });
    expect(card).toContain("https://github.com/o/r/blob/abc123/");
    expect(card).toContain("#L3");
    // The path is URL-encoded on the way into the href: a hostile path
    // containing a paren or a space would otherwise close the link early and
    // spill the rest of the row into the comment.
    expect(card).not.toMatch(/\]\(https:[^)]*[ |]/);
  });

  it("renders the location as inert text when there is nowhere to link", () => {
    // The kernel knows no repository and must not invent one.
    const card = renderCard(load("adversarial-report.json"));
    expect(card).not.toContain("https://");
  });

  it("is renderable by the Action that will render it", () => {
    /*
     * The report version now lives in this file and in `action/action.yml`,
     * and the Action's copy decides whether a card is rendered at all. On the
     * run report, exactly this drift went unnoticed twice — once by a unit
     * test pinning the old number, once by CI — so the guard is written here
     * before it can happen a third time rather than after.
     *
     * Read as text: no package.json in this repo carries a YAML parser, and
     * `packages/kit/src/init.test.ts` already asserts against rendered YAML
     * the same way.
     */
    const action = readFileSync(
      fileURLToPath(new URL("../../../action/action.yml", import.meta.url)),
      "utf8",
    );
    const match = /ACCEPTED_CHECK_VERSIONS='([^']*)'/.exec(action);
    expect(match).not.toBeNull();
    const accepted = (match?.[1] ?? "").split(/\s+/).filter((t) => t.length > 0).map(Number);
    expect(accepted).toContain(REPORT_VERSION);
    // A set the Action iterates, not an equality it compares.
    expect(action).toContain("for accepted in $ACCEPTED_CHECK_VERSIONS");
  });

  it("is a golden, so a change to what a maintainer reads is a change to a file", () => {
    const path = join(FIXTURES, "golden-card.md.txt");
    const actual = renderCard(load("check-report.json"));
    if (process.env["NULLIUS_UPDATE_GOLDENS"] === "1") {
      writeFileSync(path, actual);
      return;
    }
    expect(actual).toBe(readFileSync(path, "utf8"));
  });
});
