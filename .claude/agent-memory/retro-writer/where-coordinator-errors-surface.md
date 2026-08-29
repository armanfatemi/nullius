---
name: where-coordinator-errors-surface
description: review-evidence.md now carries "## Coordinator corrections since last append" blocks and [corrected-coordinator] finding tags — read them, and know what they still cannot show
metadata:
  type: project
---

Grep `review-evidence.md` for `## Coordinator corrections since last append` and
for the `[corrected-coordinator]` tag on finding headers before writing anything
about the coordinator's own errors.

**Why:** the standing blind spot in this role is "an error the coordinator
noticed and fixed before committing, which appears in no artefact". As of
`add-probe-visibility` (PR #43, 2026-08-29) that is only *mostly* true: eight
corrections blocks and eight `[corrected-coordinator]`-tagged findings existed in
one run. But nearly all of them record an error a *reviewer* caught. Genuinely
self-caught entries were rare (two: a zsh `$cmd` word-splitting loop that falsely
reported gates failing, and a probe-scoring citation truncation). So the blind
spot is narrower than it was and is still non-empty, and its size is unknown.

**How to apply:** mine these blocks — they are the densest source of real
findings in the file, and they are where cross-round patterns get named (this run
named "local edit where a document-wide sweep was needed" and "a reviewer's
finding tightened into a claim the reviewer never made", the latter three times
in one run, once reaching the implementation). Then still write the blind spot
under `## Uncertainty`: a corrections block is evidence of what was caught, never
of what was not. See [[probe-state-vs-artefact]] and
[[scope-claims-need-checking]].
