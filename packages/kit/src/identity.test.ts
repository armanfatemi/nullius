import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  NO_IDENTITY,
  resolveIdentity,
  SALT_FILE,
  worktreeId,
  type JournalIdentity,
} from "./identity";
import { appendRecords, journalPathFor } from "./journalFile";

const HEADER = { version: "0.2", origin: "hooks" as const, session: "sess-1", source: "startup" };

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "nullius-identity-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function git(cwd: string, ...args: string[]): string {
  const result = spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr ?? ""}`);
  }
  return (result.stdout ?? "").trim();
}

/** A repository with one commit, so all three fields have something to say. */
function repoAt(dir: string): void {
  git(dir, "-c", "init.defaultBranch=main", "init", "-q");
  writeFileSync(join(dir, "a.txt"), "a\n", "utf8");
  git(dir, "add", "a.txt");
  git(
    dir,
    "-c",
    "user.email=t@example.com",
    "-c",
    "user.name=T",
    "commit",
    "-q",
    "--no-gpg-sign",
    "-m",
    "one",
  );
}

describe("resolving where a run began", () => {
  it("names the branch, the head commit, and an identity for the tree", () => {
    repoAt(root);

    const identity = resolveIdentity(root);

    // Asserted positively, and deliberately. Every other test in this file
    // asserts a field is ABSENT, and all of them would pass against a
    // resolver that was never called at all.
    expect(identity.branch).toBe(git(root, "symbolic-ref", "--short", "HEAD"));
    expect(identity.head).toBe(git(root, "rev-parse", "HEAD"));
    expect(identity.worktree).toMatch(/^[0-9a-f]{16}$/);
  });

  it("resolves nothing at all outside a repository", () => {
    expect(resolveIdentity(root)).toEqual(NO_IDENTITY);
  });

  it("omits the branch on a detached HEAD rather than inventing a sentinel", () => {
    repoAt(root);
    git(root, "checkout", "-q", "--detach");

    const identity = resolveIdentity(root);

    // `rev-parse --abbrev-ref HEAD` would answer the literal string "HEAD"
    // here, which a reader cannot distinguish from a branch of that name.
    expect(identity.branch).toBeNull();
    expect(identity.head).toBe(git(root, "rev-parse", "HEAD"));
  });

  it("still names the tree in a repository with no commits", () => {
    git(root, "-c", "init.defaultBranch=main", "init", "-q");

    const identity = resolveIdentity(root);

    expect(identity.head).toBeNull();
    expect(identity.worktree).toMatch(/^[0-9a-f]{16}$/);
  });

  it("answers from a subdirectory, because a hook's cwd is wherever it is", () => {
    repoAt(root);
    const sub = join(root, "packages", "deep");
    mkdirSync(sub, { recursive: true });

    // `--git-common-dir` answers RELATIVE to git's own cwd, so a resolver that
    // resolved it against the toplevel instead would silently look for the
    // salt in the wrong place from anywhere but the repository root.
    expect(resolveIdentity(sub).worktree).toBe(resolveIdentity(root).worktree);
  });
});

describe("the worktree identity", () => {
  it("carries nothing about the machine", () => {
    repoAt(root);

    const identity = resolveIdentity(root);

    expect(identity.worktree).not.toContain(root);
    expect(identity.worktree).not.toContain("/");
    expect(identity.worktree).toMatch(/^[0-9a-f]{16}$/);
  });

  it("is stable for one tree across the session", () => {
    repoAt(root);

    expect(resolveIdentity(root).worktree).toBe(resolveIdentity(root).worktree);
  });

  it("distinguishes two trees", () => {
    const other = mkdtempSync(join(tmpdir(), "nullius-identity-other-"));
    try {
      repoAt(root);
      repoAt(other);

      expect(resolveIdentity(root).worktree).not.toBe(resolveIdentity(other).worktree);
    } finally {
      rmSync(other, { recursive: true, force: true });
    }
  });

  it("is salted — the same path under a different salt is a different digest", () => {
    repoAt(root);
    const before = resolveIdentity(root).worktree;

    writeFileSync(join(root, ".git", SALT_FILE), "a-different-salt\n", "utf8");
    const after = resolveIdentity(root).worktree;

    // An unsalted digest is identical under both, and an unsalted digest of an
    // absolute worktree path is confirmable by preimage guess — which is the
    // disclosure the hash exists to prevent.
    expect(before).not.toBe(after);
  });

  it("is not the unsalted digest of the path", () => {
    repoAt(root);
    const toplevel = git(root, "rev-parse", "--show-toplevel");
    const unsalted = createHash("sha256").update(toplevel).digest("hex").slice(0, 16);

    expect(resolveIdentity(root).worktree).not.toBe(unsalted);
  });

  it("is a salted sha-256 of the absolute path, truncated to 16 hex characters", () => {
    const salted = mkdtempSync(join(tmpdir(), "nullius-salt-"));
    try {
      writeFileSync(join(salted, SALT_FILE), "known-salt\n", "utf8");

      // The construction is pinned rather than described, because "a short
      // hash" is not a redaction claim and the parts that make it one — the
      // salt, the algorithm, the length — are exactly what a later refactor
      // would feel free to change.
      expect(worktreeId(salted, "/some/tree")).toBe(
        createHash("sha256")
          .update("known-salt")
          .update("\0")
          .update("/some/tree")
          .digest("hex")
          .slice(0, 16),
      );
    } finally {
      rmSync(salted, { recursive: true, force: true });
    }
  });

  it("keeps the salt in the git common directory, so one clone has exactly one", () => {
    repoAt(root);
    const parent = mkdtempSync(join(tmpdir(), "nullius-linked-"));
    const linked = join(parent, "wt");
    try {
      git(root, "worktree", "add", "-q", "-b", "side", linked);

      const main = resolveIdentity(root);
      const side = resolveIdentity(linked);

      // One salt, in the git common directory — nothing beside the linked
      // worktree, and nothing under `.nullius/`.
      expect(existsSync(join(root, ".git", SALT_FILE))).toBe(true);
      expect(existsSync(join(root, ".nullius", "salt"))).toBe(false);
      // Shared salt, different paths: sibling worktrees still differ, which is
      // the question the field exists to answer.
      expect(side.worktree).not.toBe(main.worktree);
      expect(side.branch).toBe("side");
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });
});

describe("git failure is never a recording failure", () => {
  it("leaves every field absent when a git call exceeds its budget", () => {
    repoAt(root);
    const shim = slowGitOnPath();
    const started = Date.now();
    let identity: JournalIdentity;
    try {
      identity = resolveIdentity(root, 50, 150);
    } finally {
      shim.restore();
    }

    expect(identity).toEqual(NO_IDENTITY);
    // Bounded, and bounded well under the 2 000 ms at which a waiting hook's
    // append stops being delayed and starts being refused.
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it("still writes a valid journal when git times out", () => {
    repoAt(root);
    const file = journalPathFor(root, "sess-1");
    const shim = slowGitOnPath();
    let identity: JournalIdentity;
    try {
      identity = resolveIdentity(root, 50, 150);
    } finally {
      shim.restore();
    }

    const outcome = appendRecords(file, [{ kind: "dispatch", id: "d1" }], {
      ...HEADER,
      ...identity,
    });

    expect(outcome.refused).toBeNull();
    expect(outcome.written).toBe(1);
    const header = JSON.parse(readFileSync(file, "utf8").split("\n")[0] ?? "{}") as
      Record<string, unknown>;
    expect(header["kind"]).toBe("journal");
    expect(Object.keys(header)).not.toContain("branch");
    expect(Object.keys(header)).not.toContain("head");
    expect(Object.keys(header)).not.toContain("worktree");
  });

  it("leaves every field absent when there is no git binary to run", () => {
    repoAt(root);
    const empty = mkdtempSync(join(tmpdir(), "nullius-nogit-"));
    const saved = process.env["PATH"];
    process.env["PATH"] = empty;
    try {
      expect(resolveIdentity(root)).toEqual(NO_IDENTITY);
    } finally {
      process.env["PATH"] = saved;
      rmSync(empty, { recursive: true, force: true });
    }
  });
});

/**
 * A `git` on PATH that will not answer inside any budget this module allows.
 *
 * The interesting failure is not git erroring — it is git *succeeding slowly*,
 * which satisfies "never fail" while costing a concurrent hook its records. A
 * shim makes that deterministic instead of hoping a real `rev-parse` is slow.
 * `exec`, so the timeout's SIGKILL lands on the sleeping process itself rather
 * than on a shell whose child would keep the pipe open past the deadline.
 */
function slowGitOnPath(): { restore: () => void } {
  const bin = mkdtempSync(join(tmpdir(), "nullius-slowgit-"));
  writeFileSync(join(bin, "git"), "#!/bin/sh\nexec sleep 5\n", { mode: 0o755 });
  const saved = process.env["PATH"];
  process.env["PATH"] = `${bin}:${saved ?? ""}`;
  return {
    restore: () => {
      process.env["PATH"] = saved;
      rmSync(bin, { recursive: true, force: true });
    },
  };
}
