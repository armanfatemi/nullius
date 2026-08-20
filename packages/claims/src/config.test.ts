import { describe, expect, it } from "vitest";

import {
  CONFIG_PATH,
  LEGACY_CONFIG_PATH,
  parseConfig,
  resolveConfigPath,
} from "./config";

describe("parseConfig", () => {
  it("accepts a full valid config", () => {
    expect(
      parseConfig(
        {
          docs: ["docs/rfcs/**/*.md"],
          exclude: ["review-evidence.md"],
          driftWindow: 5,
          moments: ["app-store-review", "client-version-skew"],
          ciCaughtMoments: [],
        },
        "fiducial.config.json",
      ),
    ).toEqual({
      docs: ["docs/rfcs/**/*.md"],
      exclude: ["review-evidence.md"],
      driftWindow: 5,
      moments: ["app-store-review", "client-version-skew"],
      ciCaughtMoments: [],
    });
  });

  it("accepts an empty object", () => {
    expect(parseConfig({}, "fiducial.config.json")).toEqual({});
  });

  it("rejects a non-object", () => {
    expect(() => parseConfig([], "x.json")).toThrow("must be a JSON object");
    expect(() => parseConfig("docs/**", "x.json")).toThrow(
      "must be a JSON object",
    );
  });

  it("rejects an unknown key, naming the allowed ones", () => {
    // A typo'd key silently checking less than configured is the quiet failure
    // this validation exists to prevent.
    expect(() => parseConfig({ momments: [] }, "x.json")).toThrow(
      /unknown key 'momments'.*moments/,
    );
  });

  it("rejects a non-string-array docs value", () => {
    expect(() => parseConfig({ docs: "docs/**/*.md" }, "x.json")).toThrow(
      "'docs' must be an array of strings",
    );
    expect(() => parseConfig({ docs: [1] }, "x.json")).toThrow(
      "'docs' must be an array of strings",
    );
  });

  it("rejects a non-integer drift window", () => {
    expect(() => parseConfig({ driftWindow: 2.5 }, "x.json")).toThrow(
      "'driftWindow' must be a non-negative integer",
    );
    expect(() => parseConfig({ driftWindow: -1 }, "x.json")).toThrow(
      "'driftWindow' must be a non-negative integer",
    );
  });

  it("accepts a zero drift window", () => {
    expect(parseConfig({ driftWindow: 0 }, "x.json")).toEqual({
      driftWindow: 0,
    });
  });
});

describe("parseConfig — checker tuning keys", () => {
  it("accepts the anchor and search tuning keys", () => {
    expect(
      parseConfig(
        { minAnchorChars: 12, relaxedControl: false, searchTimeoutMs: 5000 },
        "c.json",
      ),
    ).toEqual({ minAnchorChars: 12, relaxedControl: false, searchTimeoutMs: 5000 });
  });

  it.each([
    ["minAnchorChars", { minAnchorChars: -1 }],
    ["minAnchorChars", { minAnchorChars: 1.5 }],
    ["searchTimeoutMs", { searchTimeoutMs: "10s" }],
  ])("rejects a bad %s", (_key, json) => {
    expect(() => parseConfig(json, "c.json")).toThrow();
  });

  it("rejects a non-boolean relaxedControl", () => {
    expect(() => parseConfig({ relaxedControl: "yes" }, "c.json")).toThrow(
      /must be a boolean/,
    );
  });
});

describe("resolveConfigPath", () => {
  const onDisk = (...paths: string[]) => (path: string) => paths.includes(path);

  it("prefers the current filename when both are present", () => {
    expect(resolveConfigPath(undefined, onDisk(CONFIG_PATH, LEGACY_CONFIG_PATH))).toBe(
      CONFIG_PATH,
    );
  });

  it("falls back to the pre-rename filename when only it is present", () => {
    // A repo configured before the rename keeps being checked as configured.
    // Silently reverting to defaults would check LESS than the author asked
    // for, which is the failure this tool exists to make loud.
    expect(resolveConfigPath(undefined, onDisk(LEGACY_CONFIG_PATH))).toBe(
      LEGACY_CONFIG_PATH,
    );
  });

  it("returns undefined when neither is present", () => {
    expect(resolveConfigPath(undefined, onDisk())).toBeUndefined();
  });

  it("never substitutes a fallback for an explicitly requested path", () => {
    // Asking for a config that is not there is an error. Quietly reading a
    // different file would hand the author a run they did not configure.
    expect(() => resolveConfigPath("custom.json", onDisk(LEGACY_CONFIG_PATH))).toThrow(
      "config file not found: custom.json",
    );
  });

  it("uses an explicit path that does exist", () => {
    expect(resolveConfigPath("custom.json", onDisk("custom.json"))).toBe("custom.json");
  });
});
