/**
 * `check --fix` and `check --stamp` through the process boundary.
 *
 * Each test builds its own git repository under a temp dir and runs the BUILT
 * `dist/cli.js` there, then asserts the DOCUMENT'S BYTES — not just the exit
 * code. A rewriting flag's whole contract is which bytes it changes and which
 * it leaves alone, and an exit code says nothing about either.
 *
 * Requires `pnpm build`, like `cli.characterization.test.ts`, and carries the
 * same freshness guard: an unbuilt tree would test the previous CLI.
 */

import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, describe, expect, it } from "vitest";

const CLI = fileURLToPath(new URL("../dist/cli.js", import.meta.url));

interface Run {
  code: number;
  stdout: string;
  stderr: string;
  output: string;
}

function run(cwd: string, args: string[], env: NodeJS.ProcessEnv = process.env): Run {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    cwd,
    env,
  });
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  return { code: result.status ?? 1, stdout, stderr, output: stdout + stderr };
}

const built = existsSync(CLI);
const suite = built ? describe : describe.skip;

if (!built) {
  console.warn(`cli.rewrite: ${CLI} is missing — run \`pnpm build\`. Suite SKIPPED.`);
}

suite("the binary under test is not stale", () => {
  it("was built after the newest source file", () => {
    const srcDir = fileURLToPath(new URL(".", import.meta.url));
    const newest = readdirSync(srcDir)
      .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))
      .map((name) => statSync(join(srcDir, name)).mtimeMs)
      .reduce((a, b) => Math.max(a, b), 0);

    expect(
      statSync(CLI).mtimeMs,
      "dist/cli.js is older than src — run `pnpm build`; this suite is testing the previous version",
    ).toBeGreaterThanOrEqual(newest);
  });
});

/**
 * The cited file. Line numbers are load-bearing: `return shared;` appears
 * twice (lines 12 and 30) so a citation to it elsewhere is `unpinned`;
 * `alphaValue` (line 2) and `betaValue` (line 6) each appear once, so a
 * citation 2 lines off is `drift` (window 3) and one 20 lines off is
 * `wrong-line`.
 */
const SOURCE: string[] = [];
SOURCE.push("export function alpha() {"); // 1
SOURCE.push("  const alphaValue = 1;"); // 2
SOURCE.push("  return alphaValue;"); // 3
SOURCE.push("}"); // 4
SOURCE.push("export function beta() {"); // 5
SOURCE.push("  const betaValue = 2;"); // 6
SOURCE.push("  return betaValue;"); // 7
SOURCE.push("}"); // 8
SOURCE.push("export function gamma() {"); // 9
SOURCE.push("  const shared = 3;"); // 10
SOURCE.push("  if (shared > 0) {"); // 11
SOURCE.push("    return shared;"); // 12
SOURCE.push("  }"); // 13
SOURCE.push("  return 0;"); // 14
SOURCE.push("}"); // 15
for (let n = 16; n <= 27; n += 1) SOURCE.push(`// filler line ${n}`); // 16..27
SOURCE.push("export function delta() {"); // 28
SOURCE.push("  const shared = 4;"); // 29
SOURCE.push("    return shared;"); // 30
SOURCE.push("}"); // 31

const roots: string[] = [];

afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

function scratch(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  roots.push(root);
  return root;
}

interface Repo {
  root: string;
  head: string;
  git: (...args: string[]) => string;
}

/** A repository with `src/a.ts` committed and a clean working tree. */
function repo(source: readonly string[] = SOURCE): Repo {
  const root = scratch("nullius-rewrite-");
  const git = (...args: string[]): string =>
    execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
  git("init", "-q", "-b", "main");
  git("config", "user.email", "test@example.com");
  git("config", "user.name", "Test");
  git("config", "commit.gpgsign", "false");
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "src", "a.ts"), `${source.join("\n")}\n`);
  git("add", ".");
  git("commit", "-q", "--no-verify", "-m", "first");
  return { root, head: git("rev-parse", "--short", "HEAD"), git };
}

function writeDoc(root: string, lines: readonly string[]): string {
  const content = `${lines.join("\n")}\n`;
  writeFileSync(join(root, "doc.md"), content);
  return content;
}

function readDoc(root: string): string {
  return readFileSync(join(root, "doc.md"), "utf8");
}

