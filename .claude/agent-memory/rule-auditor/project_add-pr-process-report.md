---
name: project-add-pr-process-report
description: Pre-review audit of add-pr-process-report (Stage 2), iterations 1-5 — canary relocates each round, iteration 2 false looks-good on a scope-mismatched anchor, iteration 5 was rules-only (dropped from anchor-support duty)
metadata:
  type: project
---

Audited 2026-09-01, proposal mode, `openspec/changes/add-pr-process-report/`.

**Iteration 1:** canary in `proposal.md:8`. One `[concern]` — tampered-bundle
scenario had no named fixture/test yet (fixed by iteration 6/final: now
`tasks.md` §6 names it against `specs/check-cli/spec.md`'s exact requirement
title).

**Iteration 2:** canary moved to `design.md:7`. **My error this round:** marked
`spec/witness-journal.md:225`/`:228` `[looks-good]` without reading the
paragraph's own scope boundary (`>=0.6` vs the `0.2` claim it was cited for).
See [[feedback_anchor_verification_method]].

**Iteration 3:** canary at `tasks.md:4`. Design.md self-corrected the
iteration-2 misreading; confirmed clean.

**Iteration 5 (final rules-only pass, dropped from anchor-support duty after
two misses):** canary at `design.md:7` again (planted 2026-09-01T03:12:26Z).
Focused only on rule-surface, not anchor-support:

- `rev-stamp-change-anchors`/`never-repoint-under-old-stamp`: ran the tool
  directly (`check 'openspec/changes/add-pr-process-report/**/*.md'`, 46
  presence + 7 search anchors, 0 FABRICATED). All STALE anchors (design.md:16,
  23, 65, 71, 75, 77; proposal.md:24, 26) confirmed via `git blame -L` as
  untouched since first-draft commit `e86705d4` — passive drift from later
  commits shifting the cited files, not author repoints. `design.md:47`
  (`action.yml:47@c8305b1`→`@04cd9ac`) is a genuine full re-stamp: verified via
  `git show <hash>:action/action.yml | sed -n 47p` that the text actually
  changed (`0.8.0`→`0.9.1`) at that exact line across both commits — correct
  re-read-and-re-stamp-both-halves, not a violation.
- **New finding:** `proposal.md:231` cites `packages/claims/src/cli.ts:904`
  as a **bare backtick citation with no `**Evidence:**` label and no `@hash`**
  — outside the checker's grounding-marker grammar entirely, so uncovered by
  `check`. Verified by hand (`awk NR==904`) that the quote/paraphrase is
  accurate (`if (report.unconfigured) {`). Flagged `[concern]` under
  `rev-stamp-change-anchors.md` — same pattern as
  `add-wiring-malformed-input`'s bare citations, see
  [[feedback_anchor_verification_method]]. Distinguished from design.md's ~9
  bare citations (`133`, `165`, `232`, `278`, `322`, `341`, `375`, `446`,
  `553`), all of which are explicit backreferences ("above", "cited in
  proposal.md") to an anchor stamped elsewhere in the same doc-set — those are
  fine, not fresh unstamped claims.
- `verdict-needs-fixture-and-test`: this change adds **no new `Verdict`
  member** (confirmed — that's `add-rev-ancestry-check`, a separate soft dep).
  Tasks §3's named-verdict round-trip assertions (`stale-verification`
  survives, `malformed`/`duplicate-id` survive a round trip via bundling) are
  extra rigor on existing verdicts, not what the rule requires — `[looks-good]`,
  rule not actually triggered by this change's scope.
- `model-proposes-code-verifies`: explicitly discharged — Non-goals says "no
  summary is generated," and tasks §4's round-detection task explicitly
  forbids using the retrospective's prose counts as the oracle ("it is prose a
  model wrote, which is not what a deterministic test is measured against").
  `[looks-good]`.
- `openspec-shall-first-line`: all 8 new requirements across both spec deltas
  open their body with SHALL on line 1. `[looks-good]`.
- Decision 12 (Stage 8 bundle-commit-push): uses `git add nullius.runs/`
  (specific path), not `-a`/`-am` — complies with skill rule 11. No merge
  anywhere — complies with rule 1.
- **Security-shaped concern raised (not a rule violation, per system-prompt
  instruction to route rather than clear as looks-good):** the redaction
  design (design.md ~line 322, tasks.md task 25) carries `report.statement`
  "exactly as recorded, not capped by the bundle" into a **committed, public**
  envelope. No `.claude/rules/*.md` file governs this, so it's `[concern]`
  routed to a human rather than silently waved through.

**Recurring lesson for this change specifically:** the canary relocates every
round without being told to stop; five rounds in it's still present and still
worth checking for (`CANARY-PRESENT` verdict from the tool, not manual
scanning — cheap and exact).
