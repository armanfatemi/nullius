---
name: stage-a-rationale-falsified-by-stage-b
description: In a multi-stage PR, a comment written in an early stage can be falsified by a later stage of the same PR — check export rationales against the kernel/kit boundary
metadata:
  type: feedback
---

In a staged PR (Stage A kit, Stage B kernel), a rationale comment written in
Stage A is checked against Stage A's tree and nobody re-reads it after Stage B.
Diff the comment's claim against the *final* tree, not the commit that added it.

**Why:** `add-pr-process-report` — `packages/kit/src/bundle.ts` exported
`reconstructJournal` saying "a second implementation of it in the reader would
be the place the two halves drift." Stage B then wrote exactly that second
implementation in `packages/claims/src/witnessReport.ts`, because the kernel
may not import the kit. The export's stated reason is unreachable by
construction, and the kit copy is now used only by kit's own tests.

**How to apply:** whenever a kit module exports something "so the reader can
use it," ask whether the reader is in `packages/claims` — if so the export can
never serve that purpose, and the duplication the comment warns about is
mandatory. Related: [[feedback_check-design-code-fences]].
