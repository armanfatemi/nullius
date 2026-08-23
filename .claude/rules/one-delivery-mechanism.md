---
id: one-delivery-mechanism
applies_to:
  - .claude/settings.json
  - plugin/hooks/hooks.json
severity: blocker
---

# One delivery mechanism per artefact

Witness hooks are delivered by the plugin, and only by the plugin. Never
write hook entries into `.claude/settings.json`. That file carries
environment and plugin enablement for this repository; it does not carry a
second copy of anything the plugin already installs.

## What goes wrong

Two copies of one hook are not redundancy — they are ambiguity that outlives
whoever created it. `doctor` exists to answer "is the ratchet still
ratcheting?", and it answers by resolving each artefact to the mechanism that
delivered it. Given two paths to the same hook it cannot tell which one is
live, which one is vestigial, or whether disabling the plugin has actually
disabled the behaviour. Every subsequent diagnosis is issued against a
harness whose shape the diagnostic tool cannot determine.

The failure surfaces long after the duplication, as a `doctor` report that
disagrees with observed behaviour — and the natural reading of that
disagreement is that `doctor` is wrong, which is how a working diagnostic
gets abandoned for a reason that was never its fault.

## The incident

`init` refuses to write hooks even on a repository where it plainly could,
and carries the refusal's reason with the decision rather than as a comment:

**Evidence:** `packages/kit/src/detect.ts:132@52f64ec` — `the plugin delivers the hooks; a second copy is a path doctor cannot disambiguate`
