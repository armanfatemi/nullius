/**
 * Checks the declared flag-arity tables against the binaries actually
 * installed on this machine.
 *
 * This exists because of a specific defect: `--color` was declared as taking a
 * separate value. GNU grep's `--color[=WHEN]` takes an OPTIONAL one, so getopt
 * only accepts the `=` form and grep never consumes the following word — but
 * the validator did, which swallowed the next operand past the path guard while
 * grep read it as a file. That reopened the file-probe oracle in full, and it
 * was found by a human reading `grep --help`, which is not a control that
 * survives the next contributor adding a flag.
 *
 * The oracle: run the binary with the flag and nothing else. A flag that takes
 * a required value makes it complain about a missing argument; anything else
 * (including an optional-value flag) produces an ordinary usage error.
 *
 * These tables model GNU grep and ripgrep. On a machine whose `grep` is BSD or
 * busybox the model may legitimately differ, so a divergence here is a signal
 * to check the table against that binary, not proof the table is wrong.
 */

import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

import {
  DENIED_FLAG_TABLES,
  FLAG_ARITY_TABLES,
  type SearchBinary,
} from "./commandSafety";

const MISSING_VALUE =
  /requires an argument|missing value for flag|missing argument for option|requires a value|value is required/i;

function binaryAvailable(binary: string): boolean {
  const probe = spawnSync(binary, ["--version"], { encoding: "utf8", timeout: 5_000 });
  return !probe.error && (probe.status ?? 1) === 0;
}

/** Whether the binary itself insists this flag is followed by a value. */
function requiresValue(binary: string, flag: string): boolean {
  const result = spawnSync(binary, [flag], {
    encoding: "utf8",
    input: "",
    timeout: 10_000,
  });
  return MISSING_VALUE.test(`${result.stderr ?? ""}${result.stdout ?? ""}`);
}

const BINARIES: SearchBinary[] = ["grep", "rg"];

for (const binary of BINARIES) {
  const available = binaryAvailable(binary);

  describe.skipIf(!available)(`${binary} flag arity matches the installed binary`, () => {
    const tables = FLAG_ARITY_TABLES[binary];

    const cases: { flag: string; declared: string }[] = [
      ...[...tables.short].map(([letter, arity]) => ({
        flag: `-${letter}`,
        declared: arity as string,
      })),
      ...[...tables.long].map(([name, arity]) => ({
        flag: `--${name}`,
        declared: arity as string,
      })),
    ];

    it.each(cases)("$flag is declared $declared", ({ flag, declared }) => {
      const actual = requiresValue(binary, flag) ? "value" : "none";
      expect(
        actual,
        `${binary} ${flag}: table says '${declared}', the binary behaves as '${actual}'. ` +
          `Declaring a value the binary does not consume hands the following word ` +
          `past the path guard.`,
      ).toBe(declared);
    });
  });

  describe.skipIf(!available)(`${binary} denied flags are unreachable`, () => {
    it("no denied flag appears in the allowlists", () => {
      const tables = FLAG_ARITY_TABLES[binary];
      for (const flag of DENIED_FLAG_TABLES[binary].keys()) {
        expect(tables.short.has(flag), `-${flag} is both denied and allowlisted`).toBe(false);
        expect(tables.long.has(flag), `--${flag} is both denied and allowlisted`).toBe(false);
      }
    });
  });
}
