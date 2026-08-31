/**
 * The hook wrapper as the harness actually runs it: `bash witness-record.sh`,
 * a payload on stdin, and nothing mocked.
 *
 * Two properties live only in this file, and neither is reachable from any
 * in-process test.
 *
 * **The script's own stdout is empty.** `UserPromptSubmit` is the one event
 * whose hook stdout the harness feeds back to the model as context, and the
 * default runner is `npx -y @nullius-inverba/kit`, which prints to stdout on a
 * cold cache. The redirect that fixes that is a shell token, so the only thing
 * that can prove it is a process. `doctor`'s live proof calls `planRecords`
 * in-process and never executes this script at all.
 *
 * **A hung runner does not hang the prompt.** The bound is inside the script
 * rather than a `timeout` key in `hooks.json`, because a harness-killed
 * process never reaches the script's `exit 0` — and that line is where this
 * repository's fail-open guarantee actually lives. So the assertion has to be
 * "the script exited 0, quickly", which is a statement about a process.
 *
 * The stub runner is a shell script writing a sentinel to STDOUT: a stub that
 * wrote to stderr would pass against a script with no redirect at all.
 */

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

const SCRIPT = fileURLToPath(new URL("../../../plugin/hooks/witness-record.sh", import.meta.url));

/** Distinctive enough that finding it in a stream is not a coincidence. */
const SENTINEL = "stub-runner-wrote-this-to-stdout";

let root: string;
let stub: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "nullius-hook-script-"));
  // `.nullius/` is the recording opt-in the script tests for. Without it the
  // script returns early and every assertion below passes vacuously.
  mkdirSync(join(root, ".nullius"), { recursive: true });
  stub = join(root, "stub-runner.sh");
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/** A runner that prints to stdout and succeeds — the npx-on-a-cold-cache shape. */
function chattyStub(): string {
  writeFileSync(stub, `#!/bin/sh\nprintf '%s\\n' '${SENTINEL}'\nexit 0\n`, { mode: 0o755 });
  return stub;
}

/** A runner that never returns. */
function hangingStub(): string {
  writeFileSync(stub, "#!/bin/sh\nexec sleep 60\n", { mode: 0o755 });
  return stub;
}

function runHook(payload: Record<string, unknown>, env: NodeJS.ProcessEnv = {}) {
  const started = Date.now();
  const result = spawnSync("bash", [SCRIPT], {
    encoding: "utf8",
    input: JSON.stringify(payload),
    env: {
      ...process.env,
      // Set explicitly rather than inherited from `cwd`: the script reads
      // CLAUDE_PROJECT_DIR first and only falls back to $PWD, so relying on
      // the working directory would test the fallback and not the path the
      // harness takes.
      CLAUDE_PROJECT_DIR: root,
      NULLIUS_KIT_BIN: stub,
      ...env,
    },
  });
  return {
    code: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    elapsedMs: Date.now() - started,
  };
}

const USER_PROMPT_SUBMIT = {
  hook_event_name: "UserPromptSubmit",
  session_id: "sess-1",
  prompt_id: "pr-1",
  prompt: "record this",
};

const PRE_TOOL_USE = {
  hook_event_name: "PreToolUse",
  session_id: "sess-1",
  tool_name: "Task",
  tool_use_id: "tu-1",
  tool_input: { subagent_type: "test-engineer", description: "d", prompt: "p" },
};

describe("the hook wrapper never speaks on stdout", () => {
  it("sends the runner's stdout to stderr on UserPromptSubmit", () => {
    chattyStub();

    const result = runHook(USER_PROMPT_SUBMIT);

    // The whole point: this event's hook stdout is returned to the model as
    // context, so anything the launcher prints becomes an instruction-shaped
    // string nobody wrote.
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain(SENTINEL);
    expect(result.code).toBe(0);
  });

  it("sends the runner's stdout to stderr on PreToolUse too", () => {
    chattyStub();

    const result = runHook(PRE_TOOL_USE);

    // Unconditional, not per-event: a redirect that only covers the event
    // known to need it is one hooks.json edit away from not covering it.
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain(SENTINEL);
    expect(result.code).toBe(0);
  });
});

/**
 * The bound degrades to "unbounded" where no `timeout` utility exists — macOS
 * bash 3.2 ships none — so this case is skipped there rather than left to hang
 * the suite for sixty seconds and be blamed on something else.
 */
const bounder = spawnSync("sh", ["-c", "command -v timeout || command -v gtimeout"], {
  encoding: "utf8",
});
const bounded = (bounder.status ?? 1) === 0;
if (!bounded) {
  console.warn("hookScript: neither `timeout` nor `gtimeout` on PATH — bound case SKIPPED.");
}

describe("a hung runner does not hang the prompt", () => {
  (bounded ? it : it.skip)(
    "kills the runner and still reaches its own exit 0",
    () => {
      hangingStub();

      const result = runHook(USER_PROMPT_SUBMIT, { NULLIUS_WITNESS_TIMEOUT: "2" });

      // Exit 0 is the assertion that matters. A harness `timeout` key would
      // kill the script itself, and a killed script never runs its last line.
      expect(result.code).toBe(0);
      expect(result.elapsedMs).toBeLessThan(20_000);
      expect(result.stdout).toBe("");
      // Loud about it: a bound that silently records nothing is the empty
      // journal this tool exists to make impossible to misread.
      expect(result.stderr).not.toBe("");
    },
    30_000,
  );
});
