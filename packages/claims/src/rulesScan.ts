/**
 * Reads `.claude/rules/*.md` off disk and hands `rules.ts` plain file
 * contents. Everything that touches the filesystem lives here, mirroring
 * `wiringScan.ts`'s split for harness artifacts generally — `rules.ts` stays
 * pure and its tests need no fixture tree.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { globSync } from "glob";

import type { RuleFile } from "./rules";

const RULES_GLOB = ".claude/rules/*.md";

export function scanRules(root: string): RuleFile[] {
  const files: RuleFile[] = [];
  for (const file of globSync(RULES_GLOB, { cwd: root }).sort()) {
    files.push({ path: file, content: readFileSync(join(root, file), "utf8") });
  }
  return files;
}
