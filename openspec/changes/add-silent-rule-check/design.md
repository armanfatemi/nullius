# Design — add-silent-rule-check

## Context

`packages/claims/src/witness.ts` (1152 lines) exports `JournalVerdict`, a
13-member union, and `validateJournal(content: string): JournalReport`, which
parses one journal and checks every invariant it knows about:

**Evidence:** `packages/claims/src/witness.ts:48@612f36b` — `export type JournalVerdict =`

**Every existing member is determinable from the journal's own content
alone.** Even the member that sounds most like it needs external state,
`stale-verification`, cross-references two records already *inside* the same
journal (a `verification`'s stored hash against a later `mutation`'s hash for
the same path) — it never reads the filesystem or takes external input:

**Evidence:** `packages/claims/src/witness.ts:688@612f36b` — `const latest = hashes.get(source.path);`

`silent-rule` breaks that pattern: answering "did rule `X` reach a delivered
verdict" requires the set of rule ids `rules select` named as applicable for
this run — an input from *outside* the journal, produced by an entirely
separate command at run time. No function in this codebase today takes
journal content plus an externally-sourced expected list (confirmed by
survey: closest analogs are `checkClaims.ts`'s `AbsenceClaim.expectedCount`,
which compares a document against a count *the same document declares*, and
`routeAgents`'s use of `selectRules`, which routes agents rather than
checking journal content).

`JournalVerdict` has **no exhaustive switch anywhere in the codebase** — its
only consumer is a `PASSING`-set membership test that fails closed by
default for an unrecognized member:

**Evidence:** `packages/claims/src/witness.ts:120@612f36b` — `const PASSING: ReadonlySet<JournalVerdict> = new Set<JournalVerdict>(["ok"]);`

So growing this union is structurally safe. Whether it is the *right* choice
is Decision 1 below — safety and correctness are different questions, and
this document does not conflate them.

**The dispatch `task` field is short and lossy by design**, not a place a
rule id can be assumed to survive:

**Evidence:** `packages/kit/src/record.ts:157@612f36b` — `const task = str(input["description"]) ?? firstLine(str(input["prompt"]));`

**Evidence:** `packages/kit/src/record.ts:496@612f36b` — `function firstLine(value: string | null): string | null {`

`buildComplianceBrief`'s rule id is on the brief's 7th rendered line, not its first:

**Evidence:** `packages/claims/src/audit.ts:282@612f36b` — `## Rule ${rule.id}`

So today, a `/comply` dispatch through the Task/Agent tool would journal a
`task` field containing the brief's generic opening sentence
("You are checking ONE rule's compliance...") truncated at 200 characters —
never the rule id — unless the dispatcher explicitly sets `description`.
Journaling itself needs no new plumbing: any `Task`/`Agent` dispatch in a
session with `.nullius/` opted in is already recorded automatically by the
existing hooks (`plugin/hooks/hooks.json`'s `PreToolUse`/`PostToolUse`/
`SubagentStop` matchers on `^(Task|Agent)$`) — the gap is narrower than "wire
up journaling," it is "make the journaled `task` field actually say which
rule."

## Decisions

### 1. `silent-rule` gets its own union, not a member of `JournalVerdict`

**Chosen:** A new, narrow union — `RuleCoverageVerdict = "ok" | "silent-rule"`
— with its own `PASSING`/`isRuleCoverageFailure`, produced by a new pure
function `checkRuleCoverage(journalContent: string, expectedRuleIds:
readonly string[]): RuleCoverageFinding[]`. `validateJournal`'s signature and
`JournalVerdict`'s 13 members are untouched.

**Alternatives considered:** Add `silent-rule` as a 14th `JournalVerdict`
member, computed either by widening `validateJournal`'s signature with an
optional `expectedRuleIds` parameter, or by a separate function that still
returns `JournalFinding` shapes tagged with the existing `JournalVerdict`
type.

**Rationale:** This repository has already answered this exact question
three times — `Verdict` → `WiringVerdict` → `RuleVerdict`, each split
justified by "a new *kind* of check gets its own union and its own
`isXFailure` function, not a branch grafted onto an existing one" (the
precedent `.claude/agents/checker-engineer.md` now teaches explicitly, using
`RuleVerdict` as the worked example). Every existing `JournalVerdict` member
answers "is this journal internally consistent"; `silent-rule` answers "does
this journal's content match an externally-produced expectation" — a
different question, needing a different input shape, checking the same
document for a different reason. Widening `validateJournal`'s signature to
accept an optional parameter every other call site now has to omit is the
"less work than standing up a new family" shortcut the precedent specifically
warns against.

**The cost this creates — a caller must remember to run two checks — is real
and is closed at the CLI layer, not by folding the union together** (see
Decision 4). `silent-rule` existing as a defect this project would have
punished a *different* proposal for repeating (a check that must be
separately invoked is a check that gets silently skipped) is exactly why
Decision 4 is not optional polish.

### 2. `checkRuleCoverage` is a pure function; the caller supplies both inputs

