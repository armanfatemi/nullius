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

**A terminal `report` record with `outcome: "found"` carries the subagent's
actual answer text, not just a flag that it answered:**

**Evidence:** `packages/kit/src/record.ts:309@612f36b` — `...(text.length > EXCERPT_LIMIT ? { truncated: true, response_chars: text.length } : {}),`

**Evidence:** `packages/kit/src/record.ts:119@612f36b` — `const EXCERPT_LIMIT = 2000;`

2000 characters is comfortably enough to hold `buildComplianceBrief`'s
required read-receipt-then-verdict opening. `outcome` itself distinguishes
three shapes: `"found"` (the subagent said something and it was captured),
`"empty"`/`"no-report"` (the subagent explicitly said nothing, or never
reported at all). This matters for Decision 5 below — "reached a terminal
record" and "delivered a verdict" are not the same fact, and `no-report` is
a terminal.

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

**Rationale:** `openspec/project.md` lists this as one of the kernel's
*absolute* constraints, not merely observed precedent:

**Evidence:** `openspec/project.md:16@612f36b` — `new verdict families get new unions. Its command surface stays small.`

This repository has already applied that constraint repeatedly: `WiringVerdict`,
`RuleVerdict`, and `JournalVerdict` itself are each their own union, split
from `Verdict` rather than grafted onto it — `JournalVerdict` is not a
hypothetical fourth instance, it already exists as one. **The discriminator
is not "different artifact class"** — `checkClaims`, `wiring`, and `rules`
all scan repo files; artifact class never actually drove those splits, and this
document does not lean on that framing. The real discriminator is *different
question, different input shape*: every existing `JournalVerdict` member
answers "is this journal internally consistent" from the journal's own bytes
alone; `silent-rule` answers "does this journal's content match an
externally-produced expectation" — a different question, needing an input
(the expected rule-id list) no other member needs. Widening
`validateJournal`'s signature to accept an optional parameter every other
call site now has to omit is the "less work than standing up a new family"
shortcut the constraint above exists to rule out.

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
`JournalRecord` parsing pass — the interface is declared at `witness.ts:220`,
`byId` deduplication at `witness.ts:412`, and the pass-1/pass-2 loop inside
`validateJournal` itself (`witness.ts:436`, `:524`) — for reuse.

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
file format, and the residual risk needs two separate mitigations, not one —
an earlier draft of this section claimed one mitigation covered both risks,
and it does not.**

1. **A structurally invalid record** (bad JSON, wrong kind, missing id) —
   *is* bounded by `validateJournal`'s own `malformed` verdict, for every
   journal where `validateJournal` actually reads that far. This part of the
   original claim holds.
2. **A journal `validateJournal` never reads past its header at all** — does
   **not** reduce to a `malformed` finding, and the original claim was wrong
   to say so. When a journal declares an unsupported schema version,
   `validateJournal` stops immediately and reads nothing further:

   **Evidence:** `packages/claims/src/witness.ts:356@612f36b` — `if (version === null || !VERSIONS.some((known) => known === version)) {`

   There is no `malformed` finding for the records after the header in that
   case — `unsupported-version` is documented as "Terminal, and alone." A
   version-blind `checkRuleCoverage` scan would still read those same bytes
   and could emit a hard `silent-rule` finding about content the validator
   explicitly refused to judge. **Fixed by Decision 4's CLI wiring**: when
   `validateJournal`'s findings include `unsupported-version`, the coverage
   check does not run at all — see Decision 4.
