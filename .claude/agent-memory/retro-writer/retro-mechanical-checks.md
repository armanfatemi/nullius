---
name: retro-mechanical-checks
description: Cheap Step-1 commands that have each surfaced a real finding — per-commit numstat for binary blobs, an awk tally for per-agent attribution, and max_refine vs the documented default
metadata:
  type: project
---

Three checks that cost one command and have each produced a finding no narrative
would have offered.

**1. `git diff --numstat <c>^ <c> -- <file>` per commit, looking for `-  -`.**
A `Bin` in a diffstat means the diff was *unreviewable*, not merely large. On
`add-oracle-conservation` (PR #55) `oracle.ts` was committed with literal NUL
bytes used as glob sentinels; build, type-check, 874 tests and every dogfood gate
were green on it, and the next commit found three defects in the file nobody
could read. **Adjudicate before writing it up:** `git show --stat` prints `Bin`
whenever *either* side is binary, so the repair commit's own stat still says
`Bin`. Use `numstat` on each side to find which blob was actually binary — I
nearly filed the fix commit as a false commit message on this run.

**2. Tally findings by tag and named agent with awk**, over bullets matching
`^- \*\*\[`, splitting on the tag and searching the bullet body for each agent
name. "Closed" sections use `- **Title.**` with no tag, so they are excluded for
free. Then grep the tagged bullets for negations ("did not see", "missed by")
before trusting the counts, and label them heuristic in the file.

**3. Compare state `max_refine` against the documented default**
(`.claude/skills/proposal-to-pr/SKILL.md:60` — default 3). A mismatch means the
cap was raised, which is a human intervention that leaves no `pause_reason`
behind once resumed. Record who raised it as `unknown` if it is not written down.

See [[where-coordinator-errors-surface]] and [[probe-leak-side-channels]].