**Chosen:** `checkRuleCoverage(journalContent, expectedRuleIds)` takes
already-read journal content and an already-computed rule-id list — no
filesystem or git access, matching this repo's pure-core convention
(`rules.ts`/`rulesScan.ts`'s split is the most recent precedent). The CLI
layer is responsible for reading the journal file and for obtaining
`expectedRuleIds` from `rules select`'s existing output.

**Alternatives considered:** Have the function take a root directory and
resolve the journal path and the rule selection itself.

**Rationale:** Every kernel checking function in this codebase is pure over
already-gathered input (`checkClaims`, `checkRule`, `checkWiring`) — the
scan/gather step lives in a sibling module (`runners.ts`, `rulesScan.ts`,
`wiringScan.ts`) or the CLI. A function that resolves its own inputs is
harder to unit-test (needs a fixture tree, not just two strings) and breaks
that established split for no benefit here.

### 3. A minimal, independent dispatch/terminal scan — not a refactor of `validateJournal`'s internals

**Chosen:** `checkRuleCoverage` does its own lightweight pass over the
journal's lines, extracting only `dispatch` records' `task`/`id` fields and
whether each dispatch id reached any terminal (`report`) record — ignoring
`verification`, `mutation`, `finding`, `resolution`, and every other kind
`validateJournal` handles.

**Alternatives considered:** Export `validateJournal`'s internal
`JournalRecord` parsing pass (currently module-private, `witness.ts:220-253`
and the pass-1/pass-2 loop inside `validateJournal` itself) for reuse.

**Rationale:** That internal pass is deeply coupled to the full
invariant-checking pipeline — `byId` deduplication, `duplicate-id` detection,
schema-version vocabulary gating, all in service of computing 13 different
verdicts `checkRuleCoverage` does not need. Extracting a clean "just give me
dispatch/terminal pairs" seam from a 1152-line, extensively-tested module is
real surgery on code this project depends on staying correct, for a narrower
need than what that pass already computes. A ~30-line independent scan,
covering only the two record kinds this check cares about, is safer,
independently testable, and does not risk `validateJournal`'s existing
behaviour.

**This does mean two independent JSON-Lines scanners exist over the same
file format.** Accepted: `RuleCoverageFinding`'s scan is a strict subset of
what `validateJournal` already parses (dispatch existence, terminal
existence — not the full invariant set), so drift between the two is bounded
to "did the record shape change," which `validateJournal`'s own `malformed`
verdict already catches independently for any journal `checkRuleCoverage`
would also see.

### 4. CLI wiring: one command, not two — `witness validate --expect-rules <id...>`

**Chosen:** `witness validate <journal>` gains an optional `--expect-rules
<id...>` flag. When given, the CLI runs both `validateJournal` and
`checkRuleCoverage` against the same journal content and merges both
finding sets into one report and one exit code. Without the flag, behaviour
is unchanged — fully backward compatible.

**Alternatives considered:** A separate `witness coverage` (or similar)
subcommand, invoked independently.

**Rationale:** This proposal's whole subject is a check going silently
missing because nothing forced it to run. Shipping `silent-rule` as a
separate command a caller must remember to invoke would recreate that exact
failure mode one layer up — a `/comply` run that validates its journal but
forgets the coverage flag reports "journal valid" while a rule went silent,
which is precisely the false-clean-run this proposal exists to prevent.
Folding it into `witness validate` means the coverage check rides along with
whatever already calls journal validation.

## Open questions

- **How does `/comply`'s final step learn the current session's journal
  path?** Journals are keyed by session id (`packages/kit/src/journalFile.ts:94@612f36b`
  — `export function journalPathFor(root: string, session: string | null): string {`),
  and I found no evidence of a mechanism exposing the current session's id to
  a plugin command's shell-based instructions. This is not asserted as
  solved anywhere in this document — it is the one integration detail Stage
  2 review or implementation must resolve before task 3.1's `comply.md` edit
  can actually call `witness validate --expect-rules`. Candidates to
  investigate during implementation: an environment variable the harness
  already sets, or a `witness` subcommand that resolves "the current
  session's journal" without requiring the caller to know the session id.
- **Rule-id matching convention once `description` carries it.** Exact
  string equality against `description`, or does a resumed/re-dispatched
  `/comply` run (same rule id appearing in more than one dispatch record)
  need explicit handling — e.g. "covered if ANY matching dispatch reached a
  terminal," not "exactly one dispatch per rule id"? Leaning toward "any
  matching dispatch reached a terminal," since a re-dispatch after a timeout
  is a legitimate recovery path, not a defect — but not settled here.
- **Does `silent-rule` distinguish never-dispatched from
  dispatched-but-`no-terminal`?** `JournalVerdict`'s existing `no-terminal`
  member already answers "this dispatch never reached a terminal" for
  dispatches that exist. `checkRuleCoverage` could report a plain
  `silent-rule` for both cases, or could special-case "the rule's dispatch
  exists and journal validation already flagged it `no-terminal`" as a more
  specific message reusing that existing finding. Left to the implementer;
  the devil's-advocate review that shaped this proposal's Non-goals section
  did not require solving this, only naming that these are different
  failures.
