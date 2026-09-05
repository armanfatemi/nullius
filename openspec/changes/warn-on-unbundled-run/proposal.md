# Proposal — warn-on-unbundled-run

> **Depends on:** None

## Problem

Four of the run report's seven card rows read their answers from a committed
envelope. When no envelope exists for a branch the report says so honestly —
and says it about a branch whose session recorded everything those rows need.

The envelope is written by a command a human has to remember to run, and nothing
notices when they do not. The report's own handling of the absence is correct:

**Evidence:** `packages/claims/src/witnessReport.ts:933@2f870d2` — `  if (bundle === null) {`

So the failure is silent by construction. A run that dispatched twenty
reviewers, recorded every one, and never bundled produces a report stating that
agent review cannot be confirmed — and the statement is true of the artefact and
false of the run.

This is observed, and it is what prompted the change. A reviewer asked why four
rows on a pull request read *not recorded*. Two of the answers were sound: an
oracle was unconfigured, and a journal had genuine findings. The third was that
nobody had run `witness bundle` on that branch, and nothing anywhere had
mentioned it — not the report, not `doctor`, not CI.

The gap is narrow and the cost is not. A report whose blanks are indistinguishable
from a repository that does not record its runs teaches a reader to discount the
blanks, and the blanks are the part that carries the warning.

## Why now

The report only recently began answering these rows at all: a failing journal
used to block every count taken from it, so an unbundled branch and a bundled
one looked identical. Now that they differ, the missing envelope is the single
remaining reason a well-recorded run reports nothing.

## What changes

The design question is where the notice belongs, and there are three candidates
worth arguing rather than one obvious answer:

- **`doctor` reports it.** It already answers "is the ratchet still ratcheting",
  and "this branch has journals and no envelope" is that question. Costs
  nothing at PR time and is only seen by someone who runs it.
- **The report says which branch it looked for.** It names the path today; it
  could also say that journals for this range exist on this machine, turning a
  blank into an instruction. Requires the renderer to read `.nullius/runs`,
  which it currently does not and arguably should not.
- **The bundle is written at a known point** rather than remembered — on the
  first commit of a range, or by the pipeline's own PR stage. Removes the
  failure rather than reporting it, and is the largest of the three.

## Non-goals

- **Bundling automatically on every commit.** The envelope is committed content
  and a hook that writes committed content on every commit is a worse problem
  than the one being solved.
- **Failing a build over a missing envelope.** The report renders and does not
  gate. A project that does not record its runs must stay able to use it.
- **Changing what an absent bundle renders.** The current text is accurate. The
  question is whether anything says it earlier.

## Size estimate

Small for the `doctor` option, medium for the others. The design is the work:
the third removes the failure and the first two only describe it.
