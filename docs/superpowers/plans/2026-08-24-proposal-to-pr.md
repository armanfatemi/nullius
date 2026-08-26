# proposal-to-pr — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the orchestrator five artifacts already name — a nine-stage OpenSpec-change-to-PR pipeline whose judgement lives in a skill and whose every deterministic decision lives in tested TypeScript.

**Architecture:** `packages/kit/src/pipeline.ts` holds pure functions (dependency parsing, dispatch routing, blocked-command scanning, pause detection, state paths) with `runPipeline` as a thin CLI adapter delegated from `cli.ts`, matching how `init` and `doctor` already attach. `.claude/skills/proposal-to-pr/SKILL.md` carries the nine stages and calls those subcommands for anything a checker could decide. `.claude/agents/retro-writer.md` becomes the fifth roster name so Stage 9 resolves.

**Tech Stack:** TypeScript, vitest, tsup. No new dependencies in `packages/kit` — see Global Constraints.

**Spec:** `docs/superpowers/specs/2026-08-24-proposal-to-pr-design.md`

## Global Constraints

- **`pnpm build` before any nullius CLI invocation.** The CLIs run from `dist/`; an unbuilt tree validates the previous version and reports success.
- **Run `node packages/claims/dist/cli.js wiring .` after every task.** `.claude/**` is scanned harness surface from the moment a file lands. A surviving `{{TOKEN}}` is a hard failure, and a `dispatches:` entry naming a missing agent is a hard `DANGLING-AGENT`.
- **`DANGLING-SKILL` resolves only the declared `skills:` frontmatter field**, against `.claude/skills/<name>/SKILL.md`. Never declare a plugin skill (`superpowers:*`, `opsx:*`) there — reference it in prose, which is not resolved. This is settled, not open.
- **No new dependency in `packages/kit`.** Its only dependency is `@nullius-inverba/claims`. Nothing in this plan needs a glob matcher: rule selection belongs to the kernel's unbuilt `rules select`, and the pipeline is forbidden to grow a second copy.
- **Six `flagConformance` failures are environmental** on machines where `grep` is ugrep. Exactly six, all in `src/flagConformance.test.ts`, is the baseline. Any other count is a real failure. Never edit the flag table to make them pass.
- **Anchors written into `openspec/changes/**` or `docs/**` are rev-stamped** with `git rev-parse --short HEAD` taken when the cited file is read. Never repoint a line number under an old stamp.
- **Never write hook entries into `.claude/settings.json`.**
- **Merge with merge commits; never squash.**
- Test one package: `pnpm --filter @nullius-inverba/kit test`. Whole repo: `pnpm test`.

## File Structure

| Path | Responsibility |
|---|---|
| `packages/kit/src/pipeline.ts` | Pure decisions + `runPipeline(argv)` CLI adapter |
| `packages/kit/src/pipeline.test.ts` | Unit tests; one per routing row, asserted by agent name |
| `packages/kit/src/cli.ts` | One added delegation line + usage text |
| `.claude/agents/retro-writer.md` | Fifth roster agent; Stage 9's target |
| `.claude/skills/proposal-to-pr/SKILL.md` | The nine stages |
| `.claude/agents/{rule-auditor,architecture-reviewer,checker-engineer,test-engineer}.md` | Prose correction: the orchestrator now exists |
| `.claude/skills/advise-specialized-agents/SKILL.md` | Same correction |

**Ordering is by verifiability, not preference.** The kit lands first because the skill calls it. `retro-writer` lands before `SKILL.md` because `dispatches:` naming a missing agent is a hard wiring failure. The five prose corrections land *in the same commit as* `SKILL.md`: they are false while the skill is absent and true once it exists, so any other ordering leaves the repository asserting something untrue.

---

### Task 1: Dependency parsing and compare-status classification

**Files:**
- Create: `packages/kit/src/pipeline.ts`
- Create: `packages/kit/src/pipeline.test.ts`

