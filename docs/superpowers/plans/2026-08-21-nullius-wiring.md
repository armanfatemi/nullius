# `nullius wiring` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `nullius wiring` kernel command that fails when a harness artifact — an agent, skill, rule, hook or command file — references an agent, skill, path or glob that does not exist.

**Architecture:** A new checker module in the kernel, following the `witness.ts` shape: its own verdict union (never added to the exported `Verdict`), a pure core function over parsed artifacts, and I/O injected through a deps object so unit tests touch no disk. A new strict flat-frontmatter parser supplies the declared fields the hard verdicts read; `add-rules-compliance` will reuse it. Only declared fields fail the build — inferred references from prose are advisory.

**Tech Stack:** TypeScript (ESM, `"type": "module"`), vitest, tsup, pnpm workspaces, `glob` (already a dependency).

**Spec:** `docs/adopting-the-pipeline.md` — Phase 0.

## Global Constraints

- **Build before any CLI use.** `pnpm build` writes `dist/`, and the CLIs run from `dist/`. An unbuilt tree validates the previous version of the code.
- **The exported `Verdict` union in `src/checkClaims.ts` is public API; growing it is breaking.** Wiring verdicts go in a separate `WiringVerdict` union, exactly as `JournalVerdict` does.
- **A new verdict requires both a fixture that trips it and a unit test asserting it.** CI only checks the broken fixture's exit code, which stays 1 even when a new verdict never fires.
- **Evidence Anchors in `openspec/changes/**` are rev-stamped from the start**, using `git rev-parse --short HEAD` at the moment the file is read. Never repoint a line number while keeping an old stamp.
- **`spec/**/*.md` is checked with `--require-markers`.** `spec/wiring.md` must carry at least one Evidence Anchor or CI fails.
- **Six pre-existing test failures in `src/flagConformance.test.ts` are environmental** on machines where `grep` is ugrep. Do not chase them, do not edit the flag table.
- Source style: double-quoted strings, 2-space indent, extensionless relative imports (`from "./witness"`).

---

### Task 1: The OpenSpec change

**Files:**
- Create: `openspec/changes/add-wiring-check/proposal.md`
- Create: `openspec/changes/add-wiring-check/design.md`
- Create: `openspec/changes/add-wiring-check/specs/wiring/spec.md`
- Create: `openspec/changes/add-wiring-check/tasks.md`

**Interfaces:**
- Consumes: nothing.
- Produces: the change name `add-wiring-check`, referenced by every later commit message.

- [ ] **Step 1: Capture the rev you are reading at**

```bash
cd /Users/arman/Documents/GitHub/nullius
git rev-parse --short HEAD
```

Use that value verbatim in every anchor written in this task. Do not reuse the value in this plan.

- [ ] **Step 2: Write `proposal.md`**

The Why must state the failure this closes: a routing row naming an agent that does not exist does not error — the dispatch no-ops and the pipeline reports a successful review having reviewed nothing. Cite the existing separate-union precedent, replacing `REV` with the hash from Step 1:

```markdown
# Add wiring check — references that must resolve

## Why

Harness artifacts reference each other by name and by path, and nothing
checks that the referent exists. A skill naming an agent with no definition
file does not error: the dispatch silently no-ops and the run reports a
completed review having reviewed nothing. The same silence covers a rule
whose `applies_to` glob matches no file, and a hook whose command was moved
by a refactor.

Every one of those is a filesystem fact, which makes this checker territory
rather than reviewer territory.

## What Changes

- **`nullius wiring [root]`** (kernel): scan the harness artifacts under a
  root and report references that do not resolve. Six hard verdicts over
  declared frontmatter fields only — `DANGLING-AGENT`, `DANGLING-SKILL`,
  `MISSING-PATH`, `EMPTY-GLOB`, `DEAD-HOOK`, `UNSUBSTITUTED-TOKEN` — plus
  advisory `LOOSE-REFERENCE` for a backticked path in prose that does not
  resolve.
- **Its own verdict union.** The kernel's exported `Verdict` is public API
  whose growth is breaking, a lesson already paid for once:

**Evidence:** `packages/claims/src/witness.ts:48@REV` — `export type JournalVerdict =`

- **A strict flat frontmatter parser** (kernel), closed-key in the style of
  the config module, hand-rolled rather than a YAML dependency:

**Evidence:** `packages/claims/src/config.ts:4@REV` — `* Validation is strict (unknown keys are rejected) because a typo'd key —`

## Impact

- Affected specs: `wiring` (new capability spec)
- Affected code: `packages/claims/src/`, `.github/workflows/ci.yml`
```

- [ ] **Step 3: Write `specs/wiring/spec.md` with the modal verb on line one of each body**

OpenSpec's requirement check reads **only the first line** of a requirement body. A requirement whose SHALL wraps to line 2 fails with a misleading "must contain SHALL or MUST".

```markdown
# wiring

## ADDED Requirements

### Requirement: Declared references resolve

The checker SHALL report a hard verdict for every declared reference — an
agent name, a skill name, a read path, an `applies_to` glob, or a hook
command — that does not resolve against the working tree.

#### Scenario: A skill dispatches an agent with no definition

- **WHEN** a skill declares `dispatches: [ghost-reviewer]` and no
  `.claude/agents/ghost-reviewer.md` exists
- **THEN** the checker reports `DANGLING-AGENT` and exits non-zero

### Requirement: Prose references are advisory

The checker SHALL report an unresolvable backticked path in an artifact body
as advisory `LOOSE-REFERENCE`, and SHALL NOT fail the run for it.

#### Scenario: An agent's prose names an example path

- **WHEN** an agent body contains `` `src/example/Thing.ts` `` and that file does not exist
- **THEN** the checker reports `LOOSE-REFERENCE` and exits zero
```

- [ ] **Step 4: Write `design.md` and `tasks.md`**

`design.md` records the two decisions a reviewer will ask about: why declared-only for the hard half (prose cannot be distinguished from a pointer, and a noisy checker gets disabled), and why the frontmatter parser is hand-rolled (a dependency is supply-chain surface on a tool whose claim is that its verification path is small enough to read). `tasks.md` is a checklist mirroring this plan's task headings — one line each, not a copy of the steps.

- [ ] **Step 5: Validate, and check the anchors**

```bash
openspec validate add-wiring-check
node packages/claims/dist/cli.js check 'openspec/**/*.md'
```

Expected: validation passes, and every anchor in the new change reports `OK`. If `check` reports `FABRICATED`, the quoted line is wrong — open the file and fix the quote, do not adjust the line number under the old stamp.

- [ ] **Step 6: Commit**

```bash
git add openspec/changes/add-wiring-check
git commit -m "docs: propose add-wiring-check"
```

---

### Task 2: Strict flat frontmatter parser

**Files:**
- Create: `packages/claims/src/frontmatter.ts`
- Create: `packages/claims/src/frontmatter.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `parseFrontmatter(content: string): Frontmatter | null`
  - `interface Frontmatter { scalars: Map<string, Located>; lists: Map<string, Located[]>; bodyLine: number }`
  - `interface Located { value: string; line: number }`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";

