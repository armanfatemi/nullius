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
import { isSafeRepoPath } from "./pathSafety";

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
  }

  return { findings, artifacts: artifacts.length, references };
}
