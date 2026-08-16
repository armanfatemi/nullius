/**
 * Absence citations in a checked document carry a shell command that this tool
 * re-runs. That is an execution surface, so it is deliberately narrow: only
 * `grep` / `rg` pipelines are permitted, and no token that enables chaining,
 * substitution, or redirection may appear anywhere in the string.
 *
 * See spec/evidence-anchors.md → "Security model".
 */

/** Tokens that enable chaining, substitution, or redirection. */
const FORBIDDEN_TOKENS = [";", "&&", "||", "$(", "`", ">", "<", "\n"] as const;

/** Only these binaries may start a pipeline segment. */
const ALLOWED_BINARIES = ["grep", "rg"] as const;

export type SafetyVerdict = { safe: true } | { safe: false; reason: string };

export function isSafeSearchCommand(command: string): SafetyVerdict {
  const trimmed = command.trim();
  if (trimmed.length === 0) {
    return { safe: false, reason: "command is empty" };
  }

  // Checked before the pipe split so that `||` can never be mistaken for two
  // empty pipeline segments.
  for (const token of FORBIDDEN_TOKENS) {
    if (trimmed.includes(token)) {
      return {
        safe: false,
        reason: `contains forbidden token '${token === "\n" ? "\\n" : token}'`,
      };
    }
  }

  const segments = trimmed.split("|").map((segment) => segment.trim());
  for (const segment of segments) {
    if (segment.length === 0) {
      return { safe: false, reason: "pipeline has an empty segment" };
    }
    const binary = segment.split(/\s+/)[0] ?? "";
    if (!ALLOWED_BINARIES.some((allowed) => binary === allowed)) {
      return {
        safe: false,
        reason: `segment '${segment}' does not begin with grep or rg`,
      };
    }
  }

  return { safe: true };
}
