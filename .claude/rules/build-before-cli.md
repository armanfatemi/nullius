---
id: build-before-cli
applies_to:
  - packages/*/src/**/*.ts
severity: blocker
---

# Build before you trust a CLI run

Run `pnpm build` before using any nullius CLI to check your own work. The
source you just edited is not what the command executes.

## What goes wrong

An unbuilt tree does not error. It runs the *previous* build of the checker
against the *current* state of the repository and reports success — so the
run that was supposed to catch your mistake certifies work that does not
exist yet. Nothing in the output distinguishes this from a real pass: no
warning, no skipped step, no stale-artefact notice. The checker you meant to
change simply was not the checker that ran.

That is this project's own thesis turned back on it. A green result standing
in for a check that never happened is the exact defect nullius exists to
make impossible, and an unbuilt `dist/` reproduces it in the one place where
it is least likely to be noticed — the tool's own development loop, where
every result looks like the result you were hoping for.

## The incident

The CLIs are published against a compiled artefact, so the entry point a
`node ...` invocation reaches is only ever as fresh as the last build:

**Evidence:** `packages/claims/package.json:32@52f64ec` — `"nullius": "dist/cli.js"`
