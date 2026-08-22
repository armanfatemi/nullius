/**
 * Reads harness artifacts off disk and hands `checkWiring` a plain data
 * structure. Everything that touches the filesystem lives here, so the checker
 * itself stays pure and its tests need no fixture tree.
 */

import { existsSync, accessSync, constants, readFileSync } from "node:fs";
import { join } from "node:path";

import { globSync } from "glob";

import { declaredList, parseFrontmatter, type Located } from "./frontmatter";
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
    // hookTarget returning null means this command line names no checkable
    // script (a shell one-liner, an ambiguous command, ...) — not that the
    // script is missing. Pushing a null entry here would both inflate the
    // reference count and hand checkWiring a meaningless finding, so it is
    // dropped rather than recorded.
    if (target !== null) found.push({ value: target, line: index + 1 });
  });
  return found;
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
    dispatches: declaredList(front, "dispatches"),
    skills: declaredList(front, "skills"),
    reads: declaredList(front, "reads"),
    globs: declaredList(front, "applies_to"),
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
        // "plugin" is a fixed repo-relative literal, not a value computed
        // from anything on disk or in the artifact — hookTarget takes its
        // pluginRoot argument on faith and cannot validate it itself, so a
        // caller that ever derives this root dynamically (e.g. from an env
        // var or a file's own content) must run it through isSafeRepoPath
        // first. This literal needs no such check.
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