const anchor = (cite: string, quote: string): string =>
  `**Evidence:** \`${cite}\` — \`${quote}\``;

suite("check --fix", () => {
  it("repoints drift and wrong-line, leaves every other byte alone, and re-checks OK", () => {
    const { root } = repo();
    writeDoc(root, [
      "# Doc",
      "",
      anchor("src/a.ts:4", "const alphaValue = 1;"), // drift: really line 2
      "",
      "Some prose  with trailing spaces.  ",
      anchor("src/a.ts:26", "const betaValue = 2;"), // wrong-line: really line 6
    ]);

    const first = run(root, ["check", "doc.md", "--fix"]);
    expect(first.code).toBe(0);
    expect(first.stdout).toContain("DRIFT");
    expect(first.stdout).toContain("WRONG-LINE");
    expect(first.stdout).toContain("rewrote  doc.md:3  src/a.ts:4 -> src/a.ts:2");
    expect(first.stdout).toContain("rewrote  doc.md:6  src/a.ts:26 -> src/a.ts:6");
    expect(first.stdout).toContain("doc.md: 2 fixed, 0 stamped, 0 skipped");

    expect(readDoc(root)).toBe(
      [
        "# Doc",
        "",
        anchor("src/a.ts:2", "const alphaValue = 1;"),
        "",
        "Some prose  with trailing spaces.  ",
        anchor("src/a.ts:6", "const betaValue = 2;"),
        "",
      ].join("\n"),
    );

    const second = run(root, ["check", "doc.md"]);
    expect(second.code).toBe(0);
    expect(second.stdout).not.toContain("DRIFT");
    expect(second.stdout).not.toContain("WRONG-LINE");
    expect(second.stdout).toContain("All 2 grounding marker(s) verified.");
  });

  it("leaves fabricated and unpinned anchors byte-identical and still fails", () => {
    const { root } = repo();
    const before = writeDoc(root, [
      anchor("src/a.ts:3", "const nonexistentValue = 99;"), // fabricated
      anchor("src/a.ts:1", "return shared;"), // unpinned: lines 12 and 30
    ]);

    const result = run(root, ["check", "doc.md", "--fix"]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("FABRICATED");
    expect(result.stderr).toContain("UNPINNED");
    expect(result.stdout).not.toContain("rewrote");
    expect(readDoc(root)).toBe(before);
  });

  it("never repoints a stamped anchor, even when its unreadable rev fails open to drift", () => {
    const { root } = repo();
    // `deadbeef1` is hex, so it reaches `git show`, which cannot resolve it;
    // the checker then falls open to the working tree and reports drift.
    const before = writeDoc(root, [anchor("src/a.ts:4@deadbeef1", "const alphaValue = 1;")]);

    const result = run(root, ["check", "doc.md", "--fix"]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("DRIFT");
    expect(result.stdout).not.toContain("rewrote");
    expect(readDoc(root)).toBe(before);
  });

  it("composes with --stamp: a drift anchor is repointed and stamped at the new line", () => {
    const { root, head } = repo();
    writeDoc(root, [anchor("src/a.ts:4", "const alphaValue = 1;")]);

    const result = run(root, ["check", "doc.md", "--fix", "--stamp"]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain(`rewrote  doc.md:1  src/a.ts:4 -> src/a.ts:2`);
    expect(result.stdout).toContain(`rewrote  doc.md:1  src/a.ts:2 -> src/a.ts:2@${head}`);
    expect(result.stdout).toContain("doc.md: 1 fixed, 1 stamped, 0 skipped");
    expect(readDoc(root)).toBe(`${anchor(`src/a.ts:2@${head}`, "const alphaValue = 1;")}\n`);

    const again = run(root, ["check", "doc.md"]);
    expect(again.code).toBe(0);
    expect(again.stdout).toContain(`OK            doc.md:1  src/a.ts:2@${head}`);
  });
});

suite("check --stamp", () => {
  it("stamps an OK anchor with the short HEAD on a clean tree and leaves a fabricated one alone", () => {
    const { root, head } = repo();
    writeDoc(root, [
      anchor("src/a.ts:2", "const alphaValue = 1;"),
      anchor("src/a.ts:3", "const nonexistentValue = 99;"),
    ]);

    const result = run(root, ["check", "doc.md", "--stamp"]);

    expect(result.code).toBe(1);
    expect(result.stdout).toContain(`rewrote  doc.md:1  src/a.ts:2 -> src/a.ts:2@${head}`);
    expect(result.stdout).toContain("doc.md: 0 fixed, 1 stamped, 0 skipped");
    expect(readDoc(root)).toBe(
      [
        anchor(`src/a.ts:2@${head}`, "const alphaValue = 1;"),
        anchor("src/a.ts:3", "const nonexistentValue = 99;"),
        "",
      ].join("\n"),
    );

    const again = run(root, ["check", "doc.md"]);
    expect(again.stdout).toContain(`OK            doc.md:1  src/a.ts:2@${head}`);
    expect(again.stderr).toContain("FABRICATED    doc.md:2  src/a.ts:3");
  });

  it("skips an anchor whose quote an uncommitted edit added: OK locally, not at HEAD", () => {
    const { root } = repo();
    writeFileSync(
      join(root, "src", "a.ts"),
      `${["  const addedLocally = 7;", ...SOURCE].join("\n")}\n`,
    );
    const before = writeDoc(root, [anchor("src/a.ts:1", "const addedLocally = 7;")]);

    const result = run(root, ["check", "doc.md", "--stamp"]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("OK ");
    expect(result.stdout).toContain("skipped  doc.md:1  not-at-rev");
    expect(result.stdout).toContain("doc.md: 0 fixed, 0 stamped, 1 skipped");
    expect(result.stdout).not.toContain("rewrote");
    expect(readDoc(root)).toBe(before);
  });

  it("never launders a local fabrication through HEAD: quote removed locally, present at HEAD", () => {
    const { root } = repo();
    writeFileSync(
      join(root, "src", "a.ts"),
      `${SOURCE.filter((line) => !line.includes("alphaValue = 1")).join("\n")}\n`,
    );
    const before = writeDoc(root, [anchor("src/a.ts:2", "const alphaValue = 1;")]);

    const result = run(root, ["check", "doc.md", "--stamp"]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("FABRICATED");
    expect(result.stdout).not.toContain("rewrote");
    expect(result.stdout).not.toContain("skipped");
    expect(readDoc(root)).toBe(before);
  });

  it("exits 2 and writes nothing outside a git repository", () => {
    const root = scratch("nullius-norepo-");
    mkdirSync(join(root, "src"));
    writeFileSync(join(root, "src", "a.ts"), `${SOURCE.join("\n")}\n`);
    const before = writeDoc(root, [anchor("src/a.ts:2", "const alphaValue = 1;")]);

    const result = run(root, ["check", "doc.md", "--stamp"]);

    expect(result.code).toBe(2);
    expect(result.stderr).toContain("cannot stamp");
    // Nothing was read or reported either: the refusal comes before the loop.
    expect(result.stdout).not.toContain("OK ");
    expect(readDoc(root)).toBe(before);
    expect(readdirSync(root).filter((name) => name.includes("nullius-tmp"))).toEqual([]);
  });

  it("exits 2 and writes nothing when git itself is unavailable", () => {
    if (process.platform === "win32") return;
    const { root } = repo();
    const before = writeDoc(root, [anchor("src/a.ts:2", "const alphaValue = 1;")]);
    // A `git` that fails on every invocation, ahead of the real one on PATH.
    const bin = scratch("nullius-brokengit-");
    writeFileSync(join(bin, "git"), "#!/bin/sh\nexit 1\n");
    chmodSync(join(bin, "git"), 0o755);

    const result = run(root, ["check", "doc.md", "--stamp"], {
      ...process.env,
      PATH: `${bin}:${process.env["PATH"] ?? ""}`,
    });

    expect(result.code).toBe(2);
    expect(result.stderr).toContain("cannot stamp");
    expect(result.stdout).not.toContain("OK ");
    expect(readDoc(root)).toBe(before);
  });
});

suite("check without --fix or --stamp", () => {
  it("leaves the document byte-identical even when drift is reported", () => {
    const { root } = repo();
    const before = writeDoc(root, [anchor("src/a.ts:4", "const alphaValue = 1;")]);

    const result = run(root, ["check", "doc.md"]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("DRIFT");
    expect(result.stdout).not.toContain("rewrote");
    expect(readDoc(root)).toBe(before);
  });
});
