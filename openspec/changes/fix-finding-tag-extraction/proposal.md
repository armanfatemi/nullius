# Proposal — fix-finding-tag-extraction

> **Depends on:** None

## Problem

A reviewer's findings reach the run journal only if the reviewer wrote its
severity tag as bare text. The extractor anchors the tag directly to the list
bullet:

**Evidence:** `packages/kit/src/record.ts:234@889d69c` — `const TAG_LINE = /^\s*-\s*\[(blocker|concern|looks-good|false-premise)\]\s+(.+)$/;`

So `- [blocker] ...` is extracted, and `` - `[blocker]` ... `` and
`- **[blocker]** ...` are both dropped. Markdown emphasis around a tag is not a
deviation from the contract any agent file states; the reviewer agents in this
repository describe the tags in prose that is itself written in backticks, and
at least one reviewer reproduces that formatting in its report.

The consequence is not a missing line in a log. `pipeline` asks the journal
which blockers are still open, and the coordinator is instructed to trust that
answer over its own synthesis precisely because the synthesis is written by the
party with the motive. When extraction drops a reviewer's findings, that query
returns empty while a real blocker is outstanding, and the pipeline concludes
every finding was answered.

`SUPPRESSED-FINDING` cannot catch it. That check compares findings against
resolutions, so it fires when a recorded blocker has no answer. A blocker that
was never recorded has nothing to be compared against, and the check passes for
the same reason the gate did.

This is observed rather than theoretical. In the `add-run-report-card` run,
`test-engineer` returned a blocker at pre-review iteration 2 written as
`` - `[blocker]` ``. It never reached the journal; `findings --open` reported no
unanswered blockers while that blocker was outstanding. It was caught only
because the coordinator read the report text, which is the habit the journal
exists to make unnecessary.

## Why now

The gate is currently strongest against the reviewers that need it least. An
agent whose formatting happens to match is fully accounted for; an agent whose
formatting does not is invisible, and nothing distinguishes the two states from
the outside. Every run since the extractor landed has been reporting a
finding count that depends on markdown styling.

## What changes

- The tag is recognised when wrapped in the markdown emphasis a reviewer may
  reasonably use — inline code, bold, italic — in any combination, on either
  side.
- The tag remains anchored to the start of a list item. Widening to "anywhere in
  the line" would match prose *about* the tags, including the agent definitions
  and this proposal, and would manufacture findings rather than recover them.
- A dropped tag stops being silent. Where a line begins a list item and contains
  a recognised severity word in brackets that the extractor still declines, the
  recorder notes it, so the next instance of this class is visible rather than
  absent.

## Non-goals

- **Inferring findings from untagged prose.** A return with no tag line produces
  no findings, and that stays the honest reading.
- **Changing the closed severity vocabulary**, or how `false-premise` maps onto
  `blocker`.
- **Relaxing `SUPPRESSED-FINDING`.** It is correct; it was never reached.

## Size estimate

Small. One regex, one diagnostic, and unit tests over the formatting variants.
The variants are the whole point of the change, so each gets a case.
