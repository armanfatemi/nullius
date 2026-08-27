---
name: probe-state-vs-artefact
description: The pipeline state file's `probe` key is last-write-wins and disagrees with review-evidence.md on multi-iteration runs — always score the probe from the artefact
metadata:
  type: project
---

`.git/nullius/pipeline/<change>.state.json` holds `probe` as a single scalar,
written through a plain last-write-wins setter (`writeStateKey` in
`packages/kit/src/pipeline.ts`). Stage 2 re-plants a canary every refinement
round, so a run with three pre-review iterations produces three probe verdicts
and the state file keeps only the last.

**Why:** observed on `add-wiring-malformed-input` (PR #39, first end-to-end
`proposal-to-pr` run): `review-evidence.md` carried three `## Probe — stage 2`
sections scoring MISSED, CAUGHT, CAUGHT, while state read `"probe": "caught"`.
A retro written from state would report zero probe misses for a run that had one.

**How to apply:** count `## Probe` sections in `review-evidence.md` and score
from those; treat the state key as a cross-check, and record the disagreement
itself as a finding. Also worth knowing: a `MISSED` is often a *synthesis*
fidelity failure rather than a quiet review layer — `verifyCanary` matches only
on the full repo-relative `doc:line` or the planted text verbatim, so a
synthesis that paraphrases or uses a bare filename scores MISSED even when the
reviewers all caught the plant. Check the reviewers' findings before concluding
the layer went quiet. See [[scope-claims-need-checking]].
