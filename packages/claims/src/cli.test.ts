import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { plantCanary } from "./canary";
import { parseArgs, runCanary, runCheck } from "./cli";

const DOC = [
  "# Design",
  "",
  "The retry budget is shared across workers.",
  "",
  "**Evidence:** `src/app.ts:1` — `export const MAX_RETRIES = 3;`",
  "",
].join("\n");

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), "nullius-cli-"));
  mkdirSync(join(root, ".git"), { recursive: true });
  mkdirSync(join(root, "src"), { recursive: true });
  mkdirSync(join(root, "docs"), { recursive: true });
  writeFileSync(join(root, "src", "app.ts"), "export const MAX_RETRIES = 3;\n");
  writeFileSync(join(root, "src", "util.ts"), "export function helper() {}\n");
  writeFileSync(join(root, "docs", "design.md"), DOC);
  return root;
}

function args(overrides: Partial<ReturnType<typeof parseArgs>> = {}) {
  return { ...parseArgs([]), ...overrides };
}

describe("runCheck — canary merge guard", () => {
  const originalCwd = process.cwd();
  let root: string;
  let logs: string[];
  let errors: string[];

  beforeEach(() => {
    root = fixture();
    process.chdir(root);
    logs = [];
    errors = [];
    vi.spyOn(console, "log").mockImplementation((line: unknown) => {
      logs.push(String(line));
    });
    vi.spyOn(console, "error").mockImplementation((line: unknown) => {
      errors.push(String(line));
    });
  });

  afterEach(() => {
    process.chdir(originalCwd);
    vi.restoreAllMocks();
  });

  it("fails a planted document and passes it again under --probing", () => {
    plantCanary(root, "docs/design.md");

    const guarded = runCheck(args({ globs: ["docs/*.md"] }));
    expect(guarded).toBe(1);
    expect(logs.join("\n")).not.toContain("CANARY-PRESENT");
    expect(errors.join("\n")).toContain("CANARY-PRESENT");

    logs = [];
    errors = [];
    const probing = runCheck(args({ globs: ["docs/*.md"], probing: true }));
    expect(probing).toBe(0);
    expect([...logs, ...errors].join("\n")).not.toContain("CANARY-PRESENT");
  });

  it("warns when the registered canary is outside the matched set, without reading it", () => {
    plantCanary(root, "docs/design.md");
    writeFileSync(join(root, "other.md"), "# Other doc\n\nProse here.\n");

    const code = runCheck(args({ globs: ["other.md"] }));
    expect(code).toBe(0);
    expect(errors.join("\n")).toContain("outside the matched set");
  });

  it("warns about a stale registry when the planted text is gone", () => {
    plantCanary(root, "docs/design.md");
    writeFileSync(join(root, "docs", "design.md"), DOC);

    const code = runCheck(args({ globs: ["docs/*.md"] }));
    expect(code).toBe(0);
    expect(errors.join("\n")).toContain("no longer present");
  });

  it("fails closed when the registry is unreadable", () => {
    mkdirSync(join(root, ".git", "nullius"), { recursive: true });
    writeFileSync(join(root, ".git", "nullius", "canaries.json"), "{nope");

    const code = runCheck(args({ globs: ["docs/*.md"] }));
    expect(code).toBe(1);
    expect(errors.join("\n")).toContain("cannot be determined");
  });

  it("keeps a canary-only document on the no-anchors list — the guard is not a grounding marker", () => {
    writeFileSync(join(root, "docs", "bare.md"), "# Bare\n\nOnly prose here.\n");
    plantCanary(root, "docs/bare.md");

    const code = runCheck(args({ globs: ["docs/bare.md"] }));
    expect(code).toBe(1);
    expect(errors.join("\n")).toContain("CANARY-PRESENT");
    expect(logs.join("\n")).toContain("No anchors");
  });
});

describe("runCanary — exit codes", () => {
  const originalCwd = process.cwd();
  let root: string;
  let logs: string[];

  beforeEach(() => {
    root = fixture();
    process.chdir(root);
    logs = [];
    vi.spyOn(console, "log").mockImplementation((line: unknown) => {
      logs.push(String(line));
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    process.chdir(originalCwd);
    vi.restoreAllMocks();
  });

  it("status exits 1 while planted and 0 after clear", () => {
    expect(runCanary(args({ globs: ["status"] }))).toBe(0);
    const entry = plantCanary(root, "docs/design.md");
    expect(runCanary(args({ globs: ["status"] }))).toBe(1);
    expect(logs.join("\n")).toContain(`${entry.doc}:${entry.line}`);
    expect(runCanary(args({ globs: ["clear"] }))).toBe(0);
    expect(runCanary(args({ globs: ["status"] }))).toBe(0);
  });

  it("verify exits 0 caught, 1 missed, 3 tainted, 2 when it cannot run", () => {
    expect(runCanary(args({ globs: ["verify", "nope.txt"] }))).toBe(2);

    const entry = plantCanary(root, "docs/design.md");
    writeFileSync(join(root, "caught.txt"), `flagged ${entry.doc}:${entry.line}\n`);
    writeFileSync(join(root, "missed.txt"), "all clear\n");
    writeFileSync(join(root, "tainted.txt"), "CANARY-PRESENT seen in check\n");

    expect(runCanary(args({ globs: ["verify", "caught.txt"] }))).toBe(0);
    expect(runCanary(args({ globs: ["verify", "missed.txt"] }))).toBe(1);
    expect(runCanary(args({ globs: ["verify", "tainted.txt"] }))).toBe(3);
  });

  it("status and verify exit 2 on an unreadable registry — never a fabricated all-clear", () => {
    mkdirSync(join(root, ".git", "nullius"), { recursive: true });
    writeFileSync(join(root, ".git", "nullius", "canaries.json"), "{nope");

    expect(runCanary(args({ globs: ["status"] }))).toBe(2);
    expect(runCanary(args({ globs: ["verify", "whatever.txt"] }))).toBe(2);
  });
});
