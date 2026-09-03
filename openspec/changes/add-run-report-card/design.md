# Design — add-run-report-card

## Context

The run report is built as four tiers of sections and rendered top to bottom.
The card changes nothing about how the report is built; it is a second
rendering of the same object.

## Decision 1 — the card is a projection, not a second data path

`buildCard` takes a `RunReport` and returns rows. It does not take
`RunReportInput`, does not call git, does not read the bundle, and does not
re-validate anything. Every value on a row is already present in a section.

The reason is the module's existing invariant: the renderer decides nothing
about provenance, and three earlier drafts of this feature each invented an
attribution the data did not carry. A card that reached for its own inputs
would be a fourth. Keeping it downstream of `buildRunReport` means a row can
only ever restate a section, and a row with no section behind it cannot
compile.

## Decision 2 — the tri-state is mechanical, and derived from data already there

Each row resolves to one of three marks. The mapping is a lookup, not a
judgment:

- **not recorded** — the backing section has `status: "not-recorded"`. This is
  read directly off the section, which is where it is already decided:

**Evidence:** `packages/claims/src/witnessReport.ts:522@80f862d` — `  return { id, title, statement, status: "not-recorded", reason, notes: [] };`

- **attention** — the section carries data and its row's *named failing count*
  is greater than zero.
- **clear** — the section carries data and that count is zero.

Each row declares which number is its failing count, in one table in the
source. That table is the only judgment in the feature, it is a constant, and
it is unit-tested row by row. It is the same shape as the kernel's `PASSING`
set: a small, explicit, reviewable calibration rather than a heuristic.

**A row never invents a mark.** There is no fallback branch that guesses when a
section is shaped unexpectedly; an unrecognised section is a missing row, and
the card says so.

## Decision 3 — every row carries its tier, and the tiers are not flattened

A mark means different things per tier, and hiding that would make the card a
worse document than the one it replaces. Loop depth and check counts come from
`stage` and `check` records, which the validator classifies as the
coordinator's own account of itself.

Rows therefore print their tier. A green row in the self-reported tier says
*the coordinator says so*; a green row in the code-verified tier says *this was
re-read here*. The card states that distinction in one line above the table
rather than trusting the column header to carry it.

## Decision 4 — no score, and no automation ratio

Rejected: a 0–100 process score, a letter grade, and a single autonomy figure
derived from prompts against records.

All three are weighted aggregates over rows whose weights nothing in the
repository can justify, presented in a format that reads as a measurement. The
objection is not that a good weighting is hard to find. It is that the output
would be indistinguishable from a measured quantity while being an opinion,
which is the exact substitution this project exists to refuse. The components
are printed; the reader does the weighing.

## Decision 5 — session time is reported as active time, with the threshold named

Wall-clock span is the wrong number and is misleading by a large factor. On
the range this change was designed against, the span is 26.8 hours and the
active time is 3.1 hours across ten windows: the difference is a night.

The card prints active time, the window count, and the idle threshold that
produced them, and prints the span second and labelled. A reader who disagrees
with the threshold can see it and discount accordingly, which is not possible
if only the derived figure is shown.

## Decision 6 — operator volume is measured in characters, because that survives redaction

The prompt recorder writes a character count beside the text, and it is
written into the record itself rather than derived at render time:

**Evidence:** `packages/kit/src/record.ts:900@80f862d` — `        chars: text.length,`

This matters because prompt text does not always travel. Under hashed mode and
under the bundler's `--no-prompts`, the text is withheld and the count is not.
Measuring steering in characters therefore works on bundles where measuring it
in words or content would silently degrade to zero — and a steering metric
that reads zero because the text was redacted is worse than no metric.

## Decision 7 — the agents are listed, and their roles are not inferred

Rejected: matching agent names against a pattern list to report whether a
critique or adversarial reviewer ran.

Any such list is either this repository's vocabulary imposed on every other, or
a config key each project must fill in correctly for the row to mean anything.
Both fail the same way: a green "critique review present" row that fired
because a name matched a glob is a claim about a role, evidenced by a string.
The card prints the agent names and their dispatch counts and stops there.
A reader who knows the repository recognises the roles; a reader who does not
is not misled by a mark the data cannot support.

## Decision 8 — the card leads the comment; the document is collapsed beneath it

The comment stays one self-contained artefact. The card is visible; the
existing tiered document follows inside a `<details>` block.

Rejected: moving the document to the job summary and leaving only the card.
That is cleaner on the pull request page and worse everywhere else — the
detail becomes a click into Actions, and is absent entirely from the email
notification and from `gh pr view`, which is how a reviewer triaging a queue
actually reads.

The size budget is unchanged and still enforced, so a card cannot push a
comment past the limit that would cause it to be rejected outright:

**Evidence:** `packages/claims/src/witnessReport.ts:72@80f862d` — `export const MARKDOWN_BUDGET_BYTES = 60_000;`

Because the budget truncates from the end, the card is emitted first and is
the last thing that can be lost.

## Decision 9 — the JSON document gains the card under its own key

`renderJson` grows a `card` key holding the rows. It does not restructure the
tiers and does not move data out of them: the card duplicates, and the tiers
remain the source. `RUN_REPORT_VERSION` goes to 2, because a consumer that
reads version 1 must not be handed a document whose top level changed shape.

## Risks

- **The card becomes the only thing anyone reads, and a grey row is read as a
  pass.** Mitigated by the summary line, which states how many rows are
  unanswerable and why, above the table rather than below it.
- **Row calibration drifts from what the sections mean.** Mitigated by
  building rows from section ids and failing a test when an id disappears,
  rather than re-deriving values from raw records.
- **The rounds heuristic is presented as fact.** The window is a constant and
  is already printed with the flowchart; the card names it on the row:

**Evidence:** `packages/claims/src/witnessReport.ts:44@80f862d` — `export const ROUND_WINDOW_MS = 120_000;`

## Open questions

- Whether the tiered document should eventually move behind a link rather than
  a `<details>` block. Deferred until the card has been used on real review
  traffic; reversing a collapse is cheap, reversing a move is not.
