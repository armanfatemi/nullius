---
name: scope-claims-need-checking
description: A coordinator's `in scope of:` line about a reviewer is a claim to verify against the agent file, not a fact — one run misfiled a miss against an agent that had no such remit
metadata:
  type: project
---

When a coordinator records that a reviewer missed something "in its declared
scope", open `.claude/agents/<name>.md` and check the scope before repeating it.

**Why:** on `add-wiring-malformed-input` the probe section wrote
`in scope of: ... test-engineer (spec/fixtures/**)` and the coordinator filed a
missed false premise against it. The agent's actual scope is
`spec/fixtures/**/*.jsonl`, the planted claim named a `.ts` file, and
`test-engineer.md` contains no false-premise pass at all — only
`architecture-reviewer` declares one. The agent was never dispatched to find it.

Second occurrence, `add-authoring-ergonomics` (PR #42): all five probe sections
listed `checker-engineer` and `test-engineer` as in scope "briefed to read
proposal.md in full", and iteration 0 wrote "test-engineer's false-premise pass
spot-checked anchors only". Neither agent file contains the string "false
premise" at all; only `architecture-reviewer` and `rule-auditor` declare that
pass (`rule-auditor.md:89`, unconditional in proposal mode). So test-engineer's
two non-flags were not agent misses.

**How to apply:** globs get paraphrased and the paraphrase gets wider. Grepping
the agent file takes one command and decides whether a finding is filed as an
*agent* defect or a *brief* defect — which sends the fix to a different file.
See [[probe-state-vs-artefact]].
