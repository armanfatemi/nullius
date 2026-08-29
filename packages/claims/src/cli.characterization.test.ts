import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

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
const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));

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
    cwd: REPO_ROOT,
  });
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  return { code: result.status ?? 1, stdout, stderr, output: stdout + stderr };
}

/**
 * Scratch documents for the funnel and parity suites. They cite REPO-RELATIVE
 * paths, so the CLI still runs with cwd = repo root (`run()` above) and the
 * documents are passed by absolute path.
 */
const scratchRoots: string[] = [];

afterAll(() => {
  for (const root of scratchRoots) rmSync(root, { recursive: true, force: true });
});

function scratch(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  scratchRoots.push(root);
  return root;
}

function writeDoc(root: string, name: string, lines: readonly string[]): string {
  const path = join(root, name);
  writeFileSync(path, `${lines.join("\n")}\n`);
  return path;
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
 * `nullius <command> --help` prints that command's block alone. The overview
 * is composed from the same blocks, so the two are pinned against each other:
 * one example per block, seven blocks in the overview, and a block that does
 * not leak its neighbours.
 */
suite("CLI characterization — per-command help", () => {
  const COMMAND_NAMES = ["check", "demo", "audit", "witness", "wiring", "rules", "canary"];

  function exampleLines(text: string): string[] {
    return text.split("\n").filter((line) => line.trimStart().startsWith("example:"));
  }

  it("prints only the check block for `check --help`, with exactly one example", () => {
    const result = run("check", "--help");

    expect(result.code).toBe(0);
    expect(exampleLines(result.stdout)).toHaveLength(1);
    expect(result.stdout).toContain("--require-markers");
    expect(result.stdout).not.toContain("witness validate");
    expect(result.stdout).toContain("spec: ");
  });

  it("prints the whole overview for `--help`: every command, one example each", () => {
    const result = run("--help");

    expect(result.code).toBe(0);
    for (const name of COMMAND_NAMES) {
      expect(result.stdout, name).toContain(`nullius ${name}`);
    }
    expect(exampleLines(result.stdout)).toHaveLength(7);
  });

  it("still exits 2 with no arguments at all", () => {
    expect(run().code).toBe(2);
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
 * `witness survey` — add-journal-identity tasks 2.1-2.6. Through the built
 * binary like the rest of this suite: `runWitnessSurvey` is not exported.
 */
suite("CLI characterization — witness survey", () => {
  it("still takes exactly one path for `validate`, which is why `survey` exists", () => {
    // Task 2.6. Teaching `validate` to accept globs was rejected in design.md
    // Decision 1 — it is a CI gate people have already wired, and a verb that
    // sometimes-aggregates invites the merge semantics that decision forbids.
    // So this refusal is a feature with a reason, and it gets pinned.
    const two = run(
      "witness",
      "validate",
      "spec/fixtures/valid-run.jsonl",
      "spec/fixtures/v0.3-run.jsonl",
    );

    expect(two.code).toBe(2);
    expect(two.output).toContain("usage: nullius witness validate");

    // And a glob is not expanded by `validate` either: quoted, it reaches the
    // CLI as a literal path that does not exist.
    const glob = run("witness", "validate", "spec/fixtures/*.jsonl");
    expect(glob.code).toBe(2);
    expect(glob.output).toContain("no such file:");
  });

  it("prints usage when survey is given no glob", () => {
    const result = run("witness", "survey");

    expect(result.code).toBe(2);
    expect(result.output).toContain("nullius witness survey");
  });

  it("reports an unmatched glob with exit 2 rather than an empty survey", () => {
    const result = run("witness", "survey", "spec/fixtures/no-such-*.jsonl");

    expect(result.code).toBe(2);
    expect(result.output).toContain("no journals matched:");
  });

  it("surveys a glob of valid journals with exit 0", () => {
    const result = run("witness", "survey", "spec/fixtures/valid-run.jsonl");

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("1 journal(s) surveyed, 0 failing");
  });

  it("exits 1 when any surveyed journal fails", () => {
    const result = run("witness", "survey", "spec/fixtures/*.jsonl");

    expect(result.code).toBe(1);
    expect(result.output).toContain("do not hold up");
  });

  it("prints the journal count in the same block as the totals", () => {
    const result = run("witness", "survey", "spec/fixtures/*.jsonl");

    // A summed outcome triple with no denominator reads as one validated run.
    expect(result.stdout).toMatch(
      /Outcomes across \d+ independently validated journal\(s\): \d+ found, \d+ explicitly empty, \d+ never reported\./,
    );
    expect(result.stdout).toMatch(/\d+ journal\(s\) surveyed, \d+ failing, \d+ valid\./);
  });

  it("documents survey in the witness help block, one example line still", () => {
    const result = run("witness", "--help");

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("survey <glob...>");
    // One `example:` line per command block, still — the overview is composed
    // from these blocks and the funnel suite counts one per command.
    expect(
      result.stdout.split("\n").filter((line) => line.trimStart().startsWith("example:")),
    ).toHaveLength(1);
  });

  it("refuses --expect-rules on a survey rather than ignoring it", () => {
    const result = run(
      "witness",
      "survey",
      "spec/fixtures/valid-run.jsonl",
      "--expect-rules",
      "build-before-cli",
    );

    expect(result.code).toBe(2);
    expect(result.output).toContain("--expect-rules belongs to `witness validate`");
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

/**
 * Decision 6, second half: on a matched set with no grounding markers, the
 * closing line is the next command, not `All 0 grounding marker(s) verified.`
 * — REPLACED, never appended. The exit code does not move.
 */
suite("CLI characterization — the zero-marker funnel", () => {
  const OLD_CLOSING = "All 0 grounding marker(s) verified.";

  function funnelDocs(): { glob: string; longer: string } {
    const root = scratch("nullius-funnel-");
    writeDoc(root, "short.md", ["# Short", "", "Two paragraphs, no citations at all."]);
    const longer = writeDoc(root, "long.md", [
      "# Long",
      "",
      "This document says a great deal about the code and cites none of it.",
      "",
      "Paragraph two.",
      "",
      "Paragraph three.",
      "",
      "Paragraph four.",
    ]);
    return { glob: join(root, "*.md"), longer };
  }

  function lastLine(text: string): string {
    const lines = text.split("\n").filter((line) => line.trim() !== "");
    return lines[lines.length - 1] ?? "";
  }

  it("ends with `next: nullius audit <largest> --propose` and exits 0", () => {
    const { glob, longer } = funnelDocs();
    const result = run("check", glob);

    expect(result.code).toBe(0);
    expect(lastLine(result.stdout)).toBe(`next: nullius audit ${longer} --propose`);
    expect(result.stdout).not.toContain(OLD_CLOSING);
  });

  it("still prints the next line under --require-markers, and still exits 1", () => {
    const { glob, longer } = funnelDocs();
    const result = run("check", glob, "--require-markers");

    expect(result.code).toBe(1);
    expect(result.stdout).toContain(`next: nullius audit ${longer} --propose`);
    expect(result.stdout).not.toContain(OLD_CLOSING);
    expect(result.stderr).toContain("carry no grounding markers");
  });

  it("carries the same string as summary.next under --format json", () => {
    const { glob, longer } = funnelDocs();
    const human = run("check", glob);
    const json = run("check", glob, "--format", "json");

    expect(json.code).toBe(human.code);
    const report = JSON.parse(json.stdout) as { summary: { next: string | null } };
    expect(report.summary.next).toBe(`nullius audit ${longer} --propose`);
    expect(lastLine(human.stdout)).toBe(`next: ${report.summary.next}`);
  });

  it("does not fire when any matched document carries a marker", () => {
    const result = run("check", "README.md");

    expect(result.code).toBe(0);
    expect(result.stdout).not.toContain("next: nullius audit");
    expect(result.stdout).toMatch(/All \d+ grounding marker\(s\) verified\./);
  });
});

/**
 * Decision 5's owed test: `--format json` is a second renderer over the same
 * results and the same exit code. For each case the two modes are run against
 * the same documents and the exit codes must agree; the JSON must parse and
 * its `failing` entries must sum to `summary.failures`.
 */
suite("CLI characterization — --format json parity", () => {
  interface Report {
    version: number;
    documents: { doc: string; results: { verdict: string; failing: boolean }[] }[];
    summary: { failures: number; markerFloorFailed: boolean; next: string | null };
  }

  function parity(...args: string[]): { human: Run; json: Run; report: Report } {
    const human = run("check", ...args);
    const json = run("check", ...args, "--format", "json");

    expect(json.code, "exit code parity").toBe(human.code);
    expect(human.stdout.startsWith("{"), "human stdout is not JSON").toBe(false);
    const report = JSON.parse(json.stdout) as Report;
    expect(report.version).toBe(1);
    const failing = report.documents.flatMap((entry) => entry.results).filter((entry) => entry.failing);
    expect(report.summary.failures).toBe(failing.length);
    return { human, json, report };
  }

  const readmeFirstLine = readFileSync(join(REPO_ROOT, "README.md"), "utf8").split("\n")[0] ?? "";

  it("agrees on a passing document", () => {
    const root = scratch("nullius-parity-ok-");
    const doc = writeDoc(root, "ok.md", [
      "# Grounded",
      "",
      `**Evidence:** \`README.md:1\` — \`${readmeFirstLine}\``,
    ]);
    const { human, report } = parity(doc);

    expect(human.code).toBe(0);
    expect(report.summary.failures).toBe(0);
    expect(report.documents[0]?.results[0]?.verdict).toBe("ok");
  });

  it("agrees on a failing document, and names the fabricated claim", () => {
    const root = scratch("nullius-parity-fab-");
    const doc = writeDoc(root, "fabricated.md", [
      "# Invented",
      "",
      "**Evidence:** `README.md:1` — `this sentence was never written into the readme`",
    ]);
    const { human, report } = parity(doc);

    expect(human.code).toBe(1);
    expect(report.summary.failures).toBe(1);
    expect(report.documents[0]?.results[0]).toMatchObject({ verdict: "fabricated", failing: true });
  });

  it("agrees on an unanchored document under --require-markers", () => {
    const root = scratch("nullius-parity-floor-");
    const doc = writeDoc(root, "bare.md", ["# Bare", "", "Nothing cited."]);
    const { human, report } = parity(doc, "--require-markers");

    expect(human.code).toBe(1);
    expect(report.summary.failures).toBe(0);
    expect(report.summary.markerFloorFailed).toBe(true);
  });

  it("agrees on this change's own folder", () => {
    const { human, report } = parity("openspec/changes/add-authoring-ergonomics/*.md");

    expect(report.documents.length).toBeGreaterThan(0);
    expect(human.code).toBe(report.summary.failures > 0 || report.summary.markerFloorFailed ? 1 : 0);
  });
});

suite("CLI characterization — --format json on a no-match run", () => {
  it("still writes one JSON document, with the diagnostic, and exits 0", () => {
    const result = run("check", "no/such/dir/**/*.md", "--format", "json");
    expect(result.code).toBe(0);
    const report = JSON.parse(result.stdout) as {
      version: number;
      documents: unknown[];
      summary: { documents: number };
      diagnostics: string[];
    };
    expect(report.version).toBe(1);
    expect(report.documents).toEqual([]);
    expect(report.summary.documents).toBe(0);
    expect(report.diagnostics[0]).toMatch(/^no files matched/);
    expect(result.stderr).toContain("no files matched");
  });

  it("keeps exit 1 under --require-markers and the same JSON shape", () => {
    const result = run("check", "no/such/dir/**/*.md", "--format", "json", "--require-markers");
    expect(result.code).toBe(1);
    const report = JSON.parse(result.stdout) as {
      documents: unknown[];
      summary: { markerFloorFailed: boolean; failures: number };
      diagnostics: string[];
    };
    expect(report.documents).toEqual([]);
    expect(report.summary.markerFloorFailed).toBe(true);
    expect(report.summary.failures).toBe(0);
    expect(report.diagnostics[0]).toMatch(/^no files matched/);
  });

  it("human mode on a no-match run still writes nothing to stdout", () => {
    const result = run("check", "no/such/dir/**/*.md");
    expect(result.code).toBe(0);
    expect(result.stdout).toBe("");
  });
});

describe("witness survey — post-review fixes", () => {
  const FIXTURE = "spec/fixtures/valid-run.jsonl";

  it("counts one file once when reached by two spellings", () => {
    // The same journal as an absolute path and a relative one. Deduping on the
    // raw glob output counted it twice, which inflated every total INCLUDING
    // the journal count printed beside them — so the number a reader would use
    // to sanity-check the totals was wrong in the same direction as the totals.
    const both = run("witness", "survey", resolve(REPO_ROOT, FIXTURE), FIXTURE);
    const one = run("witness", "survey", FIXTURE);

    expect(both.output).toContain("1 journal(s) surveyed");
    expect(both.code).toBe(one.code);
    // Not just the count: the whole aggregate block must match the single-path
    // run, or a future dedupe could fix the denominator and leave the sums.
    const totals = (r: { output: string }) =>
      r.output.split("\n").filter((line) => line.includes("record(s) read across"));
    expect(totals(both)).toEqual(totals(one));
  });

  it("refuses a glob that matched a directory with exit 2, not a crash", () => {
    // Reading a directory throws EISDIR, which exited 1 — the same code a
    // genuinely failing journal returns. A mistyped glob was indistinguishable
    // from a finding, and the operator saw a Node stack trace either way.
    const result = run("witness", "survey", "spec/fixtures");

    expect(result.code).toBe(2);
    expect(result.stderr).toContain("not a readable file");
    expect(result.output).not.toContain("EISDIR");
    expect(result.output).not.toMatch(/at .*\.js:\d+/);
  });
});