3. **A future schema version introduces a second terminal record kind.**
   `validateJournal`'s vocabulary is versioned:

   **Evidence:** `packages/claims/src/witness.ts:143@612f36b` — `const KINDS_V03 = [...KINDS_V02, "stage", "finding", "resolution", "check", "decision"] as const;`

   `report` is the only terminal kind today. `checkRuleCoverage`'s scan
   hardcodes `"report"` as the terminal kind it looks for — a future version
   adding a second terminal kind would be valid to `validateJournal` and
   invisible to this scan, producing a false-positive `silent-rule` for a
   genuinely-covered rule.

   **This mitigation was wrong in an earlier draft of this section, caught
   in Stage 2 iteration 2 review.** It proposed "pin the current
   terminal-kind set with a named unit test" in `ruleCoverage.test.ts` —
   but `KINDS_V01`/`KINDS_V03`/`Kind`/`VOCABULARY` (`witness.ts:136-157`)
   are module-private, not re-exported. A test asserting `"report"` is the
   only terminal kind would pin `checkRuleCoverage`'s **own** hardcoded
   assumption, disconnected from `witness.ts`'s real vocabulary — a future
   schema version adding a terminal kind would leave that test passing
   unchanged, which defeats the mitigation's actual purpose.

   **Corrected mitigation: `witness.ts` gains one small, additive,
   non-breaking export**, `TERMINAL_RECORD_KINDS: readonly string[]`, and
   `checkRuleCoverage` imports and defers to it rather than hardcoding its
   own copy. This is a narrow, deliberate exception to "don't touch
   `witness.ts`" above — it does not touch `JournalVerdict`, does not
   change `validateJournal`'s signature, and does not restructure its
   `case "report":` switch (which stays exactly as written; the new export
   sits beside it, not inside it). The residual risk this doesn't close: a
   future terminal kind added to the switch without also updating
   `TERMINAL_RECORD_KINDS` would still go unnoticed by `checkRuleCoverage`
   — closing *that* would mean deriving the switch itself from the
   constant, which is the internal restructuring this decision already
   declined to do, for the same risk-to-a-tested-module reason. A code
   comment at both the export and the switch, each pointing at the other,
   is the residual, human-diligence half of this mitigation (task 2.5).

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

**When `validateJournal`'s own findings include `unsupported-version`, the
coverage check does not run at all** — reported as a validation failure
only, never compounded with a `silent-rule` finding computed from content
the validator itself refused to read (this is the fix for Decision 3's
second residual-risk case above). `unsupported-version` is documented as
"Terminal, and alone," so its presence in the findings is a reliable signal
that nothing after the header was read, independent of whether the journal
happens to also be headerless (a normal, unrelated case read as v0.1 that
must NOT trigger this skip).

### 5. `silent-rule` requires a recognized verdict keyword in the terminal's findings — "reached a terminal" is not "delivered a verdict"

**Chosen:** A rule counts as covered only when its matching dispatch reached
a terminal `report` with `outcome: "found"` **and** that report's `findings`
excerpt contains one of the exact strings `COMPLIANT`, `VIOLATION`, or
`NOT-APPLICABLE` (`buildComplianceBrief`'s own required vocabulary). A
terminal with `outcome: "empty"` or `outcome: "no-report"`, or a `"found"`
terminal whose excerpt contains none of the three verdict strings, does
**not** count as covered — `silent-rule` fires for it.

**Alternatives considered:** Treat "reached any terminal record" as
sufficient, matching `no-terminal`'s own criterion in `JournalVerdict`.

**Rationale:** This was Stage 2's one real blocker. `specs/rule-coverage/spec.md`'s
requirement is titled "every rule must reach a **delivered verdict**," but a
"reached any terminal" mechanism would count `outcome: "no-report"` as
covered — and `outcome: "no-report"` is a subagent that ran and explicitly
reported nothing, which `proposal.md`'s own Problem statement names as one
of the three silence modes this proposal exists to catch ("dispatched but
never reported"). The stated requirement and the terminal-only mechanism
diverged; requiring a recognized verdict string in a `"found"` excerpt
closes that gap and makes the requirement's own words true of what the code
actually checks.

**This still checks liveness, not correctness** (proposal.md's Non-Goals
holds): a subagent could write `COMPLIANT` into a fabricated answer with no
real anchor, and this check would still count it as delivered — the anchor
itself is re-verified separately, by `/comply`'s existing `check <plan>`
step, not by this one. Requiring the keyword closes the "silently said
nothing" gap; it does not and is not meant to close the "said something
untrustworthy" gap.

**Residual risk, named rather than left implicit (Stage 2 iteration 2,
architecture-reviewer): a verdict pushed past `EXCERPT_LIMIT` (2000
characters) by a long preamble would produce a false `silent-rule`.** The
mitigation is real — `buildComplianceBrief`'s brief requires the read-receipt
and verdict near the top of the answer, well inside 2000 characters for any
realistic response — but was previously only argued in this document's
Context, not pinned as a task. Task 4.5 asserts this as a property (a
`findings` excerpt with the verdict string within the first ~500 characters
recognizes correctly), turning an implicit assumption into a checked one.

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
