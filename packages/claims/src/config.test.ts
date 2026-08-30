import { describe, expect, it } from "vitest";

import { parseConfig } from "./config";

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
        "nullius.config.json",
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
    expect(parseConfig({}, "nullius.config.json")).toEqual({});
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

/**
 * The reservation exists because unknown keys are a hard error here. A repo
 * initialised by a newer kit must not break an older kernel pinned in CI, and
 * the only way to buy that is to accept the key before anything writes it.
 */
describe("parseConfig — the configVersion reservation", () => {
  it("accepts configVersion without complaint", () => {
    expect(() => parseConfig({ configVersion: 1 }, "c.json")).not.toThrow();
  });

  it("ignores it — a reserved key is not a parsed one", () => {
    // Deliberately absent from the result. Reading it would make this build
    // depend on a schema that has not been designed yet.
    expect(parseConfig({ configVersion: 1 }, "c.json")).toEqual({});
  });

  it("does not type-check the value, so a future format cannot break this build", () => {
    // If today's kernel demanded a number and the key later became "2.0",
    // every pinned older CI would fail on a repo it should merely not
    // understand — the exact breakage the reservation is meant to prevent.
    for (const value of [1, "2.0", null, { major: 3 }, []]) {
      expect(() => parseConfig({ configVersion: value }, "c.json")).not.toThrow();
    }
  });

  it("still rejects keys that are genuinely unknown", () => {
    expect(() => parseConfig({ configversion: 1 }, "c.json")).toThrow(/unknown key 'configversion'/);
  });

  it("coexists with real settings", () => {
    expect(parseConfig({ configVersion: 1, driftWindow: 5 }, "c.json")).toEqual({
      driftWindow: 5,
    });
  });
});

describe("parseConfig — the oracles key", () => {
  it("accepts a glob-only entry", () => {
    expect(parseConfig({ oracles: [{ glob: "test/**/*.test.ts" }] }, "c.json")).toEqual({
      oracles: [{ glob: "test/**/*.test.ts" }],
    });
  });

  it("accepts weakening and skipMarker", () => {
    const config = parseConfig(
      {
        oracles: [
          { glob: "test/**/*.test.ts", weakening: "\\bexpect\\(", skipMarker: "\\.skip\\(" },
        ],
      },
      "c.json",
    );
    expect(config.oracles?.[0]?.weakening).toBe("\\bexpect\\(");
    expect(config.oracles?.[0]?.skipMarker).toBe("\\.skip\\(");
  });

  // The whole point of the key is that it reaches the command. A key that
  // validates and is then dropped is `configVersion`'s deliberate behaviour and
  // would be a defect here.
  it("survives to the parsed config rather than being silently dropped", () => {
    const config = parseConfig({ oracles: [{ glob: "a/**" }] }, "c.json");
    expect(config.oracles).toBeDefined();
    expect(config.oracles).toHaveLength(1);
  });

  it("rejects an unknown sub-key, naming it", () => {
    expect(() =>
      parseConfig({ oracles: [{ glob: "a/**", weakning: "x" }] }, "c.json"),
    ).toThrow(/unknown key 'weakning'/);
  });

  it("rejects an entry with no glob", () => {
    expect(() => parseConfig({ oracles: [{ weakening: "x" }] }, "c.json")).toThrow(
      /needs a non-empty 'glob'/,
    );
  });

  it("rejects a blank glob", () => {
    expect(() => parseConfig({ oracles: [{ glob: "   " }] }, "c.json")).toThrow(
      /needs a non-empty 'glob'/,
    );
  });

  it("rejects a non-array oracles", () => {
    expect(() => parseConfig({ oracles: { glob: "a/**" } }, "c.json")).toThrow(
      /must be an array of objects/,
    );
  });

  // An uncompilable pattern is an authoring error, and the run that finds it
  // should name the config it came from rather than failing later at match time.
  it("rejects a weakening pattern that cannot compile, naming the entry", () => {
    expect(() =>
      parseConfig({ oracles: [{ glob: "a/**", weakening: "(" }] }, "c.json"),
    ).toThrow(/oracles\[0\].*not a valid regular expression/s);
  });

  it("reports the index of the offending entry", () => {
    expect(() =>
      parseConfig({ oracles: [{ glob: "a/**" }, { glob: "b/**", nope: 1 }] }, "c.json"),
    ).toThrow(/oracles\[1\]/);
  });

  it("leaves oracles undefined when the key is absent", () => {
    expect(parseConfig({ driftWindow: 2 }, "c.json").oracles).toBeUndefined();
  });
});
