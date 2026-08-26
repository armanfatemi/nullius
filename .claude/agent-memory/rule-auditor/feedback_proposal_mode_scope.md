---
name: feedback-proposal-mode-scope
description: In proposal mode, derive in-scope files from tasks.md's named code paths too, not just files physically inside the change dir
metadata:
  type: feedback
---

When auditing an OpenSpec change in proposal mode, the in-scope file list is
not just the files inside `openspec/changes/<name>/` (proposal.md, design.md,
tasks.md, specs/**/spec.md). Read `tasks.md` (and `proposal.md`'s "What
changes" section) for the real repo paths the plan names as edit targets —
e.g. `packages/claims/src/wiring.ts`, `spec/wiring.md`, `CHANGELOG.md` — and
add those to the in-scope list even though they don't exist as diffs yet.

**Why:** This materially widens which rules are "applicable" per their
`applies_to` globs. On `add-wiring-malformed-input`, treating scope as "only
the 4 files inside the change dir" would have applied just 4 rules
(rev-stamp-change-anchors, never-repoint-under-old-stamp, merge-never-squash,
openspec-shall-first-line). Pulling the named `.ts`/`spec/wiring.md` targets
out of `tasks.md` correctly brought `build-before-cli`,
`model-proposes-code-verifies`, and `verdict-needs-fixture-and-test` into
scope too — and the plan's own task 5.4 (`pnpm build` before any CLI use) and
tasks 2.1-2.5 + 3.1-3.3 (fixture + named-verdict unit test for each new
verdict) turned out to be exactly the evidence needed to clear those rules as
`[looks-good]` rather than leaving them silently unchecked.

**How to apply:** In proposal mode, always cross-reference `tasks.md`'s named
paths against every rule's `applies_to` glob before finalizing the
"Rules applied" list — don't stop at the change-dir file list. Per the
system prompt's own guidance, audit the *plan's described approach* against
these newly-in-scope rules (no diff exists yet for files that don't exist),
not the (nonexistent) code.
