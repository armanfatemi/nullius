import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  formatReport,
  isManagedHookCommand,
  liveProof,
  probeChecks,
  runChecks,
  type Check,
} from "./doctor";

function scratch(): string {
  return mkdtempSync(join(tmpdir(), "nullius-doctor-"));
}

const REAL_PROBES = fileURLToPath(
  new URL("../../../spec/fixtures/probes/claude-code", import.meta.url),
);

function check(root: string, probeDir = join(root, "nowhere")) {
  return runChecks({ root, probeDir });
}

function find(checks: Check[], name: string): Check | undefined {
  return checks.find((entry) => entry.name.includes(name));
}

describe("doctor — hook ownership is by command path, and only that", () => {
  it("claims the kit's own shims and binary", () => {
    for (const command of [
      '".nullius/hooks/witness-record.sh"',
      "npx nullius-kit witness record",
      "node packages/kit/dist/cli.js witness record",
    ]) {
      expect(isManagedHookCommand(command), command).toBe(true);
    }
  });

  it("does not claim hooks somebody else installed", () => {
    // `--fix` may only ever modify what this matches, so a false positive here
    // means editing another tool's hook entry.
    for (const command of [
      "./scripts/precheck.sh",
      "npx some-other-tool check",
      "echo nullius",
      "node dist/cli.js",
    ]) {
      expect(isManagedHookCommand(command), command).toBe(false);
    }
  });
});

describe("doctor — a dead hook is loud", () => {
  it("fails, names the command it tried, and makes the run non-zero", () => {
    const root = scratch();
    mkdirSync(join(root, ".claude"));
    writeFileSync(
      join(root, ".claude", "settings.json"),
      JSON.stringify({
        hooks: {
          PreToolUse: [
            { matcher: "Task", hooks: [{ type: "command", command: ".nullius/hooks/gone.sh" }] },
          ],
        },
      }),
    );

    const report = check(root);
    const hook = find(report.checks, "gone.sh");

    expect(hook?.status).toBe("fail");
    expect(hook?.detail).toContain("gone.sh");
    expect(report.failed).toBe(true);
  });

  it("does NOT claim the plugin's own hooks", () => {
    const root = scratch();
    mkdirSync(join(root, ".claude"));
    writeFileSync(
      join(root, ".claude", "settings.json"),
      JSON.stringify({
        hooks: {
          SessionStart: [
            {
              hooks: [
                { type: "command", command: '"${CLAUDE_PLUGIN_ROOT}/hooks/witness-record.sh"' },
              ],
            },
          ],
        },
      }),
    );

    // The plugin delivers these and owns them. If the kit claimed them,
    // `--fix` — which may only ever modify what this matches — would start
    // editing another delivery mechanism's entries. So the kit sees no
    // managed hooks here, which is the correct answer, not a blind spot.
    expect(isManagedHookCommand('"${CLAUDE_PLUGIN_ROOT}/hooks/witness-record.sh"')).toBe(false);
    expect(find(check(root).checks, "managed hooks")?.status).toBe("fact");
  });

  it("declines to judge a KIT command whose path the harness expands", () => {
    const root = scratch();
    mkdirSync(join(root, ".claude"));
    writeFileSync(
      join(root, ".claude", "settings.json"),
      JSON.stringify({
        hooks: {
          SessionStart: [
            { hooks: [{ type: "command", command: '"${REPO}/.nullius/hooks/record.sh"' }] },
          ],
        },
      }),
    );

    // Not a pass and not a failure. The variable is expanded by the harness,
    // so resolving it from here would be a guess in either direction.
    expect(find(check(root).checks, "REPO")?.status).toBe("unknown");
  });

  it("reports unreadable settings as not checkable, never as clean", () => {
    const root = scratch();
    mkdirSync(join(root, ".claude"));
    writeFileSync(join(root, ".claude", "settings.json"), "{ not json");

    expect(find(check(root).checks, "managed hooks")?.status).toBe("unknown");
  });
});

describe("doctor — absence of evidence is labelled, not inferred", () => {
  it("calls an empty journal directory a fact about the directory", () => {
    const root = scratch();
    mkdirSync(join(root, ".nullius", "runs"), { recursive: true });

    const journals = find(check(root).checks, "journals recorded");

    expect(journals?.status).toBe("fact");
    expect(journals?.detail).toContain("not a verdict");
    // The scenario that matters: an idle repo must not look broken.
    expect(check(root).failed).toBe(false);
  });

  it("counts journals when there are some", () => {
    const root = scratch();
    mkdirSync(join(root, ".nullius", "runs"), { recursive: true });
    writeFileSync(join(root, ".nullius", "runs", "a.jsonl"), "");
    writeFileSync(join(root, ".nullius", "runs", "b.jsonl"), "");

    expect(find(check(root).checks, "journals recorded")?.detail).toContain("2 journal(s)");
  });

  it("treats a missing .nullius as the default, not a fault", () => {
    const report = check(scratch());

    expect(find(report.checks, "recording opt-in")?.status).toBe("fact");
    expect(report.failed).toBe(false);
  });
});

