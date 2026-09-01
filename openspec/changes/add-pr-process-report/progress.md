# Progress — proposal-to-pr: add-pr-process-report

_Started 2026-08-31; last updated 2026-08-31_

## Phases completed

- [x] Stage 1: Load
- [x] Stage 2: Pre-review iterations 1, 2, 3, 4 — probe CAUGHT all four rounds
- [x] Stage 3: Refine iterations 1, 2, 3

## Current phase

**PAUSED at the refinement cap for the second time.** `stage: refine`,
`paused: true`, `pause_reason: refinement_cap`, `max_refine: 4` (raised from 3
by the user after the first cap). Three blockers and two false premises open.
No code written, no branch cut, nothing committed.

## Open blockers

1. **B14** — the prohibition "may not remove a record" is stated over the wrong
   noun. Lines rejected in pass 1 (`malformed`, `duplicate-id`) never enter
   `records` (`witness.ts:1644`), so serialising `records` drops them and their
   verdicts. State the rule over *lines*, or carry raw source lines.
2. **B15** — `--no-prompts` emptying `prompt.text` manufactures `malformed`:
   the validator requires `chars` **and** a non-empty `hash` when text is empty
   (`witness.ts:1448`), and the producer's text mode writes no hash
   (`record.ts:894-900`). Convert to the producer's existing hashed form.
3. **B16** — the range predicate is undefined for pathless kinds. Only
   `mutation`, `verification` and `append` carry a path; dispatches, reports,
   findings and prompts do not. Say which kinds scoping applies to.

## Open false premises

- **FP-H** — `report.findings` entries are plain strings (`record.ts:479`).
  Decision 4, tasks §3 and the installer spec all promise to "preserve each
  entry's id". There are no ids. Preserve arity, empty each string.
- **FP-I** — `truncated`/`response_chars` describe the clipped findings entry,
  not `statement` (`record.ts:481`).

## Next 3 actions (for whoever resumes)

1. Restate the prohibition over lines and decide whether the envelope carries
   raw source lines — B14 and C15 collapse into that one decision.
2. Rewrite `--no-prompts` as a conversion to the hashed prompt form (B15).
3. Correct the findings-entry shape in all three documents (FP-H, FP-I), then
   re-run Stage 2 as iteration 5.

## Integration points the next session needs to read on resume

- packages/claims/src/witness.ts:761-841 — pass 1; the five line classes that never become records
- packages/claims/src/witness.ts:1443-1455 — prompt validation; the hash requirement when text is empty
- packages/kit/src/record.ts:475-485 — the findings array shape (strings, no ids) and where `truncated` belongs
- packages/kit/src/record.ts:892-902 — the producer's two prompt shapes, text and hashed
- packages/claims/src/witness.ts:1615-1639 — the `atLedgerFloor` gate and `provenance`

## Decisions taken

- **Ship whole**, not cut — the human's call.
- **Prompts travel by default** — the human's call.
- **Below v0.6 the tier breakdown renders *not recorded*** — the human's call;
  `architecture-reviewer` was later asked to attack it and argued for it.
- **Redaction may empty a field, not remove a record** — the coordinator's
  redesign; now known to need restating over lines (B14) and one stated
  exception (B15/C16).

## Pending user decisions

- Whether to raise the cap again for iteration 5, or stop and hand back.

## Review-layer observations for the retro

- Probe CAUGHT in all four rounds; three documents, cycled.
- `rule-auditor` cleared unsupported anchors in two consecutive rounds, the
  second after being briefed on that exact failure. Dropped at iteration 4's
  pre-flight. That halved the probe's scored population — worth noting as a
  cost of the exclusion.
- `checker-engineer` returned an empty report once (memory-update line only)
  and had to be re-dispatched. The re-run produced the round's strongest
  findings. A silent empty return reads as a clean review.
- Six of the coordinator's own errors across four rounds were the same shape:
  a claim about existing code checked at too small a unit — the line, then the
  comment, then the paragraph, then the record — while the governing scope was
  one level further out.
