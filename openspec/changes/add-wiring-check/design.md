# Design — wiring check

## Decision 1 — hard verdicts read declared frontmatter fields only

A path or a name that appears in an artifact's prose might be a live
pointer or an illustrative example, and nothing can mechanically tell the
two apart. A checker that fails the run over a made-up example path in an
agent's own documentation is a checker that gets disabled the first time it
does that. Declared frontmatter fields — `dispatches`, `applies_to`, a hook
`command` — carry no such ambiguity: they are read by the harness at
dispatch time, so an unresolved one is always a real failure. The six hard
verdicts are scoped to that closed set; everything found only in prose
(a backticked path, a bare agent name in a sentence) is reported as the
single advisory `LOOSE-REFERENCE` instead of failing the run.

## Decision 2 — the frontmatter parser is hand-rolled, not a YAML dependency

The frontmatter this checker reads is flat and small: a handful of string,
array, and boolean keys, never nested structures. Pulling in a YAML library
to parse it adds supply-chain surface — transitive dependencies, a versioned
grammar the tool does not need, an update cadence the checker does not
control — to a tool whose whole pitch is that its verification path is
small enough to read end to end. The config module already made this
argument for itself:

**Evidence:** `packages/claims/src/config.ts:4@7846833` — `* Validation is strict (unknown keys are rejected) because a typo'd key —`

The wiring parser follows the same shape: closed-key, flat, hand-rolled, and
rejects anything it does not recognize rather than silently ignoring it.
