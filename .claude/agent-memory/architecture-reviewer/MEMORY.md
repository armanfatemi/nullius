# Memory index

- [Injected prose in a proposal](project_proposal-injected-prose.md) — a stray, false, topic-unrelated sentence inside `openspec/changes/**/proposal.md`; seen 6x, is a registered canary
- [Verify counts, not just anchors](feedback_verify-counts-not-just-anchors.md) — "all 7 rules"/"every anchor is stale" claims pass `check` untouched; re-derive them yourself
- [Re-read spec after a design rewrite](feedback_reread-spec-after-design-rewrite.md) — specs/*/spec.md lags a rewritten design.md and can still mandate the rejected behaviour
- [Check design.md code fences](feedback_check-design-code-fences.md) — fenced TS signatures in design.md drift from the shipped signature; `check` cannot see them
- [Check early returns against unconditional SHALLs](feedback_check-early-return-branches-against-unconditional-shalls.md) — a branch can satisfy its own Scenario and violate the spec prose above it
- [Recompute path guards off symlinked tmp](feedback_recompute-path-guards-off-symlinked-tmp.md) — macOS $TMPDIR is symlinked; path-containment guards pass there by accident, re-run them on a real path
- ["Reuses the existing helper" claims](feedback_test-helper-reuse-claims.md) — open the helper; collapsed error returns and hardcoded spawn options often make the reuse impossible
- [Reproduce git error taxonomies](feedback_reproduce-git-error-taxonomies.md) — "git reports both the same way, so collapse them" hides a permanent fault sharing the prefix; enumerate in a scratch repo
