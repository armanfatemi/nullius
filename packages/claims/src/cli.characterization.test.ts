import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

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

/**
 * Presence is not freshness. `existsSync` passes on a dist/ built from any
 * earlier commit, and this suite would then characterize the PREVIOUS version
 * of the CLI while reporting green — the exact failure CLAUDE.md warns about,
 * in the one suite whose job is to notice it.
 */
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

  it("rejects an unknown option, naming the command it was offered to", () => {
    const result = run("check", "--bogus");

    expect(result.code).toBe(2);
    // Was `unknown option: --bogus` before per-command parsing. The command
    // name is the addition: the same flag can be unknown here and fine there.
    expect(result.output).toContain("unknown option for `check`: --bogus");
  });

  it("rejects --config with no value", () => {
    const result = run("check", "--config");

    expect(result.code).toBe(2);
    expect(result.output).toContain("--config requires a path argument");
  });

  // The refactor broke every one of these and no test noticed, in a suite
  // whose stated job is to record what the CLI does. `<command> --help` is
  // the most-typed help form there is, and USAGE lists --help and --version
  // under "check options:".
  it("honours --help and --version after a command, not just before one", () => {
    for (const argv of [
      ["check", "--help"],
      ["check", "-h"],
      ["check", "--version"],
      ["audit", "--help"],
      ["witness", "--help"],
      ["audit", "doc.md", "--help"],
    ]) {
      const result = run(...argv);
      expect(result.code, argv.join(" ")).toBe(0);
    }
  });

  it("answers --help even when the rest of the line is nonsense", () => {
    // Which is usually why someone is asking.
    expect(run("check", "--bogus", "--help").code).toBe(0);
  });

  it("treats -- as an operand separator", () => {
    expect(run("check", "--", "README.md").code).toBe(0);
  });

  it("rejects --emit-brief with no value", () => {
    const result = run("audit", "README.md", "--emit-brief");

    expect(result.code).toBe(2);
    expect(result.output).toContain("--emit-brief requires a claim id");
  });
});

/**
 * These four cases are the whole point of task 1.1, and they are the only
 * expectations in this file that the refactor was allowed to change. Each one
 * records what it used to do, because "a flag from another command is accepted
 * and ignored" is a failure a reader will not believe was ever shipped unless
 * the old behaviour is written down next to the new one.
 */
