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

**Third occurrence, `add-probe-visibility` (PR #43)** — and a partial fix. The
probe sections escalated test-engineer's non-flags to "a reproducible gap in one
reviewer's prose pass" over four rounds. `grep -rni 'false.premise'
.claude/agents/test-engineer.md` → 0 results; its output format is Blockers /
Concerns / Looks good / Not checked, no False premises heading. Brief defect, not
agent defect — three runs running.

What *did* improve: the coordinator recorded the plant's in-scope reviewer set at
plant time, and iteration 5 used it to score test-engineer "not measured" rather
than "missed" when the plant landed outside its briefed file set. That is the
first time the scope record caught the error in-run instead of being
retro-corrected. Keep checking the claim anyway — the same run got the agent-file
question wrong while getting the brief-scope question right.

**First clean run — `add-journal-identity` (PR #53, 2026-08-29).** All three
probe sections' `in scope of:` lines check out: `grep -ric 'false.premise'
.claude/agents/*.md` gives architecture-reviewer 10, rule-auditor 7,
checker-engineer 0, test-engineer 0, which is exactly what the artefact claims,
and iteration 3 explicitly declines to count test-engineer's non-flag as a miss.
The coordinator also wrote the agent-file distinction into its own corrections
block at iteration 1. So `brief_defects: []` was the honest entry for once.
Keep running the grep — one clean run is not a repaired habit.

**Second clean run — `add-canary-status-redaction` (PR #58, 2026-08-31).**
`grep -ric 'false.premise' .claude/agents/*.md` gives architecture-reviewer 10,
rule-auditor 7, checker-engineer 0, test-engineer 0 — exactly what all five probe
sections claim, and each one explicitly declines to score test-engineer on the
plant. Two clean runs now; keep running the grep.

New adjacent check worth making every time: **which agents were NOT dispatched,
and was the omission justified?** That run never dispatched checker-engineer at
all (0 mentions across six rounds) on a change to `canary.ts` and `cli.ts`, with
no pre-flight justification — while the coordinator did correct itself for
dropping rule-auditor from a single dispatch. Absence gets less scrutiny than
omission, and `grep -c '<agent>' review-evidence.md` finds it in one command.
