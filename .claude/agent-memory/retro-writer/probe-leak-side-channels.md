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

**Third occurrence, and it got structural — `add-probe-visibility` (PR #43).**
architecture-reviewer's *durable* memory now carries the leak: commit `045c48a`
added to `project_proposal-injected-prose.md` the line "`canary status` +
`check '<dir>/**/*.md'` in one call confirmed it again … that pairing is now
3-for-3 as the fastest opener", together with the plant's exact fixture path
(`spec/fixtures/rules-valid/src/example.ts`, unvaried across five rounds, and
unvaried across the previous run too). A side channel that was incidental is now
persisted across runs. Treat any future CAUGHT from architecture-reviewer in this
repo as pre-compromised until the plant string is varied.

Also new: this run's probe sections record per-reviewer catch/miss *and* whether
each catch came from reading or the registry. That decomposition is worth more
than the aggregate — 5/5 CAUGHT decomposed to 5/5 for one reviewer (2 leaked),
2/3 for another, 0/4 for a third that was never briefed for the pass at all.

**Fourth occurrence, and a new channel — `add-journal-identity` (PR #53,
2026-08-29).** architecture-reviewer's memory file gained this run's plant host
(`design.md:6`), the same unvaried fixture path, the plant timestamp, and
"`canary status` + `check '<dir>/**/*.md'` in one call: 5-for-5". The counter is
now cumulative across runs.

The new channel is worse and is the pipeline's own: the coordinator wrote "Plant
the iteration-2 canary into design.md" into `progress.md`, which the pipeline
COMMITS into the change folder, so the plant location shipped in the diff the
reviewers read. rule-auditor cited `progress.md` as its confirmation source.
Always grep the committed change folder for the plant document before scoring a
CAUGHT.

Also confirmed empirically: paraphrase defeats taint. That round scored exit 0
while three of four reports were tainted, because the synthesis described the
leak without using any of the three literals. So TAINTED under-reports and
CAUGHT is inflated corpus-wide, not just per run.

Contrast worth keeping: checker-engineer caught the plant on the merits 3 of 3
rounds and its new memory file contains no probe machinery at all — and it
declares no false-premise pass. The declared pass is not what produces catches.
