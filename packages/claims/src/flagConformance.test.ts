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
  isSafeSearchCommand,
  type SearchBinary,
} from "./commandSafety";

const MISSING_VALUE =
  /requires an argument|missing value for flag|missing argument for option|requires a value|value is required/i;

/** The binary telling us the flag is not one of its own. */
const UNRECOGNISED =
  /unrecognized flag|unrecognized option|unrecognised option|invalid option|unexpected argument|unknown flag|found argument/i;

/**
 * Skipping is the wrong default in CI. `ubuntu-latest` does not ship ripgrep,
 * so a plain `skipIf` silently drops every rg assertion — including the ones
 * that caught a real arity defect — and the run still goes green. In CI a
 * missing binary is a setup failure to fix, not a reason to check less.
 */
const IN_CI = process.env['CI'] === 'true' || process.env['CI'] === '1';

function binaryAvailable(binary: string): boolean {
  const probe = spawnSync(binary, ["--version"], { encoding: "utf8", timeout: 5_000 });
  return !probe.error && (probe.status ?? 1) === 0;
}

/** The binary's own complaint about being given the flag and nothing else. */
function complaint(binary: string, flag: string): string {
  const result = spawnSync(binary, [flag], {
    encoding: "utf8",
    input: "",
    timeout: 10_000,
  });
  return `${result.stderr ?? ""}${result.stdout ?? ""}`;
}

/** Whether the binary itself insists this flag is followed by a value. */
function requiresValue(binary: string, flag: string): boolean {
  return MISSING_VALUE.test(complaint(binary, flag));
}

const BINARIES: SearchBinary[] = ["grep", "rg"];

for (const binary of BINARIES) {
  const available = binaryAvailable(binary);

  describe(`${binary} is available to check against`, () => {
    it.skipIf(!IN_CI)("is installed in CI", () => {
      expect(
        available,
        `${binary} is missing. In CI this must be installed rather than skipped: ` +
          `skipping drops every ${binary} arity assertion and the run still goes green.`,
      ).toBe(true);
    });
  });

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
      // An unrecognised flag also produces "no value required", so without this
      // the table could accumulate flags the binary does not even have.
      expect(
        UNRECOGNISED.test(complaint(binary, flag)),
        `${binary} does not recognise ${flag} — it should not be on the allowlist`,
      ).toBe(false);

      const actual = requiresValue(binary, flag) ? "value" : "none";
      expect(
        actual,
        `${binary} ${flag}: table says '${declared}', the binary behaves as '${actual}'. ` +
          `Declaring a value the binary does not consume hands the following word ` +
          `past the path guard.`,
      ).toBe(declared);
    });
  });

  // No binary needed, so this must NOT be gated on one: it is the guard that a
  // contributor cannot quietly re-allowlist `--pre`, and it would be a poor
  // guard that disappears on machines without ripgrep installed.
  describe(`${binary} denied flags are unreachable`, () => {
    it("refuses every denied flag in an actual command", () => {
      for (const flag of DENIED_FLAG_TABLES[binary].keys()) {
        const spelling = flag.length === 1 ? `-${flag}` : `--${flag}`;
        const verdict = isSafeSearchCommand(`${binary} ${spelling} needle src/`);
        expect(verdict.safe, `${binary} ${spelling} was accepted`).toBe(false);
      }
    });

    it("keeps the tables disjoint", () => {
      const tables = FLAG_ARITY_TABLES[binary];
      for (const flag of DENIED_FLAG_TABLES[binary].keys()) {
        expect(
          tables.short.has(flag) || tables.long.has(flag),
          `${flag} is both denied and allowlisted for ${binary}`,
        ).toBe(false);
      }
    });
  });
}