import { parseFrontmatter } from "./frontmatter";

describe("parseFrontmatter", () => {
  it("returns null when the file has no fence on line 1", () => {
    expect(parseFrontmatter("# Just a heading\n")).toBeNull();
  });

  it("reads a scalar and its line", () => {
    const front = parseFrontmatter("---\nname: rule-auditor\n---\nbody\n");
    expect(front?.scalars.get("name")).toEqual({ value: "rule-auditor", line: 2 });
  });

  it("reads a block list, one line per item", () => {
    const front = parseFrontmatter(
      "---\ndispatches:\n  - rule-auditor\n  - retro-writer\n---\n",
    );
    expect(front?.lists.get("dispatches")).toEqual([
      { value: "rule-auditor", line: 3 },
      { value: "retro-writer", line: 4 },
    ]);
  });

  it("reads an inline flow list, all items on the declaring line", () => {
    const front = parseFrontmatter("---\ndispatches: [a-agent, b-agent]\n---\n");
    expect(front?.lists.get("dispatches")).toEqual([
      { value: "a-agent", line: 2 },
      { value: "b-agent", line: 2 },
    ]);
  });

  it("strips matching quotes from scalars and list items", () => {
    const front = parseFrontmatter("---\nreads: \"CLAUDE.md\"\n---\n");
    expect(front?.scalars.get("reads")?.value).toBe("CLAUDE.md");
  });

  it("reports where the body starts", () => {
    const front = parseFrontmatter("---\nname: x\n---\nfirst body line\n");
    expect(front?.bodyLine).toBe(4);
  });

  it("returns null when the fence is never closed", () => {
    expect(parseFrontmatter("---\nname: x\nno closing fence\n")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd packages/claims && npx vitest run src/frontmatter.test.ts`
Expected: FAIL — `Failed to resolve import "./frontmatter"`.

- [ ] **Step 3: Implement the parser**

```ts
/**
 * A deliberately small frontmatter reader: scalars, inline flow lists, and
 * block lists. No nesting, no anchors, no multi-line scalars.
 *
 * Hand-rolled rather than pulling in a YAML parser, for the same reason the
 * CLI parser is: a dependency here is supply-chain surface on a tool whose
 * whole claim is that its verification path is small enough to read. The
 * subset covers what harness artifacts actually declare, and anything richer
 * is simply not read — which is visible, rather than silently half-parsed.
 */

export interface Located {
  value: string;
  /** 1-based line in the source file. */
  line: number;
}

export interface Frontmatter {
  scalars: Map<string, Located>;
  lists: Map<string, Located[]>;
  /** 1-based line where the body begins, after the closing fence. */
  bodyLine: number;
}

const FENCE = "---";

/** Strip one matching pair of surrounding quotes, and nothing else. */
function unquote(raw: string): string {
  const value = raw.trim();
  const first = value.at(0);
  const last = value.at(-1);
  if (value.length >= 2 && (first === '"' || first === "'") && first === last) {
    return value.slice(1, -1);
  }
  return value;
}

function flowItems(raw: string, line: number): Located[] {
  const inner = raw.trim().slice(1, -1);
  if (inner.trim().length === 0) return [];
  return inner
    .split(",")
    .map((item) => unquote(item))
    .filter((value) => value.length > 0)
    .map((value) => ({ value, line }));
}

export function parseFrontmatter(content: string): Frontmatter | null {
  const lines = content.split("\n");
  if (lines[0]?.trim() !== FENCE) return null;

  const close = lines.findIndex((line, index) => index > 0 && line.trim() === FENCE);
  if (close === -1) return null;

  const scalars = new Map<string, Located>();
  const lists = new Map<string, Located[]>();
  let currentKey: string | null = null;

  for (let index = 1; index < close; index += 1) {
    const raw = lines[index] ?? "";
    const line = index + 1;
    const trimmed = raw.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#")) continue;

    // A block-list item belongs to the key that opened above it.
    if (trimmed.startsWith("- ") || trimmed === "-") {
      if (currentKey === null) continue;
      const value = unquote(trimmed.slice(1));
      if (value.length === 0) continue;
      lists.get(currentKey)?.push({ value, line });
      continue;
    }

    const colon = trimmed.indexOf(":");
    if (colon === -1) continue;
    const key = trimmed.slice(0, colon).trim();
    const rest = trimmed.slice(colon + 1).trim();
    if (key.length === 0) continue;

    if (rest.length === 0) {
      // A bare `key:` opens a block list. An empty list is a real answer.
      currentKey = key;
      lists.set(key, []);
      continue;
    }

    currentKey = null;
    if (rest.startsWith("[") && rest.endsWith("]")) {
      lists.set(key, flowItems(rest, line));
      continue;
    }
    scalars.set(key, { value: unquote(rest), line });
  }

  return { scalars, lists, bodyLine: close + 2 };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd packages/claims && npx vitest run src/frontmatter.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/claims/src/frontmatter.ts packages/claims/src/frontmatter.test.ts
git commit -m "feat(claims): strict flat frontmatter parser"
```

---

### Task 3: Wiring core — types and the two name verdicts

**Files:**
- Create: `packages/claims/src/wiring.ts`
- Create: `packages/claims/src/wiring.test.ts`

**Interfaces:**
- Consumes: `parseFrontmatter`, `Located` from Task 2.
- Produces:
  - `type WiringVerdict = "ok" | "dangling-agent" | "dangling-skill" | "missing-path" | "empty-glob" | "dead-hook" | "unsubstituted-token" | "loose-reference"`
  - `isWiringFailure(verdict: WiringVerdict): boolean`
  - `interface WiringDeps { exists(path: string): boolean; isExecutable(path: string): boolean; glob(pattern: string): string[] }`
  - `interface HarnessArtifact { path: string; kind: ArtifactKind; name: string | null; dispatches: Located[]; skills: Located[]; reads: Located[]; globs: Located[]; hooks: Located[]; tokens: Located[]; loose: Located[] }`
  - `interface WiringFinding { artifact: string; line: number; verdict: WiringVerdict; subject: string; detail: string }`
  - `interface WiringReport { findings: WiringFinding[]; artifacts: number; references: number }`
  - `checkWiring(artifacts: HarnessArtifact[], deps: WiringDeps): WiringReport`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";

import {
  checkWiring,
  isWiringFailure,
  type HarnessArtifact,
  type WiringDeps,
} from "./wiring";

function artifact(over: Partial<HarnessArtifact> = {}): HarnessArtifact {
  return {
    path: ".claude/skills/demo/SKILL.md",
    kind: "skill",
    name: "demo",
    dispatches: [],
    skills: [],
    reads: [],
    globs: [],
    hooks: [],
    tokens: [],
    loose: [],
    ...over,
  };
}

/** Every path missing unless named. Tests declare only what exists. */
function deps(present: string[] = [], matches: Record<string, string[]> = {}): WiringDeps {
  const set = new Set(present);
  return {
    exists: (path) => set.has(path),
    isExecutable: (path) => set.has(path),
    glob: (pattern) => matches[pattern] ?? [],
  };
}

describe("dangling-agent", () => {
  it("fails a dispatch naming an agent with no definition file", () => {
    const report = checkWiring(
      [artifact({ dispatches: [{ value: "ghost-reviewer", line: 4 }] })],
      deps(),
    );

    expect(report.findings).toHaveLength(1);
    expect(report.findings[0]?.verdict).toBe("dangling-agent");
    expect(report.findings[0]?.subject).toBe("ghost-reviewer");
    expect(report.findings[0]?.line).toBe(4);
  });

  it("passes a dispatch whose agent file exists", () => {
    const report = checkWiring(
      [artifact({ dispatches: [{ value: "rule-auditor", line: 4 }] })],
      deps([".claude/agents/rule-auditor.md"]),
    );

    expect(report.findings).toEqual([]);
    expect(report.references).toBe(1);
  });
});

describe("dangling-skill", () => {
  it("fails a reference to a skill with no SKILL.md", () => {
    const report = checkWiring(
      [artifact({ skills: [{ value: "retro-rollup", line: 7 }] })],
      deps(),
    );

    expect(report.findings[0]?.verdict).toBe("dangling-skill");
  });

  it("passes a reference whose skill directory exists", () => {
    const report = checkWiring(
      [artifact({ skills: [{ value: "retro-rollup", line: 7 }] })],
      deps([".claude/skills/retro-rollup/SKILL.md"]),
    );

    expect(report.findings).toEqual([]);
  });
});

describe("isWiringFailure", () => {
  it("treats loose-reference as advisory and the rest as failures", () => {
    expect(isWiringFailure("loose-reference")).toBe(false);
    expect(isWiringFailure("ok")).toBe(false);
    expect(isWiringFailure("dangling-agent")).toBe(true);
    expect(isWiringFailure("dead-hook")).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd packages/claims && npx vitest run src/wiring.test.ts`
Expected: FAIL — `Failed to resolve import "./wiring"`.

- [ ] **Step 3: Implement types and the two name checks**

```ts
/**
 * References that must resolve.
 *
 * A skill naming an agent that has no definition file does not error: the
 * dispatch no-ops and the run reports a completed review having reviewed
 * nothing. That silence is a filesystem fact, so it belongs to a checker.
 *
 * Only DECLARED fields fail. A path in prose might be a live pointer or an
 * illustrative example, and nothing here can tell them apart — so an
 * unresolvable one is advisory. The hard half reads frontmatter, where the
 * author committed to the reference.
 *
 * Its own verdict union on purpose: the kernel's exported `Verdict` is public
 * API, and growing it is a breaking change.
 *
 * See spec/wiring.md.
 */

import type { Located } from "./frontmatter";

export type WiringVerdict =
  /** The reference resolves. */
  | "ok"
  /** A declared dispatch names an agent with no definition file. */
  | "dangling-agent"
  /** A declared skill reference names a skill with no SKILL.md. */
  | "dangling-skill"
  /** A declared read path does not exist. */
  | "missing-path"
  /** A declared glob matches no file. */
  | "empty-glob"
  /** A hook command does not resolve, or is not executable. */
  | "dead-hook"
  /** A `{{TOKEN}}` placeholder survived a port. */
  | "unsubstituted-token"
  /** A backticked path in prose that does not resolve. Advisory. */
  | "loose-reference";

export type ArtifactKind = "agent" | "skill" | "rule" | "hooks" | "settings" | "command";

export interface HarnessArtifact {
  /** Repo-relative path of the file these references came from. */
  path: string;
  kind: ArtifactKind;
  /** The `name:` this artifact declares for itself, when it has one. */
  name: string | null;
  dispatches: Located[];
  skills: Located[];
  reads: Located[];
  globs: Located[];
  hooks: Located[];
  tokens: Located[];
  loose: Located[];
}

export interface WiringDeps {
  exists(repoPath: string): boolean;
  isExecutable(repoPath: string): boolean;
  glob(pattern: string): string[];
}

export interface WiringFinding {
  /** Repo-relative path of the artifact carrying the reference. */
  artifact: string;
  /** 1-based line of the reference within that artifact. */
  line: number;
  verdict: WiringVerdict;
  /** The reference itself — the agent name, path, or glob. */
  subject: string;
  detail: string;
}

export interface WiringReport {
  findings: WiringFinding[];
  artifacts: number;
  /** Declared references examined. Advisory prose references are not counted. */
  references: number;
}

/**
 * Advisory verdicts pass. `loose-reference` is heuristic by construction, and
 * a heuristic that fails a build is a check people delete.
 */
const PASSING: ReadonlySet<WiringVerdict> = new Set<WiringVerdict>(["ok", "loose-reference"]);

export function isWiringFailure(verdict: WiringVerdict): boolean {
  return !PASSING.has(verdict);
}

export function agentPath(name: string): string {
  return `.claude/agents/${name}.md`;
}

export function skillPath(name: string): string {
  return `.claude/skills/${name}/SKILL.md`;
}

export function checkWiring(
  artifacts: HarnessArtifact[],
  deps: WiringDeps,
): WiringReport {
  const findings: WiringFinding[] = [];
  let references = 0;

  for (const item of artifacts) {
    for (const ref of item.dispatches) {
      references += 1;
      const target = agentPath(ref.value);
      if (deps.exists(target)) continue;
      findings.push({
        artifact: item.path,
        line: ref.line,
        verdict: "dangling-agent",
        subject: ref.value,
        detail: `no ${target} — this dispatch would silently no-op, and the run would report a review that never happened`,
      });
    }

    for (const ref of item.skills) {
      references += 1;
      const target = skillPath(ref.value);
      if (deps.exists(target)) continue;
      findings.push({
        artifact: item.path,
        line: ref.line,
        verdict: "dangling-skill",
        subject: ref.value,
        detail: `no ${target}`,
      });
    }
  }

  return { findings, artifacts: artifacts.length, references };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd packages/claims && npx vitest run src/wiring.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/claims/src/wiring.ts packages/claims/src/wiring.test.ts
git commit -m "feat(claims): wiring core with dangling-agent and dangling-skill"
```

---

### Task 4: Path, glob, and prose verdicts

**Files:**
- Modify: `packages/claims/src/wiring.ts` — extend `checkWiring`
- Modify: `packages/claims/src/wiring.test.ts` — add describe blocks

**Interfaces:**
- Consumes: everything Task 3 produced.
- Produces: no new exported names; `checkWiring` now emits `missing-path`, `empty-glob`, and `loose-reference`.

- [ ] **Step 1: Write the failing tests**

Append to `src/wiring.test.ts`:

```ts
describe("missing-path", () => {
  it("fails a declared read path that does not exist", () => {
    const report = checkWiring(
      [artifact({ reads: [{ value: "docs/architecture/events.md", line: 5 }] })],
      deps(),
    );

    expect(report.findings[0]?.verdict).toBe("missing-path");
    expect(report.findings[0]?.subject).toBe("docs/architecture/events.md");
  });

  it("passes a declared read path that exists", () => {
    const report = checkWiring(
      [artifact({ reads: [{ value: "CLAUDE.md", line: 5 }] })],
      deps(["CLAUDE.md"]),
    );

    expect(report.findings).toEqual([]);
  });

  it("fails an unsafe declared path without touching the filesystem", () => {
    const report = checkWiring(
      [artifact({ reads: [{ value: "../../etc/passwd", line: 5 }] })],
      deps(["../../etc/passwd"]),
    );

    expect(report.findings[0]?.verdict).toBe("missing-path");
    expect(report.findings[0]?.detail).toContain("traversal");
  });
});

describe("empty-glob", () => {
  it("fails a glob that matches nothing", () => {
    const report = checkWiring(
      [artifact({ kind: "rule", globs: [{ value: "src/legacy/**/*.ts", line: 3 }] })],
      deps(),
    );

    expect(report.findings[0]?.verdict).toBe("empty-glob");
  });

  it("passes a glob with at least one match", () => {
    const report = checkWiring(
      [artifact({ kind: "rule", globs: [{ value: "src/**/*.ts", line: 3 }] })],
      deps([], { "src/**/*.ts": ["src/wiring.ts"] }),
    );

    expect(report.findings).toEqual([]);
  });
});

describe("loose-reference", () => {
  it("reports an unresolvable prose path as advisory", () => {
    const report = checkWiring(
      [artifact({ loose: [{ value: "src/example/Thing.ts", line: 40 }] })],
      deps(),
    );

    expect(report.findings[0]?.verdict).toBe("loose-reference");
    expect(isWiringFailure(report.findings[0]!.verdict)).toBe(false);
  });

  it("does not count prose references as declared references", () => {
    const report = checkWiring(
      [artifact({ loose: [{ value: "src/example/Thing.ts", line: 40 }] })],
      deps(),
    );

    expect(report.references).toBe(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd packages/claims && npx vitest run src/wiring.test.ts`
Expected: FAIL — 7 failing, the new blocks find no findings.

- [ ] **Step 3: Extend `checkWiring`**

Add the import at the top of `src/wiring.ts`:

```ts
import { isSafeRepoPath } from "./pathSafety";
```

Then insert these three loops inside the `for (const item of artifacts)` body, after the `skills` loop:

```ts
    for (const ref of item.reads) {
      references += 1;
      // Checked before the filesystem is touched: a declared path is
      // repo-controlled, but the same containment rule applies as to a
      // citation, and an escaping path is a defect regardless of what is there.
      const safety = isSafeRepoPath(ref.value);
      if (!safety.safe) {
        findings.push({
          artifact: item.path,
          line: ref.line,
          verdict: "missing-path",
          subject: ref.value,
          detail: safety.reason,
        });
        continue;
      }
      if (deps.exists(ref.value)) continue;
      findings.push({
        artifact: item.path,
        line: ref.line,
        verdict: "missing-path",
        subject: ref.value,
        detail: "declared as read, but no such file",
      });
    }

    for (const ref of item.globs) {
      references += 1;
      if (deps.glob(ref.value).length > 0) continue;
      findings.push({
        artifact: item.path,
        line: ref.line,
        verdict: "empty-glob",
        subject: ref.value,
        detail: "matches no file — this artifact applies to nothing",
      });
    }

    // Advisory, and not counted as a reference: prose is allowed to be prose,
    // and a heuristic that fails a build is a check people delete.
    for (const ref of item.loose) {
      if (deps.exists(ref.value)) continue;
      findings.push({
        artifact: item.path,
        line: ref.line,
        verdict: "loose-reference",
        subject: ref.value,
        detail: "looks like a repo path but does not resolve — an example, or a pointer that moved",
      });
    }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd packages/claims && npx vitest run src/wiring.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/claims/src/wiring.ts packages/claims/src/wiring.test.ts
git commit -m "feat(claims): missing-path, empty-glob, and advisory loose-reference"
```

---

### Task 5: Hook and token verdicts

**Files:**
- Modify: `packages/claims/src/wiring.ts`
- Modify: `packages/claims/src/wiring.test.ts`

**Interfaces:**
- Consumes: everything above.
- Produces: `hookTarget(command: string, pluginRoot: string): string | null`, exported for its own tests and reused by the scanner in Task 6.

- [ ] **Step 1: Write the failing tests**

Append to `src/wiring.test.ts`, and add `hookTarget` to the import at the top of the file:

```ts
describe("hookTarget", () => {
  it("expands the plugin root and strips quotes", () => {
    expect(hookTarget('"${CLAUDE_PLUGIN_ROOT}/hooks/check-plan.sh"', "plugin")).toBe(
      "plugin/hooks/check-plan.sh",
    );
  });

  it("takes the first path-shaped token of a command line", () => {
    expect(hookTarget("node packages/kit/dist/cli.js witness record", "plugin")).toBe(
      "packages/kit/dist/cli.js",
    );
  });

  it("returns null for a bare command with no path", () => {
    expect(hookTarget("echo hello", "plugin")).toBeNull();
  });

  it("returns null for an absolute path, which is not ours to judge", () => {
    expect(hookTarget("/usr/local/bin/thing", "plugin")).toBeNull();
  });
});

describe("dead-hook", () => {
  it("fails a hook whose script is missing", () => {
    const report = checkWiring(
      [artifact({ kind: "hooks", path: "plugin/hooks/hooks.json", hooks: [{ value: "plugin/hooks/gone.sh", line: 9 }] })],
      deps(),
    );

    expect(report.findings[0]?.verdict).toBe("dead-hook");
  });

  it("fails a hook whose script exists but is not executable", () => {
    const present = new Set(["plugin/hooks/check-plan.sh"]);
    const report = checkWiring(
      [artifact({ kind: "hooks", path: "plugin/hooks/hooks.json", hooks: [{ value: "plugin/hooks/check-plan.sh", line: 9 }] })],
      {
        exists: (path) => present.has(path),
        isExecutable: () => false,
        glob: () => [],
      },
    );

    expect(report.findings[0]?.verdict).toBe("dead-hook");
    expect(report.findings[0]?.detail).toContain("not executable");
  });

  it("passes a hook that exists and is executable", () => {
    const report = checkWiring(
      [artifact({ kind: "hooks", path: "plugin/hooks/hooks.json", hooks: [{ value: "plugin/hooks/check-plan.sh", line: 9 }] })],
      deps(["plugin/hooks/check-plan.sh"]),
    );

    expect(report.findings).toEqual([]);
  });
});

describe("unsubstituted-token", () => {
  it("fails a placeholder that survived a port", () => {
    const report = checkWiring(
      [artifact({ tokens: [{ value: "{{VERIFY_TEST}}", line: 22 }] })],
      deps(),
    );

    expect(report.findings[0]?.verdict).toBe("unsubstituted-token");
    expect(report.findings[0]?.subject).toBe("{{VERIFY_TEST}}");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd packages/claims && npx vitest run src/wiring.test.ts`
Expected: FAIL — `hookTarget is not exported`.

- [ ] **Step 3: Implement `hookTarget` and the two loops**

Add to `src/wiring.ts`:

```ts
/**
 * The repo-relative script a hook command runs, or null when there is nothing
 * to check.
 *
 * Conservative on purpose. A hook command is a shell line, not a path: it may
 * be a bare binary on `$PATH`, an absolute path outside the repo, or an
 * interpreter followed by a script. Guessing wrong here produces a failing
 * build over a hook that works, which is how a check earns its way into
 * someone's ignore list.
 */
export function hookTarget(command: string, pluginRoot: string): string | null {
  const expanded = command
    .replaceAll("${CLAUDE_PLUGIN_ROOT}", pluginRoot)
    .replaceAll("$CLAUDE_PLUGIN_ROOT", pluginRoot);

  for (const rawToken of expanded.split(/\s+/)) {
    const token = rawToken.replaceAll('"', "").replaceAll("'", "");
    if (!token.includes("/")) continue;
    if (token.startsWith("/") || token.startsWith("~")) return null;
    return token;
  }
  return null;
}
```

Then insert these two loops inside the `for (const item of artifacts)` body:

```ts
    for (const ref of item.hooks) {
      references += 1;
      if (!deps.exists(ref.value)) {
        findings.push({
          artifact: item.path,
          line: ref.line,
          verdict: "dead-hook",
          subject: ref.value,
          detail: "hook command does not resolve — if this is a build output, run `pnpm build` first",
        });
        continue;
      }
      if (deps.isExecutable(ref.value)) continue;
      findings.push({
        artifact: item.path,
        line: ref.line,
        verdict: "dead-hook",
        subject: ref.value,
        detail: "exists but is not executable — the harness fails this open, so it would never run and never say so",
      });
    }

    for (const ref of item.tokens) {
      references += 1;
      findings.push({
        artifact: item.path,
        line: ref.line,
        verdict: "unsubstituted-token",
        subject: ref.value,
        detail: "placeholder survived a port — the instruction containing it is not addressed to this repo",
      });
    }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd packages/claims && npx vitest run src/wiring.test.ts`
Expected: PASS, 20 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/claims/src/wiring.ts packages/claims/src/wiring.test.ts
git commit -m "feat(claims): dead-hook and unsubstituted-token verdicts"
```

---

### Task 6: Filesystem scanner

**Files:**
- Create: `packages/claims/src/wiringScan.ts`
- Create: `packages/claims/src/wiringScan.test.ts`

**Interfaces:**
- Consumes: `parseFrontmatter`, `Located`, `HarnessArtifact`, `ArtifactKind`, `hookTarget`, `WiringDeps`.
- Produces:
  - `scanHarnessRoot(root: string): HarnessArtifact[]`
  - `fsWiringDeps(root: string): WiringDeps`
  - `looseCandidates(body: string, startLine: number): Located[]` — exported for its own tests

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";

import { looseCandidates } from "./wiringScan";

describe("looseCandidates", () => {
  it("finds a backticked repo-relative path", () => {
    expect(looseCandidates("see `src/wiring.ts` for the rules", 1)).toEqual([
      { value: "src/wiring.ts", line: 1 },
    ]);
  });

  it("counts lines from the offset it was given", () => {
    expect(looseCandidates("first\nsee `src/wiring.ts`", 10)).toEqual([
      { value: "src/wiring.ts", line: 11 },
    ]);
  });

  it("ignores prose, URLs, globs, and absolute paths", () => {
    const body = "`just words` `https://example.com/a.md` `src/**/*.ts` `/etc/passwd`";
    expect(looseCandidates(body, 1)).toEqual([]);
  });

  it("ignores a bare filename with no directory", () => {
    expect(looseCandidates("`README.md`", 1)).toEqual([]);
  });

  it("ignores a path inside a fenced block", () => {
    expect(looseCandidates("```\n`src/wiring.ts`\n```\n", 1)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd packages/claims && npx vitest run src/wiringScan.test.ts`
Expected: FAIL — `Failed to resolve import "./wiringScan"`.

- [ ] **Step 3: Implement the scanner**

```ts
/**
 * Reads harness artifacts off disk and hands `checkWiring` a plain data
 * structure. Everything that touches the filesystem lives here, so the checker
 * itself stays pure and its tests need no fixture tree.
 */

import { existsSync, accessSync, constants, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { globSync } from "glob";

import { parseFrontmatter, type Frontmatter, type Located } from "./frontmatter";
import { isSafeRepoPath } from "./pathSafety";
import { hookTarget, type ArtifactKind, type HarnessArtifact, type WiringDeps } from "./wiring";

/** Where each kind of artifact lives, relative to the scanned root. */
const SOURCES: { glob: string; kind: ArtifactKind }[] = [
  { glob: ".claude/agents/*.md", kind: "agent" },
  { glob: ".claude/skills/**/SKILL.md", kind: "skill" },
  { glob: ".claude/rules/*.md", kind: "rule" },
  { glob: ".claude/commands/**/*.md", kind: "command" },
];

const HOOK_SOURCES: { glob: string; kind: ArtifactKind }[] = [
  { glob: ".claude/settings.json", kind: "settings" },
  { glob: "plugin/hooks/hooks.json", kind: "hooks" },
];

const TOKEN = /\{\{[A-Z_]+\}\}/g;
const BACKTICKED = /`([^`\n]+)`/g;

/**
 * Paths in prose that are worth an advisory mention. The filter is deliberately
 * narrow: it must contain a directory separator and end in an extension, which
 * excludes prose, bare filenames, and globs. Anything ambiguous is dropped —
 * a false advisory is cheap, but a stream of them is how the whole check gets
 * ignored.
 */
export function looseCandidates(body: string, startLine: number): Located[] {
  const found: Located[] = [];
  let fenced = false;

  body.split("\n").forEach((line, index) => {
    if (line.trim().startsWith("```")) {
      fenced = !fenced;
      return;
    }
    if (fenced) return;

    for (const match of line.matchAll(BACKTICKED)) {
      const value = match[1]?.trim() ?? "";
      if (!value.includes("/")) continue;
      if (value.includes("://") || value.includes("*") || value.includes(" ")) continue;
      if (!isSafeRepoPath(value).safe) continue;
      if (!/\.[A-Za-z0-9]+$/.test(value)) continue;
      found.push({ value, line: startLine + index });
    }
  });

  return found;
}

function tokensIn(content: string): Located[] {
  const found: Located[] = [];
  content.split("\n").forEach((line, index) => {
    for (const match of line.matchAll(TOKEN)) {
      found.push({ value: match[0], line: index + 1 });
    }
  });
  return found;
}

/** Every `"command": "..."` string in a hooks or settings JSON file, with its line. */
function hookCommands(content: string, pluginRoot: string): Located[] {
  const found: Located[] = [];
  content.split("\n").forEach((line, index) => {
    const match = /"command"\s*:\s*"(.*)"\s*,?\s*$/.exec(line);
    if (match === null) return;
    const raw = (match[1] ?? "").replaceAll('\\"', '"');
    const target = hookTarget(raw, pluginRoot);
    if (target !== null) found.push({ value: target, line: index + 1 });
  });
  return found;
}

/**
 * A key may be written as a list or as a lone scalar — `reads: CLAUDE.md` and
 * `reads:\n  - CLAUDE.md` mean the same thing to whoever wrote it. Reading
 * only the list form would silently check less than the author declared, which
 * is the failure this whole command exists to make loud.
 */
function declared(front: Frontmatter | null, key: string): Located[] {
  if (front === null) return [];
  const list = front.lists.get(key);
  if (list !== undefined) return list;
  const scalar = front.scalars.get(key);
  return scalar === undefined ? [] : [scalar];
}

function markdownArtifact(root: string, file: string, kind: ArtifactKind): HarnessArtifact {
  const content = readFileSync(join(root, file), "utf8");
  const front = parseFrontmatter(content);
  const body = front === null ? content : content.split("\n").slice(front.bodyLine - 1).join("\n");
  const bodyStart = front === null ? 1 : front.bodyLine;

  return {
    path: file,
    kind,
    name: front?.scalars.get("name")?.value ?? null,
    dispatches: declared(front, "dispatches"),
    skills: declared(front, "skills"),
    reads: declared(front, "reads"),
    globs: declared(front, "applies_to"),
    hooks: [],
    tokens: tokensIn(content),
    loose: looseCandidates(body, bodyStart),
  };
}

export function scanHarnessRoot(root: string): HarnessArtifact[] {
  const artifacts: HarnessArtifact[] = [];

  for (const source of SOURCES) {
    for (const file of globSync(source.glob, { cwd: root }).sort()) {
      artifacts.push(markdownArtifact(root, file, source.kind));
    }
  }

  for (const source of HOOK_SOURCES) {
    for (const file of globSync(source.glob, { cwd: root }).sort()) {
      const content = readFileSync(join(root, file), "utf8");
      artifacts.push({
        path: file,
        kind: source.kind,
        name: null,
        dispatches: [],
        skills: [],
        reads: [],
        globs: [],
        hooks: hookCommands(content, "plugin"),
        tokens: tokensIn(content),
        loose: [],
      });
    }
  }

  return artifacts;
}

export function fsWiringDeps(root: string): WiringDeps {
  return {
    exists: (repoPath) => existsSync(join(root, repoPath)),
    isExecutable: (repoPath) => {
      try {
        accessSync(join(root, repoPath), constants.X_OK);
        return true;
      } catch {
        return false;
      }
    },
    glob: (pattern) => globSync(pattern, { cwd: root }),
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd packages/claims && npx vitest run src/wiringScan.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/claims/src/wiringScan.ts packages/claims/src/wiringScan.test.ts
git commit -m "feat(claims): filesystem scanner for harness artifacts"
```

---

### Task 7: The `wiring` command

**Files:**
- Modify: `packages/claims/src/cliArgs.ts`
- Modify: `packages/claims/src/cliArgs.test.ts`
- Modify: `packages/claims/src/cli.ts`

**Interfaces:**
- Consumes: `scanHarnessRoot`, `fsWiringDeps`, `checkWiring`, `isWiringFailure`.
- Produces: `interface WiringArgs { kind: "wiring"; root: string }` in `cliArgs.ts`, added to the `Command` union.

- [ ] **Step 1: Write the failing parser tests**

Append to `src/cliArgs.test.ts`:

```ts
describe("wiring", () => {
  it("defaults the root to the working directory", () => {
    expect(parseCli(["wiring"])).toEqual({ kind: "wiring", root: "." });
  });

  it("accepts one root operand", () => {
    expect(parseCli(["wiring", "spec/fixtures/wiring-valid"])).toEqual({
      kind: "wiring",
      root: "spec/fixtures/wiring-valid",
    });
  });

  it("rejects a flag belonging to another command by naming its owner", () => {
    expect(() => parseCli(["wiring", "--require-markers"])).toThrow(/option of `check`/);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd packages/claims && npx vitest run src/cliArgs.test.ts`
Expected: FAIL — `unknown command: wiring`.

- [ ] **Step 3: Add the command to the parser**

In `src/cliArgs.ts`, add the interface after `WitnessArgs`:

```ts
export interface WiringArgs {
  kind: "wiring";
  /** Root to scan. Defaults to the working directory. */
  root: string;
}
```

Add `| WiringArgs` to the `Command` union, add `"wiring"` to the `COMMANDS` set, add the dispatch line in `parseCli` beside the others:

```ts
  if (first === "wiring") return parseWiring(rest);
```

and the parser itself:

```ts
/**
 * `wiring` takes an optional root and no flags. One operand only: two roots
 * would silently scan the first and ignore the second.
 */
function parseWiring(rawArgv: readonly string[]): WiringArgs {
  const { flags: argv, literal } = splitOperands(rawArgv);
  const operands: string[] = [...literal];

  for (const arg of argv) {
    if (arg.startsWith("-")) rejectMisplaced(arg, "wiring");
    operands.push(arg);
  }

  if (operands.length > 1) {
    throw new CliError(`\`wiring\` takes at most one root, got: ${operands.join(" ")}`);
  }
  return { kind: "wiring", root: operands[0] ?? "." };
}
```

- [ ] **Step 4: Run to verify the parser tests pass**

Run: `cd packages/claims && npx vitest run src/cliArgs.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the runner and usage text**

In `src/cli.ts`, add the imports:

```ts
import { checkWiring, isWiringFailure } from "./wiring";
import { fsWiringDeps, scanHarnessRoot } from "./wiringScan";
```

Add `WiringArgs` to the existing `cliArgs` type import. Add to `USAGE`, under `commands:`:

```
  wiring [root]       verify that harness artifacts reference things that
                      exist — agents, skills, read paths, applies_to globs,
                      hook commands. A dispatch naming an agent with no
                      definition file does not error at runtime; it no-ops.
```

Add the runner:

```ts
function runWiring(args: WiringArgs): number {
  if (!existsSync(args.root)) {
    console.error(`no such directory: ${args.root}`);
    return 2;
  }

  const artifacts = scanHarnessRoot(args.root);
  if (artifacts.length === 0) {
    console.error(
      `no harness artifacts under ${args.root} — expected .claude/agents, .claude/skills, .claude/rules, .claude/commands, or a hooks JSON file`,
    );
    return 2;
  }

  const report = checkWiring(artifacts, fsWiringDeps(args.root));

  let failures = 0;
  for (const finding of report.findings) {
    const line = `${finding.verdict.toUpperCase().padEnd(20)} ${finding.artifact}:${finding.line}  ${finding.subject}`;
    if (isWiringFailure(finding.verdict)) {
      failures += 1;
      console.error(line);
      console.error(`                     ! ${finding.detail}`);
    } else {
      console.log(line);
      console.log(`                     ~ ${finding.detail}`);
    }
  }

  console.log("");
  console.log(
    `${report.artifacts} artifact(s) scanned, ${report.references} declared reference(s) checked.`,
  );

  if (failures > 0) {
    console.error("");
    console.error(
      `${failures} unresolved reference(s) — each one is an instruction addressed to something that is not there.`,
    );
    return 1;
  }

  console.log("Every declared reference resolves.");
  return 0;
}
```

And the switch case, beside `case "witness":`:

```ts
    case "wiring":
      return runWiring(command);
```

- [ ] **Step 6: Build and smoke it on the repo's own tree**

```bash
cd /Users/arman/Documents/GitHub/nullius
pnpm build
node packages/claims/dist/cli.js wiring
```

This is the checker's first contact with real files. Expect either a clean pass or advisory `LOOSE-REFERENCE` lines. **A hard failure here is a finding, not a bug** — record what it says. If a hard verdict fires on something legitimate, fix the checker rather than the artifact, and add the case to `wiring.test.ts` before moving on.

- [ ] **Step 7: Run the characterization tests**

Run: `cd packages/claims && npx vitest run src/cli.characterization.test.ts`
Expected: PASS. If this file pins the `USAGE` text, update the expectation deliberately — the usage string changed because a command was added.

- [ ] **Step 8: Commit**

```bash
git add packages/claims/src/cliArgs.ts packages/claims/src/cliArgs.test.ts packages/claims/src/cli.ts packages/claims/src/cli.characterization.test.ts
git commit -m "feat(claims): nullius wiring command"
```

---

### Task 8: `spec/wiring.md`

**Files:**
- Create: `spec/wiring.md`

**Interfaces:**
- Consumes: the verdict union from Task 3.
- Produces: the spec URL referenced by the module header comment.

- [ ] **Step 1: Capture the rev**

```bash
git rev-parse --short HEAD
```

- [ ] **Step 2: Write the spec**

It joins `evidence-anchors.md`, `binding-moments.md` and `witness-journal.md` as a spec-family document. Cover: the problem (a dispatch that no-ops reports a review that never happened), the declared-vs-prose split and why the hard half is declared-only, the verdict table, the declared fields read from frontmatter (`name`, `dispatches`, `skills`, `reads`, `applies_to`), the hook-command resolution rules, and the scope boundary — wiring checks that references resolve, not that a dispatch happened, which is `witness`'s subject.

**`spec/**/*.md` is checked with `--require-markers`, so this file must carry at least one Evidence Anchor.** Anchor the claim about the separate verdict union, using the rev from Step 1:

```markdown
**Evidence:** `packages/claims/src/wiring.ts:LINE@REV` — `export type WiringVerdict =`
```

- [ ] **Step 3: Verify the anchor**

```bash
node packages/claims/dist/cli.js check 'spec/**/*.md' --require-markers
```

Expected: exit 0, with `spec/wiring.md` listed among the documents carrying markers.

- [ ] **Step 4: Commit**

```bash
git add spec/wiring.md
git commit -m "docs: spec for the wiring check"
```

---

### Task 9: Fixtures and the CI gate

**Files:**
- Create: `spec/fixtures/wiring-valid/.claude/agents/present-agent.md`
- Create: `spec/fixtures/wiring-valid/.claude/skills/demo/SKILL.md`
- Create: `spec/fixtures/wiring-valid/.claude/rules/matched.md`
- Create: `spec/fixtures/wiring-valid/src/thing.ts`
- Create: `spec/fixtures/wiring-broken/.claude/skills/demo/SKILL.md`
- Create: `spec/fixtures/wiring-broken/.claude/rules/unmatched.md`
- Create: `spec/fixtures/wiring-broken/plugin/hooks/hooks.json`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: the CLI from Task 7.
- Produces: two fixture roots, referenced by the CI step.

- [ ] **Step 1: Build the valid fixture**

`spec/fixtures/wiring-valid/.claude/skills/demo/SKILL.md`:

```markdown
---
name: demo
dispatches:
  - present-agent
reads:
  - src/thing.ts
---

A skill whose every declared reference resolves.
```

`.claude/agents/present-agent.md` carries `---\nname: present-agent\n---` and a sentence. `.claude/rules/matched.md` carries `applies_to: [src/**/*.ts]`. `src/thing.ts` carries one line so the glob matches.

- [ ] **Step 2: Build the broken fixture — it must trip every hard verdict**

`spec/fixtures/wiring-broken/.claude/skills/demo/SKILL.md`:

```markdown
---
name: demo
dispatches:
  - ghost-reviewer
skills:
  - ghost-skill
reads:
  - docs/never-written.md
---

Runs {{VERIFY_TEST}} and mentions `src/moved/away.ts` in prose.
```

`.claude/rules/unmatched.md` carries `applies_to: [src/nothing/**/*.ts]`. `plugin/hooks/hooks.json` carries a `"command"` pointing at `plugin/hooks/gone.sh`, which is not created.

That is `dangling-agent`, `dangling-skill`, `missing-path`, `unsubstituted-token`, `empty-glob`, `dead-hook`, and one advisory `loose-reference` — all six hard verdicts, so a verdict that stops firing cannot hide behind the others.

- [ ] **Step 3: Assert both fixtures from a unit test**

The CI step below only checks exit codes, which stay 0 and 1 even if a verdict never fires.

First extend the existing imports at the top of `src/wiringScan.test.ts` — do not add a second import block for a module already imported there:

```ts
import { fileURLToPath } from "node:url";

import { checkWiring, type WiringVerdict } from "./wiring";
import { fsWiringDeps, looseCandidates, scanHarnessRoot } from "./wiringScan";
```

Then append:

```ts
// fileURLToPath, not URL.pathname: the latter is a URL component, and on a
// path containing a space or a drive letter it is not a filesystem path.
const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));

describe("fixtures", () => {
  it("the valid fixture has no findings at all", () => {
    const root = `${REPO_ROOT}spec/fixtures/wiring-valid`;
    const report = checkWiring(scanHarnessRoot(root), fsWiringDeps(root));
    expect(report.findings).toEqual([]);
  });

  it("the broken fixture trips every hard verdict", () => {
    const root = `${REPO_ROOT}spec/fixtures/wiring-broken`;
    const report = checkWiring(scanHarnessRoot(root), fsWiringDeps(root));
    const seen = new Set<WiringVerdict>(report.findings.map((finding) => finding.verdict));

    expect(seen).toEqual(
      new Set<WiringVerdict>([
        "dangling-agent",
        "dangling-skill",
        "missing-path",
        "empty-glob",
        "dead-hook",
        "unsubstituted-token",
        "loose-reference",
      ]),
    );
  });
});
```

- [ ] **Step 4: Run to verify**

Run: `cd packages/claims && npx vitest run src/wiringScan.test.ts`
Expected: PASS. A failure naming a missing verdict means the broken fixture does not trip it — fix the fixture, not the assertion.

- [ ] **Step 5: Add the CI step**

In `.github/workflows/ci.yml`, after the `nullius check (self)` step:

```yaml
      # The wiring check, dogfooded on both fixtures and on this repo's own
      # harness tree. A routing row naming an agent that does not exist is the
      # one review failure that reports success, so the broken fixture must
      # keep failing; the unit test asserts WHICH verdicts fire, because the
      # exit code here stays 1 even when one of them goes quiet.
      - name: nullius wiring (self)
        run: |
          node packages/claims/dist/cli.js wiring spec/fixtures/wiring-valid
          ! node packages/claims/dist/cli.js wiring spec/fixtures/wiring-broken
          node packages/claims/dist/cli.js wiring
```

- [ ] **Step 6: Commit**

```bash
git add spec/fixtures/wiring-valid spec/fixtures/wiring-broken packages/claims/src/wiringScan.test.ts .github/workflows/ci.yml
git commit -m "test: wiring fixtures and CI gate"
```

---

### Task 10: Public exports, changelog, and full verification

**Files:**
- Modify: `packages/claims/src/index.ts`
- Modify: `CHANGELOG.md`
- Modify: `openspec/changes/add-wiring-check/tasks.md`

**Interfaces:**
- Consumes: everything above.
- Produces: the package's public wiring surface.

- [ ] **Step 1: Export the public surface**

Append to `src/index.ts`:

```ts
export {
  checkWiring,
  hookTarget,
  isWiringFailure,
  type ArtifactKind,
  type HarnessArtifact,
  type WiringDeps,
  type WiringFinding,
  type WiringReport,
  type WiringVerdict,
} from "./wiring";
export { fsWiringDeps, looseCandidates, scanHarnessRoot } from "./wiringScan";
export { parseFrontmatter, type Frontmatter, type Located } from "./frontmatter";
```

- [ ] **Step 2: Write the changelog entry**

Under the unreleased heading, note the new `wiring` command and its seven verdicts, and state explicitly that `WiringVerdict` is a **separate union** — the exported `Verdict` is unchanged, so this is additive rather than breaking.

- [ ] **Step 3: Full verification from a clean build**

```bash
cd /Users/arman/Documents/GitHub/nullius
pnpm build
pnpm type-check
pnpm test
```

Expected: build and type-check clean. Tests: **exactly 6 failures, all in `src/flagConformance.test.ts`**, on a machine where `grep` is ugrep. Any other failure is yours. If `flagConformance` passes entirely, you are on GNU grep and that is also fine.

- [ ] **Step 4: Run every dogfooding gate as CI will**

```bash
node packages/claims/dist/cli.js check 'README.md' 'spec/**/*.md' --require-markers
node packages/claims/dist/cli.js check 'openspec/**/*.md'
node packages/claims/dist/cli.js wiring spec/fixtures/wiring-valid
! node packages/claims/dist/cli.js wiring spec/fixtures/wiring-broken
node packages/claims/dist/cli.js wiring
```

Expected: every line exits as written. Do not proceed to the PR with any of these failing.

- [ ] **Step 5: Tick off `tasks.md` and commit**

```bash
git add packages/claims/src/index.ts CHANGELOG.md openspec/changes/add-wiring-check/tasks.md
git commit -m "feat(claims): export the wiring surface"
```

- [ ] **Step 6: Open the PR — merge commit, never squash**

A squash merge orphans every commit a rev-stamped anchor names, and the checker then fails open with the advisory `UNVERIFIABLE-REV`: CI stays green while the hard gate silently stops existing. The change proposal written in Task 1 carries stamped anchors, so this matters for this PR specifically.

```bash
git push -u origin <branch>
gh pr create --title "feat: nullius wiring — references that must resolve" --body "..."
```

The PR body asserts things about the codebase, so it carries Evidence Anchors like any other approved document.

---

## Notes for the executor

**Do not archive the OpenSpec change** as part of this plan. Archiving happens after merge, via `/opsx:archive`, and re-pins anchors if the PR was squashed.

**The one design decision most likely to need revisiting** is `looseCandidates`. If the repo-root run in Task 7 Step 6 produces a wall of advisory lines, the filter is too loose — tighten it and add the counter-example to `wiringScan.test.ts`. A noisy advisory trains people to ignore the hard verdicts printed beside it.
