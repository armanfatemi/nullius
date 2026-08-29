---
name: probe-leak-side-channels
description: A CAUGHT probe score can come from the per-clone canary registry or from prior probe sections in review-evidence.md, and the taint check cannot see either — score CAUGHT as "not disproven"
metadata:
  type: project
---

Before recording `probe: caught`, read the probe section's `found by:` and
`leak:` lines and ask *how* the reviewer found the plant. Two side channels are
structural in this repo:

1. The per-clone registry — any agent running `nullius check` here trips the
   `CANARY-PRESENT` merge guard (`packages/claims/src/cli.ts:92`, the `--probing`
   flag exists to suppress it for the probe run only).
2. `review-evidence.md` is committed with the previous iterations' probe
   sections, which name the plant location, and reviewers read that file.

`verifyCanary` tests taint before caught, but only against three literal tokens
(`packages/claims/src/canary.ts:49` — `canaries.json`, `.git/nullius`,
`CANARY-`). A reviewer writing "confirmed via the local registry" or "the merge
guard fired" escapes taint and scores CAUGHT.

**Why:** on `add-authoring-ergonomics` (PR #42) the identical sentence was
planted at `proposal.md:6` five rounds running; architecture-reviewer confirmed
it from the registry in iterations 2, 3 and 4 ("third/fourth/fifth successive
plant") and rule-auditor identified iteration 1's plant by reading iteration 0's
probe section. Four CAUGHT scores, none of which measured reading.

**How to apply:** report leaked CAUGHTs explicitly (`probe_leaked`,
`probe_plant_varied` frontmatter fields) rather than passing the score through.
A leaked CAUGHT is a finding, not a healthy probe. See
[[probe-state-vs-artefact]] and [[scope-claims-need-checking]].
