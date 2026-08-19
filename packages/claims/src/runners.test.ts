/**
 * These tests execute real processes. They exist because the RCE they cover was
 * not a parsing bug — the command parsed fine and ran anyway — so only an
 * end-to-end check proves it is closed.
 */

import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  writeFileSync,
  chmodSync,
  mkdirSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { checkClaims } from "./checkClaims";
import { parseSearchCommand } from "./commandSafety";
import { parseClaims } from "./parseClaims";
import { fileLinesReader, searchRunner } from "./runners";

/** Whether a blocking FIFO can be created here, for the kill-path tests. */
function fifoAvailable(): boolean {
  const probe = spawnSync("mkfifo", ["--version"], { encoding: "utf8", timeout: 5_000 });
  return !probe.error;
}

const sandboxes: string[] = [];

afterAll(() => {
  for (const root of sandboxes) rmSync(root, { recursive: true, force: true });
});

function sandbox(): string {
  const root = mkdtempSync(join(tmpdir(), "nullius-runner-"));
  sandboxes.push(root);
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "src", "app.ts"), "const legacyRetryHelper = 1;\n");
  return root;
}

describe("searchRunner", () => {
  it("counts matches for an ordinary search", () => {
    const root = sandbox();
    const parsed = parseSearchCommand("grep -rn legacyRetryHelper src/");
    expect(parsed.safe).toBe(true);
    if (!parsed.safe) return;

    expect(searchRunner(root)(parsed.plan)).toEqual({ ok: true, count: 1 });
  });

  it("runs a pipeline without a shell", () => {
    const root = sandbox();
    const parsed = parseSearchCommand("grep -rn legacy src/ | grep Helper");
    expect(parsed.safe).toBe(true);
    if (!parsed.safe) return;

    expect(searchRunner(root)(parsed.plan)).toEqual({ ok: true, count: 1 });
  });

  it("does not hang when a first-stage search reads stdin", () => {
    const root = sandbox();
    const parsed = parseSearchCommand("grep needle");
    expect(parsed.safe).toBe(true);
    if (!parsed.safe) return;

    expect(searchRunner(root, 5000)(parsed.plan)).toEqual({ ok: true, count: 0 });
  });

  it("does not expand globs through a shell, and says so loudly", () => {
    const root = sandbox();
    // With no shell there is no glob expansion; grep reports a missing file,
    // which surfaces as command-error rather than a silent zero.
    const parsed = parseSearchCommand("grep -n legacy src/*.ts");
    expect(parsed.safe).toBe(true);
    if (!parsed.safe) return;

    const outcome = searchRunner(root)(parsed.plan);
    expect(outcome.ok).toBe(false);
  });
});

describe("the --pre remote code execution path", () => {
  it("never executes the payload, and never reports OK", () => {
    const root = sandbox();
    const marker = join(root, "PROOF_OF_RCE");
    const payload = join(root, "payload.sh");
    writeFileSync(payload, `#!/bin/sh\ntouch ${marker}\ncat "$1"\n`);
    chmodSync(payload, 0o755);

    const doc = [
      "# Deletion proposal",
      "",
      "**Evidence:** `rg --pre ./payload.sh legacyRetryHelper payload.sh` → 0 results",
      "",
    ].join("\n");

    const [result] = checkClaims(parseClaims("rce.md", doc), {
      readFileLines: fileLinesReader(root),
      runSearch: searchRunner(root),
    });

    expect(result?.verdict).toBe("unsafe");
    expect(existsSync(marker)).toBe(false);
  });
});

