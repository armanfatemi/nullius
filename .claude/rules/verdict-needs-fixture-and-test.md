---
id: verdict-needs-fixture-and-test
applies_to:
  - packages/claims/src/**/*.ts
  - spec/fixtures/**/*.jsonl
  - .github/workflows/*.yml
severity: blocker
---

# A new verdict needs a fixture *and* a unit test

Adding a verdict means adding a fixture that trips it and a unit test that
asserts it fires by name. Both. A fixture alone is not coverage.

## What goes wrong

The dogfooding gates assert exit codes: a fixture that must fail is run under
`!`, and the step is green when the command exits 1. That is a genuine check
of "something is still broken here" and a very weak check of *what*.

A fixture like `spec/fixtures/broken-run.jsonl` breaks several invariants at
once, so its exit code stays 1 while any one of them still fires. Retire a
verdict, narrow its condition, or break it outright, and the exit code does
not move. The gate keeps passing on the strength of the verdicts that still
work, and the one that went quiet is indistinguishable from the one that
never had anything to say.

This is the same shape as a no-op dispatch reporting a completed review, and
it deserves the same answer: the property has to be asserted where it can be
named. A unit test says *this verdict fired*; the fixture only says *some*
verdict did.

## The incident

The wiring gate carries the reasoning in the workflow itself, next to the
step it qualifies — the unit test asserts which verdicts fire, because the
shell gate cannot:

**Evidence:** `.github/workflows/ci.yml:155@52f64ec` — `exit code here stays 1 even when one of them goes quiet`
