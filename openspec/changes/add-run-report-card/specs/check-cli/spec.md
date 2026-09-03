# check-cli spec delta

## ADDED Requirements

### Requirement: The run report renders a reviewer card above the tiered document

`witness report` SHALL render a card of fixed rows above the tiered document,
one row per question a reviewer asks about how the change was produced, with
each row derived from a section of the same report rather than from any
additional input.

#### Scenario: the card leads the markdown document

- **WHEN** a run report is rendered as markdown
- **THEN** the card appears before the first tier heading, and the tiered document follows it unchanged

#### Scenario: a row is backed by a section

- **WHEN** the card is built
- **THEN** every row names the section id it read, and a row whose section is absent is omitted rather than defaulted

### Requirement: Each card row states the tier its answer came from

The card SHALL read every row's provenance tier from the `ReportTier` that
contains the row's backing section, and SHALL NOT derive a tier from record
kinds or from any other second attribution it maintains itself.

#### Scenario: tier is read from the containing tier, never mapped

- **WHEN** a row is built from a section
- **THEN** its tier is the `id` of the `ReportTier` that section was found under, and no mapping from record kind to tier exists anywhere in the card

#### Scenario: a section that moves tier moves its row with it

- **WHEN** a section is relocated to a different tier in a later version
- **THEN** the row's printed tier changes with it, with no card-side edit

#### Scenario: a self-reported row is not presented as verified

- **WHEN** a row's containing tier is self-reported
- **THEN** the row is marked self-reported, and the card states that such a row is the coordinator's own account

### Requirement: A row with no data is distinguishable from a row with a clean result

The card SHALL render three distinct states — clear, attention, and not
recorded — and SHALL NOT render an unrecorded section as a clean result or as
a zero.

#### Scenario: a row's failing figure is a typed field, not a rendered cell

- **WHEN** a row's mark is computed
- **THEN** the figure is read from a numeric field on the section, and no card code parses a rendered table cell

#### Scenario: every row resolves to a section that exists

- **WHEN** the card is built
- **THEN** each row in the row table names a section present in the report, and a row cannot be added without one

#### Scenario: an absent section renders as unanswerable

- **WHEN** a row's backing section has status `not-recorded`
- **THEN** the row renders as not recorded, carrying the section's reason, and carries no count

#### Scenario: the header states how many rows are unanswerable

- **WHEN** any row is not recorded
- **THEN** a line above the table states how many rows are unanswerable and why

### Requirement: A section exposes the figure its card row is about

Every section a card row reads SHALL expose that row's figure as a named
numeric field, and a section whose figure exists today only inside a rendered
table or not at all SHALL gain one, because a mark derived from presentation is
a mark that changes when the presentation does.

#### Scenario: the never-reported count is readable without parsing

- **WHEN** the dispatch-outcomes row is built
- **THEN** it reads a named field carrying the never-reported count, not the section's total and not a table cell

#### Scenario: the review-probe row has a figure to read

- **WHEN** the review-probe row is built
- **THEN** the canary section exposes a numeric field for it, rather than only the note it carries today

### Requirement: The card reports no composite score

The card SHALL NOT render a score, grade, percentage of process followed, or
any single figure aggregating rows, because such a figure is a weighting the
report cannot justify presented in the form of a measurement.

#### Scenario: components are shown rather than combined

- **WHEN** steering is reported
- **THEN** each figure the card reports is printed on its own, and no figure is combined with another into a derived total

### Requirement: Dispatched agents are listed without role inference

The card SHALL list dispatched agents by name and count, and SHALL NOT
classify any agent as a critique, adversarial or review role, because the
renderer holds no vocabulary that would make such a classification checkable.

#### Scenario: agent names are printed verbatim

- **WHEN** a bundle carries dispatch records
- **THEN** the card lists each distinct agent name with its dispatch count and asserts nothing about the role

### Requirement: The card is emitted before any truncation can remove it

The card SHALL be emitted ahead of the tiered document so that the size budget,
which truncates from the end, removes detail before it removes the summary.

#### Scenario: a report over budget keeps its card

- **WHEN** a rendered report exceeds the markdown budget
- **THEN** the card is intact in the truncated output and the truncation notice is present

### Requirement: The JSON document carries the card under its own key

`witness report --format json` SHALL carry the card under a `card` key and
SHALL raise its document version, leaving the tiers as the source of the values
the card restates.

#### Scenario: a consumer can tell the shapes apart

- **WHEN** the JSON form is rendered
- **THEN** the document version is 2 and the tiers are unchanged from version 1

#### Scenario: a card value never disagrees with the section behind it

- **WHEN** the card and the tiers are rendered into one document
- **THEN** every value a row restates equals the value in the section the row names, and a test asserts that equality rather than assuming it

### Requirement: A row references its section by id rather than copying its identity

The card SHALL carry the backing section's `id` on every row so a consumer can
resolve a row to the section it came from, because the card restates values the
tiers already hold and a restatement that cannot be traced is the duplication
this report has already had to remove once.

#### Scenario: a row can be resolved to its source

- **WHEN** a consumer reads a card row
- **THEN** the row names the section id and tier id it was built from
