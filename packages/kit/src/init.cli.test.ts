import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * `init` through its actual command surface.
 *
 * The unit tests exercise buildPlan/applyPlan directly, which left the whole
 * command path — flag parsing, root resolution, the exit code, the write-log —
 * untested. A review found four bugs and every one of them lived in exactly
 * that gap: an empty `--root` silently initialising the current directory, a
 * `--root` pointing at a file, an unguarded write dying mid-plan, and a
 * partial apply exiting 0.
 */

const CLI = fileURLToPath(new URL("../dist/cli.js", import.meta.url));

function run(...args: string[]) {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  return { code: result.status ?? 1, stdout, stderr, output: stdout + stderr };
}

function scratch(): string {
  return mkdtempSync(join(tmpdir(), "nullius-init-cli-"));
}

const built = existsSync(CLI);
const suite = built ? describe : describe.skip;
if (!built) {
  console.warn(`init.cli: ${CLI} is missing — run \`pnpm build\`. Suite SKIPPED.`);
}

suite("init — the command surface", () => {
  it("writes the profile's files and exits 0", () => {
    const root = scratch();
    const result = run("init", "--root", root, "--profile", "specs");

    expect(result.code).toBe(0);
    expect(existsSync(join(root, "nullius.config.json"))).toBe(true);
    expect(existsSync(join(root, ".nullius", "kit.json"))).toBe(true);
    expect(existsSync(join(root, ".nullius", "authoring.md"))).toBe(true);
  });

  it("is inert under --dry-run, including the directories it would create", () => {
    const root = scratch();
    const result = run("init", "--root", root, "--profile", "specs", "--dry-run");

    expect(result.code).toBe(0);
    expect(readdirSync(root)).toEqual([]);
  });

  it("reports every file as already current on a second run", () => {
    const root = scratch();
    run("init", "--root", root, "--profile", "specs");
    const second = run("init", "--root", root, "--profile", "specs");

    expect(second.code).toBe(0);
    expect(second.stdout).toContain("0 written");
    expect(second.stdout).not.toContain("1 written");
  });

  it("accepts --yes as inert, because init never prompts", () => {
    expect(run("init", "--root", scratch(), "--profile", "plans", "--yes").code).toBe(0);
  });

  it("rejects an unknown profile by name", () => {
    const result = run("init", "--root", scratch(), "--profile", "nonsense");

    expect(result.code).toBe(2);
    expect(result.output).toContain("unknown profile: nonsense");
  });

  it("rejects an unknown flag rather than ignoring it", () => {
    const result = run("init", "--root", scratch(), "--bogus");

    expect(result.code).toBe(2);
    expect(result.output).toContain("unknown flag");
  });
});

suite("init — refusing to guess about --root", () => {
  it("refuses an EMPTY --root instead of using the current directory", () => {
    // `--root "$REPO"` with REPO unset. resolve("") is process.cwd(), so this
    // silently initialised whatever directory the shell happened to be in.
    const result = run("init", "--root", "", "--profile", "plans", "--dry-run");

    expect(result.code).toBe(2);
    expect(result.output).toContain("refusing to fall back");
  });

  it("refuses a --root that exists but is a file", () => {
    const root = scratch();
    const file = join(root, "afile.txt");
    writeFileSync(file, "not a directory\n");

    const result = run("init", "--root", file, "--profile", "plans");

    expect(result.code).toBe(2);
    expect(result.output).toContain("not a directory");
  });

  it("refuses a --root that does not exist", () => {
    const result = run("init", "--root", join(scratch(), "nope"), "--profile", "plans");

    expect(result.code).toBe(2);
    expect(result.output).toContain("no such directory");
  });
});

suite("init — a failed write is reported, never swallowed", () => {
  it("exits non-zero and names the file when .nullius is a FILE", () => {
    const root = scratch();
    writeFileSync(join(root, ".nullius"), "i am a file\n");

    const result = run("init", "--root", root, "--profile", "plans");

    // Used to die on an unguarded mkdirSync with a raw stack trace, after
    // having already written nullius.config.json — a partial apply the user
    // had no record of.
    expect(result.code).toBe(1);
    expect(result.output).toContain("FAILED");
    expect(result.output).toContain(".nullius/kit.json");
    expect(result.output).not.toContain("at applyPlan");
  });

  it("still reports what DID land, so a partial apply is legible", () => {
    const root = scratch();
    writeFileSync(join(root, ".nullius"), "i am a file\n");

    const result = run("init", "--root", root, "--profile", "plans");

    expect(result.stdout).toContain("1 written");
    expect(result.stdout).toContain("2 failed");
    expect(existsSync(join(root, "nullius.config.json"))).toBe(true);
  });
});

