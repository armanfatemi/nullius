# fiducial witness — partly shipped, partly not

The second half of [fiducial](https://github.com/armanfatemi/fiducial): a
retrospective kit for agent-driven work, built on one premise —

> **The agent that just did the work is a bad witness.** It is deep in a long
> context where its early mistakes have been compacted away, it is mildly
> motivated to look competent, and it cannot see its own wrong assumptions —
> that is what an assumption is.

**The journal validator ships now**, inside the checker CLI rather than here:

```sh
fiducial witness validate run.jsonl
```

It enforces three invariants on the record a multi-agent run leaves behind —
every dispatch reaches one of three terminal states (`found` / explicit `empty`
/ `no-report`), no verification is relied on after the artifact it verified
changed, and no append omits what it corrected. Deterministic, no model, same
DNA as `check`. The schema is [spec/witness-journal.md](../../spec/witness-journal.md).

It lives in `fiducial` because it is the same kind of thing that
package already is: a deterministic validator with no model in it. This package
is reserved for the half that still needs conventions to settle.

What it will ship:

- **`witness harvest --pr <n>`** — a bounded, deterministic run manifest
  (commits, trimmed review comments, CI check states, reversal candidates)
  for a retro-writing agent to read _instead of foraging_. Every fetch
  carries an explicit projection and a cap; caps are detectable (fetch
  N+1, report "more than N") rather than silent.
- **The retro schema** — machine-readable frontmatter (`defects_caught_by`,
  `reversals`, `agent_errors`, `human_interventions`, `rules_proposed`) so
  retros aggregate into per-agent defect _rates_, not anecdotes.
- **The witness agent definition** — a fresh agent that did NOT do the work,
  reads mechanical evidence before any narrative, and treats a
  narrative/git-history disagreement as a finding in itself. It writes
  exactly one file and may never edit the rules it reports on: keeping
  sensing and actuation apart is what stops an agent laundering its own
  conclusions into its own guardrails.

The harvester and the retro conventions are deliberately unreleased while they
accumulate more real-world mileage. Until then, the design is documented in the
[main README](../../README.md#roadmap).
