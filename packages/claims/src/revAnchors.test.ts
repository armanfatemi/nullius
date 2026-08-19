/**
 * The two-axis check for `path:line@rev` anchors.
 *
 * The property under test is not "does it verify" but WHICH axis can fail: a
 * rev-stamped anchor may never be failed by an edit made after it was written,
 * and may never be excused for a quote that was not in the commit it names.
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { checkClaims, isFailure, type CheckDeps, type RevRead } from "./checkClaims";
import { parseClaims, type Claim, type PresenceClaim } from "./parseClaims";
import { fileLinesReader, revFileReader } from "./runners";

const REV = "a1b2c3d4";

/** The file as it stood at REV. */
const AT_REV = [
  "export function retry() {",
  "  const attempts = 5;",
  "  return attempts;",
  "}",
];

function stamped(line: number, text: string): Claim {
  return { ...unstamped(line, text), rev: REV };
}

function unstamped(line: number, text: string): PresenceClaim {
  return {
    kind: "presence",
    path: "src/app.ts",
    line,
    text,
    source: { doc: "design.md", line: 1 },
  };
}

function deps(current: string[] | null, atRev: RevRead): CheckDeps {
  return {
    readFileLines: () => current,
    readFileAtRev: () => atRev,
    runSearch: () => ({ ok: true, count: 0 }),
  };
}

describe("rev-stamped anchors — the gate axis", () => {
  it("fails a quote that was not in the file at the stamped commit", () => {
    const [result] = checkClaims(
      [stamped(2, "  const attempts = 500;")],
      deps(AT_REV, { status: "ok", lines: AT_REV }),
    );

    expect(result?.verdict).toBe("fabricated");
    expect(result?.detail).toContain(REV);
    expect(isFailure(result?.verdict ?? "ok")).toBe(true);
  });

  it("fails when the cited file did not exist at the stamped commit", () => {
    const [result] = checkClaims(
      [stamped(2, "  const attempts = 5;")],
      deps(AT_REV, { status: "no-file" }),
    );

    expect(result?.verdict).toBe("missing-file-at-rev");
    expect(isFailure("missing-file-at-rev")).toBe(true);
  });

  it("still fails an unpinnable quote — a commit cannot move under it", () => {
    const repeated = ["  x", "  x", "  x", "other"];
    const [result] = checkClaims(
      [stamped(4, "x")],
      deps(repeated, { status: "ok", lines: repeated }),
    );

    expect(result?.verdict).toBe("unpinned");
  });

  it("passes a citation true at the commit and still true today", () => {
    const [result] = checkClaims(
      [stamped(2, "  const attempts = 5;")],
      deps(AT_REV, { status: "ok", lines: AT_REV }),
    );

    expect(result?.verdict).toBe("ok");
  });

  it("reports a line number that was already wrong at the commit, without failing", () => {
    const [result] = checkClaims(
      [stamped(4, "  const attempts = 5;")],
      deps(AT_REV, { status: "ok", lines: AT_REV }),
    );

    expect(result?.verdict).toBe("advisory");
    expect(result?.detail).toContain("already wrong");
    expect(isFailure(result?.verdict ?? "ok")).toBe(false);
  });
});

describe("rev-stamped anchors — the rot axis", () => {
  const moved = ["", "", "export function retry() {", "  const attempts = 5;"];

  it("is advisory when the code moved after the doc was written", () => {
    const [result] = checkClaims(
      [stamped(2, "  const attempts = 5;")],
      deps(moved, { status: "ok", lines: AT_REV }),
    );

    expect(result?.verdict).toBe("stale");
    expect(isFailure("stale")).toBe(false);
    expect(result?.detail).toContain(REV);
  });

  it("is advisory — never FABRICATED — when the cited code was deleted", () => {
    const [result] = checkClaims(
      [stamped(2, "  const attempts = 5;")],
      deps(["everything else"], { status: "ok", lines: AT_REV }),
    );

    expect(result?.verdict).toBe("stale");
    expect(isFailure("stale")).toBe(false);
  });

  it("is advisory when the whole file was deleted", () => {
    const [result] = checkClaims(
      [stamped(2, "  const attempts = 5;")],
      deps(null, { status: "ok", lines: AT_REV }),
    );

    expect(result?.verdict).toBe("stale");
    expect(result?.detail).toContain("no longer exists");
  });

  it("keeps reporting a weak quote as weak", () => {
    const [result] = checkClaims(
      [stamped(2, "5;")],
      deps(AT_REV, { status: "ok", lines: AT_REV }),
    );

    expect(result?.verdict).toBe("weak-anchor");
  });
});

