# Known defects in the checkers

Two defects found by porting real files through the tooling rather than by
reading it. Neither is fixed: each needs its own change with a spec delta,
fixtures and unit tests, per `CLAUDE.md`'s rule that a verdict without both is
a verdict that can go quiet.

They are written down here because the sessions that found them recorded them
in a workspace that is gitignored, and a finding whose only home is a
transcript is a finding that has already been discarded.

## `audit` extracts the wrong claim text

`nullius audit` pairs each `**Evidence:**` marker with the statement above it,
then hands that statement to a fresh agent to refute. The pairing is wrong in
two independent ways, so the agent is often asked to refute something the
author never wrote — and a refutation of a mangled claim comes back as
`REFUTED` against the real one.

**Evidence:** `packages/claims/src/audit.ts:59@52f64ec` — `function statementAbove(lines: string[], markerIndex: number): { text: string; line: number } | null {`

**Truncation.** It returns the first non-skipped physical line above the
marker. Every document in this repository hard-wraps its prose, so a claim
spanning two lines loses everything except its last line — usually the
qualifying clause, rarely the subject.

**Fence mis-attribution.** `FENCE` matches a delimiter line, with no state for
being *inside* a fence:

**Evidence:** `packages/claims/src/audit.ts:49@52f64ec` — `const FENCE = /^\s*(?:`{3,}|~{3,})/;`

So when two `**Evidence:**` blocks are stacked, each followed by a fenced
excerpt, the walk steps over the first block's closing delimiter and accepts
the *code inside it* as the statement belonging to the second block's anchor.

The function's own doc comment promises the statement is "neither a marker, a
heading, nor part of a fenced block" — the third clause is not implemented, so
this is a mismatch with stated intent rather than a design stance.

Measured, not theorised: run against this repository's own `spec/wiring.md`,
six of its seven claims come back corrupted.

`looseCandidates` in the wiring scanner already maintains exactly the
inside-fence boolean this function lacks, so the fix has a working model in
the same package.

## `wiring`'s advisory half cannot see a citation with a section suffix

`looseCandidates` refuses any backticked value containing whitespace:

**Evidence:** `packages/claims/src/wiringScan.ts:53@52f64ec` — `if (value.includes("://") || value.includes("*") || value.includes(" ")) continue;`

That rule exists for a good reason — it is what stops a shell command line
fused by quoting (`sh -c "node hooks/run.js"`) being claimed as a script path.
But it also discards an ordinary documentation idiom: a path cited together
with a section, inside one code span.

A bare `` `.claude/rules/gone.md` `` produces a `LOOSE-REFERENCE` advisory.
The same path written `` `.claude/rules/gone.md §Some Heading` `` produces
nothing at all. Found by porting a file that contained exactly that shape: the
citation was dead, and the checker was structurally unable to say so.

A green `wiring` run is therefore not evidence that every path in a document
resolves. It is evidence that every path the filter could see resolves.
