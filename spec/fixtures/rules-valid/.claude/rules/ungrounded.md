---
id: ungrounded-example
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

## Why this rule carries no anchor

This is a frozen fixture copy of `.claude/rules/openspec-shall-first-line.md`'s
shape, made for the `ungrounded-rule` unit test — it deliberately carries no
`**Evidence:**` anchor anywhere in its body, and must stay that way even if
the live rule file it was modeled on changes later for unrelated reasons.
