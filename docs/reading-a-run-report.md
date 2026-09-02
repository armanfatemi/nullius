# Reading a run report

A pull request tells you what changed. If an agent wrote it, the diff is the
smaller half of what you need: how many agents ran, how many review rounds
happened, what was caught and what was dropped, whether a test was weakened on
the way, what the human said to steer it. The run report puts that on the pull
request beside the diff.

This page is about **reading** one. `nullius witness report --help` covers
producing one.

## The report is four tiers, and the order is the argument

Every section sits under exactly one tier, and no table mixes two. The order is
by independence from the person who opened the pull request — most independent
first — because that is the order in which a skimming reader should meet them.

### 1. Code-verified — trust this one

Re-run in CI, from the checkout, on every run. The anchor check over the PR
body and the touched documents, the oracle over the range, and the validator
over every bundled journal.

**A contributor cannot shape this tier.** It is computed from the branch, by
the same code that would run if nobody had bundled anything. If you read one
section, read this one.

### 2. Hook-attested — trust it as far as the bundle goes

Dispatches, rounds, mutations, findings, model and token usage — written by the
harness as the run happened, which the agent had no opportunity to decline.
Rendered only after every journal in the bundle re-validates.

The qualifier matters: **`witness validate` checks a journal's internal
consistency, never its completeness.** A bundle with whole journals removed
validates cleanly. The tier is honest about what it contains and cannot be
honest about what it does not.

### 3. Self-reported — a claim, not a finding

Stage records, resolutions, decisions and checks the coordinator wrote about
its own run. This is the party with the motive describing its own conduct.

It is worth reading precisely because it sits beside tier 2, which it did not
write. When a coordinator says it resolved a blocker and the hook-attested tier
shows no dispatch that could have, you have found something. That comparison is
the reason the tiers are separate rather than merged.

### 4. Unattributed — records belonging to nobody

Records with no origin of their own under a header that claims none. Counted
separately rather than folded into the hook tier, because counting them as
attested would be the flattering default the field exists to remove.

## What "not recorded" means, and why it is never zero

A section renders either its data or an explicit *not recorded* with a reason.
It never renders a missing source as `0`.

That distinction carries most of the report's value. "No reviewer raised a
blocker" and "nothing recorded whether a reviewer ran" are different facts, and
only one of them is reassuring. Common reasons:

- **`no bundle at <path>`** — nobody committed an envelope. The code-verified
  tier still rendered; the other three had nothing to read.
- **`tier breakdown not recorded — this journal is version 0.2 …`** — the
  journal predates per-record attribution, which arrived at schema `0.6`. The
  validator computes no partition for it, so the report declines to invent one.
- **`N session(s) overlapped this range but mutated no file in it`** — a
  review-only session the selection rule could not confirm. It is named rather
  than dropped, with the flag that would include it.

## What the report is not

- **Not enforcement.** Nothing here fails a build. `witness report` exits 0
  whenever it produced a report, including when a tier it rendered contains a
  failure — the checks it wraps already gate on their own, and a second place
  for pass and fail to disagree helps nobody.
- **Not proof a review happened.** A green code-verified tier says citations
  resolve, not that anyone thought about them.
- **Not model-generated.** Every sentence is a template over counts and
  records. There is no summary, and nothing was asked to characterise the run.

## Reading one quickly

1. **Code-verified tier.** Anything failing here is about the branch and is
   yours to act on.
2. **The *not recorded* list at the end.** What the report could not see is
   usually more informative than what it could.
3. **Rounds against mutations** in the flowchart. Edit bursts after a review
   round are the shape of findings being addressed; a round with no burst after
   it is a round that changed nothing.
4. **Self-reported against hook-attested.** Resolutions with no dispatch behind
   them, or blockers closed in prose and nowhere else.

## Related

- `spec/run-report.md` — the tier definitions, the selection rule, and what a
  green tier does and does not certify.
- `action/README.md` — enabling `run-report` in CI.
- `spec/witness-journal.md` — the record kinds every tier is computed from.
