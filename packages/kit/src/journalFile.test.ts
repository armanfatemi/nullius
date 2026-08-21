import { mkdtempSync, mkdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, sep } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  appendRecords,
  journalPathFor,
  linksPathFor,
  openDispatchesIn,
  recordLink,
  resolveLink,
  LOCK_SUFFIX,
} from "./journalFile";

const HEADER = { version: "0.2", origin: "hooks" as const, session: "sess-1", source: "startup" };

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "nullius-kit-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function lines(file: string): string[] {
  return readFileSync(file, "utf8").split("\n").filter((line) => line.length > 0);
}

describe("journal paths", () => {
  it("puts one file per session under .nullius/runs", () => {
    expect(journalPathFor(root, "abc-123")).toBe(join(root, ".nullius", "runs", "abc-123.jsonl"));
  });

  it("refuses to let a session id escape the runs directory", () => {
    const path = journalPathFor(root, "../../etc/passwd");

    expect(dirname(path)).toBe(join(root, ".nullius", "runs"));
    expect(path).not.toContain(`..${sep}`);
  });

  it("names an unidentified session rather than inventing an id for it", () => {
    expect(journalPathFor(root, null).endsWith("unknown-session.jsonl")).toBe(true);
  });
});

describe("appending", () => {
  it("lays the header down as the first record", () => {
    const file = journalPathFor(root, "sess-1");
    appendRecords(file, [{ kind: "dispatch", id: "d1" }], HEADER);

    expect(JSON.parse(lines(file)[0] ?? "")).toEqual({
      kind: "journal",
      version: "0.2",
      origin: "hooks",
      session: "sess-1",
      source: "startup",
    });
    expect(JSON.parse(lines(file)[1] ?? "")).toEqual({ kind: "dispatch", id: "d1" });
  });

  it("writes the header once, however many appends follow", () => {
    const file = journalPathFor(root, "sess-1");
    appendRecords(file, [{ kind: "dispatch", id: "d1" }], HEADER);
    appendRecords(file, [{ kind: "dispatch", id: "d2" }], { ...HEADER, source: "resume" });

    expect(lines(file).filter((line) => line.includes('"journal"'))).toHaveLength(1);
    expect(lines(file)).toHaveLength(3);
  });

  it("creates a journal for a header alone, so an empty session is still a record", () => {
    const file = journalPathFor(root, "sess-1");
    const outcome = appendRecords(file, [], HEADER);

    expect(outcome.refused).toBeNull();
    expect(lines(file)).toHaveLength(1);
  });

  it("writes every record as one complete line", () => {
    const file = journalPathFor(root, "sess-1");
    appendRecords(file, [{ kind: "dispatch", id: "d1", task: "a\nb" }, { kind: "dispatch", id: "d2" }], HEADER);

    expect(lines(file)).toHaveLength(3);
    for (const line of lines(file)) expect(() => JSON.parse(line)).not.toThrow();
  });
});

describe("the append lock", () => {
  it("refuses rather than interleaving when another writer holds the lock", () => {
    const file = journalPathFor(root, "sess-1");
    appendRecords(file, [{ kind: "dispatch", id: "d1" }], HEADER);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(`${file}${LOCK_SUFFIX}`, "held by a live writer");

    const outcome = appendRecords(file, [{ kind: "dispatch", id: "d2" }], HEADER, { waitMs: 60 });

    expect(outcome.written).toBe(0);
    expect(outcome.refused).toContain("lock");
    expect(lines(file)).toHaveLength(2);
  });

  it("breaks a lock left behind by a writer that died", () => {
    const file = journalPathFor(root, "sess-1");
    mkdirSync(dirname(file), { recursive: true });
    const lock = `${file}${LOCK_SUFFIX}`;
    writeFileSync(lock, "held by a process that is long gone");
    const ancient = new Date(Date.now() - 600_000);
    utimesSync(lock, ancient, ancient);

    const outcome = appendRecords(file, [{ kind: "dispatch", id: "d1" }], HEADER, { waitMs: 60 });

    expect(outcome.refused).toBeNull();
    expect(lines(file)).toHaveLength(2);
  });

  it("leaves no lock behind once it is done", () => {
    const file = journalPathFor(root, "sess-1");
    appendRecords(file, [{ kind: "dispatch", id: "d1" }], HEADER);

    expect(() => readFileSync(`${file}${LOCK_SUFFIX}`)).toThrow();
  });
});

describe("open dispatches", () => {
  const journal = [
    { kind: "journal", version: "0.2", origin: "hooks" },
    { kind: "dispatch", id: "d1", task: "find the retry helper" },
    { kind: "report", id: "r1", dispatch: "d1", outcome: "empty", statement: "None." },
    { kind: "dispatch", id: "d2", task: "check the migration" },
    { kind: "dispatch", id: "d3" },
  ]
    .map((record) => JSON.stringify(record))
    .join("\n");

  it("names the dispatches that never came back, and only those", () => {
    expect(openDispatchesIn(journal)).toEqual([
      { id: "d2", task: "check the migration" },
      { id: "d3", task: null },
    ]);
  });

  it("finds nothing in an empty journal", () => {
    expect(openDispatchesIn("")).toEqual([]);
  });
});

describe("the launch link", () => {
  it("binds an agent id to the dispatch it was launched for", () => {
    const links = linksPathFor(journalPathFor(root, "sess-1"));
    recordLink(links, "ab210a2c41e64ee5f", "d:toolu_01ABC");

    expect(resolveLink(links, "ab210a2c41e64ee5f")).toBe("d:toolu_01ABC");
  });

  it("keeps links for parallel subagents apart", () => {
    const links = linksPathFor(journalPathFor(root, "sess-1"));
    recordLink(links, "agent-one", "d:toolu_A");
    recordLink(links, "agent-two", "d:toolu_B");

    expect(resolveLink(links, "agent-one")).toBe("d:toolu_A");
    expect(resolveLink(links, "agent-two")).toBe("d:toolu_B");
  });

  it("resolves nothing for an agent it never saw launched", () => {
    const links = linksPathFor(journalPathFor(root, "sess-1"));
    recordLink(links, "agent-one", "d:toolu_A");

    expect(resolveLink(links, "a-stranger")).toBeNull();
  });

  it("resolves nothing when no link file exists at all", () => {
    expect(resolveLink(linksPathFor(journalPathFor(root, "never-ran")), "anyone")).toBeNull();
  });

  it("survives a link file that has been corrupted", () => {
    const links = linksPathFor(journalPathFor(root, "sess-1"));
    recordLink(links, "agent-one", "d:toolu_A");
    writeFileSync(links, "{ this is not json");

    expect(resolveLink(links, "agent-one")).toBeNull();
  });

  it("lives beside the journal, not inside it", () => {
    const journal = journalPathFor(root, "sess-1");
    recordLink(linksPathFor(journal), "agent-one", "d:toolu_A");
    appendRecords(journal, [{ kind: "dispatch", id: "d:toolu_A" }], HEADER);

    expect(lines(journal).some((line) => line.includes("agent-one"))).toBe(false);
  });
});
