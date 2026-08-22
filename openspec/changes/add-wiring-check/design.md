# Design — wiring check

## Decision 1 — hard verdicts read declared frontmatter fields only

A path or a name that appears in an artifact's prose might be a live
pointer or an illustrative example, and nothing can mechanically tell the
two apart. A checker that fails the run over a made-up example path in an
agent's own documentation is a checker that gets disabled the first time it
does that. Declared frontmatter fields — `dispatches`, `skills`, `reads`,
`applies_to` — carry no such ambiguity: they are read by the harness at
dispatch time, so an unresolved one is always a real failure.

A hook `command` is not a frontmatter field — it is a JSON string in
`hooks.json` or `settings.json` — and it does not carry the same unqualified
guarantee. `hookTarget` reads a command line only when it can resolve it to
**exactly one** repo-relative script; a command with two candidate tokens,
any backslash, or whitespace in a candidate is declined rather than checked,
by design (see [`spec/wiring.md`](../../../spec/wiring.md#hook-commands)).
So the real-failure guarantee applies to every hook command this checker can
unambiguously resolve, and the rest go unchecked. The six hard verdicts are
scoped to that closed set of declared fields plus resolvable hook commands;
everything found only in prose (a backticked path, a bare agent name in a
sentence) is reported as the single advisory `LOOSE-REFERENCE` instead of
failing the run.

## Decision 2 — the frontmatter parser is hand-rolled, not a YAML dependency

The frontmatter this checker reads is flat and small: a handful of string,
array, and boolean keys, never nested structures. Pulling in a YAML library
to parse it adds supply-chain surface — transitive dependencies, a versioned
grammar the tool does not need, an update cadence the checker does not
control — to a tool whose whole pitch is that its verification path is
small enough to read end to end.

The parser that shipped is a permissive subset, not a closed-key validator.
It reads scalars, inline flow lists (`dispatches: [a, b]`), and block lists
(`dispatches:` followed by `- a` / `- b`) — no nesting, no anchors, no
multi-line scalars — and anything it does not recognize (a line with no
colon, a `- item` with no key open above it, an unclosed flow bracket) is
skipped rather than rejected. There is no error path in the module: a
genuinely closed-key parser would have to reject `name`, `description`,
`model`, `tools`, and every other key real agent/skill/rule frontmatter
carries, which this checker does not own and has no business validating.
