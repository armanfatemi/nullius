/**
 * `witness bundle` through its actual command surface.
 *
 * The unit tests own the rules; this file owns the seams only the whole command
 * can reach — the git reads that produce the window, the refusal that must
 * happen BEFORE anything is written, and the exit codes a pipeline branches on.
 * A `--no-prompts` that wrote a correct envelope and then failed would pass
 * every pure test in `bundle.test.ts` and still have shipped the prompt text it
 * promised to withhold.
 */

import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

const CLI = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
const FIXTURES = fileURLToPath(new URL("../../../spec/fixtures/report/", import.meta.url));

/** The paths the second commit touches — the range's changed files. */
const RANGE_FILES = [
  "openspec/changes/add-canary-status-redaction/proposal.md",
  "packages/claims/src/canary.ts",
  "packages/claims/src/canary.test.ts",
  "packages/kit/src/bundle.ts",
];

let root: string;
let base: string;

function git(...args: string[]): string {
  const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")}: ${result.stderr ?? ""}`);
  return (result.stdout ?? "").trim();
}

function commit(message: string, when: string): string {
  const identity = ["-c", "user.email=t@example.com", "-c", "user.name=T"];
  git(...identity, "commit", "-q", "--no-gpg-sign", "--date", when, "-m", message);
  return git("rev-parse", "HEAD");
}

function write(relative: string, content: string): void {
  const target = join(root, relative);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content, "utf8");
}

function bundle(...args: string[]) {
  return spawnSync(process.execPath, [CLI, "witness", "bundle", ...args, "--root", root], {
    encoding: "utf8",
    env: { ...process.env, NULLIUS_WITNESS_ROOT: root },
  });
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "nullius-bundle-cli-"));
  git("-c", "init.defaultBranch=main", "init", "-q");

  // A base commit BEFORE every fixture journal's first timestamp, then two
  // commits spanning the window the fixtures were written against, so the
  // commit-time window is a real one rather than something the test asserts
  // about itself. Two commits rather than one: the window runs from the FIRST
  // author time to the LAST, and a single-commit range would collapse it to a
  // point plus slack, which is not the shape any real range has.
  write("README.md", "base\n");
  git("add", "-A");
  base = commit("base", "2026-08-30T19:00:00+0000");

  for (const path of RANGE_FILES.slice(0, 2)) write(path, `${path}\nchanged\n`);
  git("add", "-A");
  commit("the range opens", "2026-08-30T21:30:00+0000");

  for (const path of RANGE_FILES.slice(2)) write(path, `${path}\nchanged\n`);
  git("add", "-A");
  commit("the range closes", "2026-08-31T01:00:00+0000");

  mkdirSync(join(root, ".nullius", "runs"), { recursive: true });
  for (const name of ["pr58-session", "review-only", "other-worktree", "rejected-lines", "stale-verification"]) {
    copyFileSync(`${FIXTURES}${name}.jsonl`, join(root, ".nullius", "runs", `${name}.jsonl`));
  }
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function envelopeAt(path: string): {
  version: number;
  range: { spec: string; resolved_base: string; commits: { sha: string; at: string }[] };
  selection: {
    rule: string;
    slack_minutes: number;
    prompts: string;
    changed_files: string[];
    candidates: { session: string; classification: string; reason: string; override?: string }[];
  };
  journals: { session: string; lines: string[] }[];
} {
  return JSON.parse(readFileSync(join(root, path), "utf8")) as never;
}

