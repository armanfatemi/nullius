---
name: reread-spec-after-design-rewrite
description: When a change's design.md is rewritten between review iterations, re-read specs/<cap>/spec.md — the normative spec lags the rewrite and can still mandate the rejected behaviour
metadata:
  type: feedback
---

When an OpenSpec change comes back for iteration 2+ because `design.md` was
rewritten, re-read `openspec/changes/<name>/specs/**/spec.md` line by line
against the new Decisions. Do not assume the spec moved with the design.

**Why:** On `add-authoring-ergonomics` (2026-08-28, iteration 1) the design was
rewritten after checker-engineer found two kernel blockers, and Decision 4
replaced "stamp anything that verifies against the working tree" with "read the
file at HEAD first". `specs/check-cli/spec.md:7-9` still carried the rejected
wording verbatim, and its `--fix` requirement (`:20-24`) never picked up
Decision 3's load-bearing `claim.rev === undefined` filter — so the SHALL text
still permitted the exact repoint `.claude/rules/never-repoint-under-old-stamp.md`
forbids. Anchor checking cannot catch this: spec.md carries no anchors at all.

**How to apply:** Diff the spec's SHALL sentences against each Decision's
"Chosen" paragraph. A Decision that says a filter is "not negotiable" and a
requirement that omits it is a `[blocker]`, not a wording nit — the spec is what
the implementer and `openspec validate` follow. Related:
[[feedback-verify-counts-not-just-anchors]].

**Confirmed working (2026-08-28, iterations 3→4).** The same habit caught a
second, subtler lag: `specs/check-cli/spec.md`'s stamp requirement stated only
the HEAD half of Decision 4's two-part condition, omitting the working-tree
precondition, so the SHALL text permitted stamping a locally-`FABRICATED`
anchor into a passing `STALE`. Naming the missing clause *and* the laundering
scenario it needs got both added in one iteration. So flag the missing clause
with the concrete scenario the spec must exercise, not just "spec disagrees".

**Third shape (2026-08-28, post-review fix pass).** The lag also appears when a
*fix commit* adds behaviour: `--format json` gained always-emit-one-document on
the no-match and unreadable-registry paths, but `specs/check-cli/spec.md`'s
"Machine-readable output" requirement still described only the passing/failing
case. A fix that answers a `[concern]` is a behaviour change too — re-read the
spec against the fix diff, not just against design.md.
