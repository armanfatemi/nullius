import { describe, expect, it } from "vitest";

import { isSafeRepoPath } from "./pathSafety";

describe("isSafeRepoPath", () => {
  it.each([
    "services/settings/src/interfaces/graphql/schema.graphqls",
    "k8s/base/settings/deployment.yaml",
    "packages/claims/src/index.ts",
    "README.md",
    "libs/a..b/file.ts",
  ])("allows the repo-relative path %s", (path) => {
    expect(isSafeRepoPath(path)).toEqual({ safe: true });
  });

  it.each([
    ["posix absolute", "/etc/passwd"],
    ["windows absolute", "C:\\Windows\\System32\\config\\SAM"],
    ["home relative", "~/.ssh/id_rsa"],
    ["traversal", "../../../etc/passwd"],
    ["traversal mid-path", "services/../../secrets/key.pem"],
    ["windows traversal", "..\\..\\secrets"],
  ])("rejects %s", (_label, path) => {
    expect(isSafeRepoPath(path).safe).toBe(false);
  });

  it("rejects an empty path", () => {
    expect(isSafeRepoPath("   ")).toEqual({
      safe: false,
      reason: "path is empty",
    });
  });

  it("rejects a null byte", () => {
    expect(isSafeRepoPath("services/x.ts\0.png").safe).toBe(false);
  });

  it("allows a filename that merely starts with dots", () => {
    // `..` is only unsafe as a whole segment — `.github` and `..hidden` are fine.
    expect(isSafeRepoPath(".github/workflows/x.yml")).toEqual({ safe: true });
    expect(isSafeRepoPath("docs/..hidden.md")).toEqual({ safe: true });
  });
});
