import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { CanaryEntry } from "./canary";
import type { CheckReport } from "./checkReport";
import type { OracleReport } from "./oracle";
import { validateJournal, type JournalFinding, type JournalReport } from "./witness";
import {
  buildRunReport,
  detectRounds,
  escapeCell,
  escapeMermaidLabel,
  mermaidLabel,
  parseBundle,
  readRecords,
  reconstructJournal,
  renderJson,
  renderMarkdown,
  ROUND_WINDOW_MS,
  summariseJournalFindings,
  VALIDATION_GROUP_CAP,
  RUN_REPORT_VERSION,
  type BundledJournalReport,
  type ReportSection,
  type ReportTier,
  type RunBundle,
  type RunReport,
  type RunReportInput,
} from "./witnessReport";

/*
 * Fixtures. All five journals and both envelopes are committed under
 * spec/fixtures/report/. The envelopes were produced by the real
 * `nullius-kit witness bundle` over the real range PR #58 landed on
 * (8211685..f431193), in a worktree at that commit with the fixture journals
 * placed in .nullius/runs/ — not hand-written, and not tuned to this file.
 */
const FIXTURES = fileURLToPath(new URL("../../../spec/fixtures/report/", import.meta.url));

function fixture(name: string): string {
  return readFileSync(join(FIXTURES, name), "utf8");
}

function readBundle(name: string): RunBundle {
  const parsed = parseBundle(fixture(name));
  if ("error" in parsed) throw new Error(`${name}: ${parsed.error}`);
  return parsed;
}

function reportsFor(bundle: RunBundle): BundledJournalReport[] {
  return bundle.journals.map((journal) => ({
    session: journal.session,
    report: validateJournal(reconstructJournal(journal.lines)),
  }));
}

const PR58_CHECK = JSON.parse(fixture("pr58-check.json")) as CheckReport;

/**
 * The real `oracle` output for the fixture range, captured from
 * `nullius oracle 8211685..f431193` in that worktree, is the refusal in
 * spec/fixtures/report/pr58-oracle.txt: this repository declares no `oracles`
 * key, so the verb exits 2 rather than reporting a clean zero. That is the
 * fact the report has to render, and it is why the report calls `checkOracles`
 * directly and branches on `unconfigured` instead of shelling out to the verb.
 */
const UNCONFIGURED_ORACLE: OracleReport = {
  findings: [],
  justified: [],
  advisory: [],
  unconfigured: true,
  weakeningUnchecked: [],
  journalAbsent: true,
  unreadable: [],
};

const CONFIGURED_ORACLE: OracleReport = {
  findings: [
    {
      verdict: "unjustified-oracle-change",
      subject: "packages/claims/src/canary.test.ts",
      change: "weakened",
      detail: "3 assertion(s) removed and no decision names this path",
    },
  ],
  justified: [],
  advisory: ["packages/claims/src/canary.ts"],
  unconfigured: false,
  weakeningUnchecked: [],
  journalAbsent: true,
  unreadable: [],
};

function baseInput(overrides: Partial<RunReportInput> = {}): RunReportInput {
  const bundle = overrides.bundle === undefined ? readBundle("pr58-bundle.json") : overrides.bundle;
  return {
    range: { spec: "8211685..f431193", base: "8211685", head: "f431193" },
    bundle,
    bundlePath: "nullius.runs/feat-add-canary-status-redaction.json",
    commits: bundle?.range.commits ?? [],
    changedFiles: bundle?.selection.changedFiles ?? [],
    checkRun: PR58_CHECK,
    oracleReport: UNCONFIGURED_ORACLE,
    journalReports: bundle === null ? [] : reportsFor(bundle),
    canary: null,
    ...overrides,
  };
}

function tier(report: RunReport, id: ReportTier["id"]): ReportTier {
  const found = report.tiers.find((entry) => entry.id === id);
  if (found === undefined) throw new Error(`no ${id} tier`);
  return found;
}

function section(report: RunReport, tierId: ReportTier["id"], sectionId: string): ReportSection {
  const found = tier(report, tierId).sections.find((entry) => entry.id === sectionId);
  if (found === undefined) throw new Error(`no ${tierId}/${sectionId} section`);
  return found;
}

/* -------------------------------------------------------------------------
 * Escaping
 * ---------------------------------------------------------------------- */

