/**
 * `witness record` through its actual command surface.
 *
 * The header's identity fields are resolved in `cli.ts`, between the pre-check
 * that decides whether a header is needed and the append that takes the lock.
 * No unit test reaches that seam: `appendRecords` is handed identity as data,
 * so a build that resolved none would leave every journalFile test green. The
 * questions this file answers are the ones only the whole hook can answer —
 * does a real run come out with identity in its header, does a run outside a
 * repository come out valid without it, and does either ever exit non-zero.
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  isJournalFailure,
  validateJournal,
  CHECK_OUTCOMES,
  RESOLUTION_OUTCOMES,
} from "@nullius-inverba/claims";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const CLI = fileURLToPath(new URL("../dist/cli.js", import.meta.url));

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "nullius-witness-cli-"));
  // `.nullius/` is the recording opt-in. The shell hook tests for it; the CLI
  // does not, but a temp root without it is not the shape a real run has.
  mkdirSync(join(root, ".nullius"), { recursive: true });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function git(cwd: string, ...args: string[]): string {
  const result = spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")}: ${result.stderr ?? ""}`);
  return (result.stdout ?? "").trim();
}

function repoAt(dir: string): void {
  git(dir, "-c", "init.defaultBranch=main", "init", "-q");
  writeFileSync(join(dir, "a.txt"), "a\n", "utf8");
  git(dir, "add", "a.txt");
  const identity = ["-c", "user.email=t@example.com", "-c", "user.name=T"];
  git(dir, ...identity, "commit", "-q", "--no-gpg-sign", "-m", "one");
}

/**
 * The child's environment, with `undefined` meaning *unset* rather than the
 * string "undefined". The no-session refusal is only testable if
 * CLAUDE_CODE_SESSION_ID can actually be removed, and a developer who happens
 * to have it exported would otherwise see that test pass for the wrong reason.
 */
function childEnv(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, ...extra };
  for (const key of Object.keys(env)) if (env[key] === undefined) delete env[key];
  return env;
}

function record(payload: Record<string, unknown>, env: NodeJS.ProcessEnv = {}) {
  const result = spawnSync(process.execPath, [CLI, "witness", "record", "--root", root], {
    encoding: "utf8",
    input: JSON.stringify(payload),
    env: childEnv(env),
  });
  return { code: result.status ?? 1, stderr: result.stderr ?? "" };
}

function ledger(args: readonly string[], env: NodeJS.ProcessEnv = {}) {
  const result = spawnSync(
    process.execPath,
    [CLI, "witness", "ledger", ...args, "--root", root],
    { encoding: "utf8", env: childEnv({ CLAUDE_CODE_SESSION_ID: undefined, ...env }) },
  );
  return {
    code: result.status ?? 1,
    stdout: (result.stdout ?? "").trim(),
    stderr: result.stderr ?? "",
  };
}

const SESSION = { CLAUDE_CODE_SESSION_ID: "sess-1" };

const SESSION_START = {
  hook_event_name: "SessionStart",
  session_id: "sess-1",
  source: "startup",
};

function header(): Record<string, unknown> {
  const file = join(root, ".nullius", "runs", "sess-1.jsonl");
  const first = readFileSync(file, "utf8").split("\n")[0] ?? "{}";
  return JSON.parse(first) as Record<string, unknown>;
}

function journal(): string {
  return readFileSync(join(root, ".nullius", "runs", "sess-1.jsonl"), "utf8");
}

