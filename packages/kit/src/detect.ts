/**
 * What this repo looks like, so `init` can pick a default and know what it
 * must NOT write.
 *
 * Everything here is a filesystem fact. Nothing is inferred from a name, and
 * nothing is guessed: a detection that is wrong in a way the user cannot see
 * is worse than one that declines to answer, because `init` acts on it.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface RepoShape {
  /** An `openspec/` directory — the strongest signal for the specs profile. */
  hasOpenSpec: boolean;
  /** A `docs/` directory. */
  hasDocs: boolean;
  /** A `.git` directory, so the workflow and rev-stamps mean something. */
  hasGit: boolean;
  /** `.github/workflows/` exists, so CI is somewhere this repo already goes. */
  hasWorkflows: boolean;
}

export interface HarnessShape {
  /** A `.claude/` directory — Claude Code is in use here. */
  isClaudeCode: boolean;
  /**
   * The nullius plugin is enabled in `.claude/settings.json`. When true, the
   * plugin owns the hooks and `init` must write none: one delivery mechanism
   * per artefact, or `doctor` gets two paths it cannot tell apart.
   */
  pluginEnabled: boolean;
  /** `.claude/settings.json` exists but could not be parsed. */
  settingsUnreadable: boolean;
}

export interface Detection {
  repo: RepoShape;
  harness: HarnessShape;
  /** The profile `init` would choose with no --profile flag. */
  suggestedProfile: string;
  /** Why that profile, in one line, so the choice is auditable. */
  reason: string;
}

export function detectRepo(root: string): RepoShape {
  return {
    hasOpenSpec: existsSync(join(root, "openspec")),
    hasDocs: existsSync(join(root, "docs")),
    hasGit: existsSync(join(root, ".git")),
    hasWorkflows: existsSync(join(root, ".github", "workflows")),
  };
}

export function detectHarness(root: string): HarnessShape {
  const claudeDir = join(root, ".claude");
  const isClaudeCode = existsSync(claudeDir);
  const settingsPath = join(claudeDir, "settings.json");

  if (!existsSync(settingsPath)) {
    return { isClaudeCode, pluginEnabled: false, settingsUnreadable: false };
  }

  try {
    const settings = JSON.parse(readFileSync(settingsPath, "utf8")) as {
      enabledPlugins?: Record<string, unknown>;
    };
    const enabled = settings.enabledPlugins ?? {};
    // Matched on the plugin half of `plugin@marketplace`: the marketplace name
    // is whatever the user registered it as (a local path here, GitHub
    // elsewhere), so keying on the full string would miss real installs.
    const pluginEnabled = Object.keys(enabled).some(
      (key) => key === "nullius" || key.startsWith("nullius@"),
    );
    return { isClaudeCode, pluginEnabled, settingsUnreadable: false };
  } catch {
    // Unreadable is NOT "no plugin". Saying so lets init refuse to write hooks
    // it cannot prove are absent, rather than duplicating them.
    return { isClaudeCode, pluginEnabled: false, settingsUnreadable: true };
  }
}

export function detect(root: string): Detection {
  const repo = detectRepo(root);
  const harness = detectHarness(root);

  if (repo.hasOpenSpec) {
    return {
      repo,
      harness,
      suggestedProfile: "specs",
      reason: "an openspec/ directory is present",
    };
  }
  if (repo.hasDocs) {
    return {
      repo,
      harness,
      suggestedProfile: "prs",
      reason: "a docs/ directory is present, and no openspec/",
    };
  }
  return {
    repo,
    harness,
    suggestedProfile: "plans",
    reason: "no openspec/ or docs/ directory — plan mode is the smallest useful start",
  };
}

/**
 * Whether `init` may write hook entries into `.claude/settings.json`.
 *
 * The answer is currently always no on Claude Code, and the shape is a
 * function rather than a constant so the reason travels with the decision.
 * Duplicating a plugin-delivered hook gives `doctor` two paths it cannot tell
 * apart, and the ambiguity outlives whoever created it.
 */
export function mayWriteHooks(harness: HarnessShape): { allowed: boolean; reason: string } {
  if (!harness.isClaudeCode) {
    return { allowed: false, reason: "not a Claude Code repo — no hooks to write" };
  }
  if (harness.settingsUnreadable) {
    return {
      allowed: false,
      reason:
        ".claude/settings.json could not be parsed, so a plugin-delivered hook cannot be ruled out",
    };
  }
  return {
    allowed: false,
    reason: "the plugin delivers the hooks; a second copy is a path doctor cannot disambiguate",
  };
}
