# Memory index

- [Injected prose in a proposal](project_proposal-injected-prose.md) — stray false `retry` sentence anywhere under `openspec/changes/<name>/`; find it by reading, never by querying the probe registry
- [Verify counts, not just anchors](feedback_verify-counts-not-just-anchors.md) — "all 7 rules"/"every anchor is stale" claims pass `check` untouched; re-derive them yourself
- [Re-read spec after a design rewrite](feedback_reread-spec-after-design-rewrite.md) — specs/*/spec.md lags a rewritten design.md and can still mandate the rejected behaviour
- [Check design.md code fences](feedback_check-design-code-fences.md) — fenced TS signatures in design.md drift from the shipped signature; `check` cannot see them
- [Check early returns against unconditional SHALLs](feedback_check-early-return-branches-against-unconditional-shalls.md) — a branch can satisfy its own Scenario and violate the spec prose above it
- [Recompute path guards off symlinked tmp](feedback_recompute-path-guards-off-symlinked-tmp.md) — macOS $TMPDIR is symlinked; path-containment guards pass there by accident, re-run them on a real path
- [Scope boundaries must be mechanisms](feedback_scope-boundaries-must-be-mechanisms.md) — "only the coordinator runs that command" is a convention, not a guard; check reachability in code
- [Enumerate against the declared boundary](feedback_enumerate-against-declared-boundary.md) — when a design states a scope test, grep every call site against it yourself; lists lag boundaries
- [Redaction leaves presence oracles](feedback_redaction-leaves-presence-oracles.md) — a warning that fires only when a doc is NOT the target is a one-bit location oracle
- [Clean review vs the `found` outcome](feedback_clean-review-vs-found-outcome.md) — the recorder calls any non-empty return `found`; verdicts keyed on a missing finding misfire on honest clean reviews
- [Denominator predicates cut both ways](feedback_denominator-predicates-cut-both-ways.md) — a verdict gated on a prose-file match: check false-arming, not just the disarming limit the design records
- [Blockquoted anchors are ungated](feedback_blockquoted-anchors-are-ungated.md) — `check` skips Evidence lines inside `>` quotes; compare its anchor count to `grep -c`
- [Verbatim carry defeats field redaction](feedback_verbatim-carry-defeats-field-redaction.md) — a line kept verbatim skips every parse-dependent redaction promise
- [Schema decisions lag noun changes](feedback_schema-decisions-lag-noun-changes.md) — after a records→lines rewrite, the decision declaring the literal shape is the stale one
