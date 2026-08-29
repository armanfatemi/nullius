# Design — add-evidence-marker-near-miss

## Context

`parseClaims.ts`'s extraction loop tries, per line: a `moment` claim, then
gates everything else behind `EVIDENCE_PREFIX`, then tries `absence`,
`presence` (double- or single-backtick), and `presence-block-head` in that
order, falling back to `malformed` when a line passes the gate but matches
none of the shape regexes:

**Evidence:** `packages/claims/src/parseClaims.ts:397@2792fa1` — `    if (!EVIDENCE_PREFIX.test(raw)) continue;`

**Evidence:** `packages/claims/src/parseClaims.ts:453@2792fa1` — `    claims.push({ kind: "malformed", raw: raw.trim(), source });`

`malformed` is already an existing member of the kernel's exported `Verdict`
union and already excluded from `PASSING`, so it already fails a run:

**Evidence:** `packages/claims/src/checkClaims.ts:73@2792fa1` — `  | "malformed"`

**Evidence:** `packages/claims/src/checkClaims.ts:178@2792fa1` — `const PASSING: ReadonlySet<Verdict> = new Set<Verdict>([`

**This proposal does not add a verdict.** It routes lines that currently
bypass the gate entirely into a path that already exists, already fails, and
is already tested. That is the load-bearing scoping fact for this whole
change: no `Verdict` union growth, no new `PASSING`/`isFailure` case, no new
exhaustiveness obligation anywhere that switches over `Verdict`.

## Decisions

### 1. What counts as a "near miss," and how it's detected

**Chosen:** Add a second, deliberately looser pattern —
`EVIDENCE_NEAR_MISS` — checked only when `EVIDENCE_PREFIX` has already failed
for a line. If `EVIDENCE_NEAR_MISS` matches, push `{ kind: "malformed", raw,
source }` (the same shape line 453 already produces) instead of `continue`.
`EVIDENCE_PREFIX` itself, and the strict shape regexes below it, are
untouched — a line that already parses correctly today parses identically
after this change; the only behavior difference is for lines that today
vanish silently.

Scope of `EVIDENCE_NEAR_MISS`, in order of confidence:

- **Parenthetical after the label** (`**Evidence (Decision 4):**`) — the
  actually-observed incident (`add-rules-compliance`, Stage 3; see
  `proposal.md`). High confidence this must be covered.
- **Colon outside the bold markers** (`**Evidence**:`) and **single-asterisk
  emphasis** (`*Evidence:*`) — hypothesized by the retrospective's author,
  not observed in any recorded run. Lower confidence, but cheap to cover with
  the same general pattern if the false-positive risk (below) stays low.

**Alternatives considered:**
- **Loosen `EVIDENCE_PREFIX` itself** to accept the near-miss shapes, so they
  flow through to the strict shape regexes and might get extracted as real
  claims — rejected. The strict shape regexes require the exact `**Evidence:**`
  text immediately before the citation; a parenthetical-label line would still
  fail all three and fall through to `malformed` regardless, so loosening the
  gate alone accomplishes the same outcome with less risk than also touching
  the shape regexes. Keeping the shape regexes untouched means this change
  cannot accidentally start extracting a malformed line as a valid claim.
- **A single unified regex covering both the strict and near-miss cases** —
  rejected for readability and blast radius. `EVIDENCE_PREFIX` is read and
  reasoned about elsewhere in the file (the header comment at line 104-109
  explains its list-marker tolerance); folding near-miss detection into it
  makes one regex do two jobs and makes future changes to either job harder
  to reason about in isolation.

**Rationale:** The failure mode this fixes is silence, not incorrect
extraction — a document author who almost-wrote a real marker deserves a
`malformed` finding they can act on, not a strict grammar that also tries to
guess their intent. Keeping detection separate from extraction keeps the
blast radius to exactly the previously-silent case.

**False-positive risk:** `EVIDENCE_NEAR_MISS` must not fire on ordinary prose
that happens to contain the word "Evidence" with no markdown emphasis nearby
— e.g. a sentence like "the evidence shows this file is unused" must not
become a spurious `malformed` finding. The concrete pattern (a case-sensitive
match requiring `Evidence` immediately adjacent to at least one `*` and
within a few characters of a `:`) is an implementation task (see `tasks.md`
1.2), with test cases for both directions: near-miss markers that must be
caught, and ordinary prose mentioning "evidence" that must not be.

**Behavior consequence, stated explicitly:** any existing document that today
contains an accidental near-miss marker and currently passes `check` (because
the line is invisible) will start failing once this ships — the same shape of
behavior change `0.7.0`'s "flags belong to their command" fix made
deliberately (CHANGELOG.md, `## 0.7.0` → `### Breaking`), for the same
reason: a gate that silently was not a gate is worse than a gate that starts
firing. Note this in the CHANGELOG entry (task 5.x) so it reads as an
intentional strictness increase, not a regression.

## Open questions

- Whether `EVIDENCE_NEAR_MISS` should cover all three variants from day one,
  or ship covering only the observed parenthetical case and add the other two
  if/when they're actually observed. Leaning toward covering all three now,
  since the same general pattern plausibly catches all of them at once — but
  only if task 1.2's false-positive test suite stays clean; if extending
  coverage requires meaningfully loosening the pattern, narrow back to the
  observed case and note the other two as a follow-up.
