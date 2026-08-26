/**
 * Reads harness artifacts off disk and hands `checkWiring` a plain data
 * structure. Everything that touches the filesystem lives here, so the checker
 * itself stays pure and its tests need no fixture tree.
 */

import { existsSync, accessSync, constants, readFileSync } from "node:fs";
import { join } from "node:path";

import { globSync } from "glob";

import { declaredList, hasUnclosedFrontmatter, parseFrontmatter, type Located } from "./frontmatter";
import { isSafeRepoPath } from "./pathSafety";
import {
  hookTarget,
  type ArtifactKind,
  type ArtifactParseError,
  type HarnessArtifact,
  type WiringDeps,
} from "./wiring";

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

/**
 * Every `command` key's string value in a hooks or settings JSON structure,
 * at any depth. Hook commands nest — `hooks.PreToolUse[].hooks[].command` —
 * so this walks arrays and objects rather than assuming a shape.
 */
function collectCommands(node: unknown, found: string[]): void {
  if (Array.isArray(node)) {
    for (const item of node) collectCommands(item, found);
    return;
  }
  if (node === null || typeof node !== "object") return;
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (key === "command" && typeof value === "string") found.push(value);
    collectCommands(value, found);
  }
}

/**
 * The line a command string appears on, found by searching the raw text for
 * its JSON-escaped rendering — `JSON.parse` hands back the unescaped value,
 * but the source text still carries whatever escaping put it there (`\"`,
 * `\\`, ...), so a plain substring search against the parsed value would
 * miss it. `JSON.stringify` re-escapes it the same way `JSON.parse` would
 * have read it back, which is the inverse operation we need.
 *
 * Best-effort only: collapsed formatting can put a command on a line with
 * other content that still contains it (fine, found), or — for a form of
 * escaping `JSON.stringify` would not itself produce, e.g. `"` for a
 * quote — the search can miss entirely. When it does, this falls back to
 * line 1 rather than fail the scan; a wrong-but-plausible line number is a
 * worse bug than an honest "couldn't tell".
 */
function locateLine(lines: string[], command: string): number {
  const escaped = JSON.stringify(command).slice(1, -1);
  const index = lines.findIndex((line) => line.includes(escaped));
  return index === -1 ? 1 : index + 1;
}

/**
 * Every hook command in a hooks or settings JSON file, resolved through
 * `hookTarget`, with a best-effort line number (see `locateLine`).
 *
 * `onParseFailure`, when given, fires once on a `JSON.parse` failure — the
 * return contract below is unchanged by it (still `[]`, never a throw); it
 * exists only so the caller can record that the failure happened.
 */
function hookCommands(content: string, pluginRoot: string, onParseFailure?: () => void): Located[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    // This function still yields no hooks here, exactly as before, and still
    // has no vocabulary of its own for a parse failure — it only ever speaks
    // about references resolving, not document validity. That is no longer
    // the end of the story, though: `onParseFailure` lets the caller below
    // record what happened, and `checkWiring` now reports it as
    // `malformed-hooks` via `HarnessArtifact.parseError`. `hookCommands`
    // itself stays quiet; only its caller speaks.
    onParseFailure?.();
    return [];
  }

  const commands: string[] = [];
  collectCommands(parsed, commands);

  const lines = content.split("\n");
  const found: Located[] = [];
  for (const raw of commands) {
    const target = hookTarget(raw, pluginRoot);
    // hookTarget returning null means this command line names no checkable
    // script (a shell one-liner, an ambiguous command, ...) — not that the
    // script is missing. Pushing a null entry here would both inflate the
    // reference count and hand checkWiring a meaningless finding, so it is
    // dropped rather than recorded.
    if (target === null) continue;
    found.push({ value: target, line: locateLine(lines, raw) });
  }
  return found;
}

function markdownArtifact(root: string, file: string, kind: ArtifactKind): HarnessArtifact {
  const content = readFileSync(join(root, file), "utf8");
  const front = parseFrontmatter(content);
  const body = front === null ? content : content.split("\n").slice(front.bodyLine - 1).join("\n");
  const bodyStart = front === null ? 1 : front.bodyLine;

  // `parseFrontmatter` already returns `null` here for an unclosed fence —
  // indistinguishably from "no fence at all" — so this is a second, narrower
  // read of the same content to recover just the bit `null` throws away.
  const parseError: ArtifactParseError | null = hasUnclosedFrontmatter(content)
    ? {
        verdict: "unclosed-frontmatter",
        line: 1,
        detail: "frontmatter fence opened but never closed — declared dispatches, skills, reads and applies_to in it cannot be read",
      }
    : null;

  return {
    path: file,
    kind,
    name: front?.scalars.get("name")?.value ?? null,
    parseError,
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
      // `hookCommands` MUST stay hoisted out of the object literal below.
      // The callback writes `parseError` synchronously from the catch, and the
      // literal reads `parseError` at a key ordered before `hooks` — inline the
      // call and the read happens first, yielding `null` and dropping the
      // verdict silently. TypeScript cannot catch that: `parseError` is written
      // only inside a closure, so control-flow analysis narrows it to `null` at
      // the read site and `null` is assignable to the field's type.
      let parseError: ArtifactParseError | null = null;
      const hooks = hookCommands(content, "plugin", () => {
        parseError = {
          verdict: "malformed-hooks",
          line: 1,
          detail: "not valid JSON — hook commands in this file cannot be read",
        };
      });
      artifacts.push({
        path: file,
        kind: source.kind,
        name: null,
        parseError,
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
        hooks,
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