suite("CLI — flags belong to commands", () => {
  it("refuses a flag placed before the command, and says where it goes", () => {
    // WAS: exit 1 — the flag was honoured from before the verb, because one
    // parser scanned all of argv for both commands and options.
    const result = run("--require-markers", "check", "CLAUDE.md");

    expect(result.code).toBe(2);
    expect(result.output).toContain("the command comes first");
  });

  it("refuses an audit-only flag on check, naming its real owner", () => {
    // WAS: exit 0, flag silently ignored.
    const result = run("check", "CLAUDE.md", "--extract");

    expect(result.code).toBe(2);
    expect(result.output).toContain("--extract is an option of `audit`");
  });

  it("refuses a check-only flag on audit, naming its real owner", () => {
    // WAS: exit 0, flag silently ignored — the dangerous one. A user who
    // believed --require-markers gated that run was wrong, and nothing said so.
    const result = run("audit", "README.md", "--require-markers");

    expect(result.code).toBe(2);
    expect(result.output).toContain("--require-markers is an option of `check`");
  });

  it("refuses a flag on witness that is not --expect-rules", () => {
    const result = run("witness", "validate", "spec/fixtures/valid-run.jsonl", "--oops");

    expect(result.code).toBe(2);
    expect(result.output).toContain("unknown option for `witness`");
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
    expect(result.stderr).toContain("eager-prompt");
  });

  // A review mutated `propose` to false and to a dead branch; both left the
  // whole suite green. The deprecation note above is printed from a branch
  // gated on the ALIAS, independent of `propose`, so it proved nothing about
  // whether proposing happens. These compare the actual emitted document.
  it("makes --propose emit the eager prompt, not the ordinary plan", () => {
    const plan = run("audit", "README.md");
    const proposed = run("audit", "README.md", "--propose");

    expect(proposed.code).toBe(0);
    expect(proposed.stdout).not.toBe(plan.stdout);
    expect(proposed.stdout.length).toBeGreaterThan(0);
  });

  it("makes eager-prompt emit exactly what --propose emits", () => {
    const alias = run("eager-prompt", "README.md");
    const explicit = run("audit", "README.md", "--propose");

    // The alias's only difference is the note on stderr.
    expect(alias.stdout).toBe(explicit.stdout);
  });

  it("makes --extract emit something different again", () => {
    const extract = run("audit", "README.md", "--extract");
    const plan = run("audit", "README.md");

    expect(extract.code).toBe(0);
    expect(extract.stdout).not.toBe(plan.stdout);
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

/**
 * `--expect-rules` — add-silent-rule-check tasks 3.2-3.4. Exercised through
 * the built CLI, same as the rest of this suite: `runWitness` is not exported
 * (cli.ts ends in `process.exit(main())`), so the observable contract is
 * argv in, exit code and output out.
 */
suite("CLI characterization — witness --expect-rules", () => {
  // Task 3.3: without the flag, `witness validate`'s behaviour is
  // byte-for-byte unchanged — pinned as a literal output snapshot, since
  // "unchanged" is otherwise unfalsifiable without one. The existing
  // "CLI characterization — witness" suite above (no --expect-rules
  // anywhere in it) is the other half of this proof: those fixtures still
  // validate/fail exactly as they did before this capability existed.
  it("prints no coverage section at all when --expect-rules is omitted", () => {
    const result = run("witness", "validate", "spec/fixtures/valid-run.jsonl");

    expect(result.code).toBe(0);
    expect(result.stdout).toBe(
      "\n11 record(s) read: 3 dispatch(es), 1 verification(s), 1 mutation(s).\n" +
        "Outcomes: 1 found, 1 explicitly empty, 1 never reported.\n" +
        "Schema 0.2, origin: hooks — records emitted by the harness runtime, which the agent had no opportunity to decline.\n" +
        "Journal valid.\n",
    );
    expect(result.output).not.toContain("SILENT-RULE");
    expect(result.output).not.toContain("Rule coverage:");
  });

  it("passes when every expected rule id reached a delivered verdict", () => {
    const result = run(
      "witness",
      "validate",
      "spec/fixtures/rule-coverage-valid.jsonl",
      "--expect-rules",
      "build-before-cli",
      "merge-never-squash",
      "one-delivery-mechanism",
    );

    expect(result.code).toBe(0);
    expect(result.output).not.toContain("SILENT-RULE");
    expect(result.output).toContain("Journal valid.");
  });

  it("fails and reports SILENT-RULE for each rule that never reached a delivered verdict", () => {
    const result = run(
      "witness",
      "validate",
      "spec/fixtures/rule-coverage-broken.jsonl",
      "--expect-rules",
      "build-before-cli",
      "verdict-needs-fixture-and-test",
      "rev-stamp-change-anchors",
      "model-proposes-code-verifies",
    );

    expect(result.code).toBe(1);
    // Two covered rules must not appear as SILENT-RULE — build-before-cli
    // (a clean COMPLIANT) and model-proposes-code-verifies (also COMPLIANT),
    // included specifically to prove this check distinguishes passing rules
    // from failing ones within the same run, not just "everything fails".
    expect(result.output).not.toContain("SILENT-RULE  build-before-cli");
    expect(result.output).not.toContain("SILENT-RULE  model-proposes-code-verifies");
    // The two silent ones must, one line each, in a format that names no
    // line number — RuleCoverageFinding has none (task 2.4/3.2).
    expect(result.output).toContain("SILENT-RULE  verdict-needs-fixture-and-test");
    expect(result.output).toContain("SILENT-RULE  rev-stamp-change-anchors");
  });

  // Task 3.4: an unreadable schema version must suppress the coverage check
  // entirely — no SILENT-RULE finding computed from content the validator
  // itself declined to read, even though every named id is absent from it.
  it("reports UNSUPPORTED-VERSION and no SILENT-RULE finding when the journal's schema is unreadable", () => {
    const result = run(
      "witness",
      "validate",
      "spec/fixtures/future-run.jsonl",
      "--expect-rules",
      "build-before-cli",
      "merge-never-squash",
    );

    expect(result.code).toBe(1);
    expect(result.output).toContain("UNSUPPORTED-VERSION");
    expect(result.output).not.toContain("SILENT-RULE");
    expect(result.output).not.toContain("Rule coverage:");
  });
});

suite("CLI characterization — demo", () => {
  it("runs the sandbox tour and exits 0 even though it reports failures", () => {
    const result = run("demo");

    expect(result.code).toBe(0);
    expect(result.output).toContain("the demo exits 0");
  });
});
