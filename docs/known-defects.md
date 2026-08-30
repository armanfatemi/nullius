# Known defects in the checkers

Three defects. The first two were found by porting real files through the
tooling rather than by reading it; the third was found when archiving the
change that was supposed to close it. None is fixed: each needs its own change
with a spec delta, fixtures and unit tests, per `CLAUDE.md`'s rule that a
verdict without both is a verdict that can go quiet.

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

## `oracle` never gained `--format json`, and its conditional task expired unnoticed

`add-oracle-conservation` shipped `oracle` with one task left open, conditional
on a sibling change:

**Evidence:** `openspec/changes/archive/2026-08-30-add-oracle-conservation/tasks.md:95@b964779` — `- [ ] 4.5 `--format json` if `add-authoring-ergonomics` has landed; otherwise`

That condition was false when the task was written and true when the change
merged — `add-authoring-ergonomics` landed as PR #42, `add-oracle-conservation`
as PR #55. Nothing re-evaluates a conditional task after its precondition
changes, so the task stayed unticked and the work was never picked up.

`--format` remains owned by `check` alone, and the flag table says so:

**Evidence:** `packages/claims/src/cliArgs.ts:133@b964779` — `  ["--format", "check"],`

**Evidence:** `packages/claims/src/cliArgs.ts:37@b964779` — `  format: CheckFormat;`

The table is the mechanism, not a comment: a flag registered to `check` is
rejected on any other verb, so `oracle` has one output shape and no
machine-readable one. `OracleArgs` declares no equivalent field.

The gap is worth recording rather than fixing in passing, because closing it
breaks something that currently works. CI pins `oracle`'s *human* output and
greps an uppercased verdict token, and the change that shipped it wrote down
exactly how a later `--format json` would break that grep:

**Evidence:** `openspec/changes/archive/2026-08-30-add-oracle-conservation/tasks.md:178@b964779` — `      4.5's `--format json` would render it lowercase and the grep would stop`

So the fix is not a flag; it is a flag plus a decision about the de facto
contract CI already depends on.

The generalizable defect is the conditional task itself. A checkbox whose
condition is evaluated once, at authoring time, is a task that can silently
stop applying — the same shape as a gate that stops gating. Tasks that depend
on another change landing should either become a declared dependency, which
`proposal-to-pr` blocks on, or be written unconditionally.
