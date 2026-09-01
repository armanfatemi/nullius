/**
 * `witness bundle`'s pure half.
 *
 * The property under test everywhere in this file is that **bundling cannot
 * change a verdict, in either direction**. Everything else — the line count,
 * the `id` gate, the prompt conversion, the statement cap's flag — is a way for
 * that property to fail, and each one is asserted where it can be named rather
 * than through the round trip that would only say *something* moved.
 *
 * Verdict sets are compared on `(verdict, subject)` and never deep-equal. A
 * `JournalFinding` also carries `line`, which shifts with any blank or rejected
 * source line, and `detail`, which embeds line numbers — so deep equality would
 * be flaky for reasons that have nothing to do with the property being tested,
 * and a flaky assertion is one that gets deleted.
 */

import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

import { validateJournal, type JournalFinding } from "@nullius-inverba/claims";
import { describe, expect, it } from "vitest";

import {
  branchSlug,
  buildEnvelope,
  classifyJournals,
  parseBundleRange,
  reconstructJournal,
  redactLines,
  unreadableLines,
  BUNDLE_VERSION,
  EXCERPT_CAP,
  STATEMENT_CAP,
  STATEMENT_CAP_FLAG,
  type ClassifiedJournal,
  type JournalCandidate,
  type SelectionWindow,
} from "./bundle";

const FIXTURES = fileURLToPath(new URL("../../../spec/fixtures/report/", import.meta.url));

function fixture(name: string): JournalCandidate {
  const content = readFileSync(`${FIXTURES}${name}.jsonl`, "utf8");
  return { session: name, lines: content.split("\n") };
}

/** The comparison the round-trip property is made on. Sorted so set equality
 *  is asserted rather than emission order, which the validator owes nobody. */
function verdictSet(findings: readonly JournalFinding[]): string[] {
  return findings.map((finding) => `${finding.verdict}\t${finding.subject}`).sort();
}

function bundleAndRevalidate(candidate: JournalCandidate, prompts = true): string[] {
  const lines = redactLines(candidate.lines, { prompts });
  return verdictSet(validateJournal(reconstructJournal(lines)).findings);
}

/**
 * The window PR #58's range would produce, written out rather than read from
 * git: `classifyJournals` is pure, and a test that shelled out to resolve a
 * range would be testing this machine's clone instead of the rule.
 *
 * The changed-file set is six of PR #58's files. The four
 * `.claude/agent-memory/**` paths the producing session also mutated are
 * deliberately absent from it — they are in no pull request at all, and their
 * presence in the journal is what makes the fixture exercise the rule that the
 * bundle carries records the range never touched.
 */
const RANGE_FILES = [
  "openspec/changes/add-canary-status-redaction/design.md",
  "openspec/changes/add-canary-status-redaction/proposal.md",
  "openspec/changes/add-canary-status-redaction/specs/canary/spec.md",
  "openspec/changes/add-canary-status-redaction/tasks.md",
  "packages/claims/src/canary.test.ts",
  "packages/claims/src/canary.ts",
];

const WINDOW: SelectionWindow = {
  firstMs: Date.parse("2026-08-30T20:05:00.000Z"),
  lastMs: Date.parse("2026-08-31T02:15:00.000Z"),
  slackMs: 30 * 60_000,
  changedFiles: new Set(RANGE_FILES),
};

function classifyFixtures(
  names: readonly string[],
  overrides: Parameters<typeof classifyJournals>[2] = {},
): Map<string, ClassifiedJournal> {
  const classified = classifyJournals(names.map(fixture), WINDOW, overrides);
  return new Map(classified.map((entry) => [entry.session, entry]));
}

