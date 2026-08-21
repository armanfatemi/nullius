/**
 * Profiles — the README's personas, as data.
 *
 * The personas were prose a human read and hand-applied. Making them data is
 * most of what `init` is: the same three setups, chosen by a flag instead of
 * by reading, and printed rather than described.
 *
 * Kept declarative on purpose. A profile that could run code would be a second
 * place for behaviour to live, and `--dry-run` could no longer promise that
 * printing the plan and applying it differ only in whether bytes are written.
 */

/** Where a rendered artefact goes, and who owns the file it goes into. */
export type Ownership =
  /** The kit writes and rewrites this file wholesale. */
  | "kit-owned"
  /** The user's file; the kit contributes at most a one-line pointer. */
  | "user-owned";

export interface ArtifactPlan {
  path: string;
  ownership: Ownership;
  /** Why this file is part of this profile, printed in the write-log. */
  reason: string;
}

export interface Profile {
  name: string;
  /** One line, shown by `init --help` and in the plan header. */
  summary: string;
  /** Globs written to `nullius.config.json` as `docs`. */
  docs: string[];
  /** Whether the config sets `require-markers` for CI. */
  requireMarkers: boolean;
  /** Files this profile is responsible for. */
  artifacts: ArtifactPlan[];
  /**
   * Steps `init` prints but must not perform — plugin installation, pasting a
   * skill into agent instructions. Printing them is the point: the alternative
   * is a tool that pretends setup finished when a human step remains.
   */
  manualSteps: string[];
}

const WORKFLOW: ArtifactPlan = {
  path: ".github/workflows/claims.yml",
  ownership: "kit-owned",
  reason: "CI gate — anchors re-verified on every pull request",
};

const CONFIG: ArtifactPlan = {
  path: "nullius.config.json",
  ownership: "kit-owned",
  reason: "which documents to check, and how strictly",
};

const KIT_CONFIG: ArtifactPlan = {
  path: ".nullius/kit.json",
  ownership: "kit-owned",
  reason: "kit settings — kept out of nullius.config.json, whose unknown keys are fatal to older kernels",
};

const PLUGIN_STEPS = [
  "/plugin marketplace add armanfatemi/nullius",
  "/plugin install nullius@nullius",
];

export const PROFILES: readonly Profile[] = [
  {
    name: "plans",
    summary: "plan mode — anchors checked before you hit approve",
    docs: [".claude/plans/**/*.md"],
    requireMarkers: false,
    artifacts: [CONFIG, KIT_CONFIG],
    manualSteps: [
      ...PLUGIN_STEPS,
      "The plugin's ExitPlanMode hook then checks each plan's anchors; it fails open and never blocks plan mode.",
    ],
  },
  {
    name: "prs",
    summary: "PR descriptions and agent reviews — the CI gate",
    docs: ["docs/**/*.md"],
    requireMarkers: false,
    artifacts: [CONFIG, KIT_CONFIG, WORKFLOW],
    manualSteps: [
      "Paste plugin/skills/evidence-anchors/SKILL.md into your agents' instructions (CLAUDE.md, AGENTS.md, or Cursor rules).",
    ],
  },
  {
    name: "specs",
    summary: "spec or RFC culture — the full discipline, markers required",
    // The OpenSpec preset. `require-markers` is the half that matters: a
    // proposal carrying no anchors at all is not a pass, and the floor is per
    // document so one anchored file cannot license the rest.
    docs: ["openspec/**/*.md"],
    requireMarkers: true,
    artifacts: [CONFIG, KIT_CONFIG, WORKFLOW],
    manualSteps: [
      "Paste plugin/skills/evidence-anchors/SKILL.md into your agents' instructions (CLAUDE.md, AGENTS.md, or Cursor rules).",
    ],
  },
] as const;

export function findProfile(name: string): Profile | null {
  return PROFILES.find((profile) => profile.name === name) ?? null;
}

export const PROFILE_NAMES: readonly string[] = PROFILES.map((profile) => profile.name);
