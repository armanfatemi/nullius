import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { appendEvidence, blockedCommands, classifyCompareStatus, isSafeChangeName, parseDependsOn, KERNEL_MODULES, readState, routeAgents, routePathsFrom, runPipeline, statePath, touchedPaths, unapprovedBlocks, writeStateKey } from "./pipeline";

describe("parseDependsOn — the blockquote intent-to-proposal writes", () => {
  it("extracts backticked change names", () => {
    const doc = "# Proposal\n\n> **Depends on:** `add-rules-compliance`, `add-probe-visibility` — one line each.\n";
    expect(parseDependsOn(doc)).toEqual(["add-rules-compliance", "add-probe-visibility"]);
  });

  it("reads None as no dependencies", () => {
    expect(parseDependsOn("> **Depends on:** None\n")).toEqual([]);
  });

  it("does not lose a dependency whose name contains a word boundary hit", () => {
    // Hyphens are word boundaries, so a `\bnone\b` guard applied to the whole
    // segment swallows this dependency — failing open on a fail-closed gate.
    expect(parseDependsOn("> **Depends on:** `add-none-checking`")).toEqual(["add-none-checking"]);
  });

  it("does not mistake the template's trailing prose for a dependency", () => {
    // The template sentence contains the word None *after* the em-dash. A
    // parser that scans the whole line returns [] for a real dependency list.
    const doc = '> **Depends on:** `add-journal-sealing` — write "None" if there are no hard prerequisites.\n';
    expect(parseDependsOn(doc)).toEqual(["add-journal-sealing"]);
  });

  it("returns empty when the blockquote is absent", () => {
    expect(parseDependsOn("# Proposal\n\n## Problem\n")).toEqual([]);
  });
});

describe("classifyCompareStatus — MERGED is not proof of reaching main", () => {
  it("treats identical and behind as landed", () => {
    expect(classifyCompareStatus("identical")).toBe("landed");
    expect(classifyCompareStatus("behind")).toBe("landed");
  });

  it("treats ahead and diverged as orphaned", () => {
    expect(classifyCompareStatus("ahead")).toBe("orphaned");
    expect(classifyCompareStatus("diverged")).toBe("orphaned");
  });

  it("treats anything else as unknown, never as landed", () => {
    for (const value of ["", "weird", "MERGED"]) {
      expect(classifyCompareStatus(value)).toBe("unknown");
    }
  });
});

describe("isSafeChangeName — a change name reaches a filesystem path", () => {
  it("accepts ordinary change names", () => {
    expect(isSafeChangeName("add-wiring-malformed-input")).toBe(true);
  });

  it("refuses traversal and separators", () => {
    for (const value of ["../etc", "a/b", "", ".", "..", "a\0b"]) {
      expect(isSafeChangeName(value), value).toBe(false);
    }
  });
});

describe("touchedPaths — repo-relative paths a change names", () => {
  it("finds backticked source and spec paths", () => {
    const doc = "Touches `packages/claims/src/wiring.ts` and `spec/wiring.md` today.";
    expect(touchedPaths(doc)).toEqual(["packages/claims/src/wiring.ts", "spec/wiring.md"]);
  });

  it("deduplicates and sorts", () => {
    const doc = "`spec/a.md` `packages/kit/src/doctor.ts` `spec/a.md`";
    expect(touchedPaths(doc)).toEqual(["packages/kit/src/doctor.ts", "spec/a.md"]);
  });

  it("ignores prose that is not a path", () => {
    expect(touchedPaths("the `Verdict` union and `isFailure`")).toEqual([]);
  });
});

describe("routeAgents — one assertion per row, by name", () => {
  it("always dispatches rule-auditor, because rule selection is the kernel's job", () => {
    expect(routeAgents([])).toEqual(["rule-auditor"]);
  });

  it("dispatches checker-engineer for each kernel module and no others", () => {
    for (const module of KERNEL_MODULES) {
      expect(routeAgents([module]), module).toContain("checker-engineer");
    }
    expect(routeAgents(["packages/claims/src/parseClaims.ts"])).not.toContain("checker-engineer");
  });

  it("dispatches test-engineer for package sources", () => {
    expect(routeAgents(["packages/kit/src/doctor.ts"])).toContain("test-engineer");
    expect(routeAgents(["packages/claims/src/parseClaims.ts"])).toContain("test-engineer");
  });

  it("dispatches test-engineer for fixtures and workflows", () => {
    expect(routeAgents(["spec/fixtures/valid-run.jsonl"])).toContain("test-engineer");
    expect(routeAgents([".github/workflows/ci.yml"])).toContain("test-engineer");
  });

  it("dispatches architecture-reviewer for the spec family and openspec", () => {
    for (const path of ["spec/wiring.md", "CLAUDE.md", "README.md", "openspec/project.md"]) {
      expect(routeAgents([path]), path).toContain("architecture-reviewer");
    }
  });

  it("dispatches all four for a kernel change", () => {
    expect(routeAgents(["packages/claims/src/wiring.ts", "spec/wiring.md"])).toEqual([
      "architecture-reviewer",
      "checker-engineer",
      "rule-auditor",
      "test-engineer",
    ]);
  });

  it("dispatches only two for a docs-only change", () => {
    expect(routeAgents(["docs/adopting-the-pipeline.md", "openspec/project.md"])).toEqual([
      "architecture-reviewer",
      "rule-auditor",
    ]);
  });
});

