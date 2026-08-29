# Progress — proposal-to-pr: add-probe-visibility

_Started 2026-08-28; last updated 2026-08-28_

## Phases completed

- [x] Stage 1 Load; Stages 2/3 x5 (pre-review + refine); Stage 4 Implement;
      Stage 5 Verify; Stage 6 Post-review; Stage 7 Address must-fixes x2;
      Stage 8 PR opened — https://github.com/armanfatemi/nullius/pull/43

## Current phase

**Stage 9 (Retro).** PR is open. All 30 tasks ticked, kit 258/258, all seven
dogfood gates green both polarities.

## Outcome

Five pre-review iterations, two post-review passes, five refinements. The plan
was wrong four times in the same way — each fix applied to the quoted sentence
while a sibling making the identical claim survived — and the sweep-framed fifth
round found five at once. Post-review then found two blockers in the code, both
in the branch where the forbidding-phrase tests cannot fire.

## Merge facts the human needs

- Merge with a **merge commit**. 19 anchors are stamped `@12cde11`, an ancestor
  of this branch but not of `main`. A squash or rebase orphans them into
  advisory UNVERIFIABLE-REV: checker fails open, CI green, gate gone.
- The branch carries one unrelated pre-existing commit (`retro`) because it was
  cut from `12cde11` rather than `main`. A reviewer suggested rebasing to drop
  it; declined for the reason above, and recorded in review-evidence.md.

## Pending user decisions

- None. Merge is the human's call, per the pipeline's terminal state.
