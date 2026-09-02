---
name: router-omits-checker-engineer
description: The pipeline routing table keys checker-engineer on five fixed kernel filenames; two consecutive runs were rescued only by the coordinator overriding it by hand
metadata:
  type: project
---

When a retro's evidence file says a reviewer was "added by hand", check the
routing table before recording it as coordinator discretion — it is usually a
table defect with a one-line fix.

**The table:** `packages/kit/src/pipeline.ts` — `KERNEL_MODULES` is five fixed
paths (`checkClaims.ts`, `config.ts`, `wiring.ts`, `witness.ts`, `rules.ts`) at
`:74-78`, and `:162` gates `checker-engineer` on membership. A NEW kernel module
earns no kernel reviewer.

**Why:** two runs in a row were saved by the same override.
- `add-run-ledger-producer` (PR #74): `route` omitted checker-engineer in
  round 1; added by hand; it raised 13 of 22 evidenced findings.
- `add-pr-process-report` (PR #75): omitted TWICE, in both review stages, for two
  different reasons. Proposal mode, because `route` reads only `proposal.md` and
  `tasks.md` and the kernel paths were cited in `design.md` / by bare filename —
  the coordinator fixed that properly, by editing the artefacts so the router
  earns the agent. Diff mode at Stage 6, because the change adds a 1509-line new
  kernel module matching none of the five names. **Both Stage 6 blockers came
  from the hand-added agent**, and by its own account neither moves a verdict or
  trips a fixture, so nothing in CI would have surfaced them.

**How to apply:** `checker-engineer` is consistently the highest-yield reviewer in
this corpus and consistently the one the router drops. Count its findings share
every run, and treat a hand-add as a proposal against `pipeline.ts`, not as a note
about the coordinator. See [[where-coordinator-errors-surface]].
