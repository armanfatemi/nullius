/**
 * Rendering a profile into files, and the plan that describes doing so.
 *
 * The plan is the unit, not the write. `init` builds a complete plan, prints
 * it, and only then applies it — so `--dry-run` is the same code path minus
 * the final step, and cannot drift from the real one. A dry run that runs
 * different code is a dry run that lies.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import type { Profile } from "./profiles";

export type Disposition =
  /** The file does not exist; it will be created. */
  | "create"
  /** The file exists with different content; it will be rewritten. */
  | "update"
  /** The file exists and already matches; nothing to do. */
  | "unchanged"
  /** The kit will not touch this file, and says why. */
  | "skip";

export interface PlannedFile {
  path: string;
  disposition: Disposition;
  contents: string | null;
  reason: string;
}

export interface Plan {
  profile: string;
  root: string;
  files: PlannedFile[];
  manualSteps: string[];
  notes: string[];
}

/** Two trailing-newline-tolerant strings, compared as file content. */
function sameContent(a: string, b: string): boolean {
  return a.replace(/\s+$/, "") === b.replace(/\s+$/, "");
}

function planFile(
  root: string,
  path: string,
  contents: string,
  reason: string,
): PlannedFile {
  const absolute = join(root, path);
  if (!existsSync(absolute)) {
    return { path, disposition: "create", contents, reason };
  }
  let existing: string;
  try {
    existing = readFileSync(absolute, "utf8");
  } catch {
    return {
      path,
      disposition: "skip",
      contents: null,
      reason: "exists but could not be read — left alone rather than clobbered",
    };
  }
  if (sameContent(existing, contents)) {
    return { path, disposition: "unchanged", contents, reason };
  }
  return { path, disposition: "update", contents, reason };
}

/**
 * Keys `init` sets. Everything else in nullius.config.json belongs to the user
 * and is carried through untouched.
 */
const KIT_OWNED_CONFIG_KEYS = new Set(["docs"]);

export function renderConfig(profile: Profile, existing?: string): string {
  // `configVersion` is deliberately NOT written yet.
  //
  // The kernel reserves it, but that reservation is unreleased: every
  // published kernel (through 0.4.0) rejects unknown keys, and the Action runs
  // `npx @nullius-inverba/claims` unpinned. Writing it today means a repo's
  // first CI run fails with `unknown key 'configVersion'` — which is exactly
  // the "older kernel in CI" scenario the reservation exists to prevent.
  //
  // A reservation only buys compatibility once the writer waits for a release
  // that contains it. Add it here when the kernel carrying it has shipped and
  // the Action pins a floor at that version.
  // nullius.config.json is a KERNEL file with eight valid keys, and the one
  // users most often tune. Rewriting it wholesale silently deleted `exclude`,
  // `driftWindow`, `minAnchorChars` and the rest — with no warning and no
  // mention in the write-log. Only the keys this tool owns are replaced.
  let preserved: Record<string, unknown> = {};
  if (existing !== undefined) {
    try {
      const parsed: unknown = JSON.parse(existing);
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        preserved = Object.fromEntries(
          Object.entries(parsed as Record<string, unknown>).filter(
            ([key]) => !KIT_OWNED_CONFIG_KEYS.has(key),
          ),
        );
      }
    } catch {
      // Unparseable: keep nothing rather than guess at its contents. The file
      // is replaced, which is the only safe reading of "it is already broken".
    }
  }

  const config: Record<string, unknown> = { docs: profile.docs, ...preserved };
  return `${JSON.stringify(config, null, 2)}\n`;
}

export function renderKitConfig(profile: Profile, kitVersion: string): string {
  // Kit settings live here rather than in nullius.config.json, whose unknown
  // keys are a hard error: a kit key there breaks every older pinned kernel.
  const config = {
    kitVersion,
    profile: profile.name,
    requireMarkers: profile.requireMarkers,
  };
  return `${JSON.stringify(config, null, 2)}\n`;
}

export function renderWorkflow(profile: Profile, actionRef: string): string {
  const globs = profile.docs.map((glob) => `"${glob}"`).join(" ");
  const requireMarkers = profile.requireMarkers ? "\n          require-markers: true" : "";
  // The Action defaults `strict: false`, which makes an unverified claim a PR
  // comment and a GREEN job. For a profile whose summary promises a gate, that
  // is a gate that cannot fail. Profiles say which they want, and the
  // advisory case says so in the file rather than leaving it to be discovered.
  const strict = profile.strictCi
    ? "\n          strict: true"
    : "";
  const advisoryNote = profile.strictCi
    ? ""
    : "# Advisory: findings appear as a PR comment and the job stays green.\n# Add `strict: true` below to make an unverified claim fail the check.\n";
  return `# .github/workflows/claims.yml — generated by \`nullius-kit init\`.
# Re-render with \`nullius-kit doctor --fix\`; edits here are overwritten.
${advisoryNote}
name: claims
on: pull_request
permissions:
  contents: read
  pull-requests: write
jobs:
  claims:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          # \`git show <rev>:<path>\` needs the commit an anchor names. Without
          # this, every rev-stamped anchor degrades to the advisory
          # UNVERIFIABLE-REV and the gate silently stops gating.
          fetch-depth: 0
      - uses: ${actionRef}
        with:
          github-token: \${{ secrets.GITHUB_TOKEN }}
          globs: ${globs}${requireMarkers}${strict}
`;
}