describe("parseBundleRange", () => {
  it("splits the two separators and keeps which one was typed", () => {
    expect(parseBundleRange("main..HEAD")).toEqual({
      spec: "main..HEAD",
      base: "main",
      head: "HEAD",
      sep: "..",
    });
    expect(parseBundleRange("main...HEAD")).toEqual({
      spec: "main...HEAD",
      base: "main",
      head: "HEAD",
      sep: "...",
    });
  });

  it("reads a bare revision as that commit against its parent", () => {
    expect(parseBundleRange("04cd9ac")).toEqual({
      spec: "04cd9ac",
      base: "04cd9ac~1",
      head: "04cd9ac",
      sep: "..",
    });
  });

  it("refuses an option-shaped operand rather than escaping it", () => {
    // The operands reach a subprocess. `git show --x:path` is an argument git
    // parses as an option; that it happens to fail today is not a boundary.
    expect(parseBundleRange("--upload-pack=x")).toHaveProperty("error");
    expect(parseBundleRange("main..--x")).toHaveProperty("error");
    expect(parseBundleRange("a..b..c")).toHaveProperty("error");
    expect(parseBundleRange("main..")).toHaveProperty("error");
    expect(parseBundleRange("main;rm -rf /")).toHaveProperty("error");
  });
});

describe("branchSlug", () => {
  it("replaces everything that is not plainly a name", () => {
    expect(branchSlug("feat/add-pr-process-report")).toBe("feat-add-pr-process-report");
    expect(branchSlug("../../etc/passwd")).toBe("etc-passwd");
    expect(branchSlug(null)).toBe("bundle");
  });
});

describe("classifyJournals", () => {
  it("includes the producing session by its mutations, though its header says main", () => {
    const entry = classifyFixtures(["pr58-session"]).get("pr58-session");
    // The header is `branch: main` — see the fixture's first line. If selection
    // read it, this session would be excluded from its own pull request.
    const header: unknown = JSON.parse(fixture("pr58-session").lines[0] ?? "{}");
    expect((header as { branch?: string }).branch).toBe("main");

    expect(entry?.classification).toBe("included");
    expect(entry?.overlap).toBe(true);
    expect(entry?.touches).toBe(true);
    expect(entry?.reason).toMatch(/mutates \d+ file\(s\) in it/);
    expect(entry?.matched_paths).toContain("packages/claims/src/canary.ts");
    expect(entry?.override).toBeUndefined();
  });

  it("classifies a review-only session inconclusive — by name, not merely 'not included'", () => {
    const entry = classifyFixtures(["review-only"]).get("review-only");
    expect(entry?.classification).toBe("inconclusive");
    expect(entry?.overlap).toBe(true);
    expect(entry?.touches).toBe(false);
    expect(entry?.matched_paths).toEqual([]);
    expect(entry?.reason).toContain("--include");
  });

  it("excludes a session whose records fall outside the range's window", () => {
    // This one MUTATES two files that are in the range, so the assertion is
    // that the time window gates first — a rule that read paths alone would
    // pull in every other worktree that ever edited the same file.
    const entry = classifyFixtures(["other-worktree"]).get("other-worktree");
    expect(entry?.classification).toBe("excluded");
    expect(entry?.overlap).toBe(false);
    expect(entry?.reason).toContain("outside");
  });

  it("records --exclude as an override, and keeps the rule's own verdict in the reason", () => {
    const entry = classifyFixtures(["pr58-session"], {
      exclude: new Set(["pr58-session"]),
    }).get("pr58-session");
    expect(entry?.classification).toBe("excluded");
    expect(entry?.override).toBe("exclude");
    expect(entry?.reason).toContain("the rule said included");
  });

  it("records --include as an override on a candidate the rule did not select", () => {
    const entry = classifyFixtures(["review-only"], {
      include: new Set(["review-only"]),
    }).get("review-only");
    expect(entry?.classification).toBe("included");
    expect(entry?.override).toBe("include");
    expect(entry?.reason).toContain("the rule said inconclusive");
  });

  it("excludes everything when the range has no commits, rather than widening", () => {
    const classified = classifyJournals([fixture("pr58-session")], {
      firstMs: null,
      lastMs: null,
      slackMs: 0,
      changedFiles: new Set(RANGE_FILES),
    });
    expect(classified[0]?.classification).toBe("excluded");
    expect(classified[0]?.reason).toContain("no commits");
  });
});

