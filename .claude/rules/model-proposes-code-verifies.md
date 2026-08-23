---
id: model-proposes-code-verifies
applies_to:
  - packages/*/src/**/*.ts
  - plugin/**/*.md
severity: blocker
---

# The model proposes; code verifies

A model may generate candidates, extract claims, draft briefs, and argue.
Nothing a model returns is trusted as a result. Every judgement that decides
an outcome is made by deterministic code re-reading the artefact. A change
that puts a model anywhere in the verification path is the wrong change,
however well it performs.

## What goes wrong

A model asked to verify will verify. Handed a document and a brief shaped
like confirmation, it finds the confirmation — not through dishonesty but
because that is what the request selects for, and because a set of claims
presented together implies a narrative a model will steelman. The output is
indistinguishable from a real check: verdicts, reasoning, citations,
confidence. It is a review that reports success and did not happen, which is
the single failure mode this repository was built to make impossible.

So the boundary is structural rather than a matter of prompt quality. A
model's finding re-enters the system as an Evidence Anchor in the same
grammar any author would use, and is re-checked by the same code that checks
theirs. It gets no privileged status for having come from an agent. What
survives that re-check is a result; what does not is a suggestion that
happened to be well argued.

When a design makes the model's word load-bearing, the fix is not a better
prompt or a second model. It is to find the deterministic question underneath
and ask that instead — and if there is no such question, to say so rather
than to launder a guess through an agent.

## The incident

The audit brief tells the responding agent, in the brief itself, that its
own output will be re-checked — the constraint travels with the dispatch
rather than living in a design document:

**Evidence:** `packages/claims/src/audit.ts:155@52f64ec` — `Anchor grammar — every anchor you write is re-verified by a deterministic checker`