describe("routeAgents — basename matching, because this repo's proposals cite files by basename", () => {
  it("dispatches checker-engineer for each kernel module cited by bare filename", () => {
    for (const basename of ["checkClaims.ts", "config.ts", "wiring.ts", "witness.ts"]) {
      expect(routeAgents([basename]), basename).toContain("checker-engineer");
    }
  });

  it("dispatches test-engineer but not checker-engineer for a non-kernel bare filename", () => {
    const agents = routeAgents(["cli.ts"]);
    expect(agents).toContain("test-engineer");
    expect(agents).not.toContain("checker-engineer");
  });

  it("dispatches architecture-reviewer for the bare project.md citation, not only openspec/project.md", () => {
    expect(routeAgents(["project.md"])).toContain("architecture-reviewer");
  });
});

describe("routePathsFrom — Stage 6 routes the diff, not prose", () => {
  it("routes a kernel module path to checker-engineer", () => {
    expect(routePathsFrom("packages/claims/src/wiring.ts\n")).toContain("checker-engineer");
  });

  it("produces no spurious empty path from blank lines or a trailing newline", () => {
    expect(routePathsFrom("\n\n\n")).toEqual(["rule-auditor"]);
    expect(routePathsFrom("packages/claims/src/wiring.ts\n\n")).toEqual(
      routeAgents(["packages/claims/src/wiring.ts"]),
    );
  });

  it("routes a real path with no backticks — touchedPaths would drop it, routePathsFrom must not", () => {
    const raw = "packages/claims/src/wiring.ts";
    // Sanity check on the premise: the backtick extractor really does find
    // nothing in a plain `git diff --name-only` line.
    expect(touchedPaths(raw)).toEqual([]);
    expect(routePathsFrom(raw)).toContain("checker-engineer");
  });
});

describe("touchedPaths + routeAgents composed — the seam Task 5 wires", () => {
  it("dispatches architecture-reviewer for a change touching only root docs", () => {
    const doc = "This change rewrites `CLAUDE.md` and `README.md` only.";
    expect(routeAgents(touchedPaths(doc))).toEqual(["architecture-reviewer", "rule-auditor"]);
  });

  it("dispatches all four from prose naming a kernel module and a spec", () => {
    const doc = "Touches `packages/claims/src/wiring.ts` and `spec/wiring.md`.";
    expect(routeAgents(touchedPaths(doc))).toEqual([
      "architecture-reviewer",
      "checker-engineer",
      "rule-auditor",
      "test-engineer",
    ]);
  });

  it("dispatches checker-engineer, rule-auditor, and test-engineer for prose citing bare filenames", () => {
    const doc = "This change touches `checkClaims.ts` and `cli.ts`.";
    expect(routeAgents(touchedPaths(doc))).toEqual([
      "checker-engineer",
      "rule-auditor",
      "test-engineer",
    ]);
  });
});