describe("redactLines is line-preserving", () => {
  it("returns the same number of lines in the same order", () => {
    const source = fixture("pr58-session").lines;
    const redacted = redactLines(source, { prompts: true });
    expect(redacted).toHaveLength(source.length);
    // Order, positionally: `kind` and `id` read off each line in sequence.
    const key = (lines: readonly string[]): string[] =>
      lines.map((line) => {
        try {
          const record = JSON.parse(line) as { kind?: unknown; id?: unknown };
          return `${String(record.kind)}/${String(record.id)}`;
        } catch {
          return `raw/${line.slice(0, 20)}`;
        }
      });
    expect(key(redacted)).toEqual(key(source));
  });

  it("carries the four .claude/agent-memory mutations the range never touched", () => {
    const redacted = redactLines(fixture("pr58-session").lines, { prompts: true });
    const memoryPaths = redacted.flatMap((line) => {
      try {
        const record = JSON.parse(line) as { kind?: string; target?: { path?: string } };
        const path = record.kind === "mutation" ? record.target?.path : undefined;
        return path !== undefined && path.startsWith(".claude/agent-memory/") ? [path] : [];
      } catch {
        return [];
      }
    });
    expect(new Set(memoryPaths).size).toBe(4);
    // And none of them is in the range, which is what makes carrying them the
    // decision it is rather than an accident of the fixture.
    for (const path of memoryPaths) expect(RANGE_FILES).not.toContain(path);
  });

  it("carries the header, blank lines and rejected lines untouched", () => {
    const source = fixture("rejected-lines").lines;
    const redacted = redactLines(source, { prompts: true });
    expect(redacted).toHaveLength(source.length);
    expect(redacted[0]).toBe(source[0]); // header: no id, nothing to redact
    expect(redacted[3]).toBe(source[3]); // the unparseable line, verbatim
    expect(redacted.at(-1)).toBe(source.at(-1)); // the trailing blank
  });
});

