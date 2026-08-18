import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { beforeEach, describe, expect, it } from "vitest";

import {
  canaryGuardResult,
  clearCanary,
  loadActiveCanary,
  plantCanary,
  verifyCanary,
  type CanaryEntry,
} from "./canary";

const DOC = [
  "# Design",
  "",
  "This system retries failed operations with exponential backoff, and the",
  "retry budget is shared across workers.",
  "",
  "## Alternatives",
  "",
  "A queue was considered and rejected.",
  "",
].join("\n");

const FILE_A = [
  "export const MAX_RETRIES = 3;",
  "export function retry() {}",
  "",
].join("\n");

const FILE_B = ["export function unrelated() {}", ""].join("\n");

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), "nullius-canary-"));
  mkdirSync(join(root, ".git", "nullius"), { recursive: true });
  mkdirSync(join(root, "src", "a"), { recursive: true });
  mkdirSync(join(root, "src", "b"), { recursive: true });
  mkdirSync(join(root, "docs"), { recursive: true });
  writeFileSync(join(root, "src", "a", "alpha.ts"), FILE_A);
  writeFileSync(join(root, "src", "b", "beta.ts"), FILE_B);
  writeFileSync(join(root, "docs", "design.md"), DOC);
  return root;
}

describe("plantCanary", () => {
  let root: string;
  beforeEach(() => {
    root = fixture();
  });

  it("inserts exactly one line and registers it", () => {
    const entry = plantCanary(root, "docs/design.md");

    const before = DOC.split("\n");
    const after = readFileSync(join(root, "docs", "design.md"), "utf8").split(
      "\n",
    );
    expect(after.length).toBe(before.length + 1);
    expect(after[entry.line - 1]).toBe(entry.text);
    // Removing the planted line restores the original exactly.
    const restored = [...after];
    restored.splice(entry.line - 1, 1);
    expect(restored.join("\n")).toBe(DOC);

    const loaded = loadActiveCanary(root);
    expect(loaded.entry).toEqual(entry);
    expect(loaded.warning).toBeUndefined();
  });

  it("plants a claim that is false by construction — the symbol is absent from the named file", () => {
    const entry = plantCanary(root, "docs/design.md");

    const symbol = /`([A-Za-z_][A-Za-z0-9_]*)`/.exec(entry.text)?.[1];
    // The claim names a real file that verifiably lacks the symbol.
    const files = [...entry.text.matchAll(/`([^`]+\.[a-z]+)`/g)].map(
      (m) => m[1],
    );
    expect(files.length).toBeGreaterThan(0);
    const claimed = files[files.length - 1];
    if (claimed === undefined || symbol === undefined) {
      throw new Error("canary text missing symbol or file");
    }
    const content = readFileSync(join(root, claimed), "utf8");
    expect(content.includes(symbol)).toBe(false);
  });

  it("never harvests from nested dist or node_modules directories", () => {
    mkdirSync(join(root, "pkg", "a", "dist"), { recursive: true });
    mkdirSync(join(root, "pkg", "a", "node_modules", "dep"), {
      recursive: true,
    });
    // Alphabetically earlier than src/, so a broken filter would pick these.
    writeFileSync(
      join(root, "pkg", "a", "dist", "aaa.js"),
      "export const AAA_BUILT = 1;\n",
    );
    writeFileSync(
      join(root, "pkg", "a", "node_modules", "dep", "index.js"),
      "export const AAA_VENDORED = 1;\n",
    );

    const entry = plantCanary(root, "docs/design.md");
    expect(entry.text).not.toContain("dist/");
    expect(entry.text).not.toContain("node_modules");
    expect(entry.text).not.toContain("AAA_");
  });

  it("produces no failing anchor verdict when the planted document is checked", async () => {
    const { checkClaims, isFailure } = await import("./checkClaims");
    const { parseClaims } = await import("./parseClaims");
    plantCanary(root, "docs/design.md");

    const content = readFileSync(join(root, "docs", "design.md"), "utf8");
    const results = checkClaims(parseClaims("docs/design.md", content), {
      readFileLines: () => null,
      runSearch: () => ({ ok: true, count: 0 }),
    });

    expect(results.filter((r) => isFailure(r.verdict))).toEqual([]);
  });

  it("touches nothing in the working tree except the planted document", () => {
    const before = new Map<string, string>();
    for (const file of [
      "src/a/alpha.ts",
      "src/b/beta.ts",
    ]) {
      before.set(file, readFileSync(join(root, file), "utf8"));
    }

    plantCanary(root, "docs/design.md");

    for (const [file, content] of before) {
      expect(readFileSync(join(root, file), "utf8")).toBe(content);
    }
  });

  it("refuses a second plant while one is active", () => {
    plantCanary(root, "docs/design.md");
    expect(() => plantCanary(root, "docs/design.md")).toThrow(/active canary/);
  });

  it("normalizes a ./-prefixed document path so the merge guard cannot be bypassed", () => {
    const entry = plantCanary(root, "./docs/design.md");
    expect(entry.doc).toBe("docs/design.md");
  });

  it("plants below YAML front matter, never inside it", () => {
    const withFrontMatter = [
      "---",
      "title: My design",
      "status: draft",
      "---",
      "",
      "First real paragraph of prose.",
      "",
    ].join("\n");
    writeFileSync(join(root, "docs", "fm.md"), withFrontMatter);

    const entry = plantCanary(root, "docs/fm.md");
    expect(entry.line).toBeGreaterThan(4);
  });

  it("never plants inside a fenced code block", () => {
    const fencedFirst = [
      "# Doc",
      "",
      "```",
      "looks like prose but is quoted code",
      "```",
      "",
      "Actual prose comes after the fence.",
      "",
    ].join("\n");
    writeFileSync(join(root, "docs", "fenced.md"), fencedFirst);

    const entry = plantCanary(root, "docs/fenced.md");
    expect(entry.line).toBeGreaterThan(5);
  });

  it("refuses to run without a .git directory", () => {
    const bare = mkdtempSync(join(tmpdir(), "nullius-nogit-"));
    writeFileSync(join(bare, "design.md"), DOC);
    expect(() => plantCanary(bare, "design.md")).toThrow(/\.git/);
  });
});

