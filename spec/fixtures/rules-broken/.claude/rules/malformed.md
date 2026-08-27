---
id: malformed-example
applies_to:
  - src/**/*.ts
severity: blocker
notes: this key is not allowed
---

# A malformed fixture rule

This rule declares an unknown frontmatter key (`notes`), which must be
rejected as `malformed-rule-header` rather than silently accepted.
