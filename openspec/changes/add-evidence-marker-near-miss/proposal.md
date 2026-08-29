# Proposal — add-evidence-marker-near-miss

> **Depends on:** None

## Problem

`parseClaims.ts`'s extractor requires the `**Evidence:**` marker exactly, with
no tolerance for near-miss spellings:

**Evidence:** `packages/claims/src/parseClaims.ts:110@2792fa1` — `const EVIDENCE_PREFIX = /^\s*(?:[-*+]\s+|\d+[.)]\s+)?\*\*Evidence:\*\*/;`

A line must first clear that exact-prefix gate before the parser will even
consider it a candidate marker at all — well-formedness (matching one of the
four recognized marker shapes) is decided only afterward, for lines that
already cleared the gate:

**Evidence:** `packages/claims/src/parseClaims.ts:397@2792fa1` — `    if (!EVIDENCE_PREFIX.test(raw)) continue;`

A line that fails `EVIDENCE_PREFIX` hits that `continue` and is never seen
again — not extracted as a claim, and not reported through the `malformed`
path either, even though `malformed` already exists and is already a failing
`Verdict`:

**Evidence:** `packages/claims/src/parseClaims.ts:453@2792fa1` — `    claims.push({ kind: "malformed", raw: raw.trim(), source });`

(Line 453 is the fallback that runs when a candidate marker passes
`EVIDENCE_PREFIX` but matches none of the shape-specific regexes below it — it
never runs for a line that failed `EVIDENCE_PREFIX` itself, which is exactly
the gap.)

**This already happened.** During `add-rules-compliance`'s Stage 3, the
coordinator wrote `**Evidence (Decision 4):**` in `design.md` — a
parenthetical after the label, one character different from the accepted
shape. `check` reported nothing: no claim, no `malformed`, no signal either
way. It took a human-equivalent reviewer (`architecture-reviewer`) reading the
file by eye to find that the anchor was both unchecked and, separately, off by
one line — a defect the tool exists specifically to catch, invisible in its
own extractor. Recorded in
`.claude/retrospectives/2026-08-27-proposal-to-pr-add-rules-compliance.md`,
finding 5 (pre-review) and backlog item 6 (post-review), which names this the
item its author "would build first."

This is the exact failure this repository's own thesis is built against — an
absent check that looks like a passed one — occurring inside the one module
whose entire job is preventing it.

## Why now

Confirmed to have produced a real, silent miss on a real run, not a
hypothetical. The retrospective's author flagged it as the highest-priority
item in the remaining backlog.

## What changes

- `parseClaims.ts` gains a way to recognize a line that was clearly *attempting*
  an `**Evidence:**` marker but doesn't match the exact accepted shape, and
  route it to the existing `malformed` claim/verdict path instead of silently
  skipping it.
- The observed incident is the parenthetical-label variant
  (`**Evidence (Decision 4):**`). The exact detection pattern — and whether it
  also covers two related variants the retrospective's author hypothesized but
  did not observe (`**Evidence**:` with the colon outside the bold markers,
  and `*Evidence:*` with single-asterisk emphasis) — is Decision 1 in
  `design.md`, to be resolved with a concrete regex and test cases during
  implementation rather than guessed here.
- No change to what `parseClaims` extracts as a valid `presence`/`absence`
  claim. The strict shape regexes (`PRESENCE_DOUBLE`, `PRESENCE_SINGLE`,
  `PRESENCE_BLOCK_HEAD`, `ABSENCE`) are untouched — this only changes whether
  a line that matches none of them, and previously vanished, now surfaces as
  `malformed`.

## Non-goals

- **Not adding support for parsing `**Evidence (label):**` as a valid
  presence/absence marker.** That would be a real authoring-convention
  addition (deciding what the parenthetical means, whether to preserve it,
  how `--fix`/`--stamp` treat it) and a much larger change. This proposal
  only makes the near-miss visible as `malformed`, matching how every other
  non-conforming marker shape is already handled.
- **Not a general fuzzy-matching pass over arbitrary prose.** The detector
  must not fire on ordinary sentences that happen to contain the word
  "Evidence" with no markdown emphasis nearby — see Decision 1's false-positive
  discussion in `design.md`.

## Dependencies

### Hard (must be merged before this starts)

None.

### Soft (design assumes these exist; graceful degradation if absent)

None.

### Enables (future changes that will depend on this)

None known.

## Size estimate

|                                 |                                                        |
| ------------------------------- | ------------------------------------------------------ |
| Estimated tasks                 | ~8                                                      |
| Packages or surfaces touched    | 1 (`packages/claims`)                                   |
| Risk                            | LOW                                                     |
| Expected sessions to implement  | 1                                                       |

## Open questions

- Whether to cover only the observed parenthetical-label variant, or also the
  two hypothesized-but-unobserved variants — Decision 1 in `design.md`.