describe("rev-stamped anchors — an unreadable commit fails open", () => {
  it("does not call an author a fabricator when the commit is not in the clone", () => {
    const [result] = checkClaims(
      [stamped(2, "  const attempts = 5;")],
      deps(["unrelated"], { status: "unknown-rev" }),
    );

    expect(result?.verdict).toBe("unverifiable-rev");
    expect(isFailure("unverifiable-rev")).toBe(false);
    expect(result?.detail).toContain("fetch-depth: 0");
  });

  it("reports the ordinary verdict when the working tree already agrees", () => {
    const [result] = checkClaims(
      [stamped(2, "  const attempts = 5;")],
      deps(AT_REV, { status: "unavailable", reason: "git is not installed" }),
    );

    expect(result?.verdict).toBe("ok");
  });

  it("falls open the same way when no git reader was supplied at all", () => {
    const [result] = checkClaims([stamped(2, "  const attempts = 5;")], {
      readFileLines: () => ["unrelated"],
      runSearch: () => ({ ok: true, count: 0 }),
    });

    expect(result?.verdict).toBe("unverifiable-rev");
  });

  it("never reads a path that escaped the repo, stamped or not", () => {
    let read = 0;
    const [result] = checkClaims(
      [
        {
          kind: "presence",
          path: "../../etc/passwd",
          line: 1,
          rev: REV,
          text: "root:x:0:0",
          source: { doc: "design.md", line: 1 },
        },
      ],
      {
        readFileLines: () => null,
        readFileAtRev: () => {
          read += 1;
          return { status: "ok", lines: ["root:x:0:0"] };
        },
        runSearch: () => ({ ok: true, count: 0 }),
      },
    );

    expect(result?.verdict).toBe("unsafe-path");
    expect(read).toBe(0);
  });
});

describe("an unstamped anchor is unchanged", () => {
  it("still hard-fails a quote that is nowhere in the working tree", () => {
    const [result] = checkClaims(
      [unstamped(2, "  const attempts = 5;")],
      deps(["unrelated"], { status: "ok", lines: AT_REV }),
    );

    expect(result?.verdict).toBe("fabricated");
  });

  it("never consults git", () => {
    let read = 0;
    checkClaims([unstamped(2, "  const attempts = 5;")], {
      readFileLines: () => AT_REV,
      readFileAtRev: () => {
        read += 1;
        return { status: "ok", lines: AT_REV };
      },
      runSearch: () => ({ ok: true, count: 0 }),
    });

    expect(read).toBe(0);
  });
});

describe("parsing the @rev suffix", () => {
  it("reads the rev out of an inline anchor", () => {
    const [claim] = parseClaims(
      "design.md",
      "**Evidence:** `src/app.ts:12@A1B2C3D` — `const x = 1;`",
    );

    expect(claim).toMatchObject({
      kind: "presence",
      path: "src/app.ts",
      line: 12,
      rev: "a1b2c3d",
      text: "const x = 1;",
    });
  });

  it("reads the rev out of a block anchor", () => {
    const [claim] = parseClaims(
      "design.md",
      ["**Evidence:** `src/app.ts:12@a1b2c3d4e5f6`", "```", "const x = 1;", "```"].join("\n"),
    );

    expect(claim).toMatchObject({ rev: "a1b2c3d4e5f6", line: 12 });
  });

  it("leaves an unstamped anchor without a rev", () => {
    const [claim] = parseClaims(
      "design.md",
      "**Evidence:** `src/app.ts:12` — `const x = 1;`",
    );

    expect(claim).toMatchObject({ kind: "presence" });
    expect((claim as { rev?: string }).rev).toBeUndefined();
  });

  it("refuses a branch name where a commit belongs", () => {
    const [claim] = parseClaims(
      "design.md",
      "**Evidence:** `src/app.ts:12@main` — `const x = 1;`",
    );

    // `main` means something different next week, which is the mutability the
    // stamp exists to escape. It is refused loudly rather than being silently
    // read as part of the filename.
    expect(claim).toMatchObject({ kind: "malformed" });
  });
});

