import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * `witness report` end to end.
 *
 * Spawned rather than imported, for the same reason the characterization suite
 * spawns: `cli.ts` ends in `process.exit(main())` and cannot be imported
 * without terminating the run. The contract under test is also an exit code,
 * which is not a thing a pure function has.
 *
 * Requires `pnpm build` — the standing rule of this repository. An unbuilt tree
 * runs the PREVIOUS build of the verb against the current fixtures and reports
 * success on a verb that does not exist yet.
 */

const CLI = fileURLToPath(new URL("../dist/cli.js", import.meta.url));

interface Run {
  code: number;
  stdout: string;
  stderr: string;
  output: string;
}

let root = "";

function git(...args: string[]): void {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr ?? ""}`);
  }
}

function run(...args: string[]): Run {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    cwd: root,
    // A fixed clock for the subprocess would be no use here: the renderer reads
    // none. What the environment must NOT carry is a recorder root that would
    // make the verb read this machine's journals instead of the fixture's.
    env: { ...process.env, NULLIUS_WITNESS_ROOT: root, CLAUDE_PROJECT_DIR: root },
  });
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  return { code: result.status ?? 1, stdout, stderr, output: stdout + stderr };
}

function write(path: string, content: string): void {
  const full = join(root, path);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, content);
}

/*
 * A two-commit repository whose HEAD commit adds a document with one anchor
 * that FAILS. That is the fixture the exit-code contract needs: a verb that
 * gated would exit 1 here, and the whole of Decision 13 is that it must not.
 */
beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "nullius-report-"));
  git("init", "-q", "-b", "main");
  git("config", "user.email", "fixture@example.invalid");
  git("config", "user.name", "Fixture");

  write("src/thing.ts", "export const thing = 1;\nexport const other = 2;\n");
  write("docs/base.md", "# Base\n\nNothing anchored here yet.\n");
  git("add", "-A");
  git("commit", "-q", "-m", "base");

  write(
    "docs/claim.md",
    [
      "# The claim",
      "",
      "One anchor that holds:",
      "",
      "**Evidence:** `src/thing.ts:1` — `export const thing = 1;`",
      "",
      "One that does not — this text is in no file at any line:",
      "",
      "**Evidence:** `src/thing.ts:2` — `export const nowhere = 999;`",
      "",
    ].join("\n"),
  );
  git("add", "-A");
  git("commit", "-q", "-m", "add a document with a failing anchor");
});

afterAll(() => {
  if (root !== "") rmSync(root, { recursive: true, force: true });
});

describe("witness report — the exit-code contract", () => {
  it("exits 0 with a failing code-verified tier, and shows the failure", () => {
    const result = run("witness", "report", "HEAD");
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("# Run report");
    // Rendered, not gated. Both halves matter: an exit 0 that also hid the
    // failure would satisfy the code and defeat the point.
    expect(result.stdout).toContain("FABRICATED");
    expect(result.stdout).toContain("1 failing");
  });

  it("still exits 0 when the report is asked for as JSON", () => {
    const result = run("witness", "report", "HEAD", "--format", "json");
    expect(result.code).toBe(0);
    const document = JSON.parse(result.stdout) as {
      kind: string;
      version: number;
      check: { version: number; summary: { failures: number } } | null;
    };
    expect(document.kind).toBe("run-report");
    expect(document.version).toBe(1);
    // The embedded check document carries ITS version, not the outer one's.
    expect(document.check?.version).toBe(1);
    expect(document.check?.summary.failures).toBe(1);
  });

  it("reads a bare revision as that commit against its parent", () => {
    // Written with real hashes rather than `HEAD~1..HEAD`: `parseRange`'s
    // revision shape does not admit `~`, which is a property of the parser this
    // verb shares with `oracle` rather than something to work around here.
    const shas = spawnSync("git", ["log", "--format=%H"], { cwd: root, encoding: "utf8" })
      .stdout.trim()
      .split("\n");
    const [head, base] = shas;
    const bare = run("witness", "report", head as string, "--format", "json");
    const explicit = run("witness", "report", `${base as string}..${head as string}`, "--format", "json");
    const strip = (text: string): string =>
      JSON.stringify((JSON.parse(text) as { range: { commits: number } }).range.commits);
    expect(strip(bare.stdout)).toBe(strip(explicit.stdout));
    expect((JSON.parse(bare.stdout) as { range: { commits: number } }).range.commits).toBe(1);
  });
});

describe("witness report — bundles", () => {
  it("exits 2 and names the path when --bundle is not readable JSON", () => {
    write("nullius.runs/broken.json", "{ this is not json");
    const result = run("witness", "report", "HEAD", "--bundle", "nullius.runs/broken.json");
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("nullius.runs/broken.json");
    expect(result.stdout).toBe("");
  });

  it("exits 2 when --bundle names JSON that is not an envelope", () => {
    write("nullius.runs/notabundle.json", JSON.stringify({ hello: "world" }));
    const result = run("witness", "report", "HEAD", "--bundle", "nullius.runs/notabundle.json");
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("not a witness bundle");
  });

  it("renders not-recorded, and exits 0, when the named bundle simply is not there", () => {
    const result = run("witness", "report", "HEAD", "--bundle", "nullius.runs/absent.json");
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("no bundle at nullius.runs/absent.json");
    // The contributor-independent tier is unaffected, which is the whole reason
    // it is rendered first.
    expect(result.stdout).toContain("## Code-verified");
    expect(result.stdout).toContain("FABRICATED");
  });
});

describe("witness report — usage errors", () => {
  it("exits 2 with no range", () => {
    const result = run("witness", "report");
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("usage: nullius witness report");
  });

  it("exits 2 on a range git will not be handed", () => {
    const result = run("witness", "report", "main..--evil");
    expect(result.code).toBe(2);
    expect(result.stderr).toMatch(/option-shaped|not a range/);
  });

  it("exits 2 on a --format value it does not have", () => {
    const result = run("witness", "report", "HEAD", "--format", "human");
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("--format must be one of md|json");
  });

  it("refuses a report-only flag on another witness subcommand", () => {
    const result = run("witness", "validate", "run.jsonl", "--bundle", "x.json");
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("--bundle is an option of `witness report`");
  });
});
