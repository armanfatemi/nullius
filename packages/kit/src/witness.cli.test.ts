/**
 * `witness record` through its actual command surface.
 *
 * The header's identity fields are resolved in `cli.ts`, between the pre-check
 * that decides whether a header is needed and the append that takes the lock.
 * No unit test reaches that seam: `appendRecords` is handed identity as data,
 * so a build that resolved none would leave every journalFile test green. The
 * questions this file answers are the ones only the whole hook can answer —
 * does a real run come out with identity in its header, does a run outside a
 * repository come out valid without it, and does either ever exit non-zero.
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { validateJournal } from "@nullius-inverba/claims";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const CLI = fileURLToPath(new URL("../dist/cli.js", import.meta.url));

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "nullius-witness-cli-"));
  // `.nullius/` is the recording opt-in. The shell hook tests for it; the CLI
  // does not, but a temp root without it is not the shape a real run has.
  mkdirSync(join(root, ".nullius"), { recursive: true });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function git(cwd: string, ...args: string[]): string {
  const result = spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")}: ${result.stderr ?? ""}`);
  return (result.stdout ?? "").trim();
}

function repoAt(dir: string): void {
  git(dir, "-c", "init.defaultBranch=main", "init", "-q");
  writeFileSync(join(dir, "a.txt"), "a\n", "utf8");
  git(dir, "add", "a.txt");
  const identity = ["-c", "user.email=t@example.com", "-c", "user.name=T"];
  git(dir, ...identity, "commit", "-q", "--no-gpg-sign", "-m", "one");
}

function record(payload: Record<string, unknown>, env: NodeJS.ProcessEnv = {}) {
  const result = spawnSync(process.execPath, [CLI, "witness", "record", "--root", root], {
    encoding: "utf8",
    input: JSON.stringify(payload),
    env: { ...process.env, ...env },
  });
  return { code: result.status ?? 1, stderr: result.stderr ?? "" };
}

const SESSION_START = {
  hook_event_name: "SessionStart",
  session_id: "sess-1",
  source: "startup",
};

function header(): Record<string, unknown> {
  const file = join(root, ".nullius", "runs", "sess-1.jsonl");
  const first = readFileSync(file, "utf8").split("\n")[0] ?? "{}";
  return JSON.parse(first) as Record<string, unknown>;
}

function journal(): string {
  return readFileSync(join(root, ".nullius", "runs", "sess-1.jsonl"), "utf8");
}

describe("recording where a run began", () => {
  it("writes branch, head, and a worktree identity into the header", () => {
    repoAt(root);

    expect(record(SESSION_START).code).toBe(0);

    // The positive case, asserted first. Every "no identity fields" assertion
    // below passes just as well against a build that resolves none at all.
    expect(header()["branch"]).toBe(git(root, "symbolic-ref", "--short", "HEAD"));
    expect(header()["head"]).toBe(git(root, "rev-parse", "HEAD"));
    expect(header()["worktree"]).toMatch(/^[0-9a-f]{16}$/);
    expect(validateJournal(journal()).findings).toEqual([]);
  });

  it("resolves identity once per session, not once per event", () => {
    repoAt(root);
    record(SESSION_START);
    const first = header();

    // A second event on an open journal. The pre-check outside the lock sees a
    // non-empty file and skips resolution entirely; the header is already
    // written, so nothing could change it in any case.
    record({
      hook_event_name: "PreToolUse",
      session_id: "sess-1",
      tool_name: "Task",
      tool_use_id: "toolu_A",
      tool_input: { description: "do a thing", subagent_type: "general-purpose" },
    });

    expect(header()).toEqual(first);
    expect(journal().split("\n").filter((line) => line.includes('"kind":"journal"'))).toHaveLength(
      1,
    );
  });
});

describe("recording outside a repository", () => {
  it("writes a valid journal with no identity fields and exits 0", () => {
    const result = record(SESSION_START);

    expect(result.code).toBe(0);
    const keys = Object.keys(header());
    expect(keys).not.toContain("branch");
    expect(keys).not.toContain("head");
    expect(keys).not.toContain("worktree");
    // Absent is a valid header, and this is the assertion that says so rather
    // than merely observing that nothing crashed.
    expect(validateJournal(journal()).findings).toEqual([]);
    expect(result.stderr).not.toMatch(/git/i);
  });
});

describe("a git call that exceeds its budget", () => {
  it("leaves the fields absent, lands the append, and exits 0", () => {
    repoAt(root);
    const bin = mkdtempSync(join(tmpdir(), "nullius-slowgit-"));
    writeFileSync(join(bin, "git"), "#!/bin/sh\nexec sleep 30\n", { mode: 0o755 });

    try {
      const started = Date.now();
      const result = record(SESSION_START, { PATH: `${bin}:${process.env["PATH"] ?? ""}` });
      const elapsed = Date.now() - started;

      expect(result.code).toBe(0);
      expect(existsSync(join(root, ".nullius", "runs", "sess-1.jsonl"))).toBe(true);
      const keys = Object.keys(header());
      expect(keys).not.toContain("branch");
      expect(keys).not.toContain("head");
      expect(keys).not.toContain("worktree");
      expect(validateJournal(journal()).findings).toEqual([]);
      // The budget is what makes a slow git safe rather than merely survivable:
      // 30 seconds of git must not become 30 seconds of held-up hooks.
      expect(elapsed).toBeLessThan(10_000);
    } finally {
      rmSync(bin, { recursive: true, force: true });
    }
  });
});
