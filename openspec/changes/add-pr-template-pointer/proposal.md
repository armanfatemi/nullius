# Proposal — add-pr-template-pointer

> **Depends on:** None

## Problem

The Action already checks the pull request description for Evidence Anchors,
and describes it as the one claim-carrying document every workflow has:

**Evidence:** `action/action.yml:21@5f88e21` — `      the one claim-carrying document every workflow has. Runs only on`

Nothing `init` places tells a contributor, or a contributor's coding agent, to
put anchors in that description. The result on an adopting repository is a
check that runs on every pull request, finds zero grounding markers, and
reports that truthfully — a green step that means "nobody was asked" and reads
as "nothing was wrong". The one surface where an outside contributor's agent
reliably looks for instructions before writing a PR body is the repository's
pull request template, and `init` does not touch it.

This repository is the illustration rather than the counterexample. It *does*
have a pull request template, and that template already asks for anchors —

**Evidence:** `.github/PULL_REQUEST_TEMPLATE.md:27@78c13a0` — `- [ ] Load-bearing claims about existing code carry Evidence Anchors, verified`

— but that checklist item was written by hand, is about the code the diff
touches, and says nothing about the PR description the Action actually reads.
Every adopting repository would have to reach the same idea independently,
because `init` never mentions it.

## Why now

The PR-body check shipped without the authoring half that makes it produce
anything, and every day it runs on an adopting repository it trains a
maintainer to read "0 markers checked" as normal. The gap is cheap to close
and gets more expensive to close later, once maintainers have learned to skip
the comment.

## What changes

- `.github/PULL_REQUEST_TEMPLATE.md` becomes a pointer host, so `init`
  contributes its one-line authoring pointer there, following the existing
  `planPointer` discipline.
- `POINTER_HOSTS` becomes a list of host *groups*, and `planPointer` visits
  every group — taking at most one host from each, as it does today — and
  returns `PlannedFile[]`. This is a contract change, not a loop tweak, and it
  is what makes the feature reachable at all. `CLAUDE.md` and `AGENTS.md` stay
  one group and behave exactly as now. See Decision 4.
- The pointer text used in a PR template is addressed to the PR description
  rather than to the codebase generally, so a second `POINTER_LINE` constant
  is introduced for that group, and the idempotence check becomes per-group.
- `init`'s write-log names the PR template among the user-owned files it
  looked for, and says plainly when it found none — the same not-found note
  the existing hosts already get, carrying the same copyable sentence. A
  repository with `CLAUDE.md` and no PR template now gets that second note,
  where previously the loop had already returned and said nothing.
- This repository's existing `.github/PULL_REQUEST_TEMPLATE.md` gains the
  pointer by appending one line, so the convention is dogfooded rather than
  only published. The file is not rewritten.

## Non-goals

- **Rendering a full PR template.** `init` will not author or overwrite a
  contributor-facing template. See Decision 1 in `design.md`.
- **Creating a PR template where none exists.** Consistent with `planPointer`
  refusing to create `CLAUDE.md`. The consequence — repositories without a
  template get nothing — is stated as an accepted limitation, not solved here.
- **Supporting every template location GitHub honours.** Only the two `.github/`
  spellings are looked for. A repository whose template is at the repository
  root, under `docs/`, or in the directory form `.github/PULL_REQUEST_TEMPLATE/`
  is treated as having no template and gets the not-found note. GitHub does not
  publish a precedence across those locations, and an uncitable ordering inside a
  `SHALL` is worse than a limitation written down. See Decision 5.
- **Any change to what the Action checks or reports.** The PR-body check is
  already shipped; this change only causes it to have input.
- **Any kernel change.** `packages/claims` is untouched.
- **A `doctor` report on pointer presence.** Considered and dropped in Stage 3
  review. `doctor` makes no pointer statement today, and the reason is two
  lines. The pointer is only planned when `touchUserFiles` is set —

  **Evidence:** `packages/kit/src/render.ts:390@78c13a0` — `      if (!touchUserFiles) {`

  — and `doctor` is the caller that sets it false:

  **Evidence:** `packages/kit/src/cli.ts:603@78c13a0` — `      touchUserFiles: false,`

  So adding a report is new surface in a file with no pointer awareness at all,
  and it is separable from placing the pointer. Tracked as a follow-up in
  `tasks.md`; the consequence — a pointer deleted by hand is not reported — is
  accepted for now.

## Dependencies

### Hard (must be merged before this starts)

None.

### Soft (design assumes these exist; graceful degradation if absent)

`add-probe-visibility` — edits the same `runInit` output region. Not a
semantic conflict; a merge adjacency worth knowing about.

### Enables (future changes that will depend on this)

`add-maintainer-card` — a card reporting on PR-body anchors is more useful once
contributors are being asked to write them. Soft, not hard: the card renders
whatever the checker found, including nothing.

## Size estimate

|                                |                                        |
| ------------------------------ | -------------------------------------- |
| Estimated tasks                | 32 (re-derived at Stage 3 iteration 4; the original ~14 predated Decisions 4 and 5) |
| Packages or surfaces touched   | 5 (packages/kit, .github/, openspec/specs/installer, action/README.md, CHANGELOG.md) |
| Risk                           | MEDIUM — `planPointer` changes its return contract, and two tests are filesystem-case-dependent |
| Expected sessions to implement | 1-2                                    |

## Open questions

1. **Does a pointer in a PR template actually reach an agent?** The pointer is
   one sentence in a file the agent sees as prefilled body text. Whether a
   coding agent treats that as an instruction or as boilerplate to delete is
   an empirical question this change does not answer. It is the reason the
   scope stops at a pointer rather than growing into a prescriptive template.
2. ~~**What should the not-found note recommend?**~~ **Resolved in Stage 3:**
   print the sentence, because the existing note already does. `render.ts`'s
   not-found note ends `— add this line to yours: ${POINTER_LINE}`, so a
   copyable snippet is the established convention rather than a new idea, and
   the PR-template host mirrors it with its own sentence.