describe("blockedCommands — what autonomy may not do unattended", () => {
  it("refuses to merge, in any form", () => {
    expect(blockedCommands("run `gh pr merge 38`")[0]?.reason).toContain("human");
  });

  it("refuses a squash even when the verb is not merge", () => {
    expect(blockedCommands("gh pr merge --squash 38")).toHaveLength(1);
    expect(blockedCommands("some-tool --squash")[0]?.reason).toContain("merge-never-squash");
  });

  it("refuses history rewrites and publishes", () => {
    for (const command of [
      "git push --force origin main",
      "git push --force-with-lease",
      "git rebase main",
      "git filter-branch --all",
      "npm publish",
      "pnpm publish --access public",
    ]) {
      expect(blockedCommands(command), command).toHaveLength(1);
    }
  });

  it("refuses to touch the settings file and the nullius state dir", () => {
    expect(blockedCommands("edit .claude/settings.json")[0]?.reason).toContain("one-delivery-mechanism");
    expect(blockedCommands("rm .git/nullius/canaries.json")).toHaveLength(1);
  });

  it("refuses openspec archive, which would satisfy this change's own dependents", () => {
    expect(blockedCommands("openspec archive add-foo")[0]?.reason).toContain("dependents");
  });

  it("reports the line number so the orchestrator can flag the task", () => {
    expect(blockedCommands("safe\nsafe\ngh pr merge 1")[0]?.line).toBe(3);
  });

  it("stays quiet on ordinary commands", () => {
    expect(blockedCommands("pnpm build\npnpm test\ngit commit -m x\ngh pr create")).toEqual([]);
  });

  it("catches git push with the short force flag -f", () => {
    expect(blockedCommands("git push -f origin main"), "git push -f").toHaveLength(1);
  });

  it("allows pnpm test even with --filter and long flag sequences", () => {
    expect(blockedCommands("pnpm --filter @nullius-inverba/kit test")).toEqual([]);
  });

  it("catches pnpm publish with --filter between manager and verb", () => {
    expect(blockedCommands("pnpm --filter @nullius-inverba/claims publish")).toHaveLength(1);
  });

  it("catches pnpm -r publish (recursive shorthand)", () => {
    expect(blockedCommands("pnpm -r publish")).toHaveLength(1);
  });

  it("catches git filter-repo (modern rewrite-history tool)", () => {
    expect(blockedCommands("git filter-repo --path x")).toHaveLength(1);
  });

  it("catches merging via the REST API", () => {
    expect(blockedCommands("gh api repos/o/r/pulls/38/merge -X PUT -f merge_method=squash")).toHaveLength(1);
  });

  it("catches yarn publish", () => {
    expect(blockedCommands("yarn publish")).toHaveLength(1);
  });
});

describe("unapprovedBlocks — Stage 1 pauses on an unchecked box", () => {
  const proposal = [
    "# Proposal",
    "",
    "## Human Approval Required",
    "",
    "- [ ] rotate the token",
    "- [x] confirm the plan",
    "",
    "## Problem",
    "",
    "- [ ] this box is not an approval",
  ].join("\n");

  it("reports only unchecked boxes inside the block", () => {
    expect(unapprovedBlocks(proposal)).toEqual([5]);
  });

  it("returns empty when there is no such block", () => {
    expect(unapprovedBlocks("# Proposal\n\n- [ ] a task\n")).toEqual([]);
  });

  it("includes unchecked boxes under nested subheadings within the approval block", () => {
    const nested = "## Human Approval Required\n\n### Rotations\n\n- [ ] rotate the token";
    expect(unapprovedBlocks(nested)).toEqual([5]);
  });
});

function scratch(): string {
  const root = mkdtempSync(join(tmpdir(), "nullius-pipeline-"));
  mkdirSync(join(root, ".git"), { recursive: true });
  mkdirSync(join(root, "openspec", "changes", "add-thing"), { recursive: true });
  return root;
}

describe("state — machine-local, beside the canary registry", () => {
  it("lives under .git/nullius/pipeline, needing no gitignore entry", () => {
    expect(statePath("/repo", "add-thing")).toBe("/repo/.git/nullius/pipeline/add-thing.state.json");
  });

  it("refuses a change name that would escape", () => {
    expect(() => statePath("/repo", "../../etc")).toThrow(/change name/i);
  });

  it("round-trips a key", () => {
    const root = scratch();
    writeStateKey(root, "add-thing", "stage", "pre-review");
    expect(readState(root, "add-thing")["stage"]).toBe("pre-review");
  });

  it("reads an absent state file as empty rather than throwing", () => {
    expect(readState(scratch(), "add-thing")).toEqual({});
  });

  it("preserves keys written earlier", () => {
    const root = scratch();
    writeStateKey(root, "add-thing", "stage", "load");
    writeStateKey(root, "add-thing", "pr_url", "https://example.test/1");
    const state = readState(root, "add-thing");
    expect(state["stage"]).toBe("load");
    expect(state["pr_url"]).toBe("https://example.test/1");
  });

  it("treats a corrupt state file as empty rather than crashing a resume", () => {
    const root = scratch();
    mkdirSync(join(root, ".git", "nullius", "pipeline"), { recursive: true });
    writeFileSync(statePath(root, "add-thing"), "{ not json");
    expect(readState(root, "add-thing")).toEqual({});
  });
});