describe("search timeouts", () => {
  it("enforces the budget rather than letting a search run unbounded", () => {
    const root = sandbox();
    const parsed = parseSearchCommand("grep -rn legacyRetryHelper src/");
    expect(parsed.safe).toBe(true);
    if (!parsed.safe) return;

    const outcome = searchRunner(root, 1)(parsed.plan);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.error).toMatch(/exceeded|killed/);
  });

  it.skipIf(!fifoAvailable())("kills a search that would otherwise never return", () => {
    const root = sandbox();
    // A FIFO nobody writes to: grep blocks on the read forever. This is the
    // kill path specifically, and it is deterministic — unlike a "slow regex",
    // which grep's PCRE2 optimises away, letting the test pass even with the
    // timeout removed.
    execFileSync("mkfifo", [join(root, "src", "blocking.pipe")]);
    const parsed = parseSearchCommand("grep -n needle src/blocking.pipe");
    expect(parsed.safe).toBe(true);
    if (!parsed.safe) return;

    const started = Date.now();
    const outcome = searchRunner(root, 700)(parsed.plan);
    const elapsed = Date.now() - started;

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.error).toMatch(/exceeded|killed/);
    expect(elapsed).toBeLessThan(6_000);
  });

  it.skipIf(!fifoAvailable())("stops running searches once the run-wide budget is spent", () => {
    const root = sandbox();
    execFileSync("mkfifo", [join(root, "src", "blocking.pipe")]);
    const parsed = parseSearchCommand("grep -n needle src/blocking.pipe");
    expect(parsed.safe).toBe(true);
    if (!parsed.safe) return;

    // Per-search timeout alone bounds one anchor; a document can carry
    // thousands, so the run budget is what bounds the document.
    const run = searchRunner(root, 300, 500);
    const started = Date.now();
    const outcomes = [run(parsed.plan), run(parsed.plan), run(parsed.plan)];
    const elapsed = Date.now() - started;

    expect(outcomes.every((outcome) => !outcome.ok)).toBe(true);
    const last = outcomes[2];
    // Once the run budget is spent, further searches are refused outright
    // rather than each costing another full per-search timeout.
    if (last !== undefined && !last.ok) expect(last.error).toMatch(/budget/);
    expect(elapsed).toBeLessThan(3 * 300);
  });
});

describe("symlink containment", () => {
  it("refuses a search whose operand is a symlink out of the repo", () => {
    const root = sandbox();
    writeFileSync("/tmp/nullius-outside-target.txt", "SECRET_TOKEN_ABC\n");
    symlinkSync("/tmp/nullius-outside-target.txt", join(root, "evil-link"));

    const parsed = parseSearchCommand("grep -c -e SECRET_TOKEN_ABC evil-link");
    // The path is textually blameless — repo-relative, no traversal — so the
    // string guard passes it. Only the runner can see the symlink.
    expect(parsed.safe).toBe(true);
    if (!parsed.safe) return;

    const outcome = searchRunner(root)(parsed.plan);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.error).toMatch(/outside the repository/);
  });

  it("refuses to READ a symlink out of the repo", () => {
    const root = sandbox();
    writeFileSync("/tmp/nullius-outside-target.txt", "SECRET_TOKEN_ABC\n");
    symlinkSync("/tmp/nullius-outside-target.txt", join(root, "evil-read"));

    // A presence citation needs no search command at all: OK vs FABRICATED is
    // itself a content oracle over any file the runner can read.
    const [result] = checkClaims(
      parseClaims("doc.md", "**Evidence:** `evil-read:1` — `SECRET_TOKEN_ABC`"),
      { readFileLines: fileLinesReader(root), runSearch: searchRunner(root) },
    );

    expect(result?.verdict).toBe("missing-file");
  });

  it("still reads an ordinary file", () => {
    const root = sandbox();
    expect(fileLinesReader(root)("src/app.ts")?.[0]).toContain("legacyRetryHelper");
  });

  it("resolves a symlink that stays inside the repo", () => {
    const root = sandbox();
    symlinkSync(join(root, "src", "app.ts"), join(root, "alias.ts"));
    expect(fileLinesReader(root)("alias.ts")?.[0]).toContain("legacyRetryHelper");
  });
});

