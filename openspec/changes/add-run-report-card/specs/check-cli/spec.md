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

The card SHALL print the provenance tier of every row, because a mark in the
self-reported tier and the same mark in the code-verified tier are claims of
different strength, and SHALL state that distinction in prose above the table.

#### Scenario: a self-reported row is not presented as verified

- **WHEN** a row is derived from `stage` or `check` records
- **THEN** the row is marked self-reported, and the card states that such a row is the coordinator's own account

### Requirement: A row with no data is distinguishable from a row with a clean result

The card SHALL render three distinct states — clear, attention, and not
recorded — and SHALL NOT render an unrecorded section as a clean result or as
a zero.

#### Scenario: an absent section renders as unanswerable

- **WHEN** a row's backing section has status `not-recorded`
- **THEN** the row renders as not recorded, carrying the section's reason, and carries no count

#### Scenario: the header states how many rows are unanswerable

- **WHEN** any row is not recorded
- **THEN** a line above the table states how many rows are unanswerable and why

### Requirement: The card reports no composite score

The card SHALL NOT render a score, grade, percentage of process followed, or
any single figure aggregating rows, because such a figure is a weighting the
report cannot justify presented in the form of a measurement.

#### Scenario: components are shown rather than combined

- **WHEN** steering is reported
- **THEN** operator turns, characters typed, dispatches and mutations are printed as separate figures

### Requirement: Session time is reported as active time with its threshold stated

The card SHALL report active time together with the idle threshold and window
count that produced it, and SHALL label wall-clock span separately rather than
presenting it as the duration of the work.

#### Scenario: an overnight gap does not inflate the reported duration

- **WHEN** a journal's records span a long idle gap
- **THEN** the gap is excluded from active time, the threshold is printed, and the span is labelled as span

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
