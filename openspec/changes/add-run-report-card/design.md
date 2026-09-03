# Design — add-run-report-card

## Context

The run report is built as four tiers of sections and rendered top to bottom.
The card changes nothing about how the report is built; it is a second
rendering of the same object.

## Decision 1 — the card is a projection, and the metrics become sections first

`buildCard` takes a `RunReport` and returns rows. It does not take
`RunReportInput`, does not call git, does not read the bundle, and does not
re-validate anything. Every value on a row is already present in a section.

**That sentence was false in the first draft, and the change was reduced rather
than the claim weakened.** The seven question rows project cleanly from sections
that exist. The derived metrics did not: no section carried active time, loop
depth or operator characters, and the record view carries none of the fields
they need:

**Evidence:** `packages/claims/src/witnessReport.ts:257@7e807ba` — `export interface RecordView {`

A card row with no backing section also has no containing `ReportTier`, which
would have left an implementer hand-assigning a tier — the map Decision 3 bans —
or inventing sections silently. Two rounds were spent trying to fix that inside
this change; both attempts relocated the problem rather than removing it.

So the metrics leave. They are `add-run-report-metrics`, which depends on this
change, does the kernel work on its own terms, and then arrives through this
row model with no new card-side mechanism. What remains here is true as
written: every value on a row is already present in a section.

## Decision 1b — the card adds the two figures its own rows need, and no more

Two of the seven rows have no number to read, and they are found by opening the
builder rather than by reasoning about it.

`outcomes` carries its `count` as the **total** of the three terminal states, so
the figure the card's row is about — how many reviews never reported — exists
only as a rendered table cell:

**Evidence:** `packages/claims/src/witnessReport.ts:1191@7e807ba` — `        count: outcomes.found + outcomes.empty + outcomes.noReport,`

And the `canary` section is built with notes and nothing else — no `count` at
all — so the review-probe row, which is the one row that measures whether review
*found* something rather than that it ran, has no value to project.

So `ReportSection` gains **one named optional numeric field**, `failing`, and the
two sections that owe their row a figure populate it. An earlier draft of this
decision said two fields, one per row; building it showed both rows want the
same quantity — *how many of the bad case* — so a second field would have been
two names for one idea. One field, two populating sections. That is the whole of
the kernel change here.

`count` is untouched and keeps meaning what it means: how many things the
section is about. `failing` is how many of them are the case the row is asking
about, and its absence is what makes a row unanswerable rather than clear —
which is why it is optional rather than defaulted to zero.

**What the probe row can honestly say.** The `canary` section knows whether a
probe is registered *now*; it does not know whether a reviewer found one. So the
row reports an uncleared probe, which is a real merge blocker, and does not
claim to report whether review worked. That claim lives in `review-evidence.md`,
which the report does not read.

**This is deliberately not the general capability.** `add-run-report-metrics`
needs a section that can carry four figures at once, and generalising for that
here would be designing for a change that has not been reviewed. Two named
fields is the smallest thing that makes Decision 1's claim true, and it is
testable by name rather than by shape.

**It also corrects a sequencing error.** An earlier draft deferred all of this
to `add-run-report-metrics` and left that change declaring
`Depends on: add-run-report-card` — while the card needed a field only that
change provided. The dependency pointed backwards and neither could go first.
With the two fields here, the card depends on nothing and the metrics change
depends on the card for its row model, which is the direction the work actually
runs in.

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

## Decisions 5 and 6 — moved, not deleted

Session time and operator volume were Decisions 5 and 6. They specified metric
rows this change no longer contains, and their arguments — active time with the
threshold named rather than wall-clock span, and operator volume measured in
characters because the count survives redaction when the text does not — now
live in `add-run-report-metrics`, which is where the rows do.

They are recorded as moved rather than dropped because both arguments were
settled with the user and would otherwise be re-litigated from scratch.

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
