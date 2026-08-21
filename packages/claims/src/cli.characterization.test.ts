import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * A characterization suite: it records what the CLI DOES today, not what it
 * ought to do. Its whole value is that it was written before the per-command
 * parser refactor and did not change during it — a test edited to match the new
 * behaviour proves nothing about the old.
 *
 * It runs the built binary rather than importing anything, for two reasons.
 * `cli.ts` exports nothing and ends in `process.exit(main())`, so it cannot be
 * imported without terminating the test run; and the contract worth protecting
 * is the one CI and users actually invoke — argv in, stdout/stderr and an exit
 * code out. Internals are what the refactor is allowed to change.
 *
 * Requires `pnpm build`. That is the repo's standing rule anyway: the CLIs run
 * from dist/, so an unbuilt tree tests the previous version of the code.
 */

const CLI = fileURLToPath(new URL("../dist/cli.js", import.meta.url));

interface Run {
  code: number;
  stdout: string;
  stderr: string;
  /** Both streams, for assertions that do not care which one carried it. */
  output: string;
}

// spawnSync, not execFileSync: the latter discards stderr on a zero exit, and
// several behaviours worth pinning here (the eager-prompt deprecation note)
// are written to stderr by a command that succeeds.
function run(...args: string[]): Run {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    cwd: fileURLToPath(new URL("../../..", import.meta.url)),
  });
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  return { code: result.status ?? 1, stdout, stderr, output: stdout + stderr };
}

const built = existsSync(CLI);
const suite = built ? describe : describe.skip;

if (!built) {
  // A skipped suite is a green suite, and a silent one is how a safety net
  // stops being a safety net. Say so.
  console.warn(`cli.characterization: ${CLI} is missing — run \`pnpm build\`. Suite SKIPPED.`);
}

suite("CLI characterization — top-level", () => {
  it("prints the version and exits 0", () => {
    const result = run("--version");

    expect(result.code).toBe(0);
    expect(result.stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("prints usage for --help and exits 0", () => {
    const result = run("--help");

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("usage: nullius <command>");
  });

  it("prints usage with NO arguments, and exits 2 — not 0", () => {
    const result = run();

    expect(result.code).toBe(2);
    expect(result.output).toContain("usage: nullius <command>");
  });

  it("rejects an unknown command with exit 2", () => {
    const result = run("frobnicate");

    expect(result.code).toBe(2);
    expect(result.output).toContain("unknown command: frobnicate");
  });

  it("rejects an unknown option with exit 2", () => {
    const result = run("check", "--bogus");

    expect(result.code).toBe(2);
    expect(result.output).toContain("unknown option: --bogus");
  });

  it("rejects --config with no value", () => {
    const result = run("check", "--config");

    expect(result.code).toBe(2);
    expect(result.output).toContain("--config requires a path argument");
  });

  it("rejects --emit-brief with no value", () => {
    const result = run("audit", "README.md", "--emit-brief");

    expect(result.code).toBe(2);
    expect(result.output).toContain("--emit-brief requires a claim id");
  });
});

/**
 * The shared flag namespace, recorded exactly as it behaves. This is the
 * behaviour task 1.1 exists to remove, so it is pinned rather than asserted as
 * correct: after the refactor these expectations SHOULD need updating, and the
 * update is the moment to decide the new contract deliberately.
 */
suite("CLI characterization — the shared flag namespace (pre-refactor)", () => {
  it("accepts a flag BEFORE the command name", () => {
    const result = run("--require-markers", "check", "CLAUDE.md");

    // CLAUDE.md carries no anchors, so --require-markers makes this exit 1.
    // The point of the case is that the flag was honoured from before the verb.
    expect(result.code).toBe(1);
  });

  it("silently accepts an audit-only flag on check, and ignores it", () => {
    const result = run("check", "CLAUDE.md", "--extract");

    expect(result.code).toBe(0);
    expect(result.output).not.toContain("unknown option");
  });

  it("silently accepts a check-only flag on audit, and ignores it", () => {
    const result = run("audit", "README.md", "--require-markers");

    expect(result.code).toBe(0);
    expect(result.output).not.toContain("unknown option");
  });
});

suite("CLI characterization — check", () => {
  it("verifies a document with anchors and exits 0", () => {
    const result = run("check", "README.md");

    expect(result.code).toBe(0);
    expect(result.output).toContain("grounding marker");
  });

  it("fails a markerless document under --require-markers", () => {
    const result = run("check", "CLAUDE.md", "--require-markers");

    expect(result.code).toBe(1);
  });

  it("passes the same document without --require-markers", () => {
    expect(run("check", "CLAUDE.md").code).toBe(0);
  });

  it("reports a missing config file with exit 2", () => {
    const result = run("check", "--config", "nope.json", "README.md");

    expect(result.code).toBe(2);
    expect(result.output).toContain("config file not found: nope.json");
  });

  it("refuses to run with no globs and no configured docs", () => {
    const result = run("check");

    expect(result.code).toBe(2);
    expect(result.output).toContain("no documents to check");
  });
});

suite("CLI characterization — audit", () => {
  it("lists a document's claims as dispatches", () => {
    const result = run("audit", "README.md");

    expect(result.code).toBe(0);
    expect(result.output).toContain("to audit");
  });

  it("requires a document", () => {
    const result = run("audit");

    expect(result.code).toBe(2);
    expect(result.output).toContain("usage: nullius audit <doc>");
  });

  it("refuses more than one document", () => {
    const result = run("audit", "README.md", "CLAUDE.md");

    expect(result.code).toBe(2);
    expect(result.output).toContain("usage: nullius audit <doc>");
  });

  it("reports a missing document with exit 2", () => {
    const result = run("audit", "nope.md");

    expect(result.code).toBe(2);
    expect(result.output).toContain("no such file: nope.md");
  });

  it("keeps eager-prompt working as a deprecated alias", () => {
    const result = run("eager-prompt", "README.md");

    expect(result.code).toBe(0);
    expect(result.output).toContain("eager-prompt");
  });
});

suite("CLI characterization — witness", () => {
  it("prints subcommand usage when given no subcommand", () => {
    const result = run("witness");

    expect(result.code).toBe(2);
    expect(result.output).toContain("usage: nullius witness validate");
  });

  it("prints subcommand usage when validate has no file", () => {
    const result = run("witness", "validate");

    expect(result.code).toBe(2);
    expect(result.output).toContain("usage: nullius witness validate");
  });

  it("rejects an unknown witness subcommand", () => {
    const result = run("witness", "frobnicate", "x.jsonl");

    expect(result.code).toBe(2);
    expect(result.output).toContain("usage: nullius witness validate");
  });

  it("reports a missing journal with exit 2", () => {
    const result = run("witness", "validate", "nope.jsonl");

    expect(result.code).toBe(2);
    expect(result.output).toContain("no such file: nope.jsonl");
  });

  it("validates a good journal with exit 0", () => {
    const result = run("witness", "validate", "spec/fixtures/valid-run.jsonl");

    expect(result.code).toBe(0);
    expect(result.output).toContain("Journal valid.");
  });

  it("fails a broken journal with exit 1", () => {
    expect(run("witness", "validate", "spec/fixtures/broken-run.jsonl").code).toBe(1);
  });
});

suite("CLI characterization — demo", () => {
  it("runs the sandbox tour and exits 0 even though it reports failures", () => {
    const result = run("demo");

    expect(result.code).toBe(0);
    expect(result.output).toContain("the demo exits 0");
  });
});