describe("escapeCell", () => {
  // The adversarial values are one per surface the renderer puts a
  // contributor-controlled string into: a dispatch's task, a mutation's path,
  // and a prompt's text.
  const ADVERSARIAL_TASK = "ship it | now\nreally]  `rm -rf`  <img src=x> \u0007bell";
  const ADVERSARIAL_PATH = "src/a|b/c]d`e<f>.ts";
  const ADVERSARIAL_PROMPT = "# heading\r\ndo the thing | quickly";

  it("neutralises the pipe that would end a table cell", () => {
    expect(escapeCell(ADVERSARIAL_TASK)).not.toMatch(/(?<!\\)\|/);
    expect(escapeCell(ADVERSARIAL_PATH)).not.toMatch(/(?<!\\)\|/);
  });

  it("replaces every control character, including the newline and the carriage return", () => {
    for (const value of [ADVERSARIAL_TASK, ADVERSARIAL_PATH, ADVERSARIAL_PROMPT]) {
      // eslint-disable-next-line no-control-regex -- the point of the assertion
      expect(escapeCell(value)).not.toMatch(/[\u0000-\u001F\u007F]/);
    }
    // Replaced, not dropped: a cell that silently loses its second half reads
    // as a shorter string rather than as a redacted one.
    expect(escapeCell("a\nb")).toBe("a·b");
    expect(escapeCell("a\u0007b")).toBe("a·b");
  });

  it("escapes the backtick, the brackets and the angle brackets", () => {
    expect(escapeCell("`code`")).toBe("\\`code\\`");
    expect(escapeCell("a]b[c")).toBe("a\\]b\\[c");
    expect(escapeCell("<img src=x>")).toBe("&lt;img src=x&gt;");
  });

  it("escapes the backslash first, so no later escape is itself escaped", () => {
    expect(escapeCell("a\\|b")).toBe("a\\\\\\|b");
  });

  it("defuses a leading markdown control character", () => {
    expect(escapeCell("# heading")).toBe("\\# heading");
    expect(escapeCell("- item")).toBe("\\- item");
    // `>` is already inert by the time the leading-character guard runs: the
    // angle-bracket pass turned it into an entity, which is not a blockquote
    // marker and needs no second escape. Asserted rather than assumed, because
    // "the earlier pass already handled it" is the kind of claim that stops
    // being true when a pass is reordered.
    expect(escapeCell("> quote")).toBe("&gt; quote");
  });

  it("leaves a double quote alone — it is inert in a markdown cell", () => {
    expect(escapeCell('say "hello"')).toBe('say "hello"');
  });
});

describe("escapeMermaidLabel", () => {
  it("keeps ASCII x and replaces MULTIPLICATION SIGN (U+00D7)", () => {
    // The allow-list is `[A-Za-z0-9 ._:/x()-]` with ASCII `x`. An earlier draft
    // of the design wrote `×` into the allow-list; a multiplication sign is a
    // non-ASCII character the label grammar has no need of, and shipping either
    // reading untested is what this asserts against.
    expect(escapeMermaidLabel("3 x 4")).toBe("3 x 4");
    expect(escapeMermaidLabel("3 × 4")).toBe("3 · 4");
    expect(escapeMermaidLabel("×")).not.toContain("×");
  });

  it("replaces everything outside the allow-list with a middle dot", () => {
    expect(escapeMermaidLabel('a"b')).toBe("a·b");
    expect(escapeMermaidLabel("a[b]c")).toBe("a·b·c");
    expect(escapeMermaidLabel("a{b}c")).toBe("a·b·c");
    expect(escapeMermaidLabel("a|b")).toBe("a·b");
    expect(escapeMermaidLabel("a\nb")).toBe("a·b");
    expect(escapeMermaidLabel("a`b")).toBe("a·b");
    expect(escapeMermaidLabel("emoji \u{1F600}")).toBe("emoji ··");
  });

  it("is a QUOTING case, not an escaping case, for `::`", () => {
    // `:` is INSIDE the allow-list, so `::` survives replacement untouched and
    // is made inert by the quotes the caller adds. Listed here as a quoting
    // case on purpose: an earlier draft filed it under escaping, which would
    // have implied a replacement that does not and should not happen.
    expect(escapeMermaidLabel("a::b")).toBe("a::b");
    expect(mermaidLabel("a::b")).toBe('"a::b"');
  });

  it("truncates a long label with ASCII dots, which the allow-list admits", () => {
    const label = escapeMermaidLabel("x".repeat(200));
    expect(label.length).toBeLessThanOrEqual(60);
    expect(label.endsWith("...")).toBe(true);
    expect(label).not.toContain("…");
  });

  it("quotes the label, and a quote inside it cannot escape the quoting", () => {
    expect(mermaidLabel('a"b')).toBe('"a·b"');
  });
});

describe("the flowchart", () => {
  it("renders adversarial labels inert and still parses as a mermaid block", () => {
    const bundle = readBundle("pr58-bundle.json");
    const report = buildRunReport(baseInput({ bundle }));
    expect(report.flowchart).not.toBeNull();
    const mermaid = report.flowchart?.mermaid ?? "";
    expect(mermaid.startsWith("flowchart LR\n")).toBe(true);
    // Node ids are generated, never derived from content: an id is the one
    // position in the grammar quoting cannot protect.
    for (const line of mermaid.split("\n").slice(1)) {
      expect(line).toMatch(/^ {2}(n\d+\[".*"\]|n\d+ --> n\d+)$/);
    }
  });
});

/* -------------------------------------------------------------------------
 * Determinism — written BEFORE the goldens, which depend on it
 * ---------------------------------------------------------------------- */

describe("determinism", () => {
  it("renders the same fixture twice, byte for byte", () => {
    const first = renderMarkdown(buildRunReport(baseInput()));
    const second = renderMarkdown(buildRunReport(baseInput()));
    expect(second).toBe(first);
  });

  it("renders the same JSON twice, byte for byte", () => {
    const first = renderJson(buildRunReport(baseInput()));
    const second = renderJson(buildRunReport(baseInput()));
    expect(second).toBe(first);
  });

  it("reads no wall clock: every rendered timestamp is in a record or a commit", () => {
    const bundle = readBundle("pr58-bundle.json");
    const rendered = renderMarkdown(buildRunReport(baseInput({ bundle })));
    const sources = new Set<string>();
    for (const commit of bundle.range.commits) sources.add(commit.at);
    for (const journal of bundle.journals) {
      for (const record of readRecords(journal.lines)) {
        if (record.at !== null) sources.add(record.at);
        // Bursts are printed in the ISO form of a record's own timestamp.
        if (record.atMs !== null) sources.add(new Date(record.atMs).toISOString());
      }
    }
    const stamps = rendered.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[^ |]*/g) ?? [];
    expect(stamps.length).toBeGreaterThan(0);
    for (const stamp of stamps) expect(sources.has(stamp)).toBe(true);
  });
});

