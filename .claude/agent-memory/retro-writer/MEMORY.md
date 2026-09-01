# Memory index

- [Probe: state vs artefact](probe-state-vs-artefact.md) — per-iteration `probe_iter_<N>` keys now agree with the artefact; score from `review-evidence.md` anyway
- [Scope claims need checking](scope-claims-need-checking.md) — verify `in scope of:` against the agent file; correct for the first time on PR #53
- [Probe CAUGHT can be leaked](probe-leak-side-channels.md) — registry, agent memory and progress.md leak the plant; taint over-reports on canary-subject changes, under-reports on paraphrase
- [Where coordinator errors surface](where-coordinator-errors-surface.md) — mine the `## Coordinator corrections` blocks; corrections are append-only, so the false version survives where readers meet it
- [Journal `no-report` is ground truth](journal-no-report-ground-truth.md) — count lost dispatch rounds from `.nullius/runs/*.jsonl`, not from the evidence file's prose