suite("init — plugin steps are surfaced by every profile", () => {
  // The kit refuses to write hooks on Claude Code because the plugin owns
  // them. A profile that declines to write them AND never says how to get
  // them leaves the user with neither, which two of the three profiles did.
  for (const profile of ["plans", "prs", "specs"]) {
    it(`tells a ${profile} user how to install the plugin`, () => {
      const root = scratch();
      mkdirSync(join(root, ".claude"));
      const result = run("init", "--root", root, "--profile", profile, "--dry-run");

      expect(result.stdout).toContain("/plugin install nullius@nullius");
    });
  }

  it("explains the hook omission rather than being silent about it", () => {
    const root = scratch();
    mkdirSync(join(root, ".claude"));

    expect(run("init", "--root", root, "--profile", "specs", "--dry-run").stdout).toContain(
      "No hook entries written",
    );
  });
});

suite("init — the action ref is pinned at the call site", () => {
  it("emits a pinned ref, never a moving one", () => {
    const root = scratch();
    run("init", "--root", root, "--profile", "specs");

    const yaml = readdirSync(join(root, ".github", "workflows"));
    expect(yaml).toContain("claims.yml");

    const contents = spawnSync("cat", [join(root, ".github", "workflows", "claims.yml")], {
      encoding: "utf8",
    }).stdout;
    // The literal lives in cli.ts; renderWorkflow only interpolates, so this
    // is the only test that pins the real default.
    expect(contents).toContain("armanfatemi/nullius/action@v1");
    expect(contents).not.toContain("action@main");
  });
});

suite("doctor — the command surface", () => {
  it("exits 0 on a repo with nothing wrong", () => {
    const result = run("doctor", "--root", scratch());

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("live proof");
  });

  it("ends with the live proof, not with a list of green checks", () => {
    const lines: string[] = run("doctor", "--root", scratch()).stdout.trimEnd().split("\n");
    const isCheckLine = (line: string): boolean => /^\s{2}(ok|--|\?\?)\s/.test(line);
    const proofIndex = lines.findIndex((line) => line.includes("live proof"));

    let lastCheck = -1;
    for (let index = 0; index < lines.length; index += 1) {
      if (isCheckLine(lines[index] ?? "")) lastCheck = index;
    }

    expect(proofIndex).toBeGreaterThanOrEqual(0);
    expect(proofIndex).toBe(lastCheck);
  });

  it("exits 1 when a managed hook's command does not resolve", () => {
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

    const result = run("doctor", "--root", root);

    expect(result.code).toBe(1);
    expect(result.output).toContain("gone.sh");
  });

  it("stays green on an idle repo with an empty journal directory", () => {
    const root = scratch();
    mkdirSync(join(root, ".nullius", "runs"), { recursive: true });

    const result = run("doctor", "--root", root);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("not a verdict");
  });

  it("refuses an empty --root, like init", () => {
    expect(run("doctor", "--root", "").code).toBe(2);
  });

  it("rejects an unknown flag", () => {
    const result = run("doctor", "--root", scratch(), "--bogus");

    expect(result.code).toBe(2);
    expect(result.output).toContain("unknown flag");
  });
});

suite("doctor --fix", () => {
  it("re-renders a managed artifact someone edited", () => {
    const root = scratch();
    mkdirSync(join(root, "openspec"));
    run("init", "--root", root, "--profile", "specs");
    writeFileSync(join(root, "nullius.config.json"), '{"docs":["WRONG/**"]}\n');

    const result = run("doctor", "--root", root, "--fix");

    expect(result.stdout).toContain("Re-rendering");
    expect(readFileSync(join(root, "nullius.config.json"), "utf8")).toContain("openspec/**/*.md");
  });

  it("re-renders using the profile a previous init recorded", () => {
    const root = scratch();
    // No openspec/ here, so detection alone would say `plans`. kit.json is
    // what makes --fix reproduce the profile actually installed.
    run("init", "--root", root, "--profile", "specs");
    rmSync(join(root, ".github", "workflows", "claims.yml"));

    run("doctor", "--root", root, "--fix");

    expect(existsSync(join(root, ".github", "workflows", "claims.yml"))).toBe(true);
  });

  it("does not touch a hook entry it does not own", () => {
    const root = scratch();
    mkdirSync(join(root, ".claude"));
    const settings = JSON.stringify({
      hooks: {
        PreToolUse: [
          { matcher: "Bash", hooks: [{ type: "command", command: "./scripts/theirs.sh" }] },
        ],
      },
    });
    writeFileSync(join(root, ".claude", "settings.json"), settings);

    run("doctor", "--root", root, "--fix");

    // Byte-identical. --fix owns artifacts matching the kit's command-path
    // convention and nothing else; the kit writes no hooks at all.
    expect(readFileSync(join(root, ".claude", "settings.json"), "utf8")).toBe(settings);
  });
});
