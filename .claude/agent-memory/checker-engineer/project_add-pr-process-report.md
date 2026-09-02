---
name: add-pr-process-report-pre-review
description: add-pr-process-report pre-review (2026-08-31) plus post-review of the implementation (2026-09-01); two open bundler blockers in convertPrompt
metadata:
  type: project
---

`witness bundle` (kit) + `witness report` (kernel). Five pre-review iterations,
then post-review of the diff on `feat/add-pr-process-report`.

## Post-review, 2026-09-01 — what the implementation settled

Resolved from pre-review: line-level (not record-level) redaction
(`bundle.ts` `redactLines`, `lines.map`, id-gated); `--no-prompts` rewrites to
`{chars, hash}` rather than emptying; `findings` entries capped not emptied
(arity preserved, `collapsed-state` untouched); tier counts read
`JournalReport.provenance` journal-wide with no renderer-side tiering;
`provenance === null` renders *not recorded* naming the journal version;
`witness report` exits 0 whenever a report was produced; `describeCanary`
called without `reveal`. The kernel does not import the kit.

## Still open (blockers I raised at post-review)

1. **`convertPrompt` repairs a verdict.** `witness.ts:1438` raises `malformed`
   for a prompt whose `chars` is present and not a non-negative integer, and
   that branch runs *before* the text/hash branch, i.e. in both modes.
   `convertPrompt` overwrites a bad `chars` with `text.length`. The blank-text
   guard next to it exists to prevent exactly this and covers only one shape.
2. **Converted hash ≠ producer hash for truncated prompts.** Producer stores
   `clip(text, 2000)` + `truncated` + full `chars` and hashes the FULL text;
   the bundler hashes the stored clipped text and deletes `truncated`.
3. Consent hole: under `--no-prompts` a prompt line that parses but has no
   `id` ships its text; `unreadableLines` does not catch it.

## Reusable shapes

- **The repair direction is the one nobody tests.** Redaction reviews check
  "does it manufacture a failure"; the harder question is "does it erase one".
  Any field a redactor *derives* rather than carries is a repair candidate.
- **A verdict-set round-trip on `(verdict, subject)` is sound only while every
  subject is an id.** Confirm the pass-1 subject inventory before trusting it.
- **Routing gap, confirmed:** the checker-engineer row lists five files, so a
  new 1509-line kernel module routes to nobody. Key on `packages/claims/src/**`.

**Why:** post-review evidence for Stage 6 / retro counting.
**How to apply:** if this branch is revised, re-check `convertPrompt` first.

Related: [[add-run-ledger-producer-pre-review]].
