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

**Fixed as of `add-journal-identity` (PR #53, 2026-08-29).** State now carries
`probe_iter_1..4` and agrees with `review-evidence.md` round for round;
`.claude/skills/proposal-to-pr/SKILL.md:195` mandates the per-iteration key and
says an append cannot erase an earlier one. Keep counting `## Probe` sections
anyway — the agreement is now the expected case, so a *disagreement* is the
finding.

New on that run: the coordinator overrode its own instrument in the
conservative direction. Iteration 2 exited 0 from `canary verify` and was
recorded TAINTED in both the artefact and state, because the plant had been
disclosed in a committed file. Record that as `tool_score_overridden: true` — a
tool score and a recorded verdict can now legitimately differ, and the artefact
is still the one to trust.

**`add-canary-status-redaction` (PR #58, 2026-08-31) — agrees again.** State
carried `probe_iter_1..5` matching `review-evidence.md` round for round
(caught, tainted x4). Two runs in a row where agreement is the expected case, so
keep treating a *disagreement* as the finding.

Also settled by reading the code that round: `harvestFalseClaim` sorts its
candidate glob and takes the first match, with no seed and no override
(`packages/claims/src/canary.ts:220-227`). The planted sentence is therefore a
pure function of repository content and CANNOT differ between rounds of one run.
When a probe section claims the plant was rotated, it means the host document
only. Do not record `probe_plant_varied: true` on the strength of a document
rotation.

**Third agreeing run — `add-pr-process-report` (PR #75, 2026-09-02).** State
carried `probe_iter_1..5`, all `caught`, matching five `## Probe — stage 2`
sections round for round. Agreement is now firmly the expected case; a
*disagreement* is the finding. But the field is still lossy in the way that
matters: `probe: caught` in state loses that the scored population was one agent
in two of the five rounds, and that the sole catcher carries the plant's
signature in committed durable memory. Score from the artefact and read the
narrative — see [[probe-leak-side-channels]].
