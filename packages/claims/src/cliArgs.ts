/**
 * Per-command argument parsing.
 *
 * The predecessor was one parser over a shared flag namespace: every flag was
 * legal after every verb, and a flag belonging to another command was accepted
 * and silently ignored. `nullius audit doc --require-markers` exited 0 having
 * gated nothing, which is the worst shape a CLI failure can take — the user
 * believes a check ran.
 *
 * So flags belong to commands here, and a flag offered to the wrong one is an
 * error that names its real owner. Hand-rolled on purpose: a dependency for
 * this is a supply-chain surface on a tool whose whole claim is that its
 * verification path is small enough to read.
 *
 * This module is pure — no I/O, no process.exit — because `cli.ts` ends in
 * `process.exit(main())` and therefore cannot be imported by a test.
 */

export type CheckFormat = "human" | "json";

const CHECK_FORMATS: ReadonlySet<string> = new Set<CheckFormat>(["human", "json"]);

function isCheckFormat(value: string): value is CheckFormat {
  return CHECK_FORMATS.has(value);
}

export interface CheckArgs {
  kind: "check";
  globs: string[];
  configPath: string | undefined;
  requireMarkers: boolean;
  /**
   * Which renderer reads the collected results. `json` puts exactly one
   * version-tagged document on stdout and nothing else; stderr diagnostics
   * and the exit code are the same as `human`.
   */
  format: CheckFormat;
  /**
   * Suppress the CANARY-PRESENT merge guard. Set only by the probe run that
   * deliberately checks a document with a planted canary in it; every other
   * run wants the guard, which is why the default is off.
   */
  probing: boolean;
  /**
   * Repoint `drift` / `wrong-line` anchors that carry no `@rev` to the line
   * their quote uniquely matches. Never touches a stamped anchor.
   */
  fix: boolean;
  /**
   * Add `@<head>` to unstamped anchors that verify at HEAD as well as in the
   * working tree. Exits 2 when HEAD cannot be resolved.
   */
  stamp: boolean;
}

export interface AuditArgs {
  kind: "audit";
  docs: string[];
  configPath: string | undefined;
  emitBrief: string | undefined;
  extract: boolean;
  propose: boolean;
  /** True when invoked as `eager-prompt`, which implies --propose. */
  viaAlias: boolean;
}

export interface WitnessArgs {
  kind: "witness";
  operands: string[];
  /** Rule ids `witness validate` must confirm reached a delivered verdict. */
  expectRules: string[] | undefined;
}

export interface CanaryArgs {
  kind: "canary";
  operands: string[];
}

export interface WiringArgs {
  kind: "wiring";
  /** Root to scan. Defaults to the working directory. */
  root: string;
}

export interface RulesArgs {
  kind: "rules";
  sub: "select" | "check";
  /** Root to scan. Defaults to the working directory. */
  root: string;
  /** Only meaningful for `select`: candidate paths to match applies_to against. */
  paths: string[];
  /** Only meaningful for `select`: print the starved compliance brief for one selected rule id. */
  emitBrief: string | undefined;
}

export interface OracleArgs {
  kind: "oracle";
  /** The commit range, as typed. `base == head` is legal — see parseRange. */
  range: string;
  /** Journal to read justifications from. Absent means none is read. */
  journal: string | undefined;
  /** Config path. Needed so CI can point the verb at a fixture config. */
  config: string | undefined;
  /** Widen what fails beyond the union's own non-passing members. */
  strict: boolean;
}

export type Command =
  /**
   * `command` is set when a command word led the line (`nullius check
   * --help`), so the CLI can print that command's block alone instead of the
   * whole overview. Absent for `nullius --help` and for bare `nullius`.
   */
  | { kind: "help"; requested: boolean; command?: string }
  | { kind: "version" }
  | { kind: "demo" }
  | CheckArgs
  | AuditArgs
  | WitnessArgs
  | WiringArgs
  | RulesArgs
  | OracleArgs
  | CanaryArgs;

/** Which command owns which flag, so a misplaced one can name its home. */
const FLAG_OWNERS: ReadonlyMap<string, string> = new Map([
  ["--require-markers", "check"],
  ["--journal", "oracle"],
  ["--strict", "oracle"],
  ["--probing", "check"],
  ["--fix", "check"],
  ["--stamp", "check"],
  ["--format", "check"],
  ["--emit-brief", "audit"],
  ["--extract", "audit"],
  ["--propose", "audit"],
  ["--paths", "rules"],
  ["--expect-rules", "witness"],
]);

