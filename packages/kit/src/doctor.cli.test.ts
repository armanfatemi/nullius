import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * `doctor` through its actual command surface.
 *
 * `probeChecks` is a pure function of the directory it is handed, and
 * `doctor.test.ts` already covers it directly. What no direct call can cover
 * is the wiring: every unit test supplies `probeDir` itself, so repointing the
 * one call site in `cli.ts` at the live capture directory would leave the
 * whole suite green while silently converting a corpus regression test into a
 * report about a gitignored per-machine directory. That is the regression
 * design Decision 3 exists to prevent, and it is only visible from here.
 */

const CLI = fileURLToPath(new URL("../dist/cli.js", import.meta.url));

function run(...args: string[]) {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  return { code: result.status ?? 1, stdout, stderr, output: stdout + stderr };
}

function scratch(): string {
  return mkdtempSync(join(tmpdir(), "nullius-doctor-cli-"));
}

/**
 * The detail line belonging to one named check.
 *
 * `formatReport` prints a check as its name followed by its detail on the next
 * line, so an assertion against the whole of stdout is not an assertion about
 * this check. It has to be scoped: the live-capture check legitimately names
 * `.nullius/probes/` in its own detail, and an unscoped "stdout does not
 * mention .nullius/probes" would be trivially false no matter how the corpus
 * is wired.
 */
function detailFor(stdout: string, name: string): string {
  const lines = stdout.split("\n");
  const index = lines.findIndex((line) => line.includes(name));
  expect(index, `no check named ${name} in:\n${stdout}`).toBeGreaterThanOrEqual(0);
  return (lines[index + 1] ?? "").trim();
}

const built = existsSync(CLI);
const suite = built ? describe : describe.skip;
if (!built) {
  console.warn(`doctor.cli: ${CLI} is missing — run \`pnpm build\`. Suite SKIPPED.`);
}

suite("doctor — the command surface", () => {
  it("points the payload probe at the committed corpus, not at live capture", () => {
    const root = scratch();
    const result = run("doctor", "--root", root);

    // An empty root has no corpus, so the absent-corpus branch prints the
    // directory it was handed — which is the wiring under test.
    const detail = detailFor(result.stdout, "harness payload probe");
    const cited = /no probe recordings at (\S+)/.exec(detail)?.[1];

    expect(cited, detail).toBe(join(root, "spec", "fixtures", "probes", "claude-code"));
    expect(cited).not.toContain(".nullius");
  });

  it("names live capture as the source the corpus is fed from", () => {
    const root = scratch();
    const detail = detailFor(run("doctor", "--root", root).stdout, "harness payload probe");

    // Both directories appear, so the reader cannot take one for the other —
    // but the corpus is the one the check reads, and `.nullius/probes/` is
    // named only as where captures land before being promoted.
    expect(detail).toContain("spec/fixtures/probes/claude-code");
    expect(detail).toContain(".nullius/probes/");
  });
});