describe("evidence — committed into the change folder, where CI re-verifies it", () => {
  it("creates the file with the heading on first append", () => {
    const root = scratch();
    appendEvidence(root, "add-thing", "Probe — stage 2", "CAUGHT by architecture-reviewer.");
    const written = readFileSync(join(root, "openspec/changes/add-thing/review-evidence.md"), "utf8");
    expect(written).toContain("## Probe — stage 2");
    expect(written).toContain("CAUGHT by architecture-reviewer.");
  });

  it("appends without destroying earlier sections", () => {
    const root = scratch();
    appendEvidence(root, "add-thing", "Stage 2", "first");
    appendEvidence(root, "add-thing", "Stage 6", "second");
    const written = readFileSync(join(root, "openspec/changes/add-thing/review-evidence.md"), "utf8");
    expect(written).toContain("first");
    expect(written).toContain("second");
    expect(written.indexOf("first")).toBeLessThan(written.indexOf("second"));
  });

  it("refuses an unsafe change name before building an evidence path", () => {
    expect(() => appendEvidence(scratch(), "../../etc", "H", "body")).toThrow(/change name/i);
  });
});

describe("runPipeline — exit codes the skill branches on", () => {
  it("returns 2 for an unknown subcommand", () => {
    expect(runPipeline(["not-a-command"])).toBe(2);
  });

  it("returns 2 with no subcommand", () => {
    expect(runPipeline([])).toBe(2);
  });

  it("returns 1 from pause-check when an approval box is unchecked", () => {
    const root = scratch();
    writeFileSync(
      join(root, "openspec/changes/add-thing/proposal.md"),
      "# P\n\n## Human Approval Required\n\n- [ ] rotate\n",
    );
    expect(runPipeline(["pause-check", "add-thing", "--root", root])).toBe(1);
  });

  it("returns 0 from pause-check when every box is checked", () => {
    const root = scratch();
    writeFileSync(
      join(root, "openspec/changes/add-thing/proposal.md"),
      "# P\n\n## Human Approval Required\n\n- [x] rotate\n",
    );
    expect(runPipeline(["pause-check", "add-thing", "--root", root])).toBe(0);
  });

  it("returns 1 from blocked-commands when one is present", () => {
    const root = scratch();
    writeFileSync(join(root, "openspec/changes/add-thing/proposal.md"), "# P\n");
    writeFileSync(join(root, "openspec/changes/add-thing/tasks.md"), "- [ ] run `gh pr merge 1`\n");
    expect(runPipeline(["blocked-commands", "add-thing", "--root", root])).toBe(1);
  });

  it("refuses an unsafe change name without touching the filesystem", () => {
    expect(runPipeline(["pause-check", "../../etc", "--root", scratch()])).toBe(2);
  });

  it("reports an archived dependency as satisfied", () => {
    const root = scratch();
    mkdirSync(join(root, "openspec/changes/archive/add-old"), { recursive: true });
    expect(runPipeline(["dep-status", "add-old", "--root", root])).toBe(0);
  });

  it("reports an unarchived dependency as unresolved, never as satisfied", () => {
    const root = scratch();
    expect(runPipeline(["dep-status", "add-thing", "--root", root])).toBe(1);
  });

  it("classifies a compare status by tested code, not by eye", () => {
    expect(runPipeline(["classify-compare", "identical"])).toBe(0);
    expect(runPipeline(["classify-compare", "diverged"])).toBe(1);
    expect(runPipeline(["classify-compare", "nonsense"])).toBe(1);
  });
});

describe("runPipeline — the directory guard proves the artefact was read", () => {
  it("returns 1 from pause-check on a nonexistent change, not 0", () => {
    const root = scratch();
    expect(runPipeline(["pause-check", "no-such-change", "--root", root])).toBe(1);
  });

  it("returns 1 from pause-check on a change directory with no proposal.md", () => {
    // scratch() creates openspec/changes/add-thing but writes nothing into it.
    const root = scratch();
    expect(runPipeline(["pause-check", "add-thing", "--root", root])).toBe(1);
  });

  it("returns a code from progress-write on a nonexistent change, rather than throwing", () => {
    const root = scratch();
    let result: number | undefined;
    expect(() => {
      result = runPipeline(["progress-write", "no-such-change", "--root", root]);
    }).not.toThrow();
    expect(result).toBe(1);
  });

  it("still lets state-set write against a change directory that does not exist", () => {
    const root = mkdtempSync(join(tmpdir(), "nullius-pipeline-"));
    expect(runPipeline(["state-set", "brand-new", "stage", "load", "--root", root])).toBe(0);
    expect(readState(root, "brand-new")["stage"]).toBe("load");
  });

  it("refuses progress-write on a TTY rather than blocking on a read that will never come", () => {
    const root = scratch();
    const original = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");
    Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });
    try {
      expect(runPipeline(["progress-write", "add-thing", "--root", root])).toBe(2);
    } finally {
      if (original) Object.defineProperty(process.stdin, "isTTY", original);
      else delete (process.stdin as { isTTY?: boolean }).isTTY;
    }
  });
});