describe("verifyCanary", () => {
  const entry: CanaryEntry = {
    doc: "docs/design.md",
    line: 4,
    text: "Note that `MAX_RETRIES` is also defined in `src/b/beta.ts`, so the two definitions must stay in sync.",
    plantedAt: "2026-08-17T00:00:00.000Z",
  };

  it("reports caught when the report cites the planted doc:line", () => {
    expect(
      verifyCanary("[false-premise] docs/design.md:4 — this claim is wrong", entry),
    ).toBe("caught");
  });

  it("requires the full claim text — a partial quote is not a catch", () => {
    expect(
      verifyCanary(
        "The claim that `MAX_RETRIES` is also defined in `src/b/beta.ts` is false.",
        entry,
      ),
    ).toBe("missed");
    expect(verifyCanary(`Flagging: ${entry.text}`, entry)).toBe("caught");
  });

  it("reports missed when nothing references the canary", () => {
    expect(verifyCanary("All clear. No issues found.", entry)).toBe("missed");
  });

  it("does not score a longer line number or a longer path as caught", () => {
    expect(
      verifyCanary("unrelated nit at docs/design.md:41 — rename this", entry),
    ).toBe("missed");
    expect(
      verifyCanary("see foo/docs/design.md:4 for the real issue", entry),
    ).toBe("missed");
  });

  it("still scores a doc:line citation followed by punctuation as caught", () => {
    expect(verifyCanary("flagged (docs/design.md:4).", entry)).toBe("caught");
  });

  it("scores a ./-prefixed citation of the planted location as caught", () => {
    expect(
      verifyCanary("flagged ./docs/design.md:4 — this claim is wrong", entry),
    ).toBe("caught");
    expect(
      verifyCanary("flagged `./docs/design.md:4` — this claim is wrong", entry),
    ).toBe("caught");
  });

  it("taints on any CANARY- verdict token, not only CANARY-PRESENT", () => {
    expect(
      verifyCanary("CANARY-CAUGHT — the review flagged docs/design.md:4", entry),
    ).toBe("tainted");
    expect(verifyCanary("this could be CANARY-MISSED territory", entry)).toBe(
      "tainted",
    );
  });

  it("reports tainted when probe machinery leaked into the report, even alongside a catch", () => {
    expect(
      verifyCanary(
        `CANARY-PRESENT docs/design.md:4 — remove before merge`,
        entry,
      ),
    ).toBe("tainted");
    expect(verifyCanary("saw .git/nullius in the tree", entry)).toBe("tainted");
    expect(verifyCanary("canaries.json lists one entry", entry)).toBe(
      "tainted",
    );
  });
});

describe("clearCanary", () => {
  it("removes the planted line, restoring the document byte-identically", () => {
    const root = fixture();
    const entry = plantCanary(root, "docs/design.md");

    clearCanary(root, entry);

    expect(readFileSync(join(root, "docs", "design.md"), "utf8")).toBe(DOC);
    expect(loadActiveCanary(root).entry).toBeNull();
  });

  it("refuses when the registered line no longer carries the claim", () => {
    const root = fixture();
    const entry = plantCanary(root, "docs/design.md");
    const docPath = join(root, "docs", "design.md");
    const lines = readFileSync(docPath, "utf8").split("\n");
    lines[entry.line - 1] = "This line was edited after planting.";
    writeFileSync(docPath, lines.join("\n"));

    expect(() => clearCanary(root, entry)).toThrow(/no longer/);
    expect(loadActiveCanary(root).entry).toEqual(entry);
  });
});

describe("canaryGuardResult", () => {
  const entry: CanaryEntry = {
    doc: "docs/design.md",
    line: 3,
    text: "A planted false claim.",
    plantedAt: "2026-08-17T00:00:00.000Z",
  };

  it("reports canary-present when the registered claim is still in the document", () => {
    const result = canaryGuardResult(
      "docs/design.md",
      "# Doc\n\nA planted false claim.\n",
      entry,
    );

    expect(result).toMatchObject({
      verdict: "canary-present",
      claim: { kind: "canary", source: { doc: "docs/design.md", line: 3 } },
    });
  });

  it("returns null for other documents and for a document the claim left", () => {
    expect(canaryGuardResult("other.md", "content", entry)).toBeNull();
    expect(
      canaryGuardResult("docs/design.md", "# Doc\n\nEdited away.\n", entry),
    ).toBeNull();
  });
});

describe("loadActiveCanary", () => {
  it("returns a warning, not a crash, for an unparseable registry", () => {
    const root = fixture();
    writeFileSync(join(root, ".git", "nullius", "canaries.json"), "{nope");

    const loaded = loadActiveCanary(root);
    expect(loaded.entry).toBeNull();
    expect(loaded.warning).toMatch(/registry/);
  });

  it("rejects a registry entry whose path fails path safety", () => {
    const root = fixture();
    writeFileSync(
      join(root, ".git", "nullius", "canaries.json"),
      JSON.stringify({
        canaries: [
          {
            doc: "/etc/passwd",
            line: 1,
            text: "x",
            plantedAt: "2026-08-17T00:00:00.000Z",
          },
        ],
      }),
    );

    const loaded = loadActiveCanary(root);
    expect(loaded.entry).toBeNull();
    expect(loaded.warning).toMatch(/path/);
  });
});
