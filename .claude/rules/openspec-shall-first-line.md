---
id: openspec-shall-first-line
applies_to:
  - openspec/**/spec.md
severity: concern
---

# Put SHALL or MUST on a requirement's first line

Write the modal verb into the opening line of a requirement body. If the
sentence would wrap it to line two, restructure the sentence.

## What goes wrong

OpenSpec's requirement check reads only the first line of a requirement body
when looking for SHALL or MUST. A requirement whose modal verb wraps to line
two is rejected with "must contain SHALL or MUST" — a message that is true of
the parser's window and false of the document, and reads as an accusation
that the verb is missing when it is sitting one line down.

The cost is time rather than correctness: `openspec validate` fails loudly,
nothing lands, nothing silently misbehaves. But the failure points at the
wrong thing, and the obvious response — adding a second SHALL, or rewording a
requirement that was already correct — makes the spec worse in exchange for a
green check. Knowing the parser's window turns a confusing five-minute detour
into a line break moved.

## Why this rule carries no anchor

The behaviour belongs to the `openspec` binary, which is installed globally
and is not vendored into this repository. Evidence Anchors are repo-relative
by construction, so there is nothing here to cite: the only in-tree mentions
are prose restating this same rule, and an anchor into a restatement of a
rule proves the restatement exists, not the behaviour. This rule is therefore
ungrounded on purpose, and is the one rule in this tree that should be
re-checked by hand against the tool rather than trusted.
