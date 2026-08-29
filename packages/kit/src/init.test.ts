import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { parseConfig } from "@nullius-inverba/claims";
import { describe, expect, it } from "vitest";

import { detect, detectHarness, mayWriteHooks } from "./detect";
import { findProfile, PROFILE_NAMES } from "./profiles";
import { applyPlan, buildPlan, renderConfig, renderKitConfig, renderWorkflow } from "./render";

function scratch(): string {
  return mkdtempSync(join(tmpdir(), "nullius-init-"));
}

function plan(root: string, profileName = "specs") {
  const profile = findProfile(profileName);
  if (profile === null) throw new Error(`no profile ${profileName}`);
  return buildPlan({
    root,
    profile,
    kitVersion: "0.0.0-test",
    actionRef: "armanfatemi/nullius/action@v1",
    hookPolicy: mayWriteHooks(detectHarness(root)),
  });
}

describe("detection", () => {
  it("picks specs when openspec/ is present", () => {
    const root = scratch();
    mkdirSync(join(root, "openspec"));

    expect(detect(root).suggestedProfile).toBe("specs");
  });

  it("picks prs for a docs/ repo with no openspec/", () => {
    const root = scratch();
    mkdirSync(join(root, "docs"));

    expect(detect(root).suggestedProfile).toBe("prs");
  });

  it("falls back to plans, the smallest useful start", () => {
    expect(detect(scratch()).suggestedProfile).toBe("plans");
  });

  it("carries the reason, so the choice is auditable", () => {
    const root = scratch();
    mkdirSync(join(root, "openspec"));

    expect(detect(root).reason).toContain("openspec/");
  });
});

describe("plugin deference — one delivery mechanism per artifact", () => {
  it("never writes hooks on Claude Code, plugin or not", () => {
    const root = scratch();
    mkdirSync(join(root, ".claude"));

    expect(mayWriteHooks(detectHarness(root)).allowed).toBe(false);
  });

  it("detects an enabled plugin regardless of the marketplace it came from", () => {
    // `nullius@nullius` locally, `nullius@some-marketplace` elsewhere. Keying
    // on the whole string would miss real installs.
    for (const key of ["nullius", "nullius@nullius", "nullius@armanfatemi"]) {
      const root = scratch();
      mkdirSync(join(root, ".claude"));
      writeFileSync(
        join(root, ".claude", "settings.json"),
        JSON.stringify({ enabledPlugins: { [key]: true } }),
      );

      expect(detectHarness(root).pluginEnabled).toBe(true);
    }
  });

  it("treats unreadable settings as unknown, never as absent", () => {
    const root = scratch();
    mkdirSync(join(root, ".claude"));
    writeFileSync(join(root, ".claude", "settings.json"), "{ not json");

    const harness = detectHarness(root);
    expect(harness.settingsUnreadable).toBe(true);
    expect(harness.pluginEnabled).toBe(false);
    expect(mayWriteHooks(harness).reason).toContain("could not be parsed");
  });

  it("says so in the plan rather than omitting hooks silently", () => {
    const root = scratch();
    mkdirSync(join(root, ".claude"));

    expect(plan(root).notes.join(" ")).toContain("No hook entries written");
  });
});

describe("the plan is the unit — dry run and apply share it", () => {
  it("writes nothing until applyPlan is called", () => {
    const root = scratch();
    mkdirSync(join(root, "openspec"));

    const built = plan(root);
    expect(built.files.every((file) => file.disposition === "create")).toBe(true);
    // The plan exists and describes three creates; the directory is still bare.
    expect(() => readFileSync(join(root, "nullius.config.json"), "utf8")).toThrow();
  });

  it("creates every planned file on apply", () => {
    const root = scratch();
    const result = applyPlan(plan(root));

    expect(result.written).toContain("nullius.config.json");
    expect(result.written).toContain("nullius.kit.json");
    expect(result.written).toContain(".github/workflows/claims.yml");
  });
});

describe("idempotency", () => {
  it("re-running changes nothing", () => {
    const root = scratch();
    applyPlan(plan(root));
    const second = applyPlan(plan(root));

    expect(second.written).toEqual([]);
    // Counted from the plan rather than hardcoded, so adding an artifact to a
    // profile does not silently weaken the idempotency claim.
    expect(second.unchanged).toHaveLength(plan(root).files.length);
  });

  it("re-renders a file a user edited, because the kit owns it outright", () => {
    const root = scratch();
    applyPlan(plan(root));
    writeFileSync(join(root, "nullius.config.json"), '{"docs":["nonsense/**"]}\n');

    const second = plan(root);
    const config = second.files.find((file) => file.path === "nullius.config.json");
    expect(config?.disposition).toBe("update");
  });

  it("treats a trailing-whitespace-only difference as unchanged", () => {
    const root = scratch();
    applyPlan(plan(root));
    const path = join(root, "nullius.config.json");
    writeFileSync(path, `${readFileSync(path, "utf8").trimEnd()}\n\n\n`);

    const config = plan(root).files.find((file) => file.path === "nullius.config.json");
    expect(config?.disposition).toBe("unchanged");
  });

  it("recreates a deleted file rather than reporting it current", () => {
    const root = scratch();
    applyPlan(plan(root));
    rmSync(join(root, "nullius.config.json"));

    const replanned = plan(root);
    expect(
      replanned.files.find((file) => file.path === "nullius.config.json")?.disposition,
    ).toBe("create");
    expect(applyPlan(replanned).written).toContain("nullius.config.json");
  });

  it("rewrites a file emptied by hand", () => {
    const root = scratch();
    applyPlan(plan(root));
    writeFileSync(join(root, "nullius.config.json"), "");

    expect(applyPlan(plan(root)).written).toContain("nullius.config.json");
  });
});

