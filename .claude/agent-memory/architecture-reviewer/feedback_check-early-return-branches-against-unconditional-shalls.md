---
name: check-early-return-branches-against-unconditional-shalls
description: Post-review technique — an implementation's early-return branch usually satisfies its own Scenario block while silently violating the unconditional SHALL paragraphs above it
metadata:
  type: feedback
---

When reviewing an implementation against an OpenSpec `spec.md`, check every
early-return branch in the new function against the **unconditional requirement
prose**, not only against the `#### Scenario:` block that names that branch.

**Why:** in `add-probe-visibility`, `captureChecks`' `unknown` early return
(`packages/kit/src/doctor.ts:218`) satisfied its own "a settings file does not
parse" scenario exactly, while violating two unconditional SHALLs stated higher
in the same spec — "where no settings file sets the variable, the report SHALL
state which files were read" and "where payloads are held, the report SHALL
state how many are held". Scenarios are written per-branch, so a branch-shaped
implementation matches them by construction; the unconditional paragraphs are
the ones with no branch to anchor them, and are where the gaps land.

**How to apply:** list the function's return statements first, then read the
spec's non-scenario prose and ask of each SHALL "does this branch also do it?"
Watch for a unit test that *pins* the omission (there, a test asserting the
detail string is identical with and without payloads) — a pinned violation is
still a violation, and the test makes it permanent rather than accidental.

Related: [[feedback_reread-spec-after-design-rewrite]],
[[feedback_verify-counts-not-just-anchors]].
