/**
 * `fiducial eager-prompt <doc>` — the refute-first audit brief for a document
 * with NO anchors yet.
 *
 * Eager mode cannot be deterministic (extracting claims from prose and
 * hunting evidence are model tasks), so the CLI does not run a model. It
 * ships the PROTOCOL: a brief any harness can execute
 * (`claude -p "$(fiducial eager-prompt design.md)"`), whose only permitted
 * output is candidate anchors — which the deterministic checker then verifies
 * like anyone else's. The model proposes; the checker disposes.
 *
 * Refute-first is load-bearing, not stylistic: a model sent to find evidence
 * FOR claims will find it — a real line that exists, passes the checker, and
 * doesn't entail the claim. Sent to refute, the same model catches the
 * false-premise case this project was built on.
 */

import { DEFAULT_BINDING_MOMENTS } from './checkClaims';

export function buildEagerPrompt(
  docPath: string,
  content: string,
  moments: readonly string[] = DEFAULT_BINDING_MOMENTS
): string {
  return `You are performing a DESCRIPTIVE audit of the document below — not a review of whether its plan is good, but of whether what it says about the existing codebase is TRUE. Work refute-first: your default hypothesis for every claim is that it is wrong. You are not summarizing the document; you are auditing it against reality.

Document under audit: ${docPath}

## Protocol

1. Extract every LOAD-BEARING claim about existing code, config, or infrastructure — a factual assertion whose removal would change the decision, the risk assessment, or the implementation. Skip judgment calls, trade-off reasoning, product risk, and claims about code the change will CREATE.

2. For each claim, go to the code and attempt to REFUTE it. Open the files it implies. Run the searches it implies. Never assess plausibility from memory or from the document's own framing — every conclusion below must trace to a file you actually opened or a search you actually ran.

3. Classify each claim:

- REFUTED — you found counter-evidence. Report the claim, the counter-evidence as a checkable anchor (grammar below), and the note: "re-examine the decision this claim was supporting." Counter-evidence goes in your report, not the document — the claim itself needs the author's correction.
- SUPPORTED — you found direct evidence. Propose an anchor to insert directly under the claim in the document.
- UNVERIFIABLE — you could neither support nor refute with concrete evidence. Propose moving the claim to an "## Open questions" section.

4. Anchor grammar — must be exact; a deterministic checker re-verifies every anchor you propose:

**Evidence:** \`path/to/file.ext:LINE\` — \`exact text appearing on that line\`
**Evidence:** \`grep -rn --include='*.ext' 'pattern' dir/\` → N results

- Paths are repo-relative. The quoted text must actually appear on that line (use a double-backtick span when the cited text itself contains a backtick).
- Absence commands: grep/rg pipelines only, with allowlisted flags. There is no shell — the command is spawned as argv, so metacharacters, redirection and variable expansion are refused, and a '*' glob is passed through literally: use --include=/-g instead. Search paths must be repo-relative, like citations. One output line per match — never grep -c.
- Quote enough of a line to be WRONG if the code changes. A quote that matches several lines of the file is WEAK-ANCHOR when it sits on the cited line, and a hard UNPINNED failure once that line number is stale — so quote something that occurs once. A short quote is advisory. For a long or multi-line quote, put it in a fenced block under the marker instead of a code span.
- An absence anchor is weaker than a presence one: its verdict is SEARCH-CLEAN, certifying the search and never the absence. For a load-bearing absence, stack several searches and state the blind spots that remain.
- Cite source files, never generated output (codegen, lockfiles, build artifacts).
- A compatibility-risk claim must also name when it binds: **Binds at:** \`<moment>\`, from this project's closed list: ${moments.join(', ')}. A risk that binds at build/compile time is caught by CI and is not a runtime risk — say so instead of anchoring it.

5. Present everything as a proposed edit to the document for the author's review. Do NOT present your anchors as verified truth — they are proposals, and the author adopting them is the entailment review. Then run:

    npx -y fiducial check "${docPath}"

and confirm every marker verifies. A FABRICATED, UNPINNED or COUNT-MISMATCH verdict on an anchor you proposed means you fabricated or cited something that identifies nothing — return to step 2 for that claim. DRIFT and WRONG-LINE pass: they mean the line number is stale, not that the claim is false.

## Document

\`\`\`\`markdown
${content}
\`\`\`\`
`;
}
