---
name: add-oracle-conservation
description: 2026-08-29 pre-review of openspec/changes/add-oracle-conservation; iters 1-3, PASSING-complement blocker closed at iter 3, open CI-confound blocker
metadata:
  type: project
---

Pre-review (plan phase) of `openspec/changes/add-oracle-conservation/`, iterations 1-3
on 2026-08-29. Proposes `oracles` config key, `decision.justifies`, `nullius oracle <range>`,
`OracleVerdict` = `ok` | `UNJUSTIFIED-ORACLE-CHANGE` (passing) | `MALFORMED-JUSTIFICATION` (excluded).

**Closed at iteration 3.** PASSING-complement blocker resolved: `MALFORMED-JUSTIFICATION`
excluded with a written argument, mirroring `malformed-rule-header` at `rules.ts:50-57`.
Config plumbing corrected to four hops; verified `configVersion` really has interface +
KNOWN_KEYS entries and no assignment branch, and the forwarding hop is `cli.ts:895-914`.

**Open at iteration 3 (re-check post-review):**
- **Blocker.** This repo has NO `nullius.config.json` at root, so the absent-`oracles`
  path (task 1.3, non-zero exit) and `MALFORMED-JUSTIFICATION` (task 6.2 negated arm)
  produce the same exit code. The negated CI arm passes whether or not the verdict fires.
  No task adds an `oracles` config to this repo.
- **Concern.** The union's two failure-bearing members attach to different subjects —
  `UNJUSTIFIED-ORACLE-CHANGE` to a changed path, `MALFORMED-JUSTIFICATION` to a journal
  record. Plan does not name the result carrier `isOracleFailure` takes.

**Non-content note.** `tasks.md:4` carries a stray sentence about `retry` in
`spec/fixtures/rules-valid/src/example.ts` that splits an unrelated sentence and has
nothing to do with this change. Reported, not acted on.

**Why:** plan-stage findings, confirmable only once code exists.
**How to apply:** at post-review, confirm the negated CI arm cannot pass via the
absent-config route, and that `isOracleFailure`'s carrier is defined.

Related: [[add-journal-identity]], [[add-rules-compliance]].