const COMMANDS: ReadonlySet<string> = new Set([
  "check",
  "audit",
  "witness",
  "wiring",
  "rules",
  "canary",
  "oracle",
  "demo",
  "eager-prompt",
]);

export class CliError extends Error {}

function requireValue(
  argv: readonly string[],
  index: number,
  flag: string,
  what: string,
): string {
  const value = argv[index];
  if (value === undefined) throw new CliError(`${flag} requires ${what}`);
  return value;
}

/**
 * A flag that is real, but not on this command. Worth its own sentence: the
 * old parser's silence here is the defect this refactor exists to remove, and
 * "unknown option" would understate it — the option is known, just not here.
 */
function rejectMisplaced(flag: string, command: string): never {
  // Unreachable for global flags — parseCli intercepts them first — but the
  // guard keeps that true if the interception ever moves.
  if (GLOBAL_FLAGS.has(flag)) {
    throw new CliError(`${flag} is handled before command parsing; this is a bug in the kit`);
  }
  const owner = FLAG_OWNERS.get(flag);
  if (owner !== undefined && owner !== command) {
    throw new CliError(
      `${flag} is an option of \`${owner}\`, not \`${command}\` — it was previously accepted here and silently ignored`,
    );
  }
  throw new CliError(`unknown option for \`${command}\`: ${flag}`);
}

/**
 * `--help` and `--version` belong to no command and to every command.
 * `nullius check --help` is the most-typed help form there is, and the USAGE
 * text advertises both as global options — so scoping them to argv[0] made the
 * CLI reject a flag its own help advertises.
 */
const GLOBAL_FLAGS: ReadonlySet<string> = new Set(["--help", "-h", "--version"]);

function globalFlag(argv: readonly string[]): Command | null {
  if (argv.some((arg) => arg === "--version")) return { kind: "version" };
  if (argv.some((arg) => arg === "--help" || arg === "-h")) {
    // Only a LEADING command word scopes the help. `--help check` is someone
    // asking for the overview with a stray word after it, not for check's
    // block; and the alias gets the block of the command it aliases, since
    // the alias has no options of its own to document.
    const first = argv[0];
    if (first !== undefined && COMMANDS.has(first)) {
      return { kind: "help", requested: true, command: first === "eager-prompt" ? "audit" : first };
    }
    return { kind: "help", requested: true };
  }
  return null;
}

export function parseCli(argv: readonly string[]): Command {
  const [first, ...rest] = argv;

  if (first === undefined) return { kind: "help", requested: false };

  // Checked across the whole of argv, before anything else: help must work
  // even when the rest of the line is nonsense, which is usually why someone
  // is asking for it.
  const global = globalFlag(argv);
  if (global !== null) return global;

  if (first.startsWith("-")) {
    // The command used to be findable anywhere in argv, so this parsed. Say
    // what changed rather than pretending the flag is unknown.
    const owner = FLAG_OWNERS.get(first);
    throw new CliError(
      owner === undefined
        ? `expected a command, got the option ${first} — run \`nullius --help\``
        : `the command comes first: \`nullius ${owner} ${first} …\`, not \`nullius ${first} ${owner} …\``,
    );
  }

  if (!COMMANDS.has(first)) throw new CliError(`unknown command: ${first}`);
  if (first === "demo") {
    if (rest.length > 0) throw new CliError(`\`demo\` takes no arguments, got: ${rest.join(" ")}`);
    return { kind: "demo" };
  }
  if (first === "check") return parseCheck(rest);
  if (first === "witness") return parseWitness(rest);
  if (first === "wiring") return parseWiring(rest);
  if (first === "rules") return parseRules(rest);
  if (first === "canary") return parseCanary(rest);
  if (first === "oracle") return parseOracle(rest);
  return parseAudit(rest, first === "eager-prompt");
}

/**
 * Everything after a bare `--` is an operand, however it starts. Without this
 * there is no way to name a file whose name begins with a dash — the old
 * parser passed such names through by accident, and per-command parsing turned
 * that accident into a hard error with no escape hatch.
 */
function splitOperands(argv: readonly string[]): { flags: readonly string[]; literal: readonly string[] } {
  const index = argv.indexOf("--");
  if (index === -1) return { flags: argv, literal: [] };
  return { flags: argv.slice(0, index), literal: argv.slice(index + 1) };
}

