---
name: project-add-pr-process-report
description: Pre-review audit (iterations 1-5) plus post-review (Stage 6) of add-pr-process-report — canary relocates each round, iteration 2 false looks-good on a scope-mismatched anchor, post-review clean
metadata:
  type: project
---

Audited 2026-09-01, proposal mode then diff mode, `openspec/changes/add-pr-process-report/`.

**Iteration 1:** canary in `proposal.md:8`. One `[concern]` — tampered-bundle
scenario had no named fixture/test yet (fixed by iteration 6/final).

**Iteration 2:** canary moved to `design.md:7`. **My error this round:** marked
`spec/witness-journal.md:225`/`:228` `[looks-good]` without reading the
paragraph's own scope boundary (`>=0.6` vs the `0.2` claim it was cited for).
See [[feedback_anchor_verification_method]].

**Iteration 3:** canary at `tasks.md:4`. Design.md self-corrected the
iteration-2 misreading; confirmed clean.

**Iteration 5 (rules-only pass):** canary at `design.md:7`. All STALE anchors
confirmed passive drift via `git blame -L`. One genuine full re-stamp
(`action.yml:47@c8305b1`→`@04cd9ac`) verified correct. One bare unstamped
citation found (`proposal.md:231` → `cli.ts:904`), flagged `[concern]`.
Security-shaped concern raised (redaction design commits `report.statement`
uncapped into a public envelope) — routed, no rule governs it.

**Post-review (Stage 6, diff mode, 80 files/~11.8k insertions/6 commits,
`git diff main...HEAD`):** Everything the coordinator flagged for scrutiny
checked out clean:
- Hard rule 12 (no gate via stored command string): the `claims="node ...
  cli.js"` pattern was fully removed from the new report step in
  `.github/workflows/ci.yml` (confirmed via diff `-` lines); all 7 call sites
  now direct. Pre-existing `kit=`/other `claims=` vars elsewhere in ci.yml are
  unchanged context, out of scope for this diff.
- `action/action.yml`: new marker `<!-- nullius-run-report -->` vs existing
  `<!-- nullius-claims -->` — checked both directions of `.startswith()` in
  Python, neither is a prefix of the other. Both SHAs read from
  `$GITHUB_EVENT_PATH`, no PR-controlled interpolation into shell.
- `one-delivery-mechanism`: no `.claude/settings.json` diff at all in this PR
  (grepped whole diff for the string — only prose mentions in docs).
- `rev-stamp-change-anchors`/`never-repoint-under-old-stamp`: ran
  `check 'openspec/**/*.md'` directly — 405/405 grounding markers verified,
  exit 0, across 52 documents. Spot-checked the one differently-hashed new
  anchor (`checkReport.ts:262@c8305b1`) — genuine fresh stamp, text matches.
- SKILL.md Stage 8 (`witness bundle` → commit → push before `gh pr create`):
  uses `git add nullius.runs/` (specific path, not `-A`/`-a`) — complies with
  skill hard rule 11. No merge — complies with hard rule 1. The
  "raw source lines committed" sensitivity flagged by the coordinator turned
  out to be a **documented, deliberate design decision** in design.md's
  "Redaction is line-level" sections (not an oversight) — still flagged
  `[concern]` and routed since no `.claude/rules/*.md` governs artifact
  sensitivity, but distinguished explicitly as "known trade, not a miss."
- The two unrelated proposal repairs (`add-diff-scoped-strictness`'s narrowed
  grep pattern, `add-maintainer-card`'s corrected count) were **independently
  re-run by hand** rather than trusted from the diff's own framing — both
  came back exactly as the repair described, and in both cases the narrowing
  supported rather than weakened the original claim (an internal identifier
  in another verb's renderer becoming non-zero isn't evidence about a
  different verb's argument surface). `[looks-good]`, and worth remembering
  as a template: when an author repairs their own falsified anchors,
  re-derive the check yourself rather than accepting "I checked, it's fine."
- No new `Verdict` member added this PR — confirmed by grep — so
  `verdict-needs-fixture-and-test.md` correctly not triggered.

**Recurring lesson for this change specifically:** the canary relocates every
round without being told to stop; across six rounds (five pre-review + this
post-review) it never leaked into a real finding, but the tool check (not
manual scanning) is what to run for it every time.
