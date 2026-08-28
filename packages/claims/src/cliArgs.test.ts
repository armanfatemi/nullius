import { describe, expect, it } from "vitest";

import { CliError, parseCli } from "./cliArgs";

/**
 * Unit coverage for the parser itself. The subprocess characterization suite
 * proves the CLI's observable contract; these cover the option-consumption
 * edges that are tedious to reach through a process boundary, and run in
 * microseconds rather than tens of milliseconds each.
 */

function parse(...argv: string[]) {
  return parseCli(argv);
}

describe("parseCli — top level", () => {
  it("treats no arguments as unrequested help", () => {
    expect(parse()).toEqual({ kind: "help", requested: false });
  });

  it("distinguishes requested help, which is a different exit code", () => {
    expect(parse("--help")).toEqual({ kind: "help", requested: true });
    expect(parse("-h")).toEqual({ kind: "help", requested: true });
  });

  it("reads --version", () => {
    expect(parse("--version")).toEqual({ kind: "version" });
  });

  it("rejects an unknown command", () => {
    expect(() => parse("frobnicate")).toThrow(/unknown command: frobnicate/);
  });

  it("rejects arguments to demo rather than ignoring them", () => {
    expect(() => parse("demo", "extra")).toThrow(/takes no arguments/);
  });
});

describe("parseCli — per-command help", () => {
  it("names the command when --help follows a command word", () => {
    expect(parse("check", "--help")).toEqual({ kind: "help", requested: true, command: "check" });
    expect(parse("witness", "--help")).toEqual({ kind: "help", requested: true, command: "witness" });
    expect(parse("canary", "-h")).toEqual({ kind: "help", requested: true, command: "canary" });
  });

  it("still answers when the rest of the line is nonsense", () => {
    expect(parse("check", "--bogus", "--help")).toEqual({
      kind: "help",
      requested: true,
      command: "check",
    });
  });

  it("maps the deprecated alias onto the command it aliases", () => {
    expect(parse("eager-prompt", "--help")).toEqual({ kind: "help", requested: true, command: "audit" });
  });

  it("leaves the overview shape alone when no command word leads", () => {
    expect(parse("--help")).toEqual({ kind: "help", requested: true });
    expect(parse("--help", "check")).toEqual({ kind: "help", requested: true });
    expect(parse("--help")).not.toHaveProperty("command");
  });

  it("lets --version win over a command-scoped --help", () => {
    expect(parse("check", "--help", "--version")).toEqual({ kind: "version" });
  });
});

describe("parseCli — flags belong to commands", () => {
  it("points a misplaced flag at its owning command", () => {
    expect(() => parse("check", "doc.md", "--extract")).toThrow(
      /--extract is an option of `audit`, not `check`/,
    );
    expect(() => parse("audit", "doc.md", "--require-markers")).toThrow(
      /--require-markers is an option of `check`, not `audit`/,
    );
  });

  it("says the command comes first when a known flag leads", () => {
    expect(() => parse("--require-markers", "check")).toThrow(/the command comes first/);
  });

  it("does not pretend an unrecognised leading option is a command", () => {
    expect(() => parse("--nonsense")).toThrow(/expected a command/);
  });

  it("throws CliError, so the caller can attach usage to parse failures only", () => {
    expect(() => parse("check", "--bogus")).toThrow(CliError);
  });
});

describe("parseCli — check", () => {
  it("collects globs in order", () => {
    const args = parse("check", "a.md", "b.md");

    expect(args).toMatchObject({ kind: "check", globs: ["a.md", "b.md"] });
  });

  it("consumes the value after --config", () => {
    expect(parse("check", "--config", "custom.json", "a.md")).toMatchObject({
      configPath: "custom.json",
      globs: ["a.md"],
    });
  });

  it("refuses --config with nothing after it", () => {
    expect(() => parse("check", "--config")).toThrow(/--config requires a path argument/);
  });

  it("does not mistake a following flag for the config path", () => {
    // The value is consumed positionally, so this records that `--config
    // --require-markers` takes the flag as a path rather than silently
    // enabling it — wrong-looking input, but never a silently dropped gate.
    expect(parse("check", "--config", "--require-markers")).toMatchObject({
      configPath: "--require-markers",
      requireMarkers: false,
    });
  });
});

describe("parseCli — audit", () => {
  it("collects documents so the runner can enforce arity", () => {
    expect(parse("audit", "a.md", "b.md")).toMatchObject({ docs: ["a.md", "b.md"] });
  });

  it("reads the claim id after --emit-brief", () => {
    expect(parse("audit", "a.md", "--emit-brief", "c3")).toMatchObject({ emitBrief: "c3" });
  });

  it("refuses --emit-brief with nothing after it", () => {
    expect(() => parse("audit", "a.md", "--emit-brief")).toThrow(/requires a claim id/);
  });

  it("makes eager-prompt an alias that implies --propose", () => {
    expect(parse("eager-prompt", "a.md")).toMatchObject({
      kind: "audit",
      propose: true,
      viaAlias: true,
    });
  });

  it("leaves plain audit un-proposing, which is the whole point of the rename", () => {
    expect(parse("audit", "a.md")).toMatchObject({ propose: false, viaAlias: false });
  });

  it("names the alias, not audit, when a flag is misplaced on it", () => {
    expect(() => parse("eager-prompt", "a.md", "--require-markers")).toThrow(/not `eager-prompt`/);
  });
});