function parseCheck(rawArgv: readonly string[]): CheckArgs {
  const { flags: argv, literal } = splitOperands(rawArgv);
  const args: CheckArgs = {
    kind: "check",
    globs: [...literal],
    configPath: undefined,
    requireMarkers: false,
    format: "human",
    probing: false,
    fix: false,
    stamp: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) continue;
    if (arg === "--require-markers") {
      args.requireMarkers = true;
    } else if (arg === "--probing") {
      args.probing = true;
    } else if (arg === "--fix") {
      args.fix = true;
    } else if (arg === "--stamp") {
      args.stamp = true;
    } else if (arg === "--format") {
      index += 1;
      const value = requireValue(argv, index, "--format", "a value: human or json");
      if (!isCheckFormat(value)) {
        throw new CliError(`--format must be one of human|json, got: ${value}`);
      }
      args.format = value;
    } else if (arg === "--config") {
      index += 1;
      args.configPath = requireValue(argv, index, "--config", "a path argument");
    } else if (arg.startsWith("-")) {
      rejectMisplaced(arg, "check");
    } else {
      args.globs.push(arg);
    }
  }

  return args;
}

function parseAudit(rawArgv: readonly string[], viaAlias: boolean): AuditArgs {
  const { flags: argv, literal } = splitOperands(rawArgv);
  const args: AuditArgs = {
    kind: "audit",
    docs: [...literal],
    configPath: undefined,
    emitBrief: undefined,
    extract: false,
    propose: viaAlias,
    viaAlias,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) continue;
    if (arg === "--extract") {
      args.extract = true;
    } else if (arg === "--propose") {
      args.propose = true;
    } else if (arg === "--emit-brief") {
      index += 1;
      args.emitBrief = requireValue(argv, index, "--emit-brief", "a claim id (e.g. c1)");
    } else if (arg === "--config") {
      index += 1;
      args.configPath = requireValue(argv, index, "--config", "a path argument");
    } else if (arg.startsWith("-")) {
      rejectMisplaced(arg, viaAlias ? "eager-prompt" : "audit");
    } else {
      args.docs.push(arg);
    }
  }

  return args;
}

/**
 * `witness` takes a subcommand and an operand, plus one optional variadic
 * flag: `--expect-rules <id...>`. Everything else the command needs — arity
 * of the subcommand/operand pair — is checked by the runner, which already
 * owns the usage string.
 *
 * `--expect-rules` is variadic, the same shape as `rules select`'s `--paths`
 * (see `parseRules` below): it greedily consumes every following argument up
 * to the next flag or the end of the line, rather than taking exactly one
 * value the way `--config` or `--emit-brief` do. Unlike `--paths` — which
 * `rules select` accepts as its only argument, so greediness is unambiguous
 * there — `witness validate` also takes two required positional operands.
 * That makes ordering load-bearing: `--expect-rules` must come AFTER
 * `validate <journal>` (`witness validate <journal> --expect-rules <id...>`,
 * matching the usage string). Placed before the operands, it greedily
 * swallows them as rule ids instead — a known, tested constraint, not a
 * silent footgun (see cliArgs.test.ts).
 */
function parseWitness(rawArgv: readonly string[]): WitnessArgs {
  const { flags: argv, literal } = splitOperands(rawArgv);
  const operands: string[] = [...literal];
  let expectRules: string[] | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) continue;
    if (arg === "--expect-rules") {
      const first = argv[index + 1];
      if (first === undefined || first.startsWith("-")) {
        throw new CliError("--expect-rules requires at least one rule id argument");
      }
      const values: string[] = [];
      index += 1;
      while (index < argv.length) {
        const value = argv[index];
        if (value === undefined || value.startsWith("-")) break;
        values.push(value);
        index += 1;
      }
      index -= 1; // compensate for the outer loop's own increment
      expectRules = values;
    } else if (arg.startsWith("-")) {
      rejectMisplaced(arg, "witness");
    } else {
      operands.push(arg);
    }
  }

  return { kind: "witness", operands, expectRules };
}

/**
 * `canary` takes a subcommand and its operands, and no flags. `--probing`
 * belongs to `check`: it suppresses the merge guard during a probe run, and a
 * canary subcommand has no guard to suppress.
 */