/**
 * The file agent instructions point AT. Kit-owned and rewritten freely, so the
 * user's own file only ever carries a one-line reference to it.
 */
export function renderAuthoring(profile: Profile): string {
  return `# Evidence Anchors — the authoring rule

Generated by \`nullius-kit init\` (profile: \`${profile.name}\`). Kit-owned:
re-rendered on upgrade, so point at it rather than copying it.

Add one line to your agent instructions — CLAUDE.md, AGENTS.md, or Cursor
rules — and nothing here needs merging when this file changes:

> Load-bearing claims about existing code carry an Evidence Anchor. See
> \`nullius.authoring.md\`.

## The rule

A **load-bearing claim** is a statement about what existing code, config, or
infrastructure does, on which a decision rests. If you cannot cite it, you may
not assert it — move it to \`## Open questions\` instead.

\`\`\`markdown
**Evidence:** \`path/to/file.ts:88@a1b2c3d\` — \`const result = await retry(...)\`
\`\`\`

- Open the file. The quote must appear on that line.
- Quote enough that a real change would contradict it; a two-character quote
  asserts nothing and verifies as \`WEAK-ANCHOR\`.
- Stamp the commit you read (\`git rev-parse --short HEAD\`). Without it the
  checker has only the working tree and cannot tell a fabrication from code
  someone deleted afterwards — your honest document goes red on an unrelated
  refactor. With it, only the line number is allowed to rot (\`STALE\`).
- Judgment calls take NO anchor. Citation theater trains readers to skim past
  the real ones.

## Check before you hand it over

\`\`\`sh
npx @nullius-inverba/claims check "${profile.docs.join('" "')}"
\`\`\`

Full spec:
https://github.com/armanfatemi/nullius/blob/main/spec/evidence-anchors.md
`;
}

/**
 * The one line that goes into a file the USER owns.
 *
 * Deliberately a sentence, not a marker-delimited block. A block collects four
 * wounds — users edit inside the markers, version strings conflict on every
 * release, marker conventions collide with other tools, and blocks outlive
 * uninstallation as cargo-culted instructions. A pointer has none of them:
 * the pointed-at file is regenerated freely, and removal is deleting one line.
 */
export const POINTER_LINE =
  "Load-bearing claims about existing code carry an Evidence Anchor — see `nullius.authoring.md`.";

/** Where a pointer would go, in preference order. Never created if absent. */
const POINTER_HOSTS = ["CLAUDE.md", "AGENTS.md"] as const;

/**
 * Appends the pointer to an agent-instructions file that already exists.
 *
 * Never creates one. A tool that invents CLAUDE.md in a repo that had none is
 * making a decision about someone's agent setup that it has no standing to
 * make, and the file would then outlive uninstallation.
 */
function planPointer(root: string): PlannedFile | null {
  for (const host of POINTER_HOSTS) {
    const absolute = join(root, host);
    if (!existsSync(absolute)) continue;

    let existing: string;
    try {
      existing = readFileSync(absolute, "utf8");
    } catch {
      return {
        path: host,
        disposition: "skip",
        contents: null,
        reason: "exists but could not be read — left alone rather than clobbered",
      };
    }

    // Compared with whitespace collapsed. An exact substring match is defeated
    // by any markdown formatter that re-wraps prose — and then a second copy
    // is appended on every run, growing without bound in any repo whose
    // formatter runs on commit.
    const flatten = (text: string): string => text.replace(/\s+/g, " ");
    if (flatten(existing).includes(flatten(POINTER_LINE))) {
      return {
        path: host,
        disposition: "unchanged",
        contents: existing,
        reason: "already points at nullius.authoring.md",
      };
    }

    // Append. The rest of the file is copied through untouched, which is the
    // property that makes re-running safe on a file someone has edited.
    const separator = existing.endsWith("\n") ? "" : "\n";
    return {
      path: host,
      disposition: "update",
      contents: `${existing}${separator}\n${POINTER_LINE}\n`,
      reason: "one-line pointer appended; the rest of your file is untouched",
    };
  }
  return null;
}

export interface PlanOptions {
  root: string;
  profile: Profile;
  kitVersion: string;
  actionRef: string;
  /** From `mayWriteHooks` — carried so the plan can explain the omission. */
  hookPolicy: { allowed: boolean; reason: string };
  /**
   * Whether a user-owned file may be touched at all.
   *
   * False for `doctor --fix`, whose contract is that user-owned files come out
   * byte-identical. A user who deliberately deleted the pointer had it
   * silently reinstated on every repair otherwise.
   */
  touchUserFiles?: boolean;
}