describe("doctor — config parsing", () => {
  it("fails on a config the kernel rejects", () => {
    const root = scratch();
    writeFileSync(join(root, "nullius.config.json"), '{"nonsenseKey": 1}');

    const report = check(root);
    expect(find(report.checks, "nullius.config.json")?.status).toBe("fail");
    expect(report.failed).toBe(true);
  });

  it("passes a config the kernel accepts", () => {
    const root = scratch();
    writeFileSync(join(root, "nullius.config.json"), '{"docs":["docs/**/*.md"]}');

    expect(find(check(root).checks, "nullius.config.json")?.status).toBe("pass");
  });
});

describe("doctor — the workflow check is about the gate, not the file", () => {
  it("fails a workflow missing fetch-depth: 0", () => {
    const root = scratch();
    mkdirSync(join(root, ".github", "workflows"), { recursive: true });
    writeFileSync(join(root, ".github", "workflows", "claims.yml"), "name: claims\non: pull_request\n");

    const workflow = find(check(root).checks, "CI workflow");
    // Without it, `git show <rev>:<path>` fails and every rev-stamped anchor
    // degrades to the advisory UNVERIFIABLE-REV — the gate stops gating and
    // stays green while doing it.
    expect(workflow?.status).toBe("fail");
    expect(workflow?.detail).toContain("UNVERIFIABLE-REV");
  });

  it("passes one that has it", () => {
    const root = scratch();
    mkdirSync(join(root, ".github", "workflows"), { recursive: true });
    writeFileSync(
      join(root, ".github", "workflows", "claims.yml"),
      "steps:\n  - uses: actions/checkout@v4\n    with:\n      fetch-depth: 0\n",
    );

    expect(find(check(root).checks, "CI workflow")?.status).toBe("pass");
  });
});

describe("doctor — the harness payload probe", () => {
  it("passes against the recordings this repo ships", () => {
    // Not a mock. These are payloads a real Claude Code session emitted, fed
    // back through the real extractor — so an upgrade that changes payload
    // shape fails here rather than producing a journal that records nothing.
    for (const result of probeChecks(REAL_PROBES)) {
      expect(result.status, `${result.name}: ${result.detail}`).toBe("pass");
    }
  });

  it("recognises the dispatch tool by the name the payload actually uses", () => {
    const results = probeChecks(REAL_PROBES);
    // The recording says `tool_name: "Agent"` where the docs say `Task`. A
    // recorder matching only the documented name recognises no dispatches.
    expect(find(results, "PreToolUse-Agent")?.detail).toContain("dispatch");
  });

  it("says it cannot check when there are no recordings, rather than passing", () => {
    const results = probeChecks(join(scratch(), "none"));

    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe("unknown");
  });

  it("fails when a payload no longer yields the record it should", () => {
    const dir = scratch();
    // A plausible harness change: the dispatch tool renamed again.
    writeFileSync(
      join(dir, "PreToolUse-Agent.json"),
      JSON.stringify({
        hook_event_name: "PreToolUse",
        tool_name: "SomethingElse",
        tool_use_id: "x",
        tool_input: { description: "d", prompt: "p" },
      }),
    );

    expect(find(probeChecks(dir), "PreToolUse-Agent")?.status).toBe("fail");
  });
});

describe("doctor — the live proof", () => {
  it("runs a payload through the recorder AND the validator", () => {
    const [proof] = liveProof();

    // A list of green configuration checks is a claim about configuration.
    // This is the only check that exercises the pipeline end to end.
    expect(proof?.status).toBe("pass");
    expect(proof?.detail).toContain("journal valid");
  });

  it("is the last check doctor runs", () => {
    const checks = check(scratch()).checks;

    expect(checks[checks.length - 1]?.name).toBe("live proof");
  });
});

describe("doctor — the report", () => {
  it("does not let a not-checkable read as a pass", () => {
    const text = formatReport({
      checks: [{ name: "x", status: "unknown", detail: "d" }],
      failed: false,
    });

    expect(text).toContain("1 not checkable from here");
    expect(text).toContain("`??` is not a pass");
  });

  it("counts each status separately, so they cannot be added together", () => {
    const text = formatReport({
      checks: [
        { name: "a", status: "pass", detail: "" },
        { name: "b", status: "fail", detail: "" },
        { name: "c", status: "unknown", detail: "" },
        { name: "d", status: "fact", detail: "" },
      ],
      failed: true,
    });

    expect(text).toContain("1 ok, 1 failing, 1 not checkable from here, 1 observation(s)");
  });
});

/**
 * Each case here was a wrong verdict a review reproduced. The predecessor took
 * "the first whitespace token containing a slash" as the binary, which picked
 * redirection targets, passed on any directory, and failed on shell forms that
 * work — four false FAILs on working installs and one false pass on a command
 * that cannot run at all.
 */