/* -------------------------------------------------------------------------
 * Tier counts come off `provenance`, and absence is never a zero
 * ---------------------------------------------------------------------- */

describe("a journal below the ledger floor", () => {
  const report = buildRunReport(baseInput());
  const attribution = [
    section(report, "hook-attested", "hook-attribution"),
    section(report, "self-reported", "self-attribution"),
    section(report, "unattributed", "unattributed"),
  ];

  it("renders all three tier breakdowns as not recorded", () => {
    for (const entry of attribution) expect(entry.status).toBe("not-recorded");
  });

  it("names the journal's version and the version attribution arrived at", () => {
    // Asserted against the structured report rather than the markdown, and by
    // the two version strings rather than by scanning for "0": a string scan
    // for a zero would fire on `0.2` and `0.6` themselves.
    for (const entry of attribution) {
      expect(entry.reason).toContain("0.2");
      expect(entry.reason).toContain("0.6");
    }
  });

  it("carries no `count` key at all — absence rendered as zero is the failure mode", () => {
    for (const entry of attribution) {
      expect(Object.hasOwn(entry, "count")).toBe(false);
      expect(entry.count).toBeUndefined();
    }
  });

  it("renders the ledger-backed sections as not recorded too, for the same reason", () => {
    for (const id of ["stages", "resolutions", "decisions", "checks"]) {
      const entry = section(report, "self-reported", id);
      expect(entry.status).toBe("not-recorded");
      expect(Object.hasOwn(entry, "count")).toBe(false);
    }
    for (const id of ["findings", "prompts"]) {
      const entry = section(report, "hook-attested", id);
      expect(entry.status).toBe("not-recorded");
      expect(Object.hasOwn(entry, "count")).toBe(false);
    }
  });

  it("still counts the records the validator did read", () => {
    // The tier BREAKDOWN is what is missing, not the journal. 20 dispatches and
    // 37 mutations are in the validator's report either way.
    expect(section(report, "hook-attested", "dispatches").count).toBe(20);
    expect(section(report, "hook-attested", "outcomes").count).toBe(20);
  });
});

describe("range scoping", () => {
  const bundle = readBundle("pr58-bundle.json");
  const report = buildRunReport(baseInput({ bundle }));

  // The four paths the PR #58 session mutated that are in no pull request at
  // all. They are what makes this fixture the right one: the journal's
  // mutations only partially overlap the range.
  const OUT_OF_RANGE = [
    ".claude/agent-memory/architecture-reviewer/MEMORY.md",
    ".claude/agent-memory/architecture-reviewer/feedback_scope-boundaries-must-be-mechanisms.md",
    ".claude/agent-memory/architecture-reviewer/project_proposal-injected-prose.md",
    ".claude/agent-memory/retro-writer/MEMORY.md",
  ];

  it("carries the out-of-range records in the bundle", () => {
    const lines = bundle.journals.flatMap((journal) => journal.lines).join("\n");
    for (const path of OUT_OF_RANGE) expect(lines).toContain(path);
    expect(bundle.selection.changedFiles).not.toContain(OUT_OF_RANGE[0]);
  });

  it("excludes them from the mutation-derived table and says how many", () => {
    const mutations = section(report, "hook-attested", "mutations");
    const paths = (mutations.table?.rows ?? []).map((row) => row[0]);
    for (const path of OUT_OF_RANGE) expect(paths).not.toContain(path);
    expect(mutations.count).toBe(33);
    expect(mutations.notes.join(" ")).toContain("4 mutation record(s)");
  });

  it("never reaches the tier counts, which stay journal-wide", () => {
    // On this fixture the tier count is absent for a VERSION reason. The
    // assertion that matters is that the range is not among the reasons: a tier
    // scoped by the range would be the renderer re-partitioning `provenance`,
    // which is the one thing Decision 1 forbids.
    const attribution = section(report, "hook-attested", "hook-attribution");
    expect(attribution.reason).not.toContain("range");
    expect(attribution.statement).toContain("Journal-wide");
  });

  it("leaves the tier counts of a 0.6 journal at their whole-journal figures", () => {
    // review-only is version 0.6 and mutates exactly one file, which is NOT in
    // the range's changed files. Its mutation table is therefore empty while
    // `provenance` still reports every record in the journal.
    const sixOh = readBundle("review-only-bundle.json");
    const reports = reportsFor(sixOh);
    const provenance = reports[0]?.report.provenance;
    expect(provenance).not.toBeNull();
    const rendered = buildRunReport(baseInput({ bundle: sixOh, journalReports: reports }));
    expect(section(rendered, "hook-attested", "hook-attribution").count).toBe(provenance?.hooks);
    expect(section(rendered, "self-reported", "self-attribution").count).toBe(
      provenance?.selfReported,
    );
    expect(section(rendered, "unattributed", "unattributed").count).toBe(provenance?.unattributed);
    // ...while the mutation-derived table is empty and says so.
    const mutations = section(rendered, "hook-attested", "mutations");
    expect(mutations.count).toBe(0);
    expect(mutations.notes.join(" ")).toContain("1 mutation record(s)");
  });

  it("counts kinds that carry no path in full, and the report says so", () => {
    expect(section(report, "hook-attested", "dispatches").statement).toContain(
      "carries no path to scope by",
    );
  });
});