describe("what redaction rewrites", () => {
  const REPORT = (statement: string): string =>
    JSON.stringify({
      kind: "report",
      id: "r1",
      dispatch: "d1",
      outcome: "found",
      findings: ["x".repeat(EXCERPT_CAP + 500), "short"],
      statement,
      truncated: true,
      response_chars: 91234,
    });

  it("caps report.statement under a NEW flag and leaves truncated/response_chars byte-identical", () => {
    const source = REPORT("s".repeat(STATEMENT_CAP + 300));
    const [redacted = ""] = redactLines([source], { prompts: true });
    const before = JSON.parse(source) as Record<string, unknown>;
    const after = JSON.parse(redacted) as Record<string, unknown>;

    expect((after["statement"] as string).length).toBe(STATEMENT_CAP + 1); // capped + the ellipsis
    // The flag is a NEW key. A test that accepted `truncated` here would pass
    // the exact mismatch the design refuses: those two describe the producer's
    // clipped findings entry, not a statement the bundler shortened.
    expect(after[STATEMENT_CAP_FLAG]).toBe(true);
    expect(STATEMENT_CAP_FLAG in before).toBe(false);
    expect(STATEMENT_CAP_FLAG).not.toBe("truncated");
    expect(STATEMENT_CAP_FLAG).not.toBe("response_chars");
    expect(after["truncated"]).toBe(before["truncated"]);
    expect(after["response_chars"]).toBe(before["response_chars"]);
  });

  it("does not set the cap flag on a statement that fits", () => {
    const [redacted = ""] = redactLines([REPORT("short enough")], { prompts: true });
    const after = JSON.parse(redacted) as Record<string, unknown>;
    expect(STATEMENT_CAP_FLAG in after).toBe(false);
    expect(after["statement"]).toBe("short enough");
  });

  it("preserves report.findings' arity while capping its entries", () => {
    const [redacted = ""] = redactLines([REPORT("short")], { prompts: true });
    const after = JSON.parse(redacted) as { findings: string[] };
    // Arity is what the validator reads: an `outcome: "found"` with an emptied
    // array trips the hard `collapsed-state` verdict.
    expect(after.findings).toHaveLength(2);
    expect(after.findings[0]?.length).toBe(EXCERPT_CAP + 1);
    expect(after.findings[1]).toBe("short");
    expect(validateJournal(`${JSON.stringify({ kind: "journal", version: "0.2", origin: "hooks" })}\n${JSON.stringify({ kind: "dispatch", id: "d1", task: "t" })}\n${redacted}`).findings).toEqual([]);
  });

  it("caps finding.text", () => {
    const source = JSON.stringify({
      kind: "finding",
      id: "f1",
      severity: "blocker",
      author: "test-engineer",
      text: "t".repeat(EXCERPT_CAP + 10),
    });
    const [redacted = ""] = redactLines([source], { prompts: true });
    expect((JSON.parse(redacted) as { text: string }).text.length).toBe(EXCERPT_CAP + 1);
  });

  it("caps prompt.text when prompts travel as text", () => {
    const source = JSON.stringify({
      kind: "prompt",
      id: "p:long",
      text: "p".repeat(EXCERPT_CAP + 10),
      chars: EXCERPT_CAP + 10,
      at: "2026-08-31T09:14:02Z",
    });
    const [redacted = ""] = redactLines([source], { prompts: true });
    const after = JSON.parse(redacted) as Record<string, unknown>;
    expect((after["text"] as string).length).toBe(EXCERPT_CAP + 1);
    // `chars` is the producer's, and describes the operator's prompt rather
    // than the excerpt the bundler kept. It is carried, never recomputed.
    expect(after["chars"]).toBe(EXCERPT_CAP + 10);
    expect(after).not.toHaveProperty("hash");
  });

  it("leaves origin on every record it rewrites", () => {
    // Asserted directly rather than through a downstream count: the provenance
    // partition depends on this field across a stage boundary, and nothing else
    // in this stage would notice it going missing.
    const sources = [
      JSON.stringify({
        kind: "resolution",
        id: "res1",
        origin: "self-reported",
        finding: "f1",
        outcome: "fixed",
        text: "t".repeat(EXCERPT_CAP + 10),
      }),
      JSON.stringify({
        kind: "check",
        id: "c1",
        origin: "self-reported",
        command: "pnpm test",
        outcome: "pass",
        text: "t".repeat(EXCERPT_CAP + 10),
      }),
    ];
    for (const [name, prompts] of [
      ["with prompts", true],
      ["without prompts", false],
    ] as const) {
      const redacted = redactLines(sources, { prompts });
      for (const line of redacted) {
        expect((JSON.parse(line) as { origin?: string }).origin, name).toBe("self-reported");
      }
    }

    // And across a whole real journal, every record that carried an origin
    // still carries the same one.
    const origins = (lines: readonly string[]): string[] =>
      lines.flatMap((line) => {
        try {
          const record = JSON.parse(line) as { id?: string; origin?: string };
          return record.origin === undefined ? [] : [`${String(record.id)}=${record.origin}`];
        } catch {
          return [];
        }
      });
    const source = fixture("review-only").lines;
    expect(origins(redactLines(source, { prompts: false }))).toEqual(origins(source));
  });
});

describe("redaction gates on a valid id", () => {
  it("copies a line with a redactable text field and no id byte-for-byte", () => {
    const source = fixture("rejected-lines").lines;
    const index = source.findIndex((line) => line.startsWith('{"kind": "finding"'));
    expect(index).toBeGreaterThan(-1);
    const line = source[index] ?? "";
    // The fixture line is spaced after its colons and carries a text far past
    // the cap, so any rewrite at all changes its bytes AND the leading 60
    // characters the validator quotes as the subject.
    expect(line).toContain('"text": ');
    expect(JSON.parse(line)).toHaveProperty("text");
    expect((JSON.parse(line) as { text: string }).text.length).toBeGreaterThan(EXCERPT_CAP);
    expect(JSON.parse(line)).not.toHaveProperty("id");

    const redacted = redactLines(source, { prompts: true });
    expect(redacted[index]).toBe(line);

    // And the finding raised ABOUT that line has the same subject on both
    // sides, which is the reason for the gate: its subject is its own text.
    const subjectOf = (content: string): string | undefined =>
      validateJournal(content).findings.find(
        (finding) => finding.verdict === "malformed" && finding.subject.startsWith('{"kind": "finding"'),
      )?.subject;
    expect(subjectOf(reconstructJournal(redacted))).toBe(subjectOf(reconstructJournal(source)));
    expect(subjectOf(reconstructJournal(source))).toBeDefined();
  });
});