describe("doctor — hook resolution says only what it can settle", () => {
  function withHook(command: string) {
    const root = scratch();
    mkdirSync(join(root, ".claude"));
    writeFileSync(
      join(root, ".claude", "settings.json"),
      JSON.stringify({
        hooks: { PreToolUse: [{ matcher: "*", hooks: [{ type: "command", command }] }] },
      }),
    );
    return { root, checks: check(root).checks };
  }

  it("never reports pass for a directory — accessSync(dir, X_OK) succeeds", () => {
    // WAS: `ok`, printing the repo root as the resolved command.
    const { checks } = withHook("nullius-kit witness record --root ./");
    const hook = checks.find((entry) => entry.name.includes("hook command"));

    expect(hook?.status).not.toBe("pass");
  });

  it("does not mistake a redirection target for the binary", () => {
    for (const command of [
      "nullius-kit witness record >/dev/null 2>&1",
      "nullius-kit witness record 2>>/tmp/n.log",
    ]) {
      const hook = withHook(command).checks.find((entry) => entry.name.includes("hook command"));
      // The verdict must be about `nullius-kit`, never about /dev/null.
      expect(hook?.name, command).toContain("nullius-kit");
    }
  });

  it("declines to judge an UNBRACED shell variable, not just a braced one", () => {
    // WAS: braced was `??`, unbraced was a false FAIL. The repo's own plugin
    // uses the braced form, which is why only that one was handled.
    // Both forms must be MANAGED commands, or there is no check to inspect —
    // the kit claims only what its own command-path convention matches.
    for (const command of [
      'node "${CLAUDE_PROJECT_DIR}/.nullius/hooks/rec.sh" record',
      'node "$CLAUDE_PROJECT_DIR/.nullius/hooks/rec.sh" record',
    ]) {
      const hook = withHook(command).checks.find((entry) => entry.name.includes("hook command"));
      expect(hook?.status, command).toBe("unknown");
    }
  });

  it("declines to judge a home-relative path rather than failing it", () => {
    const hook = withHook("~/bin/nullius-kit witness record").checks.find((entry) =>
      entry.name.includes("hook command"),
    );

    expect(hook?.status).toBe("unknown");
  });

  it("makes a missing PATH binary LOUD, as the spec requires", () => {
    // `??` here would mean a dead hook reports exit 0. `nullius-kit` is a
    // managed command by convention and is not installed globally in test.
    const { root, checks } = withHook("nullius-kit witness record");
    const hook = checks.find((entry) => entry.name.includes("hook command"));

    expect(hook?.status).toBe("fail");
    expect(check(root).failed).toBe(true);
  });

  it("checks the executable bit whatever the shim is named", () => {
    // WAS: only enforced for `.sh`, so a non-executable shim under any other
    // name reported pass — and spec.md:66 asks for "shims executable".
    const root = scratch();
    mkdirSync(join(root, ".claude"));
    mkdirSync(join(root, ".nullius", "hooks"), { recursive: true });
    const shim = join(root, ".nullius", "hooks", "record");
    writeFileSync(shim, "#!/bin/sh\n");
    chmodSync(shim, 0o644);
    writeFileSync(
      join(root, ".claude", "settings.json"),
      JSON.stringify({
        hooks: {
          PreToolUse: [
            { matcher: "*", hooks: [{ type: "command", command: ".nullius/hooks/record" }] },
          ],
        },
      }),
    );

    const hook = check(root).checks.find((entry) => entry.name.includes("hook command"));
    expect(hook?.status).toBe("fail");
    expect(hook?.detail).toContain("not executable");
  });

  it("checks the SCRIPT when the command is an interpreter", () => {
    const root = scratch();
    mkdirSync(join(root, ".claude"));
    writeFileSync(
      join(root, ".claude", "settings.json"),
      JSON.stringify({
        hooks: {
          PreToolUse: [
            {
              matcher: "*",
              hooks: [{ type: "command", command: "node packages/kit/dist/cli.js witness record" }],
            },
          ],
        },
      }),
    );

    const hook = check(root).checks.find((entry) => entry.name.includes("hook command"));
    // node exists; the script does not. The script is what goes missing.
    expect(hook?.status).toBe("fail");
    expect(hook?.detail).toContain("cli.js");
  });
});

describe("doctor — a diagnostic must not throw on a broken repo", () => {
  it("reports rather than crashes when runs/ is not a directory", () => {
    const root = scratch();
    mkdirSync(join(root, ".nullius"));
    writeFileSync(join(root, ".nullius", "runs"), "i am a file\n");

    // The state a diagnostic exists for is exactly when an unguarded read
    // throws. Used to exit with a raw Node stack trace.
    expect(() => check(root)).not.toThrow();
    expect(check(root).checks.some((entry) => entry.status === "fail")).toBe(true);
  });

  it("reports rather than crashes when the workflow is unreadable", () => {
    const root = scratch();
    mkdirSync(join(root, ".github", "workflows"), { recursive: true });
    // A directory where the file should be — same class as EACCES, without
    // needing to chmod in a test.
    mkdirSync(join(root, ".github", "workflows", "claims.yml"));

    expect(() => check(root)).not.toThrow();
    expect(check(root).checks.find((entry) => entry.name === "CI workflow")?.status).toBe("fail");
  });
});
