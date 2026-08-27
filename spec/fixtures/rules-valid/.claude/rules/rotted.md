---
id: rotted-example
applies_to:
  - src/**/*.ts
severity: blocker
---

# A rotted fixture rule

This rule's incident anchor cites text that is not actually present at the
cited location, so verification must fail and the rule must report
`rule-rot`.

## The incident

**Evidence:** `src/example.ts:2` — `this text does not appear in example.ts`