export function buildPlan(options: PlanOptions): Plan {
  const { root, profile, kitVersion, actionRef, hookPolicy } = options;
  const touchUserFiles = options.touchUserFiles ?? true;
  const files: PlannedFile[] = [];
  const notes: string[] = [];

  for (const artifact of profile.artifacts) {
    if (artifact.path === "nullius.config.json") {
      const configPath = join(root, artifact.path);
      const existing = existsSync(configPath)
        ? (() => {
            try {
              return readFileSync(configPath, "utf8");
            } catch {
              return undefined;
            }
          })()
        : undefined;
      files.push(
        planFile(root, artifact.path, renderConfig(profile, existing), artifact.reason),
      );
    } else if (artifact.path === "nullius.kit.json") {
      files.push(
        planFile(root, artifact.path, renderKitConfig(profile, kitVersion), artifact.reason),
      );
    } else if (artifact.path === ".github/workflows/claims.yml") {
      files.push(
        planFile(root, artifact.path, renderWorkflow(profile, actionRef), artifact.reason),
      );
    } else if (artifact.path === "nullius.authoring.md") {
      files.push(planFile(root, artifact.path, renderAuthoring(profile), artifact.reason));
      if (!touchUserFiles) {
        // doctor --fix: user-owned files come out byte-identical, so the
        // pointer is neither added nor re-added here.
        notes.push("User-owned files left untouched; the pointer is `init`'s to place.");
      } else {
        const pointer = planPointer(root);
        if (pointer === null) {
          notes.push(
            `No agent-instructions file found (${POINTER_HOSTS.join(" or ")}) — add this line to yours: ${POINTER_LINE}`,
          );
        } else {
          files.push(pointer);
        }
      }
    } else {
      // Never silently dropped. A profile can name an artifact no renderer
      // handles — that is a bug in this file, and the plan is where it should
      // be visible rather than in a missing file nobody looks for.
      files.push({
        path: artifact.path,
        disposition: "skip",
        contents: null,
        reason: `no renderer for this artifact — this is a bug in the kit, not your repo`,
      });
      notes.push(`\`${artifact.path}\` is declared by the \`${profile.name}\` profile but has no renderer.`);
    }
  }

  // Stated as a fact in the plan, not silently omitted. An installer that
  // quietly declines to do something is indistinguishable from one that forgot.
  if (!hookPolicy.allowed) {
    notes.push(`No hook entries written: ${hookPolicy.reason}.`);
  }

  return { profile: profile.name, root, files, manualSteps: [...profile.manualSteps], notes };
}

export interface ApplyResult {
  written: string[];
  unchanged: string[];
  skipped: string[];
  /** Writes that threw. Reported per file so a partial apply is legible. */
  failed: { path: string; reason: string }[];
}

/**
 * Applies a plan. `--dry-run` simply does not call this.
 *
 * Every write is guarded individually. An unguarded loop dies on the first
 * EEXIST or EACCES with a raw stack trace and a half-applied plan, and the
 * user is left without even a record of which half landed — the failure this
 * whole module's write-log exists to prevent.
 */
export function applyPlan(plan: Plan): ApplyResult {
  const result: ApplyResult = { written: [], unchanged: [], skipped: [], failed: [] };

  for (const file of plan.files) {
    if (file.disposition === "unchanged") {
      result.unchanged.push(file.path);
      continue;
    }
    if (file.disposition === "skip" || file.contents === null) {
      result.skipped.push(file.path);
      continue;
    }
    const absolute = join(plan.root, file.path);
    try {
      mkdirSync(dirname(absolute), { recursive: true });
      writeFileSync(absolute, file.contents, "utf8");
      result.written.push(file.path);
    } catch (error) {
      result.failed.push({
        path: file.path,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return result;
}

/** The printed record. Every path, what happened to it, and why. */
export function formatPlan(plan: Plan, dryRun: boolean): string {
  const lines: string[] = [];
  lines.push(
    dryRun
      ? `Plan for profile \`${plan.profile}\` — DRY RUN, nothing will be written.`
      : `Applying profile \`${plan.profile}\`.`,
  );
  lines.push("");

  if (plan.files.length === 0) {
    lines.push("  (no files for this profile)");
  }
  for (const file of plan.files) {
    lines.push(`  ${file.disposition.padEnd(9)} ${file.path}`);
    lines.push(`            ${file.reason}`);
  }

  for (const note of plan.notes) {
    lines.push("");
    lines.push(`  note: ${note}`);
  }

  if (plan.manualSteps.length > 0) {
    lines.push("");
    lines.push("  Steps this tool will not do for you:");
    for (const step of plan.manualSteps) lines.push(`    - ${step}`);
  }

  return lines.join("\n");
}
