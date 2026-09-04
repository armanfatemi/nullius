# Proposal — add-local-checker-binary

> **Depends on:** None

## Problem

A change to the checker cannot be seen working on a pull request until it is
published. The Action installs a pinned release rather than running the
repository it lives in:

**Evidence:** `action/action.yml:102@716d1a6` — `          docs_output=$(npx -y "@nullius-inverba/claims@${CLAIMS_VERSION}" check $GLOBS "${args[@]}" 2>&1)`

The pin is deliberate and should stay — pinning the Action without pinning its
checker is not a pin, and a breaking CLI change would otherwise reach every
caller the day it published. The gap is that there is **no way to opt out
locally**, so this repository cannot dogfood its own pull-request comments.

The cost is not hypothetical. It has now happened three times in one session,
each time in the same shape: a change verified end to end locally, reported as
working, and then absent from the pull request that was supposed to demonstrate
it.

1. The run report's reviewer card. Verified locally, invisible on its own PR.
2. The maintainer card. Same.
3. The fix that stopped a failing journal blocking every count taken from it.
   Verified locally against the real bundle; the PR comment kept showing three
   unanswered rows, because the published checker still had the old behaviour.

Each time the author's claim was true of the working tree and false of the
artefact a reviewer was looking at, and nothing in the comment distinguished
them.

The kit already solved this for the recorder. Its hooks take an environment
override and say so, in the message they print when the runner cannot be found:

**Evidence:** `plugin/hooks/witness-record.sh:37@716d1a6` — `runner="${NULLIUS_KIT_BIN:-npx -y @nullius-inverba/kit}"`

## Why now

The gap is cheapest to close while the reason for it is fresh and the three
instances are on record. It also removes the standing temptation to describe a
locally verified change as though the pull request showed it.

## What changes

- The Action reads an override — `NULLIUS_CLAIMS_BIN`, mirroring the kit's
  `NULLIUS_KIT_BIN` — and runs it instead of `npx` when set. Unset, behaviour is
  exactly as today.
- The comment states which checker produced it when the override is in use, so
  a card rendered from a working tree is never mistaken for one a released
  checker produced.
- This repository's own workflow sets it, so its pull-request comments are
  rendered by the code in the pull request.

## Non-goals

- **Removing the pin.** It is correct. A consumer that has not opted in must
  keep getting the release it pinned.
- **Making the override reachable from a fork's pull request.** It is a
  workflow-level setting and stays one; a PR-controlled value that changed which
  binary CI executes is a supply-chain hole, not a convenience.

## Size estimate

Small. One shell variable in each of the Action's invocation sites, one line in
the comment, and one workflow change here. The care is in the second non-goal.
