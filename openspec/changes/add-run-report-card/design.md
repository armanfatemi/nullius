# Design — add-run-report-card

## Context

The run report is built as four tiers of sections and rendered top to bottom.
The card changes nothing about how the report is built; it is a second
rendering of the same object.

## Decision 1 — the card is a projection, and the metrics become sections first

`buildCard` takes a `RunReport` and returns rows. It does not take
`RunReportInput`, does not call git, does not read the bundle, and does not
re-validate anything. Every value on a row is already present in a section.

**That last sentence was false in the first draft, and making it true is a
prerequisite of this change rather than a description of it.** The seven
question rows project cleanly. The derived metrics did not: no section carried
active time, loop depth or operator characters, and `RecordView` carries none of
the fields they need:

**Evidence:** `packages/claims/src/witnessReport.ts:257@80f862d` — `export interface RecordView {`

A card row with no backing section also has no containing `ReportTier`, which
would have left an implementer hand-assigning a tier — the map Decision 3 just
banned — or inventing sections silently. So the metrics land in
`buildRunReport` as ordinary sections, in the tier that already owns their
records, **before** any card work:

| new or extended section | tier | why that tier |
| --- | --- | --- |
| `session-span` (active time, windows, threshold, span) | hook-attested | derived from record timestamps the hooks wrote |
| `loop-depth` (maximum `stage.iteration`) | self-reported | `stage` is in `SELF_REPORTED_KINDS` |
| `prompts` (extended with a character total) | hook-attested | the section already exists in that tier |
| `dispatches` (already carries the agent table) | hook-attested | no change needed |

Two new sections, one extended, and the card then projects all of them exactly
as it projects everything else. The tier is still never assigned by the card;
it is read from whichever tier the section was placed in, and that placement is
made once, in the builder, where every other section's is.

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

- **attention** — the section carries data, its row's *named failing count*
  resolves, and that count is greater than zero.
- **clear** — the section carries data, its row's named failing count
  resolves, and that count is zero.

**A fourth case exists and is not `clear`.** A section may carry
`status: "data"` and still have no `count`, because `count` is optional
precisely so that "not recorded" is distinguishable from `0` by a consumer
reading the JSON. Treating an absent count as zero would render a green mark
for a number nobody recorded — the exact substitution the tiered document
refuses everywhere else. A row whose named count does not resolve renders
**not recorded**, and says which field was missing.

Each row declares which number is its failing count, in one table in the
source. That table is the only judgment in the feature, it is a constant, and
it is unit-tested row by row. It is the same shape as the kernel's `PASSING`
set: a small, explicit, reviewable calibration rather than a heuristic.

**A row never invents a mark.** There is no fallback branch that guesses when a
section is shaped unexpectedly; an unrecognised section is a missing row, and
the card says so. The same applies within a recognised section: a missing count
produces *not recorded*, never a default.

## Decision 3 — every row carries its tier, and the tiers are not flattened

A mark means different things per tier, and hiding that would make the card a
worse document than the one it replaces.

**The tier is read from the `ReportTier` that contains the row's backing
section, and is never mapped from record kinds.** This is the correction that
matters most in this document. An earlier draft of the spec said a row derived
from `stage` or `check` records is marked self-reported — which is true of the
data and is exactly the map the module header forbids:

**Evidence:** `packages/claims/src/witnessReport.ts:15@80f862d` — ` * of the header's `origin` — three drafts of this feature each invented an`

`SELF_REPORTED_KINDS` already owns that classification and lives in the
validator. A second copy in the card would be the fourth draft the header
warns about: a hand-maintained attribution that silently disagrees with the
first the moment a section moves tier. Reading `ReportTier.id` at build time
makes the disagreement unrepresentable rather than merely discouraged.

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

**Raising the version is a breaking change to this repository's own Action, and
the change must carry the fix.** The Action's gate is an equality test, so
version 2 makes it post nothing at all:

**Evidence:** `action/action.yml:231@80f862d` — `        if [ "$kind" != 'run-report' ] || [ "$version" != '1' ]; then`

A card nobody sees is worse than no card, and the failure is silent — the step
succeeds and simply skips the comment. The Action therefore learns to accept a
**set** of versions it can render rather than one, in this change, with a task
of its own. A version outside that set still refuses and still says which
version it saw; the point is that the refusal stays deliberate rather than
becoming the default for every future bump.

**Rows carry the backing section's id.** The duplication concern is real: this
card lands immediately after `fix-run-report-duplication` removed restatement
from the same document. Carrying the section id makes every restated value
traceable to its source, and a test asserts a row's value equals the section's
rather than trusting that it does.

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