describe("the .git credential store", () => {
  /** A fixture with a persisted actions/checkout credential, as CI produces. */
  function repoWithToken(): string {
    const root = sandbox();
    mkdirSync(join(root, ".git"), { recursive: true });
    writeFileSync(
      join(root, ".git", "config"),
      '[http "https://github.com/"]\n  extraheader = AUTHORIZATION: basic zzTOKENVALUEzz\n',
    );
    return root;
  }

  /** Runs an absence search and returns the match count. */
  function count(root: string, command: string): number {
    const parsed = parseSearchCommand(command);
    expect(parsed.safe, `refused: ${parsed.safe ? "" : parsed.reason}`).toBe(true);
    if (!parsed.safe) return -1;
    const outcome = searchRunner(root)(parsed.plan);
    return outcome.ok ? outcome.count : -1;
  }

  // Refusing `.git` as a written operand is not enough: `grep -r` never needs
  // the directory NAMED to descend into it. Each of these returned a nonzero
  // count before the walk itself was pruned, and the count difference between a
  // matching and non-matching guess is one bit of the token, posted to a PR.
  it.each([
    ["grep with an ancestor operand", "grep -rnI -e zzTOKEN[V]ALUEzz ."],
    ["grep with no operand at all", "grep -rnI -e zzTOKEN[V]ALUEzz"],
    ["grep restricted to the config basename", "grep -rnI --include=config -e zzTOKEN[V]ALUEzz ."],
    ["rg --hidden", "rg --hidden -e zzTOKEN[V]ALUEzz ."],
    ["rg -uuu", "rg -uuu -e zzTOKEN[V]ALUEzz ."],
    ["rg --no-ignore --hidden", "rg --no-ignore --hidden -e zzTOKEN[V]ALUEzz ."],
    ["rg with a glob re-including .git", "rg -uuu --glob '.git/**' -e zzTOKEN[V]ALUEzz ."],
  ])("cannot be reached by %s", (_label, command) => {
    expect(count(repoWithToken(), command)).toBe(0);
  });

  it("refuses a symlink pointing at .git", () => {
    // `gitdir -> .git` resolves to a path that IS inside the repo, so
    // containment alone does not keep the credentials store out of reach.
    const root = repoWithToken();
    symlinkSync(join(root, ".git"), join(root, "gitdir"));

    const parsed = parseSearchCommand("grep -rnI -e zzTOKEN[V]ALUEzz gitdir/");
    expect(parsed.safe).toBe(true);
    if (!parsed.safe) return;

    const outcome = searchRunner(root)(parsed.plan);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.error).toContain(".git");
  });

  it("refuses to READ a file inside .git", () => {
    const root = repoWithToken();
    expect(fileLinesReader(root)(".git/config")).toBeNull();
  });

  it("still searches ordinary repository content", () => {
    // The prune must not make every search vacuous — that would hide the hole
    // rather than close it.
    expect(count(repoWithToken(), "grep -rnI -e legacyRetryHelper src/")).toBe(1);
  });
});

describe("the reachability control, against real searches", () => {
  /** Runs one absence claim end to end and returns its verdict. */
  function verdictFor(root: string, command: string, expected: number): string {
    const [result] = checkClaims(
      parseClaims("doc.md", `**Evidence:** \`${command}\` → ${expected} results`),
      { readFileLines: fileLinesReader(root), runSearch: searchRunner(root) },
    );
    return result?.verdict ?? "none";
  }

  it("stays quiet on a TRUE absence in a directory that really was searched", () => {
    // The property the control was rewritten for. Its predecessor truncated the
    // pattern to a fragment, and a fragment of a genuinely absent identifier is
    // usually absent too — so it fired on correct claims, which trains readers
    // to skim past ADVISORY.
    const root = sandbox();
    expect(verdictFor(root, "grep -rn -e zzNeverAppearsHerezz src/", 0)).toBe("ok");
  });

  it("fires when the scope examined no content at all", () => {
    const root = sandbox();
    // src/ holds only .ts; an include filter for .py reaches nothing, so the
    // zero says nothing about the codebase.
    expect(
      verdictFor(root, "grep -rn --include=*.py -e legacyRetryHelper src/", 0),
    ).toBe("advisory");
  });

  it("does not fire when the claim is non-zero", () => {
    const root = sandbox();
    expect(verdictFor(root, "grep -rn -e legacyRetryHelper src/", 1)).toBe("ok");
  });
});
