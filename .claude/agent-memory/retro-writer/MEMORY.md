# Memory index

- [Probe: state vs artefact](probe-state-vs-artefact.md) — per-iteration `probe_iter_<N>` keys now agree with the artefact; score from `review-evidence.md` anyway
- [Scope claims need checking](scope-claims-need-checking.md) — verify `in scope of:` against the agent file; correct for the first time on PR #53
- [Probe CAUGHT can be leaked](probe-leak-side-channels.md) — taint is scored on the coordinator's synthesis, so paraphrase flips it; the leak is now self-reinforcing via agent memory
- [Where coordinator errors surface](where-coordinator-errors-surface.md) — mine the `## Coordinator corrections` blocks; a global rename can erase the defect they record
- [Retro mechanical checks](retro-mechanical-checks.md) — numstat for binary blobs, awk tally for agent attribution, max_refine vs default
