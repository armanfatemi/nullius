---
name: bundle-leaks-operator-paths
description: Committed run artefacts (nullius.runs/*.json, review-evidence.md) carry subagent output verbatim including absolute home-directory paths — grep every committed artefact for /Users/ and CANARY- before writing the retro
metadata:
  type: project
---

Grep every artefact this run COMMITS for operator-local paths and probe tokens.
It is two commands and it found the highest-severity item of a whole run:

```sh
grep -c '/Users/' nullius.runs/*.json openspec/changes/<change>/*.md
grep -o 'CANARY-[A-Z]*' nullius.runs/*.json | sort | uniq -c
gh repo view --json isPrivate          # decides whether this is a leak or a smell
```

**Why:** on `add-pr-process-report` (PR #75, 2026-09-02) the committed bundle
`nullius.runs/feat-add-pr-process-report.json` carried 11 occurrences of
`/Users/arman/Documents/GitHub/nullius/…`, the literal `CANARY-PRESENT`, and the
live probe's planted sentence four times with its location — into a **public**
repository. Five review rounds asked whether `report.statement` was safe to
commit and capped it at 800 chars (`packages/kit/src/bundle.ts:63`). Nobody asked
the same question of `report.findings`, which is the larger surface, is copied
verbatim from subagent output, and is capped by LENGTH only (`bundle.ts:512`).
Nothing in that change's design, spec or bundler mentions paths, scrubbing or
`$HOME`. Precedent existed — `openspec/changes/add-run-ledger-producer/review-evidence.md`
on `main` already carries an absolute path — but that was a prose slip; the
bundle makes it mechanical and the Action makes it routine for adopters.

**How to apply:** subagents write absolute paths in their reports as a matter of
course, because that is how the harness hands them files. Any pipeline stage that
copies agent output into a committed file inherits that. This is a finding class
available to no reviewer (they review the diff, not the run artefact) and to no
gate, so it is genuinely this role's to find. See [[probe-leak-side-channels]].
