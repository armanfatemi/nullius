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
    });
  });

  it("accepts no flags at all", () => {
    expect(() => parse("witness", "validate", "run.jsonl", "--config", "x")).toThrow(
      /unknown option for `witness`/,
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
