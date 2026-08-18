/**
 * These tests execute real processes. They exist because the RCE they cover was
 * not a parsing bug — the command parsed fine and ran anyway — so only an
 * end-to-end check proves it is closed.
 */

import { existsSync, mkdtempSync, writeFileSync, chmodSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { checkClaims } from "./checkClaims";
import { parseSearchCommand } from "./commandSafety";
import { parseClaims } from "./parseClaims";
import { fileLinesReader, searchRunner } from "./runners";

function sandbox(): string {
  const root = mkdtempSync(join(tmpdir(), "nullius-runner-"));
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

  it("cuts off a pathological search well inside the budget", () => {
    const root = sandbox();
    // Catastrophic backtracking against a large input. Without a timeout this
    // is a free way to burn a CI runner from a PR-controlled document.
    writeFileSync(join(root, "src", "big.txt"), `${"a".repeat(60_000)}\n`.repeat(400));
    const parsed = parseSearchCommand("grep -rnP '(a+)+b$' src/");
    expect(parsed.safe).toBe(true);
    if (!parsed.safe) return;

    const started = Date.now();
    const outcome = searchRunner(root, 1500)(parsed.plan);
    const elapsed = Date.now() - started;

    expect(elapsed).toBeLessThan(10_000);
    if (!outcome.ok) expect(outcome.error).toMatch(/exceeded|killed|exited/);
  });
});