describe("parseCli — witness", () => {
  it("passes operands through for the runner to validate", () => {
    expect(parse("witness", "validate", "run.jsonl")).toMatchObject({
      kind: "witness",
      operands: ["validate", "run.jsonl"],
      expectRules: undefined,
    });
  });

  it("rejects a flag that is not --expect-rules", () => {
    expect(() => parse("witness", "validate", "run.jsonl", "--config", "x")).toThrow(
      /unknown option for `witness`/,
    );
  });

  it("still rejects a flag belonging to another command by naming its owner", () => {
    expect(() => parse("witness", "validate", "run.jsonl", "--require-markers")).toThrow(
      /--require-markers is an option of `check`, not `witness`/,
    );
  });

  it("parses --expect-rules with one rule id", () => {
    expect(parse("witness", "validate", "run.jsonl", "--expect-rules", "build-before-cli")).toMatchObject({
      kind: "witness",
      operands: ["validate", "run.jsonl"],
      expectRules: ["build-before-cli"],
    });
  });

  it("parses --expect-rules with several rule ids, greedily consumed", () => {
    expect(
      parse(
        "witness",
        "validate",
        "run.jsonl",
        "--expect-rules",
        "build-before-cli",
        "merge-never-squash",
        "openspec-shall-first-line",
      ),
    ).toMatchObject({
      kind: "witness",
      operands: ["validate", "run.jsonl"],
      expectRules: ["build-before-cli", "merge-never-squash", "openspec-shall-first-line"],
    });
  });

  it("greedily swallows a positional operand placed after --expect-rules — the flag comes last", () => {
    // Documented, not accidental: --expect-rules is variadic and greedy, the
    // same as `rules select --paths`, so it must be the LAST thing on the
    // line (`witness validate <journal> --expect-rules <id...>`). Putting it
    // before the operands would swallow them as rule ids instead — this pins
    // that known ordering constraint rather than leaving it undiscovered.
    expect(
      parse("witness", "--expect-rules", "build-before-cli", "validate", "run.jsonl"),
    ).toMatchObject({
      kind: "witness",
      operands: [],
      expectRules: ["build-before-cli", "validate", "run.jsonl"],
    });
  });

  it("rejects --expect-rules with no value", () => {
    expect(() => parse("witness", "validate", "run.jsonl", "--expect-rules")).toThrow(
      /--expect-rules requires at least one rule id argument/,
    );
  });

  it("rejects --expect-rules immediately followed by another flag", () => {
    expect(() =>
      parse("witness", "validate", "run.jsonl", "--expect-rules", "--config", "x"),
    ).toThrow(/--expect-rules requires at least one rule id argument/);
  });

  it("a misplaced --expect-rules on another command names witness as its owner", () => {
    expect(() => parse("check", "doc.md", "--expect-rules", "x")).toThrow(
      /--expect-rules is an option of `witness`, not `check`/,
    );
  });
});

describe("wiring", () => {
  it("defaults the root to the working directory", () => {
    expect(parseCli(["wiring"])).toEqual({ kind: "wiring", root: "." });
  });

  it("accepts one root operand", () => {
    expect(parseCli(["wiring", "spec/fixtures/wiring-valid"])).toEqual({
      kind: "wiring",
      root: "spec/fixtures/wiring-valid",
    });
  });

  it("rejects a flag belonging to another command by naming its owner", () => {
    expect(() => parseCli(["wiring", "--require-markers"])).toThrow(/option of `check`/);
  });
});

describe("rules", () => {
  it("parses `select --paths` with one path", () => {
    expect(parseCli(["rules", "select", "--paths", "src/graphql/schema.ts"])).toEqual({
      kind: "rules",
      sub: "select",
      root: ".",
      paths: ["src/graphql/schema.ts"],
    });
  });

  it("parses `select --paths` with several paths, greedily consumed", () => {
    expect(
      parseCli(["rules", "select", "--paths", "a.ts", "b.ts", "c.ts"]),
    ).toEqual({
      kind: "rules",
      sub: "select",
      root: ".",
      paths: ["a.ts", "b.ts", "c.ts"],
    });
  });

  it("rejects `select` with no --paths", () => {
    expect(() => parseCli(["rules", "select"])).toThrow(/requires --paths/);
  });

  it("rejects `select --paths` with no value", () => {
    expect(() => parseCli(["rules", "select", "--paths"])).toThrow(
      /--paths requires at least one path argument/,
    );
  });

  it("defaults `check`'s root to the working directory", () => {
    expect(parseCli(["rules", "check"])).toEqual({
      kind: "rules",
      sub: "check",
      root: ".",
      paths: [],
    });
  });

  it("accepts one root operand for `check`", () => {
    expect(parseCli(["rules", "check", "spec/fixtures/rules-valid"])).toEqual({
      kind: "rules",
      sub: "check",
      root: "spec/fixtures/rules-valid",
      paths: [],
    });
  });

  it("rejects `check` with --paths", () => {
    expect(() => parseCli(["rules", "check", "--paths", "a.ts"])).toThrow(
      /does not take --paths/,
    );
  });

  it("rejects an unknown subcommand", () => {
    expect(() => parseCli(["rules", "bogus"])).toThrow(/usage: nullius rules/);
  });

  it("rejects a flag belonging to another command by naming its owner", () => {
    expect(() => parseCli(["check", "--paths", "a.ts"])).toThrow(/option of `rules`/);
  });
});