/* -------------------------------------------------------------------------
 * Rounds — hand-counted from the fixture's raw record timestamps
 * ---------------------------------------------------------------------- */

describe("round detection", () => {
  /*
   * Hand-counted from `spec/fixtures/report/pr58-session.jsonl`'s twenty
   * `dispatch` records, by reading their `at` fields. NOT taken from the
   * retrospective, which records pipeline stage labels (`pre_review_1…5`,
   * `stage_6`) rather than timestamp clusters — a disagreement between that
   * and ROUND_WINDOW_MS would not say which of the two was wrong.
   *
   * | round | first dispatch (UTC)      | size |
   * | ----- | ------------------------- | ---- |
   * | 1     | 2026-08-30T20:12:18.695Z  | 3    |
   * | 2     | 2026-08-30T20:24:04.770Z  | 3    |
   * | 3     | 2026-08-31T00:10:32.331Z  | 3    |
   * | 4     | 2026-08-31T00:39:02.214Z  | 3    |
   * | 5     | 2026-08-31T00:45:38.123Z  | 3    |
   * | 6     | 2026-08-31T01:24:08.320Z  | 3    |
   *
   * Two dispatches are in no round: `Write canary redaction tests` at
   * 2026-08-31T01:15:55.429Z and `Write the retrospective` at
   * 2026-08-31T02:01:11.185Z. Each is alone, and a lone dispatch is not a
   * round — 6 rounds and 18 of 20 dispatches.
   */
  const HAND_COUNT = [
    { index: 1, startedAt: "2026-08-30T20:12:18.695Z", size: 3 },
    { index: 2, startedAt: "2026-08-30T20:24:04.770Z", size: 3 },
    { index: 3, startedAt: "2026-08-31T00:10:32.331Z", size: 3 },
    { index: 4, startedAt: "2026-08-31T00:39:02.214Z", size: 3 },
    { index: 5, startedAt: "2026-08-31T00:45:38.123Z", size: 3 },
    { index: 6, startedAt: "2026-08-31T01:24:08.320Z", size: 3 },
  ];

  const records = readRecords(fixture("pr58-session.jsonl").split("\n"));
  const dispatches = records.filter((record) => record.kind === "dispatch");

  it("matches the hand-count", () => {
    expect(dispatches).toHaveLength(20);
    const rounds = detectRounds(dispatches);
    expect(rounds.map((round) => ({ index: round.index, startedAt: round.startedAt, size: round.size }))).toEqual(
      HAND_COUNT,
    );
  });

  it("does not promote a lone dispatch into a round", () => {
    const rounds = detectRounds(dispatches);
    const grouped = rounds.reduce((total, round) => total + round.size, 0);
    expect(grouped).toBe(18);
    expect(dispatches.length - grouped).toBe(2);
  });

  it("names the agents that ran together", () => {
    const rounds = detectRounds(dispatches);
    expect(rounds[0]?.agents).toEqual([
      "architecture-reviewer",
      "rule-auditor",
      "test-engineer",
    ]);
  });

  it("uses a window the report prints, so a reader can check the grouping", () => {
    expect(ROUND_WINDOW_MS).toBe(120_000);
    const rendered = renderMarkdown(buildRunReport(baseInput()));
    expect(rendered).toContain(`${String(ROUND_WINDOW_MS)} ms`);
  });
});

/* -------------------------------------------------------------------------
 * Re-validation gates the bundle tiers
 * ---------------------------------------------------------------------- */