describe("witness bundle", () => {
  it("writes nullius.runs/<branch>.json and classifies every candidate three ways", () => {
    const result = bundle(`${base}..HEAD`);
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);

    const envelope = envelopeAt(join("nullius.runs", "main.json"));
    expect(envelope.version).toBe(1);
    expect(envelope.range.spec).toBe(`${base}..HEAD`);
    expect(envelope.range.commits).toHaveLength(2);
    expect(envelope.selection.changed_files).toEqual([...RANGE_FILES].sort());

    const by = new Map(envelope.selection.candidates.map((entry) => [entry.session, entry]));
    expect(by.get("pr58-session")?.classification).toBe("included");
    expect(by.get("rejected-lines")?.classification).toBe("included");
    expect(by.get("stale-verification")?.classification).toBe("included");
    // Overlaps in time, mutates nothing in the range — carried as a candidate,
    // not silently dropped.
    expect(by.get("review-only")?.classification).toBe("inconclusive");
    expect(by.get("other-worktree")?.classification).toBe("excluded");

    // Every included journal is carried whole, line for line.
    for (const journal of envelope.journals) {
      const source = readFileSync(join(root, ".nullius", "runs", `${journal.session}.jsonl`), "utf8");
      expect(journal.lines).toHaveLength(source.split("\n").length);
    }
    expect(envelope.journals.map((journal) => journal.session).sort()).toEqual([
      "pr58-session",
      "rejected-lines",
      "stale-verification",
    ]);

    // The selection is printed with its reasons, so an override or a surprise
    // is visible in the log rather than only in the file.
    expect(result.stdout).toContain("inconclusive\treview-only");
    expect(result.stdout).toContain("excluded\tother-worktree");
  });

  it("refuses --no-prompts when a selected journal carries an unreadable line, and writes nothing", () => {
    const result = bundle(`${base}..HEAD`, "--no-prompts");
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("rejected-lines");
    expect(result.stderr).toContain("line(s) 4");
    expect(result.stderr).toContain("--exclude");
    expect(existsSync(join(root, "nullius.runs", "main.json"))).toBe(false);
  });

  it("honours --no-prompts once the offending journal is excluded", () => {
    // `review-only` is pulled in deliberately: it is the only remaining journal
    // that CARRIES a prompt, and without it the loop below would iterate over
    // nothing and pass while converting nothing.
    const result = bundle(
      `${base}..HEAD`,
      "--no-prompts",
      "--exclude",
      "rejected-lines",
      "--include",
      "review-only",
    );
    expect(result.status).toBe(0);

    const envelope = envelopeAt(join("nullius.runs", "main.json"));
    expect(envelope.selection.prompts).toBe("hashed");
    const override = envelope.selection.candidates.find((entry) => entry.session === "rejected-lines");
    expect(override?.override).toBe("exclude");
    expect(override?.reason).toContain("the rule said included");

    let prompts = 0;
    for (const journal of envelope.journals) {
      for (const line of journal.lines) {
        if (!line.includes('"kind":"prompt"')) continue;
        prompts += 1;
        const record = JSON.parse(line) as Record<string, unknown>;
        expect(record).not.toHaveProperty("text");
        expect(record["hash"]).toEqual(expect.any(String));
        expect(record["chars"]).toEqual(expect.any(Number));
      }
    }
    expect(prompts).toBeGreaterThan(0);

    // And the excluded journal's prompt text is nowhere in the file — the
    // refusal's whole point is that this flag never appears to work.
    const raw = readFileSync(join(root, "nullius.runs", "main.json"), "utf8");
    expect(raw).not.toContain("bundle this run so CI can re-validate");
    expect(raw).not.toContain("review the canary redaction proposal");
  });

  it("carries a journal the rule did not select when --include names it", () => {
    const result = bundle(`${base}..HEAD`, "--include", "review-only");
    expect(result.status).toBe(0);
    const envelope = envelopeAt(join("nullius.runs", "main.json"));
    expect(envelope.journals.map((journal) => journal.session)).toContain("review-only");
    const entry = envelope.selection.candidates.find((each) => each.session === "review-only");
    expect(entry?.override).toBe("include");
  });

  it("refuses to write under .nullius/", () => {
    const result = bundle(`${base}..HEAD`, "--out", join(".nullius", "runs.json"));
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("recording opt-in");
    expect(existsSync(join(root, ".nullius", "runs.json"))).toBe(false);
  });

  it("exits 1 when nothing is included — an inconclusive candidate does not satisfy it", () => {
    for (const name of ["pr58-session", "rejected-lines", "stale-verification"]) {
      rmSync(join(root, ".nullius", "runs", `${name}.jsonl`));
    }
    const result = bundle(`${base}..HEAD`);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("inconclusive\treview-only");
    expect(result.stderr).toContain("--include");
    expect(existsSync(join(root, "nullius.runs", "main.json"))).toBe(false);
  });

  it("records the slack it applied, and refuses one it cannot read", () => {
    const ok = bundle(`${base}..HEAD`, "--slack", "90");
    expect(ok.status).toBe(0);
    expect(envelopeAt(join("nullius.runs", "main.json")).selection.slack_minutes).toBe(90);

    const bad = bundle(`${base}..HEAD`, "--slack", "soon");
    expect(bad.status).toBe(2);
    expect(bad.stderr).toContain("--slack");
  });

  it("exits 2 on a range it will not hand to git", () => {
    const result = bundle("--upload-pack=x");
    expect(result.status).toBe(2);
    expect(existsSync(join(root, "nullius.runs", "main.json"))).toBe(false);
  });

  it("exits 2 when git cannot read the range", () => {
    const result = bundle("nosuchref..HEAD");
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("nosuchref..HEAD");
  });

  it("reads a bare revision as that commit against its parent", () => {
    const head = git("rev-parse", "HEAD");
    const result = bundle(head, "--out", "one-commit.json");
    expect(result.status).toBe(0);
    const envelope = envelopeAt("one-commit.json");
    // The last commit against its parent, so only the two files IT changed —
    // not the four the whole branch changed. That difference is the reading.
    expect(envelope.range.commits).toHaveLength(1);
    expect(envelope.selection.changed_files).toEqual([...RANGE_FILES].slice(2).sort());
  });
});
