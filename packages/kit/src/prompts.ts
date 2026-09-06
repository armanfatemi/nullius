/**
 * The interactive layer behind `init --interactive`.
 *
 * `--interactive` is the only trigger for any of this — never ambient TTY
 * state, so a copy-pasted command line behaves the same for every reader. The
 * TTY check here is a safety fallback for the case where the flag was passed
 * but no terminal is actually attached (an agent driving the CLI through a
 * tool call, a CI job someone forgot `--yes` on): `init` still has to
 * complete rather than hang waiting for input that will never come.
 *
 * Every answer collected here is either accepted, edited, or skipped by a
 * human at the keyboard — nothing is written to disk from this module. The
 * caller (`runInit`) is the only thing that touches `nullius.config.json`,
 * exactly as it does for the non-interactive path.
 */

import * as clack from "@clack/prompts";

import { parseConfig, type OracleGlob } from "@nullius-inverba/claims";

import { detectOracleCandidates } from "./detectOracle";
import type { Detection } from "./detect";
import type { Profile } from "./profiles";

export interface InteractiveAnswers {
  /** Undefined means "leave whatever is already declared alone." */
  oracles?: OracleGlob[];
  includeWorkflow: boolean;
}

export interface InteractiveResult {
  answers: InteractiveAnswers;
  /** True when `--interactive` was passed but no TTY was available. */
  fellBackNoTTY: boolean;
}

export interface InteractiveContext {
  root: string;
  profile: Profile;
  detection: Detection;
  /** Already supplied via `--oracle` — the flag answers for it, not the prompt. */
  oracleAnswered: boolean;
  /** Already supplied via `--action` — the flag answers for it, not the prompt. */
  actionAnswered: boolean;
  /** The `oracles` value already in `nullius.config.json`, if any. */
  existingOracles?: OracleGlob[];
}

export async function runInteractivePrompts(ctx: InteractiveContext): Promise<InteractiveResult> {
  if (process.stdin.isTTY !== true) {
    return { answers: { includeWorkflow: false }, fellBackNoTTY: true };
  }

  clack.intro(`nullius-kit init --interactive — profile \`${ctx.profile.name}\` (${ctx.detection.reason})`);

  const oracles = ctx.oracleAnswered ? undefined : await promptOracles(ctx);

  const hasWorkflow = ctx.profile.artifacts.some(
    (artifact) => artifact.path === ".github/workflows/claims.yml",
  );
  let includeWorkflow = false;
  if (!ctx.actionAnswered && !hasWorkflow) {
    const wantsAction = await clack.confirm({
      message: "Add the nullius GitHub Action CI check to this repo?",
      initialValue: false,
    });
    includeWorkflow = !clack.isCancel(wantsAction) && wantsAction === true;
  }

  clack.outro("Interactive onboarding answers collected.");
  return {
    answers: { includeWorkflow, ...(oracles === undefined ? {} : { oracles }) },
    fellBackNoTTY: false,
  };
}

async function promptOracles(ctx: InteractiveContext): Promise<OracleGlob[] | undefined> {
  if (ctx.existingOracles !== undefined && ctx.existingOracles.length > 0) {
    const keep = await clack.confirm({
      message: `Oracle already declared: ${ctx.existingOracles.map((entry) => entry.glob).join(", ")} — keep it?`,
      initialValue: true,
    });
    // Undefined here means "no override" — the existing value survives
    // untouched through `renderConfig`'s preserved-keys path, same as any
    // other key this tool does not own.
    if (clack.isCancel(keep) || keep) return undefined;
  }

  const candidates = detectOracleCandidates(ctx.root);
  if (candidates.length === 0) {
    const skip = await clack.confirm({
      message: "No test configuration detected — skip Oracle configuration for now?",
      initialValue: true,
    });
    if (clack.isCancel(skip) || skip) return undefined;
  } else {
    clack.log.info(
      `Detected candidates:\n${candidates.map((entry) => `  ${entry.glob}  (${entry.reason})`).join("\n")}`,
    );
  }

  const answer = await clack.text({
    message:
      candidates.length === 0
        ? "Oracle globs to declare, comma-separated (blank to skip)"
        : "Oracle globs to declare, comma-separated — edit or accept as proposed",
    initialValue: candidates.map((entry) => entry.glob).join(","),
    validate: (value) => {
      if (value === undefined || value.trim().length === 0) return undefined;
      const globs = value.split(",").map((glob) => ({ glob: glob.trim() }));
      // Re-checked against the same schema the kernel itself enforces, rather
      // than re-implementing its rules here — this is the one place a typo
      // (or a future kernel-side tightening of what a glob may look like) is
      // caught before it is written, not after the next `check` run finds it.
      try {
        parseConfig({ oracles: globs }, "init --interactive");
        return undefined;
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
    },
  });
  if (clack.isCancel(answer)) return undefined;

  const globs = answer
    .split(",")
    .map((glob) => glob.trim())
    .filter((glob) => glob.length > 0);
  return globs.length === 0 ? undefined : globs.map((glob) => ({ glob }));
}
