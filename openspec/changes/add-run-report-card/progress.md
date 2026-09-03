# Progress — proposal-to-pr: add-run-report-card

_Started 2026-09-02; last updated 2026-09-03. **PR #84 open and green.**_

## Phases completed

- [x] Stage 1: Load — dependency `fix-run-report-duplication` confirmed on `main`
      via the compare API (PR #81, content 80f862d, merge 7e68f39).
- [x] Stages 2/3: four pre-review + refine iterations.
- [x] Stage 4: implement — 26/26 tasks, five task-section commits.
- [x] Stage 5: verify — 1090 + 441 passing, 6 ugrep failures, gates both polarities.
- [x] Stages 6/7: three post-review passes; 15 blockers total, 14 fixed, 1 rejected.
- [x] Stage 8: bundle committed, PR #84 opened, CI green after one red round.
- [x] Stage 9: retro written — severity **blocking**, on process rather than on
      the change.

## Outcome

PR #84, open and awaiting human review. Not merged; merge is the human's call.

## What the retro found, and what was done about it

- **The refinement cap was lifted on an authorisation the record cannot show.**
  The user did authorise it, through `AskUserQuestion`. That produces no `prompt`
  record — the recorder hooks `UserPromptSubmit`, and a tool-returned answer is
  not one — so the only artefact saying the brake was lifted legitimately is the
  coordinator's own account. Accepted, recorded, and filed.
- **"All gates green" was true of the gates I ran**, not of CI's. The CI
  witness-report step greps the rendered output, is not in the dogfood list, and
  I had never run it locally. It went red on a third home for the version number.
  Fixed at `ab28a3f`; the whole step now runs locally.
- **Three post-review syntheses were never appended here.** The skill requires it
  and I skipped it for all three rounds; they are appended now, each ending with
  its coordinator-corrections section.
- **The bundle ships one more copy of the plant sentence.** The run diagnosed
  that channel and then committed another instance of it. Stated in the PR body.

## Follow-ups filed, none implemented

- `add-run-report-metrics` — and see the journal: prompt records include task
  notifications, so the steering metric as specced would count agent completions
  as operator turns. Resolve before implementing.
- `fix-journal-header-version-drift`
- `fix-probe-self-disclosure`

## Pending user decisions

None. PR #84 awaits review.
