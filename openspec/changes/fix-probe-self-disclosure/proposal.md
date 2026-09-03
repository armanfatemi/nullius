# Proposal — fix-probe-self-disclosure

> **Depends on:** None

## Problem

The review probe plants a false claim in a document and scores whether review
finds it. On this repository it can no longer measure that, because the claim it
plants is public and one reviewer has it memorised.

**The claim is deterministic.** `harvestFalseClaim` sorts its candidate glob and
takes the first file with a recognisable symbol:

**Evidence:** `packages/claims/src/canary.ts:227@0ba166e` — `  }).sort();`

There is no seed and no variation. Every plant against an unchanged repository
produces the identical sentence, and the pipeline's own guidance already
half-knows this — it advises rotating the *document* between rounds while noting
that rotation "does not change the sentence itself".

**The pipeline then publishes it, twice over.** Recording the plant location in
`review-evidence.md` is mandated, and that file is committed. Reviewers quote the
planted claim verbatim when they flag it, which is correct behaviour, and the
recorder captures findings verbatim, which is also correct. So every run writes
the sentence into two committed artefacts.

**The result is measurable.** A search for the planted sentence across `main`
returns ten or more committed files, the earliest dated 2026-08-30 — archived
review evidence, a retrospective, and a proposal.

**And a reviewer has learned it.** `architecture-reviewer` carries a committed
memory file naming the pattern exactly — "a false, topic-unrelated `retry` 'must
stay in sync' sentence spliced into a document under `openspec/changes/`" — and
recording that it has been "Seen 7+ times". Its catches are pattern recall
rather than close reading. `test-engineer` and `rule-auditor` carry no
equivalent, and their catches remain evidence.

None of these three behaviours is a mistake on its own. Together they mean a
`CAUGHT` verdict on this repository certifies less than it reports, and the
degradation is invisible in the verdict.

## Why now

The probe is the instrument that measures whether every other review layer is
real. An instrument reporting a stronger result than it measured is worse than
no instrument, because the number is acted on.

## What changes

- **The planted claim varies.** Either a seed derived from something that
  changes per plant, or an explicit override, so re-planting does not reissue a
  sentence already in the repository's history.
- **`plant` refuses, or warns loudly, when its harvested claim already appears
  in the working tree.** The tool can check this in one search, and it is the
  single highest-value guard: a claim already committed cannot measure anything.
- **The scoring vocabulary gains a state for "the probe was discoverable".** A
  run whose plant text is already public should not be able to record `CAUGHT`
  as though it had measured a reader.

## Non-goals

- **Suppressing the plant location in `review-evidence.md`.** It is what makes a
  `MISSED` diagnosable, and that is worth more than the secrecy it costs.
- **Asking reviewers not to quote what they find.** Quoting the claim is how a
  false-premise finding is legible; the recorder capturing it is the whole point
  of the ledger.
- **Retroactively scrubbing the published sentence.** It is in archived
  evidence, a retrospective and an agent memory across many commits, and
  rewriting that history to protect an instrument would be the wrong trade.

## Size estimate

Small to medium in code, and the design question is the real work: what varies
per plant, and what the tool should do when it detects its own claim is already
public.
