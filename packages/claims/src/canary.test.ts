import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { beforeEach, describe, expect, it } from "vitest";

import {
  canaryGuardResult,
  clearCanary,
  describeCanary,
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

/**
 * Hand-edits the planted document so the registered line no longer carries the
 * claim, leaving `.git/nullius/canaries.json` in place.
 *
 * No CLI sequence produces this state: `clearCanary` removes the line and
 * deletes the registry together. So it is the only way to reach either the
 * stale-registry warning in `check` or `clearCanary`'s own refusal, and both
 * tests build their fixture from here.
 */
function desynchronizeRegistry(root: string, entry: CanaryEntry): void {
  const docPath = join(root, entry.doc);
  const lines = readFileSync(docPath, "utf8").split("\n");
  lines[entry.line - 1] = "This line was edited after planting.";
  writeFileSync(docPath, lines.join("\n"));
}

/**
 * The message a throwing call produced, as a string. `toThrow(/re/)` proves a
 * message says something; the redaction assertions need to prove it does NOT,
 * and that needs the text.
 */
function messageOf(call: () => unknown): string {
  try {
    call();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error("expected the call to throw, and it returned instead");
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

  it("does not name the active plant in that refusal", () => {
    const entry = plantCanary(root, "docs/design.md");

    // A reviewer reaches this message by running `canary plant` against any
    // file at all: it throws before writing, so nothing records the attempt.
    // That makes it the shortest unlogged path to the plant's location.
    const message = messageOf(() => plantCanary(root, "docs/design.md"));

    expect(message).toContain(entry.plantedAt);
    // Bound to the planted values, never to a bare ":" — the redacted form
    // still carries an ISO timestamp, which is made of colons.
    expect(message).not.toContain(entry.doc);
    expect(message).not.toContain(`${entry.doc}:${entry.line}`);
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
    desynchronizeRegistry(root, entry);

    expect(() => clearCanary(root, entry)).toThrow(/no longer/);
    expect(loadActiveCanary(root).entry).toEqual(entry);
  });

  it("does not name the plant in that refusal, and still says what to do", () => {
    const root = fixture();
    const entry = plantCanary(root, "docs/design.md");
    desynchronizeRegistry(root, entry);

    const message = messageOf(() => clearCanary(root, entry));

    expect(message).toContain(entry.plantedAt);
    // Redacting the location must not cost the operator the remedy: the
    // instruction does not require knowing which document.
    expect(message).toMatch(/restore the line/);
    expect(message).toMatch(/delete the registry/);
    expect(message).not.toContain(entry.doc);
    expect(message).not.toContain(`${entry.doc}:${entry.line}`);
  });
});

describe("describeCanary", () => {
  // `line: 4` on purpose: no "4" appears anywhere in this timestamp, so the
  // negative assertion on the line number below is not satisfied by accident.
  const entry: CanaryEntry = {
    doc: "docs/design.md",
    line: 4,
    text: "A planted false claim.",
    plantedAt: "2026-08-17T00:00:00.000Z",
  };

  it("redacts the location by default, keeping presence and plant time", () => {
    const rendered = describeCanary(entry);

    expect(rendered).toContain(entry.plantedAt);
    expect(rendered).not.toContain(entry.doc);
    expect(rendered).not.toContain(String(entry.line));
    expect(rendered).not.toContain(`${entry.doc}:${entry.line}`);
  });

  it("renders the location only when reveal is asked for by name", () => {
    const rendered = describeCanary(entry, { reveal: true });

    expect(rendered).toContain(entry.doc);
    expect(rendered).toContain(String(entry.line));
    expect(rendered).toContain(`${entry.doc}:${entry.line}`);
  });

  it("treats anything short of an explicit reveal as redacted", () => {
    // An options object that omits the flag, or passes it false, is not a
    // half-measure — there is one way to ask for the location.
    expect(describeCanary(entry, {})).not.toContain(entry.doc);
    expect(describeCanary(entry, { reveal: false })).not.toContain(entry.doc);
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
    const unsafeDoc = "/etc/passwd";
    writeFileSync(
      join(root, ".git", "nullius", "canaries.json"),
      JSON.stringify({
        canaries: [
          {
            doc: unsafeDoc,
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
    // The warning says a path was unsafe; it does not say which. Bound to the
    // registered value, so the assertion moves if the entry does.
    expect(loaded.warning).not.toContain(unsafeDoc);
    expect(loaded.warning).not.toContain(`${unsafeDoc}:1`);
  });
});

/**
 * CLI-level coverage of the redacted message sites.
 *
 * These spawn the built binary rather than importing anything: `cli.ts` exports
 * nothing and ends in `process.exit(main())`, so its handlers cannot be reached
 * from a test process. Same reasoning, and the same shape, as
 * `cli.characterization.test.ts`. Requires `pnpm build`.
 *
 * Every run uses a temp fixture as its cwd — `canary` and `check` both read
 * `process.cwd()` — so nothing here touches this repository's own registry.
 */
const CLI = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
const cliBuilt = existsSync(CLI);
const cliSuite = cliBuilt ? describe : describe.skip;

if (!cliBuilt) {
  // A skipped suite is a green suite. Say so, or the redaction gate reports
  // success on a build that was never made.
  console.warn(
    `canary CLI suite: ${CLI} is missing — run \`pnpm build\`. Suite SKIPPED.`,
  );
}

interface Run {
  code: number;
  stdout: string;
  stderr: string;
  /** Both streams, for the leak assertions, which do not care which carried it. */
  output: string;
}

function runCli(cwd: string, ...args: string[]): Run {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    cwd,
  });
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  return { code: result.status ?? 1, stdout, stderr, output: stdout + stderr };
}

/** Just `check`'s canary warnings, isolated from the run report around them. */
function canaryWarnings(result: Run): string[] {
  return result.stderr
    .split("\n")
    .filter((line) => line.includes("registered canary"));
}

cliSuite("canary status (CLI)", () => {
  it("reports presence and the plant time, and names no document", () => {
    const root = fixture();
    const entry = plantCanary(root, "docs/design.md");

    const result = runCli(root, "canary", "status");

    expect(result.stdout).toContain("active canary");
    expect(result.stdout).toContain(entry.plantedAt);
    // Bound to the actual planted values. NOT `.not.toContain(":")` — the
    // redacted message still embeds an ISO timestamp, so that form would fail
    // against correctly-redacted output.
    expect(result.output).not.toContain(entry.doc);
    expect(result.output).not.toContain(`${entry.doc}:${entry.line}`);
  });

  it("still exits 1 while a canary is active", () => {
    const root = fixture();
    plantCanary(root, "docs/design.md");

    // Every consumer of this command reads the exit code and nothing else, so
    // it is the contract a message-only change could break silently.
    expect(runCli(root, "canary", "status").code).toBe(1);
  });

  it("still prints exactly `no active canary` and exits 0 with none planted", () => {
    const root = fixture();

    const result = runCli(root, "canary", "status");

    // The half this change must not move.
    expect(result.output.trim()).toBe("no active canary");
    expect(result.code).toBe(0);
  });
});

cliSuite("check's canary warnings (CLI)", () => {
  it("warns about a canary outside the matched set without naming it", () => {
    const root = fixture();
    const entry = plantCanary(root, "docs/design.md");
    writeFileSync(
      join(root, "docs", "other.md"),
      "# Other\n\nProse with nothing to anchor.\n",
    );

    const result = runCli(root, "check", "docs/other.md");

    expect(canaryWarnings(result)).toHaveLength(1);
    const warning = canaryWarnings(result).join("\n");
    expect(warning).toContain("outside the matched set");
    expect(warning).not.toContain(entry.doc);
    expect(warning).not.toContain(`${entry.doc}:${entry.line}`);
    // The planted document was not read, so nothing in this run has any
    // reason to name it — the whole output is fair game here.
    expect(result.output).not.toContain(entry.doc);
  });

  it("warns that the registry is stale without naming the document it names", () => {
    const root = fixture();
    const entry = plantCanary(root, "docs/design.md");
    desynchronizeRegistry(root, entry);

    const result = runCli(root, "check", "docs/design.md");

    expect(canaryWarnings(result)).toHaveLength(1);
    const warning = canaryWarnings(result).join("\n");
    expect(warning).toContain("stale registry");
    // Redaction removes the document, not the remedy.
    expect(warning).toContain("delete .git/nullius/canaries.json");
    expect(warning).not.toContain(entry.doc);
    expect(warning).not.toContain(`${entry.doc}:${entry.line}`);
    // Scoped to the warning, not to the whole run: the planted document is in
    // the matched set here, so the check report names it for its own reasons.
  });
});

cliSuite("canary verify (CLI)", () => {
  it("reports MISSED and exits 1 without naming the planted claim", () => {
    const root = fixture();
    const entry = plantCanary(root, "docs/design.md");
    // The side channel a reviewer would actually reach for: a scratch report
    // saying nothing costs nothing, and MISSED used to print the location.
    writeFileSync(join(root, "report.md"), "All clear. No issues found.\n");

    const result = runCli(root, "canary", "verify", "report.md");

    expect(result.code).toBe(1);
    expect(result.stdout).toContain("CANARY-MISSED");
    expect(result.output).not.toContain(entry.doc);
    expect(result.output).not.toContain(`${entry.doc}:${entry.line}`);
  });

  it("reports CAUGHT and exits 0 without echoing the citation back", () => {
    const root = fixture();
    const entry = plantCanary(root, "docs/design.md");
    writeFileSync(
      join(root, "report.md"),
      `flagged ${entry.doc}:${entry.line} — this claim is false\n`,
    );

    const result = runCli(root, "canary", "verify", "report.md");

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("CANARY-CAUGHT");
    expect(result.output).not.toContain(entry.doc);
    expect(result.output).not.toContain(`${entry.doc}:${entry.line}`);
  });
});

cliSuite("canary clear (CLI)", () => {
  it("confirms without naming the document, and still removes the line", () => {
    const root = fixture();
    const entry = plantCanary(root, "docs/design.md");

    const result = runCli(root, "canary", "clear");

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("cleared");
    expect(result.stdout).toContain(entry.plantedAt);
    expect(result.output).not.toContain(entry.doc);
    expect(result.output).not.toContain(`${entry.doc}:${entry.line}`);
    // Redacting the confirmation must not have redacted the work.
    expect(readFileSync(join(root, "docs", "design.md"), "utf8")).toBe(DOC);
    expect(loadActiveCanary(root).entry).toBeNull();
  });
});
