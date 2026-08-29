/**
 * The one ordering constraint that cannot be read off the code.
 *
 * `headerRecord` is called from `writeRecords`, which runs while the append
 * lock is held. A hook that cannot take that lock does not queue — it waits
 * `DEFAULT_WAIT_MS` and is then REFUSED, and the records it was carrying are
 * lost rather than deferred. So a git call under the lock does not merely slow
 * this hook down; it costs every hook appending beside it its records, while
 * fully satisfying "git failure is never a recording failure", because git did
 * not fail.
 *
 * That property is invisible to a type checker and survives no refactor unless
 * something asserts it. This file asserts it by intercepting every `spawnSync`
 * in the process and asking, at each one, whether the journal's lock file
 * exists.
 */

import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const spawns = vi.hoisted(() => ({
  /** One entry per spawned process: was the journal lock held at the time? */
  calls: [] as { command: string; lockHeld: boolean }[],
  /** Set by the test to the lock it cares about. */
  lockHeld: (): boolean => false,
}));

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return {
    ...actual,
    spawnSync: (command: unknown, ...rest: unknown[]) => {
      spawns.calls.push({ command: String(command), lockHeld: spawns.lockHeld() });
      return (actual.spawnSync as (...args: unknown[]) => unknown)(command, ...rest);
    },
  };
});

const { spawnSync } = await import("node:child_process");
const { resolveIdentity } = await import("./identity");
const { appendRecords, journalPathFor, LOCK_SUFFIX } = await import("./journalFile");

const HEADER = { version: "0.2", origin: "hooks" as const, session: "sess-1", source: "startup" };

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "nullius-identity-lock-"));
  spawnSync("git", ["-C", root, "-c", "init.defaultBranch=main", "init", "-q"]);
  writeFileSync(join(root, "a.txt"), "a\n", "utf8");
  spawnSync("git", ["-C", root, "add", "a.txt"]);
  spawnSync("git", [
    "-C",
    root,
    "-c",
    "user.email=t@example.com",
    "-c",
    "user.name=T",
    "commit",
    "-q",
    "--no-gpg-sign",
    "-m",
    "one",
  ]);
  spawns.calls.length = 0;
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  spawns.lockHeld = () => false;
});

describe("no git call runs while the append lock is held", () => {
  it("resolves identity before the lock and spawns nothing under it", () => {
    const file = journalPathFor(root, "sess-1");
    spawns.lockHeld = () => existsSync(`${file}${LOCK_SUFFIX}`);

    const identity = resolveIdentity(root);
    const beforeAppend = spawns.calls.length;

    appendRecords(
      file,
      // The function form runs UNDER the lock — the same shape session-end
      // sealing uses, and the place a "just resolve it here" refactor would
      // naturally land.
      () => [{ kind: "dispatch", id: "d1" }],
      { ...HEADER, ...identity },
    );

    // Not vacuous: git really was invoked, and the interception really saw it.
    // Without this the test passes just as well against a build that resolves
    // no identity at all.
    expect(beforeAppend).toBeGreaterThan(0);
    expect(identity.head).not.toBeNull();

    expect(spawns.calls.filter((call) => call.lockHeld)).toEqual([]);
    // Nothing at all is spawned from inside the append, which is the stronger
    // statement and the one a future edit would break first.
    expect(spawns.calls.length).toBe(beforeAppend);
  });

  it("spawns nothing on an append that writes a header", () => {
    const file = journalPathFor(root, "sess-2");
    spawns.lockHeld = () => existsSync(`${file}${LOCK_SUFFIX}`);
    spawns.calls.length = 0;

    // No identity passed in at all: `headerRecord` must not go and find some.
    appendRecords(file, [{ kind: "dispatch", id: "d1" }], HEADER);

    expect(spawns.calls).toEqual([]);
    expect(existsSync(file)).toBe(true);
  });
});