function records(): Record<string, unknown>[] {
  return journal()
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

function ofKind(kind: string): Record<string, unknown>[] {
  return records().filter((entry) => entry["kind"] === kind);
}

function failures(): string[] {
  return validateJournal(journal())
    .findings.filter((finding) => isJournalFailure(finding.verdict))
    .map((finding) => finding.verdict);
}

describe("recording where a run began", () => {
  it("writes branch, head, and a worktree identity into the header", () => {
    repoAt(root);

    expect(record(SESSION_START).code).toBe(0);

    // The positive case, asserted first. Every "no identity fields" assertion
    // below passes just as well against a build that resolves none at all.
    expect(header()["branch"]).toBe(git(root, "symbolic-ref", "--short", "HEAD"));
    expect(header()["head"]).toBe(git(root, "rev-parse", "HEAD"));
    expect(header()["worktree"]).toMatch(/^[0-9a-f]{16}$/);
    expect(validateJournal(journal()).findings).toEqual([]);
  });

  it("resolves identity once per session, not once per event", () => {
    repoAt(root);
    record(SESSION_START);
    const first = header();

    // A second event on an open journal. The pre-check outside the lock sees a
    // non-empty file and skips resolution entirely; the header is already
    // written, so nothing could change it in any case.
    record({
      hook_event_name: "PreToolUse",
      session_id: "sess-1",
      tool_name: "Task",
      tool_use_id: "toolu_A",
      tool_input: { description: "do a thing", subagent_type: "general-purpose" },
    });

    expect(header()).toEqual(first);
    expect(journal().split("\n").filter((line) => line.includes('"kind":"journal"'))).toHaveLength(
      1,
    );
  });
});

describe("recording outside a repository", () => {
  it("writes a valid journal with no identity fields and exits 0", () => {
    const result = record(SESSION_START);

    expect(result.code).toBe(0);
    const keys = Object.keys(header());
    expect(keys).not.toContain("branch");
    expect(keys).not.toContain("head");
    expect(keys).not.toContain("worktree");
    // Absent is a valid header, and this is the assertion that says so rather
    // than merely observing that nothing crashed.
    expect(validateJournal(journal()).findings).toEqual([]);
    expect(result.stderr).not.toMatch(/git/i);
  });
});

describe("recording who was steering", () => {
  it("writes user.name into the header when git supplies one", () => {
    repoAt(root);
    git(root, "config", "user.name", "Ada Lovelace");

    expect(record(SESSION_START).code).toBe(0);

    expect(header()["user"]).toEqual({ name: "Ada Lovelace" });
    expect(validateJournal(journal()).findings).toEqual([]);
  });

  it("omits the key when git's answer is blank, rather than writing a blank name", () => {
    repoAt(root);
    // A configured-but-empty name is the case a producer is most likely to get
    // wrong: `git config --get` exits 0 and prints a newline. At 0.6 the
    // validator reports MALFORMED for `user: { name: "" }`, so writing one
    // would make this producer emit journals its own validator rejects.
    git(root, "config", "user.name", "");

    expect(record(SESSION_START).code).toBe(0);

    expect(Object.keys(header())).not.toContain("user");
    expect(validateJournal(journal()).findings).toEqual([]);
  });
});

describe("recording the operator's prompt", () => {
  const SUBMIT = {
    hook_event_name: "UserPromptSubmit",
    session_id: "sess-1",
    prompt_id: "prm_01",
    prompt: "implement the ledger command",
  };

  it("records the prompt text by default", () => {
    expect(record(SUBMIT).code).toBe(0);

    const [prompt] = ofKind("prompt");
    expect(prompt?.["id"]).toBe("p:prm_01");
    expect(prompt?.["text"]).toBe("implement the ledger command");
    expect(prompt?.["chars"]).toBe("implement the ledger command".length);
    expect(Object.keys(prompt ?? {})).not.toContain("hash");
    expect(validateJournal(journal()).findings).toEqual([]);
  });

  it("records a length and a hash instead when NULLIUS_WITNESS_PROMPTS=0", () => {
    // Unwired, this switch is a setting the recorder does not honour — the
    // operator believes the text is being withheld and it is being written.
    // This is the assertion that says the flag reaches the recorder.
    expect(record(SUBMIT, { NULLIUS_WITNESS_PROMPTS: "0" }).code).toBe(0);

    const [prompt] = ofKind("prompt");
    expect(Object.keys(prompt ?? {})).not.toContain("text");
    expect(prompt?.["hash"]).toMatch(/^[0-9a-f]{64}$/);
    expect(prompt?.["chars"]).toBe("implement the ledger command".length);
    expect(validateJournal(journal()).findings).toEqual([]);
  });

  it("joins the dispatches a prompt caused to the prompt itself", () => {
    record(SUBMIT);
    record({
      hook_event_name: "PreToolUse",
      session_id: "sess-1",
      tool_name: "Task",
      tool_use_id: "toolu_A",
      prompt_id: "prm_01",
      tool_input: { description: "do a thing", subagent_type: "Explore" },
    });

    expect(ofKind("dispatch")[0]?.["prompt"]).toBe("p:prm_01");
  });
});

describe("reading the dispatched agent's own definition", () => {
  function dispatchTo(subagentType: string) {
    record({
      hook_event_name: "PreToolUse",
      session_id: "sess-1",
      tool_name: "Task",
      tool_use_id: "toolu_A",
      tool_input: { description: "review it", subagent_type: subagentType },
    });
    return ofKind("dispatch")[0] ?? {};
  }

  function agentFile(name: string, body: string): void {
    mkdirSync(join(root, ".claude", "agents"), { recursive: true });
    writeFileSync(join(root, ".claude", "agents", `${name}.md`), body, "utf8");
  }

  it("marks a dispatch expects:findings when the agent declares the tag contract", () => {
    agentFile(
      "rule-auditor",
      "# rule-auditor\n\n## Output format\n\n- `[blocker]` — a rule this violates\n",
    );

    const dispatch = dispatchTo("rule-auditor");

    expect(dispatch["expects"]).toBe("findings");
    expect(dispatch["agent_definition"]).toBe("read");
  });

  it("says `missing` for an agent with no definition file, never `read`", () => {
    // "There is no such agent" and "there is one and I could not read it" are
    // different facts, and the dispatch has to keep them different: a reader
    // that collapsed them into null would make a dispatch with no `expects`
    // unattributable in the file.
    const dispatch = dispatchTo("no-such-agent");

    expect(dispatch["agent_definition"]).toBe("missing");
    expect(Object.keys(dispatch)).not.toContain("expects");
  });

  it("refuses to build a path from an unsafe subagent_type", () => {
    const dispatch = dispatchTo("../../etc/passwd");

    expect(dispatch["agent_definition"]).toBe("unsafe-name");
  });
});

describe("what an asynchronous dispatch cost", () => {
  function launchAndStop(extra: Record<string, unknown>) {
    record({
      hook_event_name: "PreToolUse",
      session_id: "sess-1",
      tool_name: "Task",
      tool_use_id: "toolu_A",
      tool_input: { description: "review it", subagent_type: "Explore" },
    });
    record({
      hook_event_name: "PostToolUse",
      session_id: "sess-1",
      tool_name: "Task",
      tool_use_id: "toolu_A",
      tool_response: {
        isAsync: true,
        status: "async_launched",
        agentId: "ag1",
        resolvedModel: "claude-haiku-4-5-20251001",
      },
    });
    return record({
      hook_event_name: "SubagentStop",
      session_id: "sess-1",
      agent_id: "ag1",
      last_assistant_message: "- [looks-good] nothing to raise",
      ...extra,
    });
  }

  function transcript(turns: readonly unknown[]): string {
    const path = join(root, "agent-ag1.jsonl");
    writeFileSync(path, turns.map((turn) => JSON.stringify(turn)).join("\n"), "utf8");
    return path;
  }

  const TURN = (input: number, output: number, cacheRead = 0, cacheCreation = 0) => ({
    type: "assistant",
    message: {
      usage: {
        input_tokens: input,
        output_tokens: output,
        cache_read_input_tokens: cacheRead,
        cache_creation_input_tokens: cacheCreation,
      },
    },
  });

  it("sums the transcript's assistant turns onto the report", () => {
    const path = transcript([
      { type: "user", message: { usage: { input_tokens: 9_999 } } },
      TURN(100, 20, 5),
      TURN(10, 2),
    ]);

    expect(launchAndStop({ agent_transcript_path: path }).code).toBe(0);

    const [report] = ofKind("report");
    // The model comes off the sidecar because SubagentStop carries none; the
    // usage comes off the transcript because it carries none of that either.
    expect(report?.["model"]).toBe("claude-haiku-4-5-20251001");
    expect(report?.["usage_source"]).toBe("transcript");
    expect(report?.["usage"]).toEqual({
      input: 110,
      output: 22,
      cache_read: 5,
      cache_creation: 0,
      total: 137,
    });
    expect(validateJournal(journal()).findings).toEqual([]);
  });

  it("omits usage and says so when the transcript is over the byte cap", () => {
    const path = join(root, "agent-ag1.jsonl");
    writeFileSync(path, `${JSON.stringify(TURN(1, 1))}\n${"#".repeat(2_100_000)}\n`, "utf8");

    const result = launchAndStop({ agent_transcript_path: path });

    const [report] = ofKind("report");
    expect(Object.keys(report ?? {})).not.toContain("usage");
    // The model is still recorded: only the measurement was unavailable.
    expect(report?.["model"]).toBe("claude-haiku-4-5-20251001");
    expect(result.stderr).toContain("budgets");
  });

  it("records the model with no usage when there is no transcript at all", () => {
    expect(launchAndStop({}).code).toBe(0);

    const [report] = ofKind("report");
    expect(report?.["model"]).toBe("claude-haiku-4-5-20251001");
    expect(Object.keys(report ?? {})).not.toContain("usage");
  });
});

describe("witness ledger — addressing the journal", () => {
  it("refuses with exit 2 when neither --session nor CLAUDE_CODE_SESSION_ID is set", () => {
    const result = ledger(["stage", "--phase", "verify"]);

    expect(result.code).toBe(2);
    // Both named. A message that names one leaves the reader to discover the
    // other, and the fallback this command does NOT have is the one they will
    // otherwise assume.
    expect(result.stderr).toContain("--session");
    expect(result.stderr).toContain("CLAUDE_CODE_SESSION_ID");
    expect(existsSync(join(root, ".nullius", "runs"))).toBe(false);
  });

  it("never picks a journal by modification time", () => {
    // A journal exists and is the only one there. The command still refuses,
    // because "the newest journal" is a different journal from "mine" the
    // moment there are two worktrees or a resumed session.
    record(SESSION_START);
    const before = journal();

    const result = ledger(["stage", "--phase", "verify"]);

    expect(result.code).toBe(2);
    expect(journal()).toBe(before);
  });

  it("takes the session from --session over the environment", () => {
    const result = ledger(
      ["stage", "--phase", "verify", "--session", "sess-1"],
      { CLAUDE_CODE_SESSION_ID: "some-other-session" },
    );

    expect(result.code).toBe(0);
    expect(ofKind("stage")).toHaveLength(1);
  });
});

describe("witness ledger — each kind round-trips and validates", () => {
  it("appends a stage that validates clean", () => {
    const result = ledger(
      ["stage", "--phase", "verify", "--iteration", "2", "--change", "add-run-ledger-producer"],
      SESSION,
    );

    expect(result.code).toBe(0);
    expect(result.stdout).toMatch(/^s:[0-9a-f]{16}$/);
    const [stage] = ofKind("stage");
    expect(stage).toMatchObject({
      kind: "stage",
      phase: "verify",
      iteration: 2,
      change: "add-run-ledger-producer",
      origin: "self-reported",
    });
    expect(failures()).toEqual([]);
  });

  it("appends a decision that validates clean", () => {
    const result = ledger(
      [
        "decision",
        "--choice",
        "the ledger writes through the CLI",
        "--rationale",
        "a coordinator's account has to be refusable before it is written",
        "--resolves",
        "Decision 3",
      ],
      SESSION,
    );

    expect(result.code).toBe(0);
    expect(result.stdout).toMatch(/^dec:[0-9a-f]{16}$/);
    expect(ofKind("decision")[0]).toMatchObject({
      choice: "the ledger writes through the CLI",
      resolves: "Decision 3",
      origin: "self-reported",
    });
    expect(failures()).toEqual([]);
  });

  it("appends a check that validates clean", () => {
    const result = ledger(
      [
        "check",
        "--command",
        "pnpm test",
        "--outcome",
        "fail",
        "--text",
        "6 ugrep baseline failures and nothing else",
        "--counts",
        "failed=6,passed=948",
      ],
      SESSION,
    );

    expect(result.code).toBe(0);
    expect(result.stdout).toMatch(/^c:[0-9a-f]{16}$/);
    expect(ofKind("check")[0]).toMatchObject({
      command: "pnpm test",
      outcome: "fail",
      counts: { failed: 6, passed: 948 },
      origin: "self-reported",
    });
    expect(failures()).toEqual([]);
  });

  it("gives two records that say the same thing different ids", () => {
    // Content-derived ids collide on a counter's worth of repetition unless the
    // timestamp is inside the hash; a collision here is DUPLICATE-ID on a
    // journal that recorded two real events correctly.
    const first = ledger(["stage", "--phase", "verify"], SESSION);
    const second = ledger(["stage", "--phase", "verify"], SESSION);

    expect(second.stdout).not.toBe(first.stdout);
    expect(failures()).toEqual([]);
  });

  it("writes every ledger record with origin: self-reported", () => {
    ledger(["stage", "--phase", "verify"], SESSION);
    ledger(["decision", "--choice", "a", "--rationale", "b"], SESSION);
    ledger(["check", "--command", "x", "--outcome", "pass", "--text", "y"], SESSION);

    // The header says `hooks`. Without a per-record origin the coordinator's
    // own account would be attested as harness-emitted, which is the one tier
    // it is least entitled to claim.
    expect(header()["origin"]).toBe("hooks");
    for (const entry of records().slice(1)) expect(entry["origin"]).toBe("self-reported");
    expect(failures()).toEqual([]);
  });
});

describe("witness ledger — refusing before the write", () => {
  it("exits 2 on an outcome outside the closed vocabulary and leaves the journal untouched", () => {
    ledger(["stage", "--phase", "verify"], SESSION);
    const before = journal();

    const result = ledger(
      ["resolution", "--finding", "f:abc", "--outcome", "resolved-ish", "--text", "done"],
      SESSION,
    );

    expect(result.code).toBe(2);
    // The accepted values are in the message. A refusal that says only "not
    // valid" makes a closed vocabulary into a guessing game.
    expect(result.stderr).toContain("out-of-scope");
    expect(journal()).toBe(before);
  });

  it("exits 2 on a check outcome outside pass|fail", () => {
    const result = ledger(
      ["check", "--command", "pnpm test", "--outcome", "mostly", "--text", "eh"],
      SESSION,
    );

    expect(result.code).toBe(2);
    expect(result.stderr).toContain("pass, fail");
    expect(existsSync(join(root, ".nullius", "runs", "sess-1.jsonl"))).toBe(false);
  });

  it("refuses a merge outcome that names no survivor", () => {
    const result = ledger(
      ["resolution", "--finding", "f:abc", "--outcome", "duplicate", "--text", "same as f:xyz"],
      SESSION,
    );

    expect(result.code).toBe(2);
    expect(result.stderr).toContain("--merges-into");
  });

  it("refuses a missing required field by name", () => {
    const result = ledger(["decision", "--choice", "a"], SESSION);

    expect(result.code).toBe(2);
    expect(result.stderr).toContain("--rationale");
  });

  it("refuses to write a finding at all", () => {
    const result = ledger(
      ["finding", "--severity", "blocker", "--author", "me", "--text", "x"],
      SESSION,
    );

    expect(result.code).toBe(2);
    expect(result.stderr).toContain("extracted by the recorder");
  });

  it("refuses an unknown flag rather than dropping it", () => {
    const result = ledger(["stage", "--phase", "verify", "--phse", "typo"], SESSION);

    expect(result.code).toBe(2);
    expect(result.stderr).toContain("--phse");
  });

  it("writes every member of the kernel's resolution vocabulary into a clean journal", () => {
    // Replaces "accepts every member of the resolution vocabulary the kernel
    // does", which existed to hold a COPY of the vocabulary honest while
    // cli.ts restated it. The copy is gone — cli.ts imports
    // `RESOLUTION_OUTCOMES` from `@nullius-inverba/claims` — so drift between
    // the two lists is no longer possible and no test needs to look for it.
    //
    // What still earns its place is the end-to-end round trip, over the real
    // list rather than a transcribed subset of it. Accepting a value is not
    // the same as writing a record the validator accepts, and the CLI has
    // rules of its own on top of the vocabulary: `duplicate` and `folded-in`
    // are refused unless they name the finding they redirect into. Iterating
    // the imported constant means a member ADDED to the kernel is exercised
    // here the moment it exists — the one direction the old copy-checking test
    // could not see, because a producer that had never heard of a value simply
    // refused it.
    seedFindings();
    const ids = ledger(["findings"], SESSION).stdout.split("\n").map((line) => line.split("\t")[0]);
    const blocker = String(ids[0]);
    const survivor = String(ids[1]);

    for (const outcome of RESOLUTION_OUTCOMES) {
      // The CLI's rule, not the schema's: an outcome that redirects a finding
      // rather than closing it must name the survivor.
      const merge =
        outcome === "duplicate" || outcome === "folded-in" ? ["--merges-into", survivor] : [];
      const result = ledger(
        ["resolution", "--finding", blocker, "--outcome", outcome, "--text", "because", ...merge],
        SESSION,
      );
      expect(result.code, `${outcome} was refused: ${result.stderr}`).toBe(0);
    }

    expect(ofKind("resolution").map((entry) => entry["outcome"])).toEqual([...RESOLUTION_OUTCOMES]);
    expect(failures()).toEqual([]);
  });

  it("writes every member of the kernel's check vocabulary into a clean journal", () => {
    // The same round trip for the other imported vocabulary. Two members, so
    // the loop looks pointless — it is not: it is written over the imported
    // constant, so a third outcome added to the kernel is covered here without
    // anyone remembering to come back.
    for (const outcome of CHECK_OUTCOMES) {
      const result = ledger(
        ["check", "--command", "pnpm test", "--outcome", outcome, "--text", "it ran"],
        SESSION,
      );
      expect(result.code, `${outcome} was refused: ${result.stderr}`).toBe(0);
    }

    expect(ofKind("check").map((entry) => entry["outcome"])).toEqual([...CHECK_OUTCOMES]);
    expect(failures()).toEqual([]);
  });
});

/**
 * A journal with a real, hook-extracted blocker and a real concern in it.
 *
 * Written through the recorder rather than hand-assembled, because the point of
 * `findings --open` is that it lists what an agent actually returned — a
 * fixture would test the reader against the test author's idea of the shape.
 */
function seedFindings(): void {
  record({
    hook_event_name: "PreToolUse",
    session_id: "sess-1",
    tool_name: "Task",
    tool_use_id: "toolu_R",
    tool_input: { description: "audit the rules", subagent_type: "rule-auditor" },
  });
  record({
    hook_event_name: "PostToolUse",
    session_id: "sess-1",
    tool_name: "Task",
    tool_use_id: "toolu_R",
    // The harness sends the input back on PostToolUse, and it is where the
    // finding's author comes from: without it the author falls back to the
    // dispatch id, which is real but says nothing about who reviewed.
    tool_input: { description: "audit the rules", subagent_type: "rule-auditor" },
    tool_response:
      "Report:\n- [blocker] the anchor is unstamped\n- [concern] the heading wording drifts\n",
  });
}

describe("witness ledger findings", () => {
  it("lists every finding the recorder extracted", () => {
    seedFindings();

    const listed = ledger(["findings"], SESSION).stdout.split("\n");

    expect(listed).toHaveLength(2);
    expect(listed[0]).toContain("blocker");
    expect(listed[0]).toContain("rule-auditor");
    expect(listed[0]).toContain("the anchor is unstamped");
    expect(listed[1]).toContain("concern");
  });

  it("--open lists exactly the blockers no resolution answers", () => {
    seedFindings();
    const open = ledger(["findings", "--open"], SESSION).stdout.split("\n");

    expect(open).toHaveLength(1);
    expect(open[0]).toContain("the anchor is unstamped");
    // The concern is not a blocker, so it was never in the --open set.
    expect(open[0]).not.toContain("heading wording");
    // And the journal does not yet hold up: an unanswered blocker is exactly
    // what SUPPRESSED-FINDING is for.
    expect(failures()).toContain("suppressed-finding");

    const blocker = String(open[0]).split("\t")[0];
    expect(
      ledger(["resolution", "--finding", String(blocker), "--outcome", "fixed", "--text", "stamped it"], SESSION)
        .code,
    ).toBe(0);

    expect(ledger(["findings", "--open"], SESSION).stdout).toBe("");
    expect(failures()).toEqual([]);
  });

  it("follows a merge chain, so folding a blocker into an unanswered finding leaves it open", () => {
    seedFindings();
    const all = ledger(["findings"], SESSION).stdout.split("\n");
    const blocker = String(all[0]).split("\t")[0];
    const concern = String(all[1]).split("\t")[0];

    ledger(
      [
        "resolution",
        "--finding",
        String(blocker),
        "--outcome",
        "folded-in",
        "--text",
        "same root cause",
        "--merges-into",
        String(concern),
      ],
      SESSION,
    );

    // A merge transfers the obligation rather than discharging it. Folding a
    // blocker into an unpoliced concern would otherwise close it while
    // answering nothing.
    expect(ledger(["findings", "--open"], SESSION).stdout).toContain(blocker);

    ledger(
      ["resolution", "--finding", String(concern), "--outcome", "fixed", "--text", "reworded"],
      SESSION,
    );

    expect(ledger(["findings", "--open"], SESSION).stdout).toBe("");
    expect(failures()).toEqual([]);
  });
});

describe("a git call that exceeds its budget", () => {
  it("leaves the fields absent, lands the append, and exits 0", () => {
    repoAt(root);
    const bin = mkdtempSync(join(tmpdir(), "nullius-slowgit-"));
    writeFileSync(join(bin, "git"), "#!/bin/sh\nexec sleep 30\n", { mode: 0o755 });

    try {
      const started = Date.now();
      const result = record(SESSION_START, { PATH: `${bin}:${process.env["PATH"] ?? ""}` });
      const elapsed = Date.now() - started;

      expect(result.code).toBe(0);
      expect(existsSync(join(root, ".nullius", "runs", "sess-1.jsonl"))).toBe(true);
      const keys = Object.keys(header());
      expect(keys).not.toContain("branch");
      expect(keys).not.toContain("head");
      expect(keys).not.toContain("worktree");
      expect(validateJournal(journal()).findings).toEqual([]);
      // The budget is what makes a slow git safe rather than merely survivable:
      // 30 seconds of git must not become 30 seconds of held-up hooks.
      expect(elapsed).toBeLessThan(10_000);
    } finally {
      rmSync(bin, { recursive: true, force: true });
    }
  });
});

describe("witness ledger — a misspelled valueless flag is refused, not ignored", () => {
  it("refuses --opn on findings rather than listing everything", () => {
    // `--open` is a filter. A typo that fell through would print the whole
    // list as though nothing had been asked of it — the wrong answer wearing
    // the right shape, which is the failure this repository is about.
    const result = ledger(["findings", "--opn"], SESSION);

    expect(result.code).toBe(2);
    expect(result.stderr).toContain("--opn");
  });

  it("refuses --open on a kind that has no such filter", () => {
    expect(ledger(["stage", "--phase", "verify", "--open"], SESSION).code).toBe(2);
  });
});