describe("--no-prompts", () => {
  const PROMPT = JSON.stringify({
    kind: "prompt",
    id: "p:1",
    text: "take add-pr-process-report to a merge-ready PR",
    chars: 45,
    truncated: true,
    at: "2026-08-31T09:14:02Z",
  });

  it("converts to the producer's hashed shape: hash and chars, no text", () => {
    const [redacted = ""] = redactLines([PROMPT], { prompts: false });
    const after = JSON.parse(redacted) as Record<string, unknown>;
    expect(after).not.toHaveProperty("text");
    expect(after).not.toHaveProperty("truncated");
    expect(after["chars"]).toBe(45);
    expect(after["hash"]).toBe(
      createHash("sha256").update("take add-pr-process-report to a merge-ready PR").digest("hex"),
    );
    expect(after["id"]).toBe("p:1");
    expect(after["at"]).toBe("2026-08-31T09:14:02Z");
  });

  it("leaves the converted journal valid and the prompt still counted", () => {
    const source = fixture("review-only");
    const before = validateJournal(reconstructJournal(source.lines));
    const after = validateJournal(reconstructJournal(redactLines(source.lines, { prompts: false })));

    expect(after.findings).toEqual([]);
    // Not removed: a removed prompt is indistinguishable from a run where the
    // human never spoke, and the report claims to show what the human asked.
    expect(after.ledger?.prompts).toBe(before.ledger?.prompts);
    expect(after.ledger?.prompts).toBe(1);
    expect(after.records).toBe(before.records);
    expect(verdictSet(after.findings)).toEqual(verdictSet(before.findings));
  });

  it("does not repair a prompt whose text is present but blank", () => {
    // Blank text is already `malformed` in the source. Converting it would
    // manufacture a valid record, which is a verdict change in the flattering
    // direction — the one this whole file exists to catch.
    const blank = JSON.stringify({ kind: "prompt", id: "p:2", text: "", chars: 0 });
    const [redacted = ""] = redactLines([blank], { prompts: false });
    expect(redacted).toBe(blank);
  });

  it("leaves an already-hashed prompt alone", () => {
    const hashed = JSON.stringify({ kind: "prompt", id: "p:3", hash: "abc123", chars: 12 });
    const [redacted = ""] = redactLines([hashed], { prompts: false });
    expect(redacted).toBe(hashed);
  });
});

describe("unreadableLines", () => {
  it("names the 1-based numbers of lines that are not a JSON object, and no others", () => {
    expect(unreadableLines(fixture("rejected-lines").lines)).toEqual([4]);
    expect(unreadableLines(fixture("pr58-session").lines)).toEqual([]);
    expect(unreadableLines(["", "  ", '{"a":1}', "[1,2]", '"scalar"', "{"])).toEqual([4, 5, 6]);
  });
});

