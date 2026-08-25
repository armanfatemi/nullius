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

export interface CheckArgs {
  kind: "check";
  globs: string[];
  configPath: string | undefined;
  requireMarkers: boolean;
  /**
   * Suppress the CANARY-PRESENT merge guard. Set only by the probe run that
   * deliberately checks a document with a planted canary in it; every other
   * run wants the guard, which is why the default is off.
   */
  probing: boolean;
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

export type Command =
  | { kind: "help"; requested: boolean }
  | { kind: "version" }
  | { kind: "demo" }
  | CheckArgs
  | AuditArgs
  | WitnessArgs
  | WiringArgs
  | CanaryArgs;

/** Which command owns which flag, so a misplaced one can name its home. */
const FLAG_OWNERS: ReadonlyMap<string, string> = new Map([
  ["--require-markers", "check"],
  ["--probing", "check"],
  ["--emit-brief", "audit"],
  ["--extract", "audit"],
  ["--propose", "audit"],
]);

const COMMANDS: ReadonlySet<string> = new Set([
  "check",
  "audit",
  "witness",
  "wiring",
  "canary",
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
 * text lists both under "check options:" — so scoping them to argv[0] made the
 * CLI reject a flag its own help advertises.
 */
const GLOBAL_FLAGS: ReadonlySet<string> = new Set(["--help", "-h", "--version"]);

function globalFlag(argv: readonly string[]): Command | null {
  if (argv.some((arg) => arg === "--version")) return { kind: "version" };
  if (argv.some((arg) => arg === "--help" || arg === "-h")) {
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
  if (first === "canary") return parseCanary(rest);
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
    probing: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) continue;
    if (arg === "--require-markers") {
      args.requireMarkers = true;
    } else if (arg === "--probing") {
      args.probing = true;
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
 * `witness` takes a subcommand and an operand and no flags at all. Its arity
 * is checked by the runner, which already owns the usage string.
 */
function parseWitness(rawArgv: readonly string[]): WitnessArgs {
  const { flags: argv, literal } = splitOperands(rawArgv);
  for (const arg of argv) {
    if (arg.startsWith("-")) rejectMisplaced(arg, "witness");
  }
  return { kind: "witness", operands: [...argv, ...literal] };
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