describe("what init writes stays readable by the kernel", () => {
  it("emits a config the strict kernel parser accepts", () => {
    const profile = findProfile("specs");
    if (profile === null) throw new Error("no specs profile");

    expect(() => parseConfig(JSON.parse(renderConfig(profile)), "c.json")).not.toThrow();
  });

  /**
   * The predecessor of this test imported the LOCAL parseConfig and claimed it
   * showed "a kernel that predates the reservation must not choke" — which is
   * the one thing it could not show, since the local parser is the one that
   * added the key. init briefly wrote `configVersion`, and every published
   * kernel rejected it.
   *
   * So the property is asserted against the released key set directly, rather
   * than against a parser that moves with this branch.
   */
  it("writes only keys that RELEASED kernels accept", () => {
    const releasedKeys = new Set([
      "docs",
      "exclude",
      "driftWindow",
      "moments",
      "ciCaughtMoments",
    ]);

    for (const name of PROFILE_NAMES) {
      const profile = findProfile(name);
      if (profile === null) throw new Error(`no profile ${name}`);
      for (const key of Object.keys(JSON.parse(renderConfig(profile)) as object)) {
        expect(releasedKeys, `${name} writes '${key}'`).toContain(key);
      }
    }
  });

  it("sets the specs profile's docs glob to openspec", () => {
    const profile = findProfile("specs");
    if (profile === null) throw new Error("no specs profile");

    expect(parseConfig(JSON.parse(renderConfig(profile)), "c.json").docs).toEqual([
      "openspec/**/*.md",
    ]);
  });
});

describe("init does not enable payload capture", () => {
  /**
   * Scoped to `nullius.kit.json` BY NAME, and asserted against the renderer's
   * in-memory output rather than a file on disk. `init` never writes
   * `.claude/settings.json` — the file the harness actually reads env from —
   * so an assertion scoped to THAT file would be vacuously true and would
   * prove nothing about whether init had enabled capture.
   */
  for (const name of PROFILE_NAMES) {
    it(`writes no probe key for the ${name} profile`, () => {
      const profile = findProfile(name);
      if (profile === null) throw new Error(`no profile ${name}`);

      const rendered = renderKitConfig(profile, "0.0.0-test");

      expect(rendered).not.toContain("NULLIUS_WITNESS_PROBE");
      // Not only the current spelling: any key naming a probe at all, so a
      // future addition under a different name is caught by this test too.
      const keys = Object.keys(JSON.parse(rendered) as Record<string, unknown>);
      expect(keys.filter((key) => /probe/i.test(key))).toEqual([]);
    });
  }
});

describe("the generated workflow", () => {
  const profile = findProfile("specs");

  // The old version of this test passed the ref in and asserted the output
  // contained it — true of `(_, ref) => ref`. The real pin is the literal in
  // cli.ts, which is what the CLI-level test below actually exercises.
  it("interpolates whatever ref it is given, and nothing else", () => {
    if (profile === null) throw new Error("no specs profile");

    expect(renderWorkflow(profile, "acme/thing@v9")).toContain("uses: acme/thing@v9");
    expect(renderWorkflow(profile, "acme/thing@v9")).not.toContain("@main");
  });

  it("makes the specs profile's workflow able to FAIL a pull request", () => {
    if (profile === null) throw new Error("no specs profile");

    // The Action defaults strict:false, so without this the "full discipline"
    // profile produces a red PR comment and a green job.
    expect(renderWorkflow(profile, "x@v1")).toMatch(/^\s+strict: true$/m);
  });

  it("says so in the file when a profile's gate is only advisory", () => {
    const prs = findProfile("prs");
    if (prs === null) throw new Error("no prs profile");
    const yaml = renderWorkflow(prs, "x@v1");

    // The advisory NOTE mentions `strict: true` in prose, which is the point —
    // so this has to match the YAML key, not the sentence describing it.
    expect(yaml).not.toMatch(/^\s+strict: true$/m);
    expect(yaml).toContain("Advisory");
    expect(yaml).toContain("strict: true");
  });

  it("sets fetch-depth: 0, without which every rev-stamp degrades silently", () => {
    if (profile === null) throw new Error("no specs profile");

    expect(renderWorkflow(profile, "x@v1")).toContain("fetch-depth: 0");
  });

  it("carries require-markers only for the profile that asks for it", () => {
    const specs = findProfile("specs");
    const plans = findProfile("plans");
    if (specs === null || plans === null) throw new Error("missing profile");

    expect(renderWorkflow(specs, "x@v1")).toContain("require-markers: true");
    expect(renderWorkflow(plans, "x@v1")).not.toContain("require-markers");
  });
});

describe("profiles", () => {
  it("offers exactly the README's three personas", () => {
    expect(PROFILE_NAMES).toEqual(["plans", "prs", "specs"]);
  });

  it("gives every profile a config and kit-config artifact", () => {
    for (const name of PROFILE_NAMES) {
      const profile = findProfile(name);
      const paths = profile?.artifacts.map((artifact) => artifact.path) ?? [];
      expect(paths).toContain("nullius.config.json");
      expect(paths).toContain("nullius.kit.json");
    }
  });

  it("does not put a CI workflow in the plans profile — plan mode is local", () => {
    const paths = findProfile("plans")?.artifacts.map((artifact) => artifact.path) ?? [];

    expect(paths).not.toContain(".github/workflows/claims.yml");
  });
});