function parseCanary(rawArgv: readonly string[]): CanaryArgs {
  const { flags: argv, literal } = splitOperands(rawArgv);
  for (const arg of argv) {
    if (arg.startsWith("-")) rejectMisplaced(arg, "canary");
  }
  return { kind: "canary", operands: [...argv, ...literal] };
}

/**
 * `wiring` takes an optional root and no flags. One operand only: two roots
 * would silently scan the first and ignore the second.
 */
function parseWiring(rawArgv: readonly string[]): WiringArgs {
  const { flags: argv, literal } = splitOperands(rawArgv);
  const operands: string[] = [...literal];

  for (const arg of argv) {
    if (arg.startsWith("-")) rejectMisplaced(arg, "wiring");
    operands.push(arg);
  }

  if (operands.length > 1) {
    throw new CliError(`\`wiring\` takes at most one root, got: ${operands.join(" ")}`);
  }
  return { kind: "wiring", root: operands[0] ?? "." };
}

/**
 * `rules select --paths <path...>` and `rules check [root]`.
 *
 * `--paths` is variadic — the only variadic flag this parser has — so it
 * greedily consumes every following argument up to the next flag (or the
 * end of the line) rather than taking exactly one value the way every other
 * flag here does.
 */
function parseOracle(rawArgv: readonly string[]): OracleArgs {
  const { flags: argv, literal } = splitOperands(rawArgv);
  const operands: string[] = [...literal];
  let journal: string | undefined;
  let config: string | undefined;
  let strict = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) continue;
    if (arg === "--journal") {
      index += 1;
      journal = requireValue(argv, index, "--journal", "a path to a .jsonl journal");
    } else if (arg === "--config") {
      index += 1;
      config = requireValue(argv, index, "--config", "a path to nullius.config.json");
    } else if (arg === "--strict") {
      strict = true;
    } else if (arg.startsWith("-")) {
      throw new CliError(`unknown flag for \`oracle\`: ${arg}`);
    } else {
      operands.push(arg);
    }
  }

  const range = operands[0];
  if (range === undefined) {
    throw new CliError(
      "usage: nullius oracle <range> [--journal <path>] [--config <path>] [--strict]\n" +
        "  e.g. nullius oracle main...HEAD --journal .nullius/runs/latest.jsonl",
    );
  }
  if (operands.length > 1) {
    throw new CliError("`oracle` takes exactly one range");
  }

  return { kind: "oracle", range, journal, config, strict };
}

function parseRules(rawArgv: readonly string[]): RulesArgs {
  const [sub, ...rest] = rawArgv;
  if (sub !== "select" && sub !== "check") {
    throw new CliError("usage: nullius rules <select --paths <path...> [--emit-brief <rule-id>] | check [root]>");
  }

  const { flags: argv, literal } = splitOperands(rest);
  const paths: string[] = [];
  const operands: string[] = [...literal];
  let emitBrief: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) continue;
    if (arg === "--paths") {
      const first = argv[index + 1];
      if (first === undefined || first.startsWith("-")) {
        throw new CliError("--paths requires at least one path argument");
      }
      index += 1;
      while (index < argv.length) {
        const value = argv[index];
        if (value === undefined || value.startsWith("-")) break;
        paths.push(value);
        index += 1;
      }
      index -= 1; // compensate for the outer loop's own increment
    } else if (arg === "--emit-brief") {
      index += 1;
      emitBrief = requireValue(argv, index, "--emit-brief", "a rule id (e.g. build-before-cli)");
    } else if (arg.startsWith("-")) {
      rejectMisplaced(arg, "rules");
    } else {
      operands.push(arg);
    }
  }

  if (sub === "select") {
    if (paths.length === 0) {
      throw new CliError("`rules select` requires --paths <path...>");
    }
    if (operands.length > 0) {
      throw new CliError(
        `\`rules select\` takes no positional operands besides --paths, got: ${operands.join(" ")}`,
      );
    }
    return { kind: "rules", sub: "select", root: ".", paths, emitBrief };
  }

  if (paths.length > 0) {
    throw new CliError("`rules check` does not take --paths — that belongs to `rules select`");
  }
  if (emitBrief !== undefined) {
    throw new CliError("`rules check` does not take --emit-brief — that belongs to `rules select`");
  }
  if (operands.length > 1) {
    throw new CliError(`\`rules check\` takes at most one root, got: ${operands.join(" ")}`);
  }
  return { kind: "rules", sub: "check", root: operands[0] ?? ".", paths: [], emitBrief: undefined };
}