describe("a tampered bundle", () => {
  // The envelope carries a journal one `report` line short: `d:rev1` is
  // dispatched and never terminated. `witness bundle` cannot produce this —
  // redaction rewrites fields and never drops a line — which is what makes it
  // a tamper rather than a variant.
  const bundle = readBundle("tampered-bundle.json");
  const reports = reportsFor(bundle);
  const report = buildRunReport(
    baseInput({
      bundle,
      journalReports: reports,
      changedFiles: bundle.selection.changedFiles,
      commits: bundle.range.commits,
    }),
  );

  it("is caught by re-validation", () => {
    const verdicts = reports.flatMap((entry) => entry.report.findings.map((f) => f.verdict));
    expect(verdicts).toContain("no-terminal");
  });

  it("replaces the hook-attested tier with the validator's finding", () => {
    const validation = section(report, "code-verified", "journal-validation");
    expect(JSON.stringify(validation.table)).toContain("NO-TERMINAL");
    for (const entry of tier(report, "hook-attested").sections) {
      expect(entry.status).toBe("not-recorded");
      expect(entry.reason).toContain("NO-TERMINAL");
    }
  });

  it("prints no dispatch count — the absence of the number is the assertion", () => {
    const dispatches = section(report, "hook-attested", "dispatches");
    expect(Object.hasOwn(dispatches, "count")).toBe(false);
    const rendered = renderMarkdown(report);
    expect(rendered).toContain("### Dispatches\n");
    expect(rendered).not.toMatch(/### Dispatches — \d/);
  });

  it("does not let the self-reported or unattributed tiers count either", () => {
    for (const id of ["self-reported", "unattributed"] as const) {
      for (const entry of tier(report, id).sections) {
        expect(entry.status).toBe("not-recorded");
        expect(Object.hasOwn(entry, "count")).toBe(false);
      }
    }
  });
});

/* -------------------------------------------------------------------------
 * No bundle
 * ---------------------------------------------------------------------- */

describe("no bundle on the branch", () => {
  const report = buildRunReport(
    baseInput({
      bundle: null,
      journalReports: [],
      commits: readBundle("pr58-bundle.json").range.commits,
      changedFiles: readBundle("pr58-bundle.json").selection.changedFiles,
    }),
  );

  it("still renders the code-verified tier", () => {
    expect(section(report, "code-verified", "anchors").status).toBe("data");
    expect(section(report, "code-verified", "commits").count).toBe(13);
  });

  it("renders the three bundle tiers as not recorded, naming the path", () => {
    for (const id of ["hook-attested", "self-reported", "unattributed"] as const) {
      for (const entry of tier(report, id).sections) {
        expect(entry.status).toBe("not-recorded");
        expect(entry.reason).toContain("no bundle at nullius.runs/feat-add-canary-status-redaction.json");
        expect(Object.hasOwn(entry, "count")).toBe(false);
      }
    }
  });
});

/* -------------------------------------------------------------------------
 * The closing not-recorded list
 * ---------------------------------------------------------------------- */

describe("the not-recorded list", () => {
  it("carries inconclusive candidates by session id, with the --include remedy", () => {
    const report = buildRunReport(baseInput());
    const entry = report.notRecorded.find((row) => row.section.includes("review-only"));
    expect(entry).toBeDefined();
    expect(entry?.tier).toBeNull();
    expect(entry?.reason).toContain("--include review-only");
    expect(renderMarkdown(report)).toContain("--include review-only");
  });

  it("does not list an excluded candidate as inconclusive", () => {
    const report = buildRunReport(baseInput());
    expect(report.notRecorded.some((row) => row.section.includes("other-worktree"))).toBe(false);
  });
});

/* -------------------------------------------------------------------------
 * The oracle row
 * ---------------------------------------------------------------------- */

describe("the oracle row", () => {
  it("reads `not configured` with the key to add, rather than reporting zero changes", () => {
    const report = buildRunReport(baseInput());
    const oracle = section(report, "code-verified", "oracle");
    expect(oracle.status).toBe("not-recorded");
    expect(Object.hasOwn(oracle, "count")).toBe(false);
    expect(oracle.reason).toContain("not configured");
    expect(oracle.reason).toContain("oracles");
  });

  it("renders findings when the project does declare oracles", () => {
    const report = buildRunReport(baseInput({ oracleReport: CONFIGURED_ORACLE }));
    const oracle = section(report, "code-verified", "oracle");
    expect(oracle.status).toBe("data");
    expect(oracle.count).toBe(1);
    expect(JSON.stringify(oracle.table)).toContain("UNJUSTIFIED-ORACLE-CHANGE");
  });
});

/* -------------------------------------------------------------------------
 * Canary
 * ---------------------------------------------------------------------- */

describe("canary redaction", () => {
  const entry: CanaryEntry = {
    doc: "openspec/changes/add-pr-process-report/design.md",
    line: 4242,
    text: "**Evidence:** `packages/claims/src/nowhere.ts:1@deadbee` — `never`",
    plantedAt: "2026-08-31T09:00:00.000Z",
  };

  it("renders neither the document nor the line for a registered entry", () => {
    const report = buildRunReport(baseInput({ canary: entry }));
    const markdown = renderMarkdown(report);
    const json = renderJson(report);
    for (const rendered of [markdown, json]) {
      expect(rendered).not.toContain(entry.doc);
      expect(rendered).not.toContain(String(entry.line));
      expect(rendered).not.toContain(entry.text);
    }
    // The accessor's redacted form IS rendered — the section is not empty, it
    // is location-free. `describeCanary` returns exactly `doc:line` when
    // `reveal` is true, so the call site is what this test is about.
    expect(markdown).toContain(`planted ${entry.plantedAt}`);
  });

  it("counts a canary-present failure and prints neither the document nor the line", () => {
    const planted: CheckReport = {
      version: 1,
      documents: [
        {
          doc: "openspec/changes/add-pr-process-report/design.md",
          lines: 600,
          results: [
            {
              verdict: "canary-present",
              label: "CANARY-PRESENT",
              failing: true,
              source: { doc: "openspec/changes/add-pr-process-report/design.md", line: 4242 },
              claim: { kind: "canary" },
              detail: "a registered canary is planted in this document",
            },
          ],
        },
      ],
      summary: {
        documents: 1,
        anchoredDocuments: 0,
        unanchored: [],
        presenceAnchors: 0,
        absenceAnchors: 0,
        verdicts: { "canary-present": 1 },
        failures: 1,
        markerFloorFailed: false,
        next: null,
      },
    };
    const report = buildRunReport(
      baseInput({ checkRun: planted, bundle: null, journalReports: [] }),
    );
    const anchors = section(report, "code-verified", "anchors");
    expect(anchors.notes.join(" ")).toContain("1 failing");
    const markdown = renderMarkdown({ ...report, check: null });
    expect(markdown).toContain("CANARY-PRESENT");
    expect(markdown).toContain("location withheld");
    expect(markdown).not.toContain("4242");
  });
});

/* -------------------------------------------------------------------------
 * Size budget
 * ---------------------------------------------------------------------- */

describe("the size budget", () => {
  it("truncates at the stated budget with a visible line", () => {
    const report = buildRunReport(baseInput());
    const rendered = renderMarkdown(report, { budgetBytes: 2_000 });
    expect(rendered.length).toBeLessThanOrEqual(2_000);
    expect(rendered).toContain("**Truncated**");
    expect(rendered).toContain("--format json");
  });

  it("leaves a report inside the budget untouched", () => {
    const report = buildRunReport(baseInput());
    const rendered = renderMarkdown(report, { budgetBytes: 1_000_000 });
    expect(rendered).not.toContain("**Truncated**");
  });
});

/* -------------------------------------------------------------------------
 * The figure a card row is about
 *
 * `count` is how many things a section is about; `failing` is how many of them
 * are the case the row asks about. Two sections owed their row a figure and
 * had none: `outcomes` puts its never-reported count only in a rendered cell,
 * and `canary` is built with notes and no count at all. A mark read out of a
 * rendered table would change when the table's formatting did.
 * ---------------------------------------------------------------------- */

describe("the failing figure on a section", () => {
  it("gives outcomes a never-reported count distinct from its total", () => {
    const report = buildRunReport(baseInput());
    const outcomes = section(report, "hook-attested", "outcomes");

    // The total stays the total: three terminal states added together.
    expect(outcomes.count).toBe(20);
    // And the figure the row is about is the third of them, on its own. It
    // agrees with the cell rather than replacing it — the table still renders
    // all three, and `failing` is the one a consumer reads without parsing.
    const rows = outcomes.table?.rows ?? [];
    const cell = rows.find((row) => row[0] === "never reported")?.[1];
    expect(outcomes.failing).toBe(Number(cell));
  });

  it("carries a non-zero never-reported count through to `failing`", () => {
    // No committed bundle has one: `noReport` counts a report record whose
    // outcome says it never reported, and a dispatch with no terminal record
    // at all is NO-TERMINAL instead — a finding, not an outcome. So the count
    // is raised on the validator's own report, which is where the renderer
    // reads it from.
    const bundle = readBundle("pr58-bundle.json");
    const raised = reportsFor(bundle).map((entry, index) => ({
      ...entry,
      report:
        index === 0
          ? { ...entry.report, outcomes: { ...entry.report.outcomes, noReport: 2 } }
          : entry.report,
    }));
    const report = buildRunReport(baseInput({ bundle, journalReports: raised }));
    const outcomes = section(report, "hook-attested", "outcomes");

    expect(outcomes.failing).toBe(2);
    // The total moved with it: `failing` is a member of `count`, not a rival.
    expect(outcomes.count).toBe(22);
  });

  it("gives the canary section a figure, so its row is answerable", () => {
    const clean = buildRunReport(baseInput({ canary: null }));
    expect(section(clean, "code-verified", "canary").failing).toBe(0);
  });

  it("counts a registered canary as the case the row is about", () => {
    const entry: CanaryEntry = {
      doc: "openspec/changes/add-run-report-card/design.md",
      line: 4242,
      text: "**Evidence:** `packages/claims/src/nowhere.ts:1@deadbee` — `never`",
      plantedAt: "2026-08-31T09:00:00.000Z",
    };
    const planted = buildRunReport(baseInput({ canary: entry }));
    const canary = section(planted, "code-verified", "canary");

    expect(canary.failing).toBe(1);
    // Still no location, in either rendering. The figure says one is planted;
    // it must not say where.
    const rendered = renderMarkdown(planted) + renderJson(planted);
    expect(rendered).not.toContain(entry.doc);
    expect(rendered).not.toContain(String(entry.line));
  });

  it("leaves `failing` absent on a section that owes no row a figure", () => {
    // Absence is what makes a row unanswerable rather than clear, so it must
    // not be defaulted to zero across the board.
    const report = buildRunReport(baseInput());
    expect(Object.hasOwn(section(report, "code-verified", "commits"), "failing")).toBe(false);
  });

  it("never carries `failing` on a not-recorded section", () => {
    const report = buildRunReport(
      baseInput({ bundle: null, journalReports: [], commits: [], changedFiles: [] }),
    );
    for (const tier of report.tiers) {
      for (const entry of tier.sections) {
        if (entry.status !== "not-recorded") continue;
        expect(Object.hasOwn(entry, "failing")).toBe(false);
      }
    }
  });
});

/* -------------------------------------------------------------------------
 * The JSON discriminator
 * ---------------------------------------------------------------------- */

describe("the JSON form", () => {
  it("carries its own kind and version", () => {
    const document = JSON.parse(renderJson(buildRunReport(baseInput()))) as RunReport;
    expect(document.kind).toBe("run-report");
    expect(document.version).toBe(RUN_REPORT_VERSION);
    expect(document.version).toBe(1);
  });

  it("embeds the check document under its own key, carrying ITS version", () => {
    const document = JSON.parse(renderJson(buildRunReport(baseInput()))) as RunReport;
    // Two documents numbered `version: 1` on one CLI, told apart by `kind` on
    // the outer one and by its key on the inner one. The inner version is the
    // check report's own, never shadowed by the outer.
    expect(document.check?.version).toBe(PR58_CHECK.version);
    expect(document.check?.summary.failures).toBe(PR58_CHECK.summary.failures);
    expect(Object.hasOwn(document.check ?? {}, "kind")).toBe(false);
  });

  it("renders four tiers in the fixed order", () => {
    const document = JSON.parse(renderJson(buildRunReport(baseInput()))) as RunReport;
    expect(document.tiers.map((entry) => entry.id)).toEqual([
      "code-verified",
      "hook-attested",
      "self-reported",
      "unattributed",
    ]);
  });
});

/* -------------------------------------------------------------------------
 * The envelope is contributor-supplied, and parsed as such
 * ---------------------------------------------------------------------- */

describe("parseBundle", () => {
  it("reads the real envelope the kit wrote", () => {
    const parsed = parseBundle(fixture("pr58-bundle.json"));
    expect("error" in parsed).toBe(false);
  });

  it.each([
    ["not JSON at all", "{"],
    ["a JSON array", "[]"],
    ["no version", JSON.stringify({ range: {}, selection: {}, journals: [] })],
    [
      "no journals array",
      JSON.stringify({ version: 1, range: { spec: "a..b", base: "a", head: "b", commits: [] }, selection: { changed_files: [], candidates: [] } }),
    ],
    [
      "a journal whose lines are not strings",
      JSON.stringify({
        version: 1,
        range: { spec: "a..b", base: "a", head: "b", commits: [] },
        selection: { changed_files: [], candidates: [] },
        journals: [{ session: "s", lines: [1, 2] }],
      }),
    ],
    [
      "a candidate with a classification outside the three",
      JSON.stringify({
        version: 1,
        range: { spec: "a..b", base: "a", head: "b", commits: [] },
        selection: { changed_files: [], candidates: [{ session: "s", classification: "maybe", reason: "" }] },
        journals: [],
      }),
    ],
  ])("refuses %s", (_label, text) => {
    const parsed = parseBundle(text);
    expect("error" in parsed).toBe(true);
  });
});

/* -------------------------------------------------------------------------
 * Goldens. They depend on determinism, above.
 * ---------------------------------------------------------------------- */

describe("goldens", () => {
  /*
   * Set NULLIUS_UPDATE_GOLDENS=1 to rewrite them. Deliberately not the default:
   * a golden that regenerates itself on every run asserts nothing.
   */
  const update = process.env["NULLIUS_UPDATE_GOLDENS"] === "1";

  /*
   * The markdown goldens are named `.md.txt`, not `.md`.
   *
   * CI runs `check` over every markdown file under spec/ with
   * `--require-markers`, and a rendered artefact
   * carries no Evidence Anchors of its own — so a golden with a `.md` extension
   * would fail the marker floor for being exactly what it is. The alternatives
   * were widening that glob or adding an exclude to a config this repository
   * deliberately does not have (the report's own `oracle` row reads *not
   * configured* because of it, and is asserted above). A suffix is the cheapest
   * of the three and the only one that changes nothing else.
   */
  function golden(name: string, actual: string): void {
    const path = join(FIXTURES, name);
    if (update) {
      writeFileSync(path, actual);
      return;
    }
    expect(actual).toBe(readFileSync(path, "utf8"));
  }

  it("markdown, with the bundle", () => {
    golden("golden-with-bundle.md.txt", renderMarkdown(buildRunReport(baseInput())));
  });

  it("json, with the bundle", () => {
    golden("golden-with-bundle.json", renderJson(buildRunReport(baseInput())));
  });

  it("markdown, with no bundle", () => {
    const bundle = readBundle("pr58-bundle.json");
    golden(
      "golden-no-bundle.md.txt",
      renderMarkdown(
        buildRunReport(
          baseInput({
            bundle: null,
            journalReports: [],
            commits: bundle.range.commits,
            changedFiles: bundle.selection.changedFiles,
          }),
        ),
      ),
    );
  });
});

/* -------------------------------------------------------------------------
 * A sanity check on the report's own claim about `validateJournal`
 * ---------------------------------------------------------------------- */

describe("what a green journal-validation row does not certify", () => {
  it("a bundle with a whole journal removed still validates cleanly", () => {
    const bundle = readBundle("pr58-bundle.json");
    const emptied: RunBundle = { ...bundle, journals: [] };
    const reports: BundledJournalReport[] = [];
    const report = buildRunReport(baseInput({ bundle: emptied, journalReports: reports }));
    // Nothing failed — and nothing was counted either, which is the honest
    // outcome. The section says so in its own statement.
    const validation = section(report, "code-verified", "journal-validation");
    expect(validation.status).toBe("not-recorded");
    expect(validation.statement).toContain("never its completeness");
  });

  it("reports every finding a journal carries, not only the first", () => {
    const journal: JournalReport = validateJournal(fixture("rejected-lines.jsonl"));
    expect(journal.findings.filter((f) => f.verdict !== "ok").length).toBeGreaterThan(1);
  });
});

/* -------------------------------------------------------------------------
 * Repetition
 *
 * One root cause must not be restated once per section it blocks. The bundle
 * behind `stale-header-bundle.json` is the real one from PR #80, truncated:
 * its header declares schema 0.2 and its records carry kinds that arrived at
 * 0.3, so every one of them is MALFORMED and the whole bundle is uncountable.
 * That is a single fact. Rendered naively it became 74% of a 21 KB comment —
 * a 9.5 KB table cell listing 57 findings with 6 distinct details, plus the
 * blocking reason repeated thirty times.
 * ---------------------------------------------------------------------- */

describe("a journal whose header names an older schema than its records", () => {
  const bundle = readBundle("stale-header-bundle.json");
  const reports = reportsFor(bundle);
  const report = buildRunReport(
    baseInput({
      bundle,
      journalReports: reports,
      changedFiles: bundle.selection.changedFiles,
      commits: bundle.range.commits,
    }),
  );
  const markdown = renderMarkdown(report);
  const failures = reports.flatMap((entry) =>
    entry.report.findings.filter((finding) => finding.verdict !== "ok"),
  );

  it("is rejected once per offending record, over few distinct details", () => {
    // The premise of every assertion below: many findings, one cause.
    expect(failures.length).toBeGreaterThan(20);
    expect(new Set(failures.map((finding) => finding.detail)).size).toBe(4);
  });

  it("groups the validation cell by detail instead of listing every line", () => {
    const cell = JSON.stringify(section(report, "code-verified", "journal-validation").table);
    const rendered = (cell.match(/MALFORMED/g) ?? []).length;
    expect(rendered).toBeLessThanOrEqual(VALIDATION_GROUP_CAP);
    expect(rendered).toBeLessThan(failures.length);
  });

  it("still names how many records each group covers, so the collapse loses no count", () => {
    const cell = JSON.stringify(section(report, "code-verified", "journal-validation").table);
    // The largest group's size is stated rather than implied by a list length.
    const biggest = Math.max(
      ...[...new Set(failures.map((f) => f.detail))].map(
        (detail) => failures.filter((f) => f.detail === detail).length,
      ),
    );
    // `(n)` rather than `\u00d7n`, following the burst table three sections down:
    // one document that spells the same idea two ways invites the reader to
    // conclude the rule is decorative.
    expect(cell).toContain(`(${String(biggest)} records`);
  });

  it("states the blocking reason in full at most twice, however many sections it blocks", () => {
    const blocked = report.tiers
      .flatMap((entry) => entry.sections)
      .filter((entry) => entry.status === "not-recorded");
    expect(blocked.length).toBeGreaterThan(10);
    const occurrences = markdown.split("a bundled journal did not re-validate").length - 1;
    expect(occurrences).toBeLessThanOrEqual(2);
  });

  it("points a repeat at the section that carries the full reason", () => {
    expect(markdown).toContain("Bundled journals re-validated");
    expect(markdown).toMatch(/\*\*Not recorded:\*\* as above/);
  });

  it("keeps every blocked section's own reason intact in the JSON form", () => {
    // The collapse is a rendering decision. A consumer reading the document
    // gets each section's reason in full, exactly as before — otherwise this
    // is not a shortening, it is a deletion.
    const document = JSON.parse(renderJson(report)) as RunReport;
    const blocked = document.tiers
      .flatMap((entry) => entry.sections)
      .filter((entry) => entry.status === "not-recorded");
    for (const entry of blocked) {
      expect(entry.reason).toBeTruthy();
      expect(entry.reason?.length).toBeGreaterThan(40);
    }
    expect(
      blocked.filter((entry) => entry.reason?.includes("did not re-validate")).length,
    ).toBeGreaterThan(10);
  });

  it("fits a comment a reviewer will actually read", () => {
    // Before the collapse this rendered at 15,676 bytes, of which one table
    // cell was 3,994 and the repeated reason another 6,180.
    expect(markdown.length).toBeLessThan(7_500);
  });
});

describe("summariseJournalFindings", () => {
  function finding(line: number, detail: string): JournalFinding {
    return { line, verdict: "malformed", subject: `r${String(line)}`, detail };
  }

  it("renders a lone finding exactly as it always did", () => {
    expect(summariseJournalFindings([finding(7, "no terminal record")])).toBe(
      "MALFORMED at line 7: no terminal record",
    );
  });

  it("says `valid` for a journal with nothing wrong with it", () => {
    expect(summariseJournalFindings([])).toBe("valid");
  });

  it("names the earliest line in a group, not whichever arrived first", () => {
    const summary = summariseJournalFindings([finding(90, "same"), finding(12, "same")]);
    expect(summary).toBe("MALFORMED (2 records, first at line 12): same");
  });

  it("caps the distinct groups and states the drop rather than hiding it", () => {
    // The fixture bundle has exactly as many distinct details as the cap
    // allows, so the drop notice has no other coverage.
    const many = Array.from({ length: VALIDATION_GROUP_CAP + 3 }, (_, index) =>
      finding(index + 1, `cause ${String(index)}`),
    );
    const summary = summariseJournalFindings(many);
    expect((summary.match(/MALFORMED/g) ?? []).length).toBe(VALIDATION_GROUP_CAP);
    expect(summary).toContain("+3 further distinct finding(s)");
    expect(summary).toContain("the JSON form carries them all");
  });
});

/* -------------------------------------------------------------------------
 * The closing list groups by cause
 * ---------------------------------------------------------------------- */

describe("the closing not-recorded list, when one cause blocks many sections", () => {
  const bundle = readBundle("stale-header-bundle.json");
  const report = buildRunReport(
    baseInput({
      bundle,
      journalReports: reportsFor(bundle),
      changedFiles: bundle.selection.changedFiles,
      commits: bundle.range.commits,
    }),
  );

  it("prints one bullet per distinct reason, not one per section", () => {
    const markdown = renderMarkdown(report);
    const closing = markdown.slice(markdown.lastIndexOf("## Not recorded"));
    const bullets = (closing.match(/^- /gm) ?? []).length;
    const distinct = new Set(report.notRecorded.map((entry) => entry.reason)).size;
    expect(bullets).toBe(distinct);
    expect(bullets).toBeLessThan(report.notRecorded.length);
  });

  it("names every section the reason covers, so grouping hides no section", () => {
    const markdown = renderMarkdown(report);
    const closing = markdown.slice(markdown.lastIndexOf("## Not recorded"));
    for (const entry of report.notRecorded) {
      expect(closing).toContain(entry.section);
    }
  });

  it("leaves the JSON list one entry per section", () => {
    const document = JSON.parse(renderJson(report)) as RunReport;
    expect(document.notRecorded.length).toBe(report.notRecorded.length);
    expect(document.notRecorded.length).toBeGreaterThan(10);
  });
});