describe("revFileReader against a real repository", () => {
  const roots: string[] = [];

  afterAll(() => {
    for (const root of roots) rmSync(root, { recursive: true, force: true });
  });

  function repo(): { root: string; first: string } {
    const root = mkdtempSync(join(tmpdir(), "nullius-rev-"));
    roots.push(root);
    const git = (...args: string[]): string =>
      execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();

    git("init", "-q", "-b", "main");
    git("config", "user.email", "test@example.com");
    git("config", "user.name", "Test");
    mkdirSync(join(root, "src"));
    writeFileSync(join(root, "src", "app.ts"), AT_REV.join("\n"));
    git("add", ".");
    git("commit", "-qm", "first");
    const first = git("rev-parse", "--short", "HEAD");
    return { root, first };
  }

  it("reads the file as it stood at a commit, not as it stands now", () => {
    const { root, first } = repo();
    writeFileSync(join(root, "src", "app.ts"), "everything changed\n");

    const read = revFileReader(root)("src/app.ts", first);

    expect(read.status).toBe("ok");
    expect(read.status === "ok" && read.lines[1]).toBe("  const attempts = 5;");
  });

  it("reports an unknown commit as unknown rather than as a missing file", () => {
    const { root } = repo();

    expect(revFileReader(root)("src/app.ts", "0123456789abcdef").status).toBe(
      "unknown-rev",
    );
  });

  it("reports a file absent from a real commit as no-file", () => {
    const { root, first } = repo();

    expect(revFileReader(root)("src/never.ts", first).status).toBe("no-file");
  });

  it("refuses a revision that is not a commit hash", () => {
    const { root } = repo();
    const read = revFileReader(root)("src/app.ts", "main; rm -rf /");

    expect(read.status).toBe("unavailable");
  });

  it("drives a real end-to-end check: deleted code is stale, invention fails", () => {
    const { root, first } = repo();
    writeFileSync(join(root, "src", "app.ts"), "export function retry() {}\n");

    const doc = [
      `**Evidence:** \`src/app.ts:2@${first}\` — \`const attempts = 5;\``,
      `**Evidence:** \`src/app.ts:2@${first}\` — \`const attempts = 9000;\``,
    ].join("\n");

    const results = checkClaims(parseClaims("design.md", doc), {
      readFileLines: fileLinesReader(root),
      readFileAtRev: revFileReader(root),
      runSearch: () => ({ ok: true, count: 0 }),
    });

    expect(results[0]?.verdict).toBe("stale");
    expect(results[1]?.verdict).toBe("fabricated");
  });
});

describe("git is spawned once per commit and file, not once per anchor", () => {
  const roots: string[] = [];

  afterAll(() => {
    for (const root of roots) rmSync(root, { recursive: true, force: true });
  });

  it("serves repeated anchors on one file from the first read", () => {
    const root = mkdtempSync(join(tmpdir(), "nullius-rev-cache-"));
    roots.push(root);
    const git = (...args: string[]): string =>
      execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
    git("init", "-q", "-b", "main");
    git("config", "user.email", "test@example.com");
    git("config", "user.name", "Test");
    mkdirSync(join(root, "src"));
    writeFileSync(join(root, "src", "app.ts"), AT_REV.join("\n"));
    git("add", ".");
    git("commit", "-qm", "first");
    const first = git("rev-parse", "--short", "HEAD");

    const reader = revFileReader(root);
    expect(reader("src/app.ts", first).status).toBe("ok");

    // Deleting the repository leaves the cache as the only possible source of
    // an answer — a second `git show` here could not succeed.
    rmSync(join(root, ".git"), { recursive: true, force: true });

    expect(reader("src/app.ts", first).status).toBe("ok");
  });
});
