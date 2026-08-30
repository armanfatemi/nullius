import { describe, expect, it } from "vitest";

import {
  collectJustifications,
  parseNameStatus,
  parseRange,
} from "./oracleGit";

describe("parseRange", () => {
  it("splits a two-dot range", () => {
    expect(parseRange("main..HEAD")).toEqual({ base: "main", head: "HEAD" });
  });

  it("splits a three-dot range", () => {
    expect(parseRange("main...HEAD")).toEqual({ base: "main", head: "HEAD" });
  });

  // CI's negated arm runs an empty range, because MALFORMED-JUSTIFICATION is
  // read from the journal and must be reachable with nothing changed. An empty
  // range is a supported input, not a degenerate one.
  it("accepts base == head rather than rejecting an empty range", () => {
    expect(parseRange("abc1234..abc1234")).toEqual({
      base: "abc1234",
      head: "abc1234",
    });
  });

  it("reads a bare revision as that commit against its parent", () => {
    expect(parseRange("abc1234")).toEqual({ base: "abc1234~1", head: "abc1234" });
  });

  it("refuses anything flag-shaped", () => {
    expect(parseRange("--upload-pack=evil")).toHaveProperty("error");
  });

  it("refuses a range with a missing end", () => {
    expect(parseRange("main..")).toHaveProperty("error");
  });

  it("refuses shell metacharacters", () => {
    expect(parseRange("main..HEAD;rm -rf /")).toHaveProperty("error");
  });
});

describe("parseNameStatus", () => {
  it("reads added, modified and deleted", () => {
    const raw = "A\0test/a.test.ts\0M\0test/b.test.ts\0D\0test/c.test.ts\0";
    expect(parseNameStatus(raw)).toEqual([
      { path: "test/a.test.ts", status: "A" },
      { path: "test/b.test.ts", status: "M" },
      { path: "test/c.test.ts", status: "D" },
    ]);
  });

  it("reads a rename's two paths", () => {
    const raw = "R100\0test/old.test.ts\0test/new.test.ts\0";
    expect(parseNameStatus(raw)).toEqual([
      { path: "test/new.test.ts", status: "R", from: "test/old.test.ts" },
    ]);
  });

  it("returns nothing for empty output", () => {
    expect(parseNameStatus("")).toEqual([]);
  });
});

describe("collectJustifications", () => {
  it("finds justifies on decision records only", () => {
    const journal = [
      '{"kind":"journal","version":"0.5","origin":"hooks","session":"s"}',
      '{"kind":"decision","id":"dec1","choice":"c","rationale":"r","justifies":{"path":"test/a.test.ts","change":"deleted"}}',
      '{"kind":"decision","id":"dec2","choice":"c","rationale":"r"}',
      '{"kind":"finding","id":"f1","justifies":{"path":"x","change":"deleted"}}',
    ].join("\n");
    expect(collectJustifications(journal)).toEqual([
      { record: "dec1", path: "test/a.test.ts", change: "deleted" },
    ]);
  });

  // The malformed value has to survive collection unvalidated, or the verdict
  // that reports it never sees the record that earned it.
  it("carries a malformed justifies through rather than dropping it", () => {
    const journal =
      '{"kind":"decision","id":"dec1","choice":"c","rationale":"r","justifies":{"path":"a","change":"tweaked"}}';
    expect(collectJustifications(journal)).toEqual([
      { record: "dec1", path: "a", change: "tweaked" },
    ]);
  });

  it("reports a non-object justifies as fully malformed", () => {
    const journal =
      '{"kind":"decision","id":"dec1","choice":"c","rationale":"r","justifies":"nope"}';
    expect(collectJustifications(journal)).toEqual([
      { record: "dec1", path: undefined, change: undefined },
    ]);
  });

  // An unparseable line is witness validate's finding, not this command's.
  // Counting it twice in two vocabularies helps nobody.
  it("skips an unparseable line without erroring", () => {
    const journal = ['{ not json', '{"kind":"decision","id":"d","justifies":{"path":"a","change":"deleted"}}'].join("\n");
    expect(collectJustifications(journal)).toHaveLength(1);
  });
});
