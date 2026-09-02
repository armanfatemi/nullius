import { chmodSync, mkdirSync, mkdtempSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  formatReport,
  isManagedHookCommand,
  liveProof,
  probeChecks,
  runChecks,
  type Check,
} from "./doctor";

import { SCHEMA_VERSION } from "./journalFile";

function scratch(): string {
  return mkdtempSync(join(tmpdir(), "nullius-doctor-"));
}

const REAL_PROBES = fileURLToPath(
  new URL("../../../spec/fixtures/probes/claude-code", import.meta.url),
);

function check(
  root: string,
  probeDir = join(root, "nowhere"),
  userSettingsPath = join(root, "nowhere-user-settings.json"),
) {
  return runChecks({ root, probeDir, userSettingsPath });
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

  it("routes the reader through live capture to the corpus, naming both directories", () => {
    // The old text said "capture some with NULLIUS_WITNESS_PROBE=1" while
    // naming the committed corpus — but that variable writes to
    // `.nullius/probes/`, so following the instruction populated a different
    // directory than the one the message pointed at. That conflation is the
    // misreading this change exists to prevent, so the corrected text is
    // pinned here rather than left to drift back.
    const dir = join(scratch(), "none");
    const detail = probeChecks(dir)[0]?.detail ?? "";

    expect(detail).toContain(dir);
    expect(detail).toContain("committed corpus");
    expect(detail).toContain(".nullius/probes/");
    expect(detail).toContain("promoted");
    expect(detail).not.toContain("capture some with NULLIUS_WITNESS_PROBE=1");
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

/**
 * The capture-state check.
 *
 * Every assertion here is on the message rather than only the status. The
 * check's whole job is to say what it read without concluding anything about
 * what it did not read, and a status alone cannot tell those apart: "no file
 * sets the variable" and "capture is off" are the same `--` and different
 * claims.
 */
describe("doctor — what the settings files say about payload capture", () => {
  function writeSettings(path: string, contents: unknown): void {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, typeof contents === "string" ? contents : JSON.stringify(contents));
  }

  function liveProbe(root: string, name: string, at: Date): void {
    const dir = join(root, ".nullius", "probes");
    mkdirSync(dir, { recursive: true });
    const file = join(dir, name);
    writeFileSync(file, "{}\n");
    utimesSync(file, at, at);
  }

  function captureCheck(root: string, userSettingsPath?: string): Check | undefined {
    return check(root, undefined, userSettingsPath).checks.find(
      (entry) => entry.name === "payload capture",
    );
  }

  // Whole seconds, so the value survives the round trip through
  // `utimesSync` exactly and the assertion is not a float-precision coin flip.
  const NEWEST = new Date("2026-02-03T04:05:06.000Z");

  it("names the file that enables capture and the payloads held, as a fact", () => {
    const root = scratch();
    writeSettings(join(root, ".claude", "settings.local.json"), {
      env: { NULLIUS_WITNESS_PROBE: "1" },
    });
    liveProbe(root, "PreToolUse-Agent.json", new Date("2025-12-25T00:00:00.000Z"));
    liveProbe(root, "SubagentStop.json", NEWEST);

    const result = captureCheck(root);

    expect(result?.status).toBe("fact");
    expect(result?.detail).toContain(".claude/settings.local.json");
    expect(result?.detail).toContain("enables capture");
    expect(result?.detail).toContain("NULLIUS_WITNESS_PROBE=1");
    expect(result?.detail).toContain("2 payload");
    // ISO-8601 UTC, not toLocaleString: a detail string that reads differently
    // on the author's machine cannot be asserted anywhere else.
    expect(result?.detail).toContain("2026-02-03T04:05:06.000Z");
    expect(result?.detail).toMatch(
      /most recently written \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/,
    );
    // The directory named is the live one, said so it cannot be read as the
    // committed corpus a different check reports on.
    expect(result?.detail).toContain(".nullius/probes/");
    expect(result?.detail).toContain("not the committed probe corpus");
    expect(check(root).failed).toBe(false);
  });

  it("says the same thing about an absent live directory and an empty one", () => {
    const absent = scratch();
    const empty = scratch();
    mkdirSync(join(empty, ".nullius", "probes"), { recursive: true });
    // Same path for both, so the live directory is the only thing that differs.
    const userSettingsPath = join(scratch(), "settings.json");

    // Zero payloads held is zero payloads held. Asserted once, here, so the
    // rest of this suite does not have to carry both columns.
    expect(captureCheck(empty, userSettingsPath)?.detail).toBe(
      captureCheck(absent, userSettingsPath)?.detail,
    );
    expect(captureCheck(absent, userSettingsPath)?.detail).toContain("holds no payloads");
  });

  it("reports any value other than 1 as that file disabling capture", () => {
    const root = scratch();
    writeSettings(join(root, ".claude", "settings.json"), {
      env: { NULLIUS_WITNESS_PROBE: "0" },
    });

    const result = captureCheck(root);

    expect(result?.status).toBe("fact");
    expect(result?.detail).toContain(".claude/settings.json");
    expect(result?.detail).toContain("disables capture");
    expect(result?.detail).toContain("NULLIUS_WITNESS_PROBE=0");
    expect(check(root).failed).toBe(false);
  });

  it("where no file sets it, names what it checked and refuses to say capture is off", () => {
    const root = scratch();
    const userSettingsPath = join(scratch(), "settings.json");
    writeSettings(join(root, ".claude", "settings.json"), { env: { NULLIUS_KIT_BIN: "x" } });

    const result = captureCheck(root, userSettingsPath);

    expect(result?.status).toBe("fact");
    expect(result?.detail).toContain(".claude/settings.local.json");
    expect(result?.detail).toContain(".claude/settings.json");
    expect(result?.detail).toContain(userSettingsPath);
    expect(result?.detail).toContain("NULLIUS_WITNESS_PROBE");
    // Scoped to what this check read. A bare "no settings file sets it" leads
    // with a quantifier over every settings file that exists, which is not a
    // claim three `existsSync` calls entitle it to make.
    expect(result?.detail).toContain("no settings file this check could parse sets");
    expect(result?.detail).toContain("capture may still be enabled by sources this check does not read");
    expect(result?.detail).toContain("launched the harness");
    // "capture is off" is not a checkable claim for the same reason "capture
    // is on" is not — both quantify over sources this check never read.
    expect(result?.detail).not.toMatch(/capture is off|not capturing|capture is disabled/i);
  });

  it("reports payloads held while no file enables capture, and never calls them stale", () => {
    const root = scratch();
    liveProbe(root, "SubagentStop.json", NEWEST);

    const result = captureCheck(root);

    // Payloads that look like coverage. The count and the write time are
    // facts; "stale" would be a claim that capture has stopped, which this
    // check cannot make.
    expect(result?.status).toBe("fact");
    expect(result?.detail).toContain("1 payload");
    expect(result?.detail).toContain("2026-02-03T04:05:06.000Z");
    expect(result?.detail).not.toMatch(/stale|not being refreshed|no longer/i);
  });

  it("is unknown only when nothing could be established, and names the file it could not parse", () => {
    const root = scratch();
    writeSettings(join(root, ".claude", "settings.local.json"), "{ not json");

    const result = captureCheck(root);

    expect(result?.status).toBe("unknown");
    expect(result?.detail).toContain(".claude/settings.local.json");
    expect(result?.detail).toContain("NULLIUS_WITNESS_PROBE");
    expect(result?.detail).toContain("holds no payloads");
    expect(check(root).failed).toBe(false);

    // This row is NOT directory-invariant. Held payloads are reported wherever
    // they are held — the requirement is unconditional, and a settings file
    // that does not parse says nothing about what is on disk. The earlier
    // version of this test pinned the omission as a deliberate collapse, which
    // made a spec violation permanent.
    const withPayloads = scratch();
    writeSettings(join(withPayloads, ".claude", "settings.local.json"), "{ not json");
    liveProbe(withPayloads, "SubagentStop.json", NEWEST);

    const held = captureCheck(withPayloads);

    expect(held?.status).toBe("unknown");
    expect(held?.detail).toContain("1 payload");
    expect(held?.detail).toContain("2026-02-03T04:05:06.000Z");
    expect(held?.detail).not.toMatch(/stale|not being refreshed|no longer/i);
  });

  it("still names every file it read, and the sources it did not, when one does not parse", () => {
    const root = scratch();
    const userSettingsPath = join(scratch(), "settings.json");
    writeSettings(join(root, ".claude", "settings.local.json"), "{ not json");

    const result = captureCheck(root, userSettingsPath);

    expect(result?.status).toBe("unknown");
    // This branch used to close on "and no other settings file sets it" — an
    // unhedged claim over settings files, which a reader takes as "capture is
    // off unless that broken file turns it on". The forbidden-phrase patterns
    // never fired on it, because the sentence meant it without saying it.
    expect(result?.detail).toContain(".claude/settings.json");
    expect(result?.detail).toContain(userSettingsPath);
    expect(result?.detail).toContain(
      "capture may still be enabled by sources this check does not read",
    );
    expect(result?.detail).toContain("launched the harness");
    expect(result?.detail).not.toContain("no other settings file sets it");
    expect(result?.detail).not.toMatch(/capture is off|not capturing|capture is disabled/i);
  });

  it("reports the user settings file as not supplied rather than dropping it", () => {
    // The `check()` helper always supplies a path, so the undefined case is
    // only reachable through `runChecks` directly. Dropped silently, the
    // message still speaks of "the files checked" while one of them is absent
    // from the list.
    const root = scratch();

    const result = runChecks({ root, probeDir: join(root, "nowhere") }).checks.find(
      (entry) => entry.name === "payload capture",
    );

    expect(result?.status).toBe("fact");
    expect(result?.detail).toContain("user settings file");
    expect(result?.detail).toContain("not supplied");
  });

  it("does not make the report unknown for a settings file that is merely absent", () => {
    // Absence is an observation; unreadability is a failure to determine.
    expect(captureCheck(scratch())?.status).toBe("fact");
  });

  it("names both files and both values when two disagree, and declares no winner", () => {
    const root = scratch();
    const userSettingsPath = join(scratch(), "settings.json");
    writeSettings(userSettingsPath, { env: { NULLIUS_WITNESS_PROBE: "1" } });
    writeSettings(join(root, ".claude", "settings.local.json"), {
      env: { NULLIUS_WITNESS_PROBE: "0" },
    });

    const result = captureCheck(root, userSettingsPath);

    expect(result?.status).toBe("fact");
    expect(result?.detail).toContain(userSettingsPath);
    expect(result?.detail).toContain(".claude/settings.local.json");
    expect(result?.detail).toContain("enables capture");
    expect(result?.detail).toContain("disables capture");
    expect(result?.detail).toContain("does not adjudicate precedence");
    // Nothing in this repository establishes the harness's ordering, so a
    // deciding file would be an ungrounded claim about external behaviour.
    expect(result?.detail).not.toMatch(/\bwins\b|takes effect|effective value|overrides/i);
  });

  it("reads each of the three settings files as a sole setter", () => {
    // So nothing passes by only ever consulting two of them.
    const cases: { label: string; path: (root: string, user: string) => string }[] = [
      { label: ".claude/settings.local.json", path: (root) => join(root, ".claude", "settings.local.json") },
      { label: ".claude/settings.json", path: (root) => join(root, ".claude", "settings.json") },
      { label: "user", path: (_root, user) => user },
    ];

    for (const { label, path } of cases) {
      const root = scratch();
      const userSettingsPath = join(scratch(), "settings.json");
      writeSettings(path(root, userSettingsPath), { env: { NULLIUS_WITNESS_PROBE: "1" } });

      const result = captureCheck(root, userSettingsPath);

      expect(result?.status, label).toBe("fact");
      expect(result?.detail, label).toContain(label === "user" ? userSettingsPath : label);
      expect(result?.detail, label).toContain("enables capture");
    }
  });

  it("keeps a determinate read when a different file does not parse", () => {
    const root = scratch();
    writeSettings(join(root, ".claude", "settings.local.json"), "{ not json");
    writeSettings(join(root, ".claude", "settings.json"), {
      env: { NULLIUS_WITNESS_PROBE: "1" },
    });

    const result = captureCheck(root);

    // `unknown` is for when nothing could be established, not for when
    // something could and something else could not.
    expect(result?.status).toBe("fact");
    expect(result?.detail).toContain(".claude/settings.json");
    expect(result?.detail).toContain("enables capture");
    expect(result?.detail).toContain("could not parse");
    expect(result?.detail).toContain(".claude/settings.local.json");
  });

  it("never reads doctor's own environment", () => {
    // The variable governs the hook subprocess. `doctor` runs in the
    // operator's shell, so its own environment answers a different question.
    const previous = process.env["NULLIUS_WITNESS_PROBE"];
    process.env["NULLIUS_WITNESS_PROBE"] = "1";
    try {
      const result = captureCheck(scratch());

      expect(result?.detail).toContain(
        "no settings file this check could parse sets NULLIUS_WITNESS_PROBE",
      );
      expect(result?.detail).not.toContain("enables capture");
    } finally {
      if (previous === undefined) delete process.env["NULLIUS_WITNESS_PROBE"];
      else process.env["NULLIUS_WITNESS_PROBE"] = previous;
    }
  });

  it("runs before the live proof", () => {
    const checks = check(scratch()).checks;
    const captureAt = checks.findIndex((entry) => entry.name === "payload capture");
    const proofAt = checks.findIndex((entry) => entry.name === "live proof");

    // Compared by name, not by a fixed offset: `checks[length - 2]` breaks the
    // moment any check lands between them, and the live-proof assertion
    // elsewhere in this file catches a misplacement only as a side effect,
    // under a name that sends the reader to debug `liveProof`.
    expect(captureAt).toBeGreaterThanOrEqual(0);
    expect(proofAt).toBeGreaterThanOrEqual(0);
    expect(captureAt).toBeLessThan(proofAt);
  });
});

describe("captureChecks — the quantifier does not include what it could not read", () => {
  it("does not claim over a file it just said it could not parse", () => {
    const root = scratch();
    mkdirSync(join(root, ".claude"), { recursive: true });
    writeFileSync(join(root, ".claude", "settings.local.json"), "{ not json");

    const detail = find(check(root).checks, "payload capture")?.detail ?? "";

    // "no settings file this check READ sets it" quantifies over a set that
    // includes the unparseable file — asserting a value for the one file the
    // same sentence calls undetermined. "could parse" excludes it.
    expect(detail).toContain("no settings file this check could parse sets it");
    expect(detail).not.toContain("this check read sets");
  });

  it("never renders a file that sets the variable as setting nothing", () => {
    const root = scratch();
    mkdirSync(join(root, ".claude"), { recursive: true });
    writeFileSync(
      join(root, ".claude", "settings.json"),
      JSON.stringify({ env: { NULLIUS_WITNESS_PROBE: "1" } }),
    );

    const detail = find(check(root).checks, "payload capture")?.detail ?? "";

    // stateOf() is only ever called where no file sets the variable. That
    // invariant lives in the caller, not the type, so assert the safe
    // rendering directly rather than trusting the call site to stay put.
    expect(detail).toContain("enables capture");
    expect(detail).not.toContain(".claude/settings.json (sets nothing)");
  });
});

describe("doctor — what the settings files say about prompt recording", () => {
  function promptCheck(root: string): Check | undefined {
    return check(root).checks.find((entry) => entry.name === "prompt recording");
  }

  it("reports the default as recorded, scoped to what it could read", () => {
    const result = promptCheck(scratch());

    // A fact, never a verdict: which of the two modes is correct is the
    // operator's privacy decision, and there is nothing here to pass or fail.
    expect(result?.status).toBe("fact");
    expect(result?.detail).toContain("prompts: recorded");
    // Scoped, because a shell export into the harness is invisible from here.
    // "prompts are recorded" would be a claim about the running harness made
    // from three file reads.
    expect(result?.detail).toContain("unless the harness's environment says otherwise");
  });

  it("names the file that turns prompt text off, and calls it hashed only", () => {
    const root = scratch();
    mkdirSync(join(root, ".claude"), { recursive: true });
    writeFileSync(
      join(root, ".claude", "settings.json"),
      JSON.stringify({ env: { NULLIUS_WITNESS_PROMPTS: "0" } }),
    );

    const result = promptCheck(root);

    expect(result?.status).toBe("fact");
    expect(result?.detail).toContain(".claude/settings.json says prompts: hashed only");
  });

  it("reports a file that sets any other value as recording text", () => {
    const root = scratch();
    mkdirSync(join(root, ".claude"), { recursive: true });
    writeFileSync(
      join(root, ".claude", "settings.json"),
      JSON.stringify({ env: { NULLIUS_WITNESS_PROMPTS: "1" } }),
    );

    // The recorder's rule is "anything but exactly 0 records the text", and
    // this check has to state the same rule rather than a friendlier one.
    expect(promptCheck(root)?.detail).toContain("prompts: recorded");
  });

  it("is not checkable when the only settings file will not parse", () => {
    const root = scratch();
    mkdirSync(join(root, ".claude"), { recursive: true });
    writeFileSync(join(root, ".claude", "settings.local.json"), "{ not json");

    expect(promptCheck(root)?.status).toBe("unknown");
  });

  it("runs before the live proof", () => {
    const checks = check(scratch()).checks;
    const promptAt = checks.findIndex((entry) => entry.name === "prompt recording");
    const proofAt = checks.findIndex((entry) => entry.name === "live proof");

    expect(promptAt).toBeGreaterThanOrEqual(0);
    expect(promptAt).toBeLessThan(proofAt);
  });
});

describe("doctor — the managed-hooks check knows which events this build records", () => {
  function settings(root: string, event: string): void {
    mkdirSync(join(root, ".claude"), { recursive: true });
    writeFileSync(
      join(root, ".claude", "settings.json"),
      JSON.stringify({
        hooks: {
          [event]: [{ hooks: [{ type: "command", command: "npx nullius-kit witness record" }] }],
        },
      }),
    );
  }

  it("says nothing extra about UserPromptSubmit, which this build records", () => {
    const root = scratch();
    settings(root, "UserPromptSubmit");

    const entry = find(check(root).checks, "UserPromptSubmit");

    expect(entry).toBeDefined();
    expect(entry?.detail).not.toContain("does not read");
  });

  it("notes a hook wired to an event nothing here reads", () => {
    const root = scratch();
    settings(root, "PreCompact");

    // The hook runs perfectly and records nothing, and the only symptom is an
    // absence — which is the failure doctor exists to make loud. Still not a
    // failure: a newer kit may read it, and calling that a fault would be a
    // claim about a build this tool is not running.
    const entry = find(check(root).checks, "PreCompact");

    expect(entry?.detail).toContain("this build's recorder does not read PreCompact");
    expect(entry?.status).not.toBe("fail");
  });
});

describe("doctor — the live proof runs the version the producer writes", () => {
  it("validates a journal at the kit's own schema version, not a frozen one", () => {
    const proof = liveProof()[0];

    // A hardcoded version here is how the live proof came to certify 0.2
    // journals long after the producer had moved: a green round trip against a
    // floor nothing in the tree writes any more.
    expect(proof?.status).toBe("pass");
    expect(SCHEMA_VERSION).toBe("0.6");
  });
});

describe("the run report check pairs the config against the workflow", () => {
  function workflow(root: string, body: string): void {
    mkdirSync(join(root, ".github", "workflows"), { recursive: true });
    writeFileSync(join(root, ".github", "workflows", "claims.yml"), body);
  }

  const WITH_INPUT = "on: pull_request\n      - uses: a/b@v1\n        with:\n          fetch-depth: 0\n          run-report: true\n";
  const WITHOUT_INPUT = "on: pull_request\n      - uses: a/b@v1\n        with:\n          fetch-depth: 0\n";

  it("is a fact, not a failure, when there is no kit config at all", () => {
    const root = scratch();

    const result = find(check(root).checks, "run report");

    // Most repositories never commit an envelope. Reporting a problem here
    // would train a reader to skim the section that matters.
    expect(result?.status).toBe("fact");
    expect(result?.detail).toContain("no nullius.kit.json");
  });

  it("is a fact when the config exists and does not ask", () => {
    const root = scratch();
    writeFileSync(join(root, "nullius.kit.json"), JSON.stringify({ profile: "specs" }));
    workflow(root, WITHOUT_INPUT);

    expect(find(check(root).checks, "run report")?.status).toBe("fact");
  });

  it("passes when the config asks and the workflow carries the input", () => {
    const root = scratch();
    writeFileSync(
      join(root, "nullius.kit.json"),
      JSON.stringify({ profile: "specs", runReport: true }),
    );
    workflow(root, WITH_INPUT);

    expect(find(check(root).checks, "run report")?.status).toBe("pass");
  });

  it("FAILS when the config asks and a hand-edited workflow dropped the input", () => {
    const root = scratch();
    writeFileSync(
      join(root, "nullius.kit.json"),
      JSON.stringify({ profile: "specs", runReport: true }),
    );
    workflow(root, WITHOUT_INPUT);

    const result = find(check(root).checks, "run report");

    // The whole reason the check exists: the repository believes it gets a run
    // report on every pull request and does not, and nothing else would say so.
    expect(result?.status).toBe("fail");
    expect(result?.detail).toContain("silently go without one");
  });

  it("refuses a non-boolean `runReport` rather than coercing it", () => {
    const root = scratch();
    writeFileSync(
      join(root, "nullius.kit.json"),
      JSON.stringify({ profile: "specs", runReport: "true" }),
    );
    workflow(root, WITH_INPUT);

    const result = find(check(root).checks, "run report");

    // `"true"` read as true would let the config mean something its author did
    // not write, and the check would then report agreement it had guessed at.
    expect(result?.status).toBe("fail");
    expect(result?.detail).toContain("must be a boolean or absent");
  });
});