**Interfaces:**
- Produces: `type DepState` (consumed by Task 5's `dep-status`), `parseDependsOn(proposal: string): string[]`, `classifyCompareStatus(status: string): "landed" | "orphaned" | "unknown"`, `isSafeChangeName(name: string): boolean`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";

import { classifyCompareStatus, isSafeChangeName, parseDependsOn } from "./pipeline";

describe("parseDependsOn — the blockquote intent-to-proposal writes", () => {
  it("extracts backticked change names", () => {
    const doc = "# Proposal\n\n> **Depends on:** `add-rules-compliance`, `add-probe-visibility` — one line each.\n";
    expect(parseDependsOn(doc)).toEqual(["add-rules-compliance", "add-probe-visibility"]);
  });

  it("reads None as no dependencies", () => {
    expect(parseDependsOn("> **Depends on:** None\n")).toEqual([]);
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @nullius-inverba/kit test`
Expected: FAIL — `Failed to resolve import "./pipeline"`.

- [ ] **Step 3: Write the implementation**

```ts
/**
 * `nullius-kit pipeline` — the deterministic half of the proposal-to-pr
 * orchestrator.
 *
 * The skill decides which agents to dispatch and whether a blocker is
 * addressed. Everything here is a decision a checker can settle by re-reading
 * an artefact, which is why it is code with tests rather than prose in a
 * prompt: a wrong answer from this module silently un-dispatches a reviewer,
 * and the run then reports a review that never happened.
 */

/** A dependency's state as the Stage 1 gate sees it. */
export type DepState = "satisfied" | "unsatisfied" | "orphaned" | "unknown";

/**
 * Parse the `> **Depends on:**` blockquote `intent-to-proposal` writes.
 *
 * Only the text before the em-dash is read. The template's own trailing
 * sentence contains the word "None", so a parser that scans the whole line
 * reports no dependencies for a proposal that has them — failing open on the
 * one gate whose whole job is to fail closed.
 */
export function parseDependsOn(proposal: string): string[] {
  for (const line of proposal.split("\n")) {
    const match = /^>\s*\*\*Depends on:\*\*\s*(.+)$/.exec(line);
    if (match === null) continue;
    const declared = (match[1] ?? "").split("—")[0] ?? "";
    if (/\bnone\b/i.test(declared)) return [];
    return [...declared.matchAll(/`([^`]+)`/g)].map((hit) => hit[1] ?? "").filter((name) => name.length > 0);
  }
  return [];
}

/**
 * Classify a `gh api compare/main...<sha>` status.
 *
 * A PR based on a feature branch reports `MERGED` while its commits never
 * reach `main`. Every anchor that PR stamped is then unreachable, which the
 * claims checker reports as the fail-open `UNVERIFIABLE-REV`. An inconclusive
 * answer is never read as success.
 */
export function classifyCompareStatus(status: string): "landed" | "orphaned" | "unknown" {
  if (status === "identical" || status === "behind") return "landed";
  if (status === "ahead" || status === "diverged") return "orphaned";
  return "unknown";
}

/** A change name is interpolated into a path, so it is validated before it is. */
export function isSafeChangeName(name: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name) && name !== "." && name !== "..";
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @nullius-inverba/kit test`
Expected: PASS — 9 tests in `pipeline.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add packages/kit/src/pipeline.ts packages/kit/src/pipeline.test.ts
git commit -m "feat(pipeline): parse the dependency contract intent-to-proposal writes"
```

---

### Task 2: Touched paths and the dispatch routing table

**Files:**
- Modify: `packages/kit/src/pipeline.ts`
- Modify: `packages/kit/src/pipeline.test.ts`

**Interfaces:**
- Consumes: nothing from Task 1
- Produces: `type AgentName`, `KERNEL_MODULES: readonly string[]`, `touchedPaths(text: string): string[]`, `routeAgents(paths: readonly string[]): AgentName[]`

- [ ] **Step 1: Write the failing tests**

One assertion per routing row, naming the agent. A test that asserts "some agents were selected" passes while a row is dead — the same one-bit coverage `.claude/rules/verdict-needs-fixture-and-test.md` was written against.

```ts
import { KERNEL_MODULES, routeAgents, touchedPaths } from "./pipeline";

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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @nullius-inverba/kit test`
Expected: FAIL — `routeAgents is not a function`.

- [ ] **Step 3: Write the implementation**

```ts
/** The roster this pipeline can dispatch for review. `retro-writer` is not a
 *  reviewer and is dispatched by stage, not by routing. */
export type AgentName =
  | "architecture-reviewer"
  | "checker-engineer"
  | "rule-auditor"
  | "test-engineer";

/** The four modules that decide a verdict. `checker-engineer` owns exactly these. */
export const KERNEL_MODULES: readonly string[] = [
  "packages/claims/src/checkClaims.ts",
  "packages/claims/src/config.ts",
  "packages/claims/src/wiring.ts",
  "packages/claims/src/witness.ts",
];

const ARCHITECTURE_PATHS: readonly RegExp[] = [
  /^spec\/[^/]+\.md$/,
  /^CLAUDE\.md$/,
  /^README\.md$/,
  /^openspec\//,
];

const TEST_PATHS: readonly RegExp[] = [
  /^packages\/(?:claims|kit)\/src\/.+\.ts$/,
  /^spec\/fixtures\//,
  /^\.github\/workflows\/.+\.ya?ml$/,
];

/** Backticked repo-relative paths with a known extension. Prose in backticks
 *  — a type name, a function — carries no extension and is not a path. */
const PATH_TOKEN = /`([A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)+\.(?:ts|md|json|jsonl|ya?ml|sh))`/g;

export function touchedPaths(text: string): string[] {
  const found = new Set<string>();
  for (const hit of text.matchAll(PATH_TOKEN)) {
    const path = hit[1];
    if (path !== undefined) found.add(path);
  }
  return [...found].sort();
}

/**
 * Decide which reviewers a set of touched paths earns.
 *
 * `rule-auditor` is unconditional. Deciding whether a rule applies means
 * matching its `applies_to` globs, and that is `rules select`'s job in the
 * kernel — a second implementation here is exactly the duplicate this
 * pipeline is forbidden to grow, so the agent globs for itself. When
 * `rules select` lands, this row can pre-filter instead.
 */
export function routeAgents(paths: readonly string[]): AgentName[] {
  const agents = new Set<AgentName>(["rule-auditor"]);
  for (const path of paths) {
    if (KERNEL_MODULES.includes(path)) agents.add("checker-engineer");
    if (ARCHITECTURE_PATHS.some((pattern) => pattern.test(path))) agents.add("architecture-reviewer");
    if (TEST_PATHS.some((pattern) => pattern.test(path))) agents.add("test-engineer");
  }
  return [...agents].sort();
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @nullius-inverba/kit test`
Expected: PASS — 10 new tests.

- [ ] **Step 5: Commit**

```bash
git add packages/kit/src/pipeline.ts packages/kit/src/pipeline.test.ts
git commit -m "feat(pipeline): route dispatch by touched path, one tested row at a time"
```

---

### Task 3: Blocked commands and unapproved pause blocks

**Files:**
- Modify: `packages/kit/src/pipeline.ts`
- Modify: `packages/kit/src/pipeline.test.ts`

**Interfaces:**
- Produces: `interface BlockedCommand { line: number; text: string; reason: string }`, `blockedCommands(text: string): BlockedCommand[]`, `unapprovedBlocks(proposal: string): number[]`

- [ ] **Step 1: Write the failing tests**

```ts
import { blockedCommands, unapprovedBlocks } from "./pipeline";

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
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @nullius-inverba/kit test`
Expected: FAIL — `blockedCommands is not a function`.

- [ ] **Step 3: Write the implementation**

```ts
/** One human-only command found in a change's own artefacts. */
export interface BlockedCommand {
  readonly line: number;
  readonly text: string;
  readonly reason: string;
}

/**
 * Commands a run may propose but never execute unattended. Drawn from the
 * rules and from what autonomy could quietly break — not from a general idea
 * of danger.
 */
const HUMAN_ONLY: readonly { readonly pattern: RegExp; readonly reason: string }[] = [
  { pattern: /\bgh\s+pr\s+merge\b/, reason: "merge is the human's call" },
  { pattern: /--squash\b/, reason: "merge-never-squash.md — a squash orphans every anchor stamp" },
  { pattern: /\bgit\s+push\b.*--force/, reason: "rewrites published history" },
  { pattern: /\bgit\s+(?:rebase|filter-branch)\b/, reason: "rewrites published history" },
  { pattern: /\b(?:npm|pnpm)\s+publish\b/, reason: "publishes an artefact" },
  { pattern: /\.claude\/settings\.json\b/, reason: "one-delivery-mechanism.md" },
  { pattern: /\.git\/nullius\//, reason: "canary registry and witness journal" },
  { pattern: /\bopenspec\s+archive\b/, reason: "archiving would satisfy this change's own dependents" },
];

export function blockedCommands(text: string): BlockedCommand[] {
  const found: BlockedCommand[] = [];
  text.split("\n").forEach((line, index) => {
    for (const { pattern, reason } of HUMAN_ONLY) {
      if (!pattern.test(line)) continue;
      found.push({ line: index + 1, text: line.trim(), reason });
      return;
    }
  });
  return found;
}

/**
 * Line numbers of unchecked boxes under a `Human Approval Required` heading.
 *
 * Scoped to that block deliberately: `tasks.md` is nothing but unchecked
 * boxes, and a pause-check that counted them would pause on every change.
 */
export function unapprovedBlocks(proposal: string): number[] {
  const unchecked: number[] = [];
  let inside = false;
  proposal.split("\n").forEach((line, index) => {
    if (/^#{1,6}\s+Human Approval Required\b/i.test(line)) {
      inside = true;
      return;
    }
    if (inside && /^#{1,6}\s/.test(line)) inside = false;
    if (inside && /^\s*-\s*\[ \]/.test(line)) unchecked.push(index + 1);
  });
  return unchecked;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @nullius-inverba/kit test`
Expected: PASS — 9 new tests.

- [ ] **Step 5: Commit**

```bash
git add packages/kit/src/pipeline.ts packages/kit/src/pipeline.test.ts
git commit -m "feat(pipeline): name the commands autonomy may propose but never run"
```

---

### Task 4: State, evidence, and progress persistence

**Files:**
- Modify: `packages/kit/src/pipeline.ts`
- Modify: `packages/kit/src/pipeline.test.ts`

**Interfaces:**
- Consumes: `isSafeChangeName` (Task 1)
- Produces: `statePath(root, change): string`, `readState(root, change): Record<string, string>`, `writeStateKey(root, change, key, value): void`, `appendEvidence(root, change, heading, body): void`

- [ ] **Step 1: Write the failing tests**

```ts
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { appendEvidence, readState, statePath, writeStateKey } from "./pipeline";

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
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @nullius-inverba/kit test`
Expected: FAIL — `statePath is not a function`.

- [ ] **Step 3: Write the implementation**

Add these imports to the top of `pipeline.ts`:

```ts
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
```

```ts
/**
 * Where a run's resume state lives.
 *
 * Under `.git/`, beside the canary registry, because machine-local nullius
 * state already has a home there — which means no `.gitignore` entry and one
 * convention rather than two. `review-evidence.md` and `progress.md` are the
 * opposite case: they are committed into the change folder, where CI already
 * re-verifies any claim they make about the codebase.
 */
export function statePath(root: string, change: string): string {
  if (!isSafeChangeName(change)) {
    throw new Error(`unsafe change name: ${change}`);
  }
  return join(root, ".git", "nullius", "pipeline", `${change}.state.json`);
}

/** Absent or corrupt state reads as empty. A resume that crashes on its own
 *  bookkeeping is worse than a resume that starts over. */
export function readState(root: string, change: string): Record<string, string> {
  const path = statePath(root, change);
  if (!existsSync(path)) return {};
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
    );
  } catch {
    return {};
  }
}

export function writeStateKey(root: string, change: string, key: string, value: string): void {
  const path = statePath(root, change);
  const state = readState(root, change);
  state[key] = value;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

/** Append one section to the change's committed review evidence. */
export function appendEvidence(root: string, change: string, heading: string, body: string): void {
  if (!isSafeChangeName(change)) throw new Error(`unsafe change name: ${change}`);
  const path = join(root, "openspec", "changes", change, "review-evidence.md");
  const header = existsSync(path) ? "" : "# Review evidence\n";
  appendFileSync(path, `${header}\n## ${heading}\n\n${body.trimEnd()}\n`, "utf8");
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @nullius-inverba/kit test`
Expected: PASS — 8 new tests.

- [ ] **Step 5: Commit**

```bash
git add packages/kit/src/pipeline.ts packages/kit/src/pipeline.test.ts
git commit -m "feat(pipeline): persist resume state beside the canary registry"
```

---

### Task 5: The CLI adapter

**Files:**
- Modify: `packages/kit/src/pipeline.ts` (add `runPipeline`)
- Modify: `packages/kit/src/cli.ts` (one delegation line + usage)
- Modify: `packages/kit/src/pipeline.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 1–4
- Produces: `runPipeline(argv: readonly string[]): number`, subcommands `dep-status` and `classify-compare`

- [ ] **Step 1: Write the failing test**

```ts
import { runPipeline } from "./pipeline";

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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @nullius-inverba/kit test`
Expected: FAIL — `runPipeline is not a function`.

- [ ] **Step 3: Write the implementation**

Append to `pipeline.ts`:

```ts
const PIPELINE_USAGE = `nullius-kit pipeline — deterministic helpers for proposal-to-pr

usage:
  nullius-kit pipeline <command> <change> [--root <dir>]

  list-changes                  every openspec/changes/<name>/
  show <change>                 the change's artefacts; exit 1 if incomplete
  state-get <change> [key]      read resume state
  state-set <change> <k> <v>    write one key
  state-reset <change>          wipe state for this change
  pause-check <change>          exit 1 on an unchecked Human Approval box
  blocked-commands <change>     exit 1 and print HUMAN: <cmd> for each
  touched-areas <change>        repo-relative paths the change names
  depends-on <change>           the > **Depends on:** blockquote, one per line
  route <change>                the agents those paths earn, one per line
  dep-status <change>           exit 0 only if provably archived
  classify-compare <status>     landed | orphaned | unknown; exit 0 on landed
  evidence-append <change> <h>  read a section from stdin
  evidence-print <change>       print accumulated review evidence
  progress-write <change>       overwrite progress.md from stdin

Exit codes: 0 ok · 1 pause or blocker · 2 usage error`;

function changeDir(root: string, change: string): string {
  return join(root, "openspec", "changes", change);
}

function readIfPresent(path: string): string {
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

export function runPipeline(argv: readonly string[]): number {
  const rootIndex = argv.indexOf("--root");
  const root = rootIndex === -1 ? process.cwd() : (argv[rootIndex + 1] ?? process.cwd());
  // Guard the -1 case explicitly. `indexOf` returns -1 when the flag is
  // absent, and `rootIndex + 1` is then 0 — a filter written without this
  // branch drops argv[0], the subcommand itself.
  const positional =
    rootIndex === -1
      ? [...argv]
      : argv.filter((_, index) => index !== rootIndex && index !== rootIndex + 1);
  const [command, change, ...rest] = positional;

  if (command === undefined || command === "--help" || command === "-h") {
    console.log(PIPELINE_USAGE);
    return command === undefined ? 2 : 0;
  }

  if (command === "list-changes") {
    const dir = join(root, "openspec", "changes");
    if (!existsSync(dir)) return 0;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name !== "archive") console.log(entry.name);
    }
    return 0;
  }

  if (change === undefined) {
    console.error(`pipeline ${command} needs a change name\n\n${PIPELINE_USAGE}`);
    return 2;
  }
  // `classify-compare` takes a status word, not a change name, so it is
  // answered before the name guard rather than exempted inside it.
  if (command === "classify-compare") {
    const verdict = classifyCompareStatus(change);
    console.log(verdict);
    return verdict === "landed" ? 0 : 1;
  }
  if (!isSafeChangeName(change)) {
    console.error(`unsafe change name: ${change}`);
    return 2;
  }

  const dir = changeDir(root, change);
  const proposal = readIfPresent(join(dir, "proposal.md"));
  const tasks = readIfPresent(join(dir, "tasks.md"));
  const design = readIfPresent(join(dir, "design.md"));

  switch (command) {
    case "show": {
      if (!existsSync(dir)) {
        console.error(`no openspec/changes/${change}/`);
        return 1;
      }
      const missing = ["proposal.md", "design.md", "tasks.md"].filter(
        (file) => !existsSync(join(dir, file)),
      );
      for (const file of readdirSync(dir)) console.log(file);
      if (missing.length > 0) {
        console.error(`incomplete change — missing ${missing.join(", ")}`);
        return 1;
      }
      return 0;
    }
    case "pause-check": {
      const unchecked = unapprovedBlocks(proposal);
      for (const line of unchecked) console.error(`proposal.md:${line} unchecked approval`);
      return unchecked.length > 0 ? 1 : 0;
    }
    case "blocked-commands": {
      const found = [...blockedCommands(tasks), ...blockedCommands(design)];
      for (const entry of found) console.log(`HUMAN: ${entry.text}  — ${entry.reason}`);
      return found.length > 0 ? 1 : 0;
    }
    case "touched-areas": {
      for (const path of touchedPaths(`${proposal}\n${tasks}`)) console.log(path);
      return 0;
    }
    case "depends-on": {
      for (const name of parseDependsOn(proposal)) console.log(name);
      return 0;
    }
    case "route": {
      for (const agent of routeAgents(touchedPaths(`${proposal}\n${tasks}`))) console.log(agent);
      return 0;
    }
    case "state-get": {
      const state = readState(root, change);
      const key = rest[0];
      if (key === undefined) console.log(JSON.stringify(state, null, 2));
      else if (state[key] !== undefined) console.log(state[key]);
      return 0;
    }
    case "state-set": {
      const [key, value] = rest;
      if (key === undefined || value === undefined) {
        console.error("state-set needs <key> <value>");
        return 2;
      }
      writeStateKey(root, change, key, value);
      return 0;
    }
    case "state-reset": {
      const path = statePath(root, change);
      if (existsSync(path)) writeFileSync(path, "{}\n", "utf8");
      return 0;
    }
    case "evidence-append": {
      const heading = rest[0];
      if (heading === undefined) {
        console.error("evidence-append needs a heading");
        return 2;
      }
      appendEvidence(root, change, heading, readFileSync(0, "utf8"));
      return 0;
    }
    case "evidence-print": {
      process.stdout.write(readIfPresent(join(dir, "review-evidence.md")));
      return 0;
    }
    case "progress-write": {
      writeFileSync(join(dir, "progress.md"), readFileSync(0, "utf8"), "utf8");
      return 0;
    }
    case "dep-status": {
      // The archive check is the whole filesystem-answerable half. The PR half
      // needs a network call, so the skill runs `gh` and hands the result back
      // to `classify-compare` — the model performs the I/O, tested code
      // interprets it. Anything not provably satisfied exits 1.
      const archived = existsSync(join(root, "openspec", "changes", "archive", change));
      const state: DepState = archived ? "satisfied" : "unknown";
      console.log(state);
      return archived ? 0 : 1;
    }
    default: {
      console.error(`unknown subcommand: pipeline ${command}\n\n${PIPELINE_USAGE}`);
      return 2;
    }
  }
}
```

Add `readdirSync` to the `node:fs` import list at the top of `pipeline.ts`.

- [ ] **Step 4: Wire it into `cli.ts`**

Add the import beside the existing ones:

```ts
import { runPipeline } from "./pipeline";
```

Add the delegation immediately after the `doctor` line in `main()` (`packages/kit/src/cli.ts:88`), because `pipeline` owns its own flags and the witness options parser would reject them:

```ts
  if (argv[0] === "pipeline") return runPipeline(argv.slice(1));
```

Add to the `USAGE` template literal, after the `doctor` line:

```
  nullius-kit pipeline <command> <change> [--root <dir>]
```

- [ ] **Step 5: Run the tests and the type-check**

Run: `pnpm --filter @nullius-inverba/kit test && pnpm type-check`
Expected: PASS — 9 new tests; type-check clean.

- [ ] **Step 6: Verify the real binary**

```bash
pnpm build
node packages/kit/dist/cli.js pipeline route add-authoring-ergonomics
```

Expected: a sorted agent list including `rule-auditor`. If it prints only `rule-auditor`, the proposal names no backticked paths — check with `pipeline touched-areas` before assuming a routing bug.

- [ ] **Step 7: Commit**

```bash
git add packages/kit/src/pipeline.ts packages/kit/src/pipeline.test.ts packages/kit/src/cli.ts
git commit -m "feat(kit): attach the pipeline helper to the kit CLI"
```

---

### Task 6: The `retro-writer` agent

**Files:**
- Create: `.claude/agents/retro-writer.md`
- Create: `.claude/retrospectives/.gitkeep`

**Interfaces:**
- Produces: an agent named `retro-writer`, resolvable at `.claude/agents/retro-writer.md`, which Task 7's `dispatches:` frontmatter names.

**Source:** `~/Documents/GitHub/nullius-vendor/openspec-pipeline-export/.claude/agents/retro-writer.md` (263 lines).

- [ ] **Step 1: Read the source and the four siblings**

Read the export's `retro-writer.md` in full, then read `.claude/agents/test-engineer.md` for this repo's register — reasoning over mechanics, an incident anchor where one exists.

- [ ] **Step 2: Write the agent, regrounded**

Frontmatter must carry `name`, `description` (with the `<example>` blocks the four siblings use), `model: opus`, `color: purple`. Do **not** add a `dispatches:` or `skills:` field — this agent dispatches nothing.

Replace the export's artefact pointers with this repo's:

| Export pointer | This repo |
|---|---|
| `.proposal-to-pr/<change>.state.json` | `.git/nullius/pipeline/<change>.state.json` |
| `openspec/changes/<change>/review-evidence.md` | unchanged |
| `openspec/changes/<change>/progress.md` | unchanged |
| Jira issue history | delete |

Keep verbatim the doctrine that earns it a place here — that it is handed pointers rather than the coordinator's account, because a coordinator's summary at the end of a long session is the least reliable input available. That is this repository's own argument and the reason the agent is not simply a summarizer.

Add the probe result to what it reads: `review-evidence.md` will carry a `## Probe — stage 2` section scoring the pre-review layer, and a run whose probe came back `MISSED` is exactly the run worth a `notable` severity.

The return contract is three lines: path, severity (`routine` / `notable` / `blocking`), headline.

- [ ] **Step 3: Verify wiring resolves it and no token survived**

```bash
pnpm build
node packages/claims/dist/cli.js wiring . 2>&1 | tail -5
```

Expected: `Every declared reference resolves.` and no `UNSUBSTITUTED-TOKEN`. The export uses `{{TOKEN}}` placeholders; a surviving one is a hard failure.

- [ ] **Step 4: Verify the agent is dispatchable**

Dispatch `retro-writer` with `prompt: "Say 'ok'."` and confirm it returns. The export warns that the agent registry loads only at session start; measured in this harness that is false — the agent was dispatchable immediately. The ping is the check that matters. Only if it fails do you need a fresh session.

- [ ] **Step 5: Commit**

```bash
git add .claude/agents/retro-writer.md .claude/retrospectives/.gitkeep
git commit -m "feat(agents): author retro-writer, the roster's fifth name"
```

---

### Task 7: The skill, and the five statements it makes false

**Files:**
- Create: `.claude/skills/proposal-to-pr/SKILL.md`
- Modify: `.claude/agents/rule-auditor.md:95`
- Modify: `.claude/agents/test-engineer.md:77`
- Modify: `.claude/agents/checker-engineer.md:105`
- Modify: `.claude/agents/architecture-reviewer.md:107`
- Modify: `.claude/skills/advise-specialized-agents/SKILL.md:22`

**Interfaces:**
- Consumes: `nullius-kit pipeline` (Tasks 1–5), `retro-writer` (Task 6)
- Produces: a skill named `proposal-to-pr`

**Source:** `~/Documents/GitHub/nullius-vendor/openspec-pipeline-export/.claude/skills/proposal-to-pr/SKILL.md` (713 lines). Port stage by stage; the design doc's "The nine stages" section lists every adaptation.

**These files change together in one commit.** The five statements below are true while the skill is absent and false once it exists. Landing the skill first leaves the repository asserting something untrue; landing the corrections first does the same in the other direction.

- [ ] **Step 1: Write the frontmatter**

```yaml
---
name: proposal-to-pr
description: Drive an OpenSpec change from proposal to merge-ready PR. Reads `openspec/changes/<name>/`, blocks at Stage 1 until every prerequisite named in the proposal's `> **Depends on:**` blockquote has reached `main`, plants a canary and runs parallel reviews on the proposal, refines until zero blockers, implements each task, verifies with an auto-fix loop that knows the ugrep baseline, re-reviews the diff, and opens a PR seeded with review evidence. Never merges. Resumable — state persists in `.git/nullius/pipeline/<name>.state.json`.
dispatches:
  - rule-auditor
  - architecture-reviewer
  - checker-engineer
  - test-engineer
  - retro-writer
---
```

No `skills:` field. `DANGLING-SKILL` resolves that field against `.claude/skills/<name>/SKILL.md`, so declaring `superpowers:test-driven-development` there is a hard failure. Reference plugin skills in prose only.

- [ ] **Step 2: Port the nine stages**

Work through the export section by section, applying the design doc's adaptations. The six that are not a straight copy:

1. **Stage 1** — drop `jira_issue_key`, `id`, `model:`, the tier advisory, and the `grep -Rls '^id:'` resolution. Dependencies come from `nullius-kit pipeline depends-on <change>`; each name is a directory. Satisfied when the directory is under `openspec/changes/archive/`, or state carries a `pr_url` that is `MERGED` **and** whose `compare/main...<mergeCommit>` status is `identical|behind`. Port the compare-API block verbatim including its explanation of why a local `git merge-base` is wrong. `ORPHANED` and `UNKNOWN` are both unsatisfied, with distinct messages. **Add `pnpm build` as the first step of the stage.**
2. **Stage 2** — add the probe, serial because the registry holds one canary: `canary plant`, dispatch `pipeline route`'s agents in parallel, `canary verify` on the synthesized report, `canary clear`. Score via `pipeline evidence-append <change> "Probe — stage 2"`. Never halts; if `plant` fails, note it and run unprobed.

   **The probe section must record where the claim was planted, not only the verdict.** A `MISSED` has two very different causes — a review layer that has gone quiet, or a canary planted outside any dispatched reviewer's declared scope — and they are indistinguishable after the fact once `canary clear` has run. Writing the plant location (file and section) into `## Probe — stage 2` costs one line at plant time and is unrecoverable later. `retro-writer` reads that section to grade the run, and cannot make the distinction without it.
3. **Stage 4** — delegate TDD to `superpowers:test-driven-development` in prose. Drop specialist-at-declared-tier. Rev-stamp any anchor written into `openspec/changes/**`.
4. **Stage 5** — `pnpm build && pnpm type-check && pnpm test`; delete the lint step and its token. Encode the ugrep baseline: exactly six failures, all in `src/flagConformance.test.ts`, is baseline; any other count is real. Add the dogfood gates in both polarities.
5. **Stage 7** — when a reviewer flags a drifted anchor, re-read and re-stamp both halves. Never repoint a line under an old hash.
6. **Stage 8** — run `nullius check` on the change folder before opening. Seed the body from `pipeline evidence-print`. Apply the `evidence-anchors` convention to the PR description itself. **Never merge.**

Stages 3 and 6 port essentially unchanged; Stage 9 ports with the state path updated.

- [ ] **Step 3: Verify no token survived and every reference resolves**

```bash
grep -n '{{' .claude/skills/proposal-to-pr/SKILL.md || echo "no tokens"
pnpm build && node packages/claims/dist/cli.js wiring . 2>&1 | tail -5
```

Expected: `no tokens`, and `Every declared reference resolves.` A `DANGLING-AGENT` here means Task 6 did not land.

- [ ] **Step 4: Correct the five now-false statements**

Each says the orchestrator has not landed. Rewrite each to say it has, and to describe what now consumes the output format. The sentence to find in all five:

```
Nothing parses it automatically yet — `proposal-to-pr` is the orchestrator planned to consume it, and it has not landed
```

In `advise-specialized-agents/SKILL.md:22` the wording differs slightly (`them` rather than `it`, spread across lines 21–24) — read the paragraph before editing rather than pattern-replacing.

Keep each citation to `docs/superpowers/plans/2026-08-22-review-spine.md:15` intact where it appears. That anchor still verifies; only the prose around it rotted.

- [ ] **Step 5: Verify the corrections left no false claim behind**

```bash
grep -rn "has not landed\|not landed\|planned to consume" .claude/ || echo "all corrected"
node packages/claims/dist/cli.js check 'openspec/**/*.md'
node packages/claims/dist/cli.js check 'README.md' 'spec/**/*.md' --require-markers
```

Expected: `all corrected`, and both checks pass.

- [ ] **Step 6: Commit**

```bash
git add .claude/skills/proposal-to-pr/SKILL.md .claude/agents/ .claude/skills/advise-specialized-agents/SKILL.md
git commit -m "feat(skill): land proposal-to-pr, and correct what its absence asserted"
```

- [ ] **Step 7: Acceptance run**

Run the pipeline against `add-authoring-ergonomics` — smallest of the seven at 134 lines, and kernel-facing, so it exercises all four routing rows.

The run is real if: `pipeline route` names four agents, all four return findings in the `[blocker] / [concern] / [looks-good]` shape, the probe returns `CAUGHT`, `review-evidence.md` carries both, and `nullius check` passes on the change folder before the PR opens.

If the probe returns `MISSED`, do not treat it as a pipeline bug before checking where the canary was planted — a claim planted outside any reviewer's declared scope is a probe placement problem, not a dead review layer. If it returns `TAINTED`, a report named the probe machinery and the result is void; re-run.

---

## Verification checklist

- [ ] `pnpm build && pnpm type-check && pnpm test` — six `flagConformance` failures on ugrep machines, no others
- [ ] `node packages/claims/dist/cli.js wiring .` — every declared reference resolves; no `DANGLING-AGENT`, no `UNSUBSTITUTED-TOKEN`
- [ ] `node packages/claims/dist/cli.js check 'openspec/**/*.md'`
- [ ] `node packages/claims/dist/cli.js check 'README.md' 'spec/**/*.md' --require-markers`
- [ ] `node packages/claims/dist/cli.js check 'docs/**/*.md'` — the design doc's nine anchors still verify
- [ ] Witness and wiring fixtures, both polarities, per `CLAUDE.md`
- [ ] `grep -rn "has not landed" .claude/` returns nothing
- [ ] PR merged with a **merge commit**, never squashed — a squash orphans every anchor this change stamped
