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

export type Command =
  | { kind: "help"; requested: boolean }
  | { kind: "version" }
  | { kind: "demo" }
  | CheckArgs
  | AuditArgs
  | WitnessArgs;

/** Which command owns which flag, so a misplaced one can name its home. */
const FLAG_OWNERS: ReadonlyMap<string, string> = new Map([
  ["--require-markers", "check"],
  ["--emit-brief", "audit"],
  ["--extract", "audit"],
  ["--propose", "audit"],
]);

const COMMANDS: ReadonlySet<string> = new Set([
  "check",
  "audit",
  "witness",
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
  const owner = FLAG_OWNERS.get(flag);
  if (owner !== undefined && owner !== command) {
    throw new CliError(
      `${flag} is an option of \`${owner}\`, not \`${command}\` — it was previously accepted here and silently ignored`,
    );
  }
  throw new CliError(`unknown option for \`${command}\`: ${flag}`);
}

export function parseCli(argv: readonly string[]): Command {
  const [first, ...rest] = argv;

  if (first === undefined) return { kind: "help", requested: false };
  if (first === "--version") return { kind: "version" };
  if (first === "--help" || first === "-h") return { kind: "help", requested: true };

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
  return parseAudit(rest, first === "eager-prompt");
}

function parseCheck(argv: readonly string[]): CheckArgs {
  const args: CheckArgs = {
    kind: "check",
    globs: [],
    configPath: undefined,
    requireMarkers: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) continue;
    if (arg === "--require-markers") {
      args.requireMarkers = true;
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

function parseAudit(argv: readonly string[], viaAlias: boolean): AuditArgs {
  const args: AuditArgs = {
    kind: "audit",
    docs: [],
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
function parseWitness(argv: readonly string[]): WitnessArgs {
  for (const arg of argv) {
    if (arg.startsWith("-")) rejectMisplaced(arg, "witness");
  }
  return { kind: "witness", operands: [...argv] };
}
