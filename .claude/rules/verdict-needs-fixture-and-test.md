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

The dogfooding gates assert exit codes. A fixture that must fail is run under
a shell negation, and the step is green whenever the command exits non-zero.
That is a real check of "something is still broken here" and a very weak
check of *what*.

The must-fail fixtures each break several invariants at once — that is what
makes them efficient — so the exit code stays 1 while any single verdict
still fires. Retire a verdict, narrow its condition, or break it outright,
and nothing moves. The gate keeps passing on the strength of the verdicts
that still work, and the one that went quiet is indistinguishable from the
one that never had anything to say.

This is the same shape as a no-op dispatch reporting a completed review, and
it deserves the same answer: the property has to be asserted where it can be
named. A unit test says *this verdict fired*; a negated exit code only says
*some* verdict did.

## The incident

The whole assertion the wiring gate makes about its broken fixture is that
the command exits non-zero — one bit, covering every verdict the fixture is
supposed to trip:

**Evidence:** `.github/workflows/ci.yml:159@90105d8` — `! node packages/claims/dist/cli.js wiring spec/fixtures/wiring-broken`