describe("bundling cannot change a verdict, in either direction", () => {
  it("round-trips a journal with an unparseable line and a duplicate id", () => {
    const source = fixture("rejected-lines");
    const before = verdictSet(validateJournal(reconstructJournal(source.lines)).findings);

    // Named explicitly: this is the case a record-level rule silently drops,
    // and the reason the redaction rule is stated over LINES.
    expect(before.some((entry) => entry.startsWith("malformed\t"))).toBe(true);
    expect(before).toContain("duplicate-id\tm:rej1");

    expect(bundleAndRevalidate(source)).toEqual(before);
    expect(bundleAndRevalidate(source, false)).toEqual(before);
  });

  it("round-trips a journal that genuinely reports stale-verification", () => {
    const source = fixture("stale-verification");
    const before = verdictSet(validateJournal(reconstructJournal(source.lines)).findings);

    // Not merely non-empty. The whole hook-attested tier rests on this one.
    expect(before).toEqual(["stale-verification\tx:stale1"]);

    const after = bundleAndRevalidate(source);
    expect(after).toEqual(before);
    // Neither silenced (a reference closure) nor joined by a manufactured
    // `dangling-reference` (a path closure) — the two failures a removal rule
    // produces in opposite directions.
    expect(after).toContain("stale-verification\tx:stale1");
    expect(after.some((entry) => entry.startsWith("dangling-reference\t"))).toBe(false);
    expect(after.some((entry) => entry.startsWith("collapsed-state\t"))).toBe(false);
  });

  it("round-trips this repository's own producing session", () => {
    const source = fixture("pr58-session");
    const before = validateJournal(reconstructJournal(source.lines));
    const after = validateJournal(reconstructJournal(redactLines(source.lines, { prompts: true })));
    expect(verdictSet(after.findings)).toEqual(verdictSet(before.findings));
    expect(after.records).toBe(before.records);
    expect(after.dispatches).toBe(before.dispatches);
    expect(after.mutations).toBe(before.mutations);
    expect(after.outcomes).toEqual(before.outcomes);
    // Version 0.2 is below the 0.6 ledger floor, so the validator computes NO
    // provenance for it — an absence, not three zeros. Asserted here because
    // the report's tier sections are built from exactly this null.
    expect(after.version).toBe("0.2");
    expect(after.provenance).toBeNull();
    expect(after.ledger).toBeNull();
  });

  it("round-trips a review-only session, prompts either way", () => {
    const source = fixture("review-only");
    const before = verdictSet(validateJournal(reconstructJournal(source.lines)).findings);
    expect(bundleAndRevalidate(source)).toEqual(before);
    expect(bundleAndRevalidate(source, false)).toEqual(before);
  });
});

describe("buildEnvelope", () => {
  it("records the rule, the slack, every candidate, and the changed-file set", () => {
    const candidates = classifyJournals(
      [fixture("pr58-session"), fixture("review-only"), fixture("other-worktree")],
      WINDOW,
    );
    const envelope = buildEnvelope({
      range: { spec: "main..HEAD", base: "main", head: "HEAD", sep: ".." },
      facts: {
        resolvedBase: "main",
        changedFiles: RANGE_FILES,
        commits: [{ sha: "abc1234", at: "2026-08-30T20:10:00.000Z" }],
      },
      slackMinutes: 30,
      prompts: true,
      candidates,
      journals: [{ session: "pr58-session", lines: redactLines(fixture("pr58-session").lines, { prompts: true }) }],
    });

    expect(envelope.version).toBe(BUNDLE_VERSION);
    expect(envelope.selection.slack_minutes).toBe(30);
    expect(envelope.selection.rule).toContain("INCONCLUSIVE");
    expect(envelope.selection.changed_files).toEqual(RANGE_FILES);
    expect(envelope.selection.caps.statement_flag).toBe(STATEMENT_CAP_FLAG);
    // Every candidate, including the ones not carried. A two-way selection
    // would make an excluded session and a session that was never on the
    // machine indistinguishable here.
    expect(envelope.selection.candidates.map((entry) => entry.classification).sort()).toEqual([
      "excluded",
      "included",
      "inconclusive",
    ]);
    expect(envelope.journals).toHaveLength(1);
    expect(envelope.journals[0]?.lines).toHaveLength(fixture("pr58-session").lines.length);
    // Prompts travelled as text, so no hash caveat is claimed.
    expect(envelope.selection.prompts).toBe("text");
    expect(envelope.selection.prompt_hash_note).toBeUndefined();
  });

  it("states the prompt-hash caveat only when prompts were converted", () => {
    const envelope = buildEnvelope({
      range: { spec: "main..HEAD", base: "main", head: "HEAD", sep: ".." },
      facts: { resolvedBase: "main", changedFiles: [], commits: [] },
      slackMinutes: 30,
      prompts: false,
      candidates: [],
      journals: [],
    });
    expect(envelope.selection.prompts).toBe("hashed");
    expect(envelope.selection.prompt_hash_note).toContain("excerpt");
  });
});
