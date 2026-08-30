# Proposal — add-pr-template-pointer

> **Depends on:** None

## Problem

The Action already checks the pull request description for Evidence Anchors,
and describes it as the one claim-carrying document every workflow has:

**Evidence:** `action/action.yml:21@5f88e21` — `      the one claim-carrying document every workflow has. Runs only on`

Nothing anywhere tells a contributor, or a contributor's coding agent, to put
anchors in that description. The result on an adopting repository is a check
that runs on every pull request, finds zero grounding markers, and reports
that truthfully — a green step that means "nobody was asked" and reads as
"nothing was wrong". The one surface where an outside contributor's agent
reliably looks for instructions before writing a PR body is the repository's
pull request template, and `init` does not touch it.

This repository has never had one either, so it cannot demonstrate the
convention it publishes:

**Evidence:** `grep -rn 'PULL_REQUEST_TEMPLATE' .github/` → 0 results

## Why now

The PR-body check shipped without the authoring half that makes it produce
anything, and every day it runs on an adopting repository it trains a
maintainer to read "0 markers checked" as normal. The gap is cheap to close
and gets more expensive to close later, once maintainers have learned to skip
the comment.

## What changes

- `.github/PULL_REQUEST_TEMPLATE.md` joins `POINTER_HOSTS` as a place `init`
  will contribute its one-line authoring pointer, using the existing
  `planPointer` discipline unchanged.
- The pointer text used in a PR template is addressed to the PR description
  rather than to the codebase generally, so a second `POINTER_LINE` constant
  is introduced for that host.
- `init`'s write-log names the PR template among the user-owned files it
  looked for, and says plainly when it found none — the same not-found note
  the existing hosts already get.
- `doctor` reports whether the pointer is present in a repository that has a
  PR template, so a silently-reverted pointer is visible.
- This repository gains its own `.github/PULL_REQUEST_TEMPLATE.md` carrying
  the pointer, so the convention is dogfooded rather than only published.

## Non-goals

- **Rendering a full PR template.** `init` will not author or overwrite a
  contributor-facing template. See Decision 1 in `design.md`.
- **Creating a PR template where none exists.** Consistent with `planPointer`
  refusing to create `CLAUDE.md`. The consequence — repositories without a
  template get nothing — is stated as an accepted limitation, not solved here.
- **Any change to what the Action checks or reports.** The PR-body check is
  already shipped; this change only causes it to have input.
- **Any kernel change.** `packages/claims` is untouched.

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
| Estimated tasks                | ~12                                    |
| Packages or surfaces touched   | 3 (packages/kit, .github/, openspec/specs/installer) |
| Risk                           | LOW                                    |
| Expected sessions to implement | 1                                      |

## Open questions

1. **Does a pointer in a PR template actually reach an agent?** The pointer is
   one sentence in a file the agent sees as prefilled body text. Whether a
   coding agent treats that as an instruction or as boilerplate to delete is
   an empirical question this change does not answer. It is the reason the
   scope stops at a pointer rather than growing into a prescriptive template.
2. **What should the not-found note recommend?** For `CLAUDE.md` the answer is
   "nothing, that is your call". For a PR template, a maintainer may reasonably
   want `init` to print a copyable snippet without writing it. Resolve in
   Stage 3.
