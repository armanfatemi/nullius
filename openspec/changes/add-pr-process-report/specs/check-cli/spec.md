# check-cli spec delta

## ADDED Requirements

### Requirement: `witness report` renders a run in four provenance tiers

The kernel SHALL provide `witness report <base>..<head> | <sha>` that renders
a markdown or JSON report in the fixed order code-verified, hook-attested,
self-reported, unattributed, with each tier under its own heading and
provenance statement, and SHALL never place values from two tiers in one
table. The report SHALL take its tier counts from the journal report's `provenance`,
SHALL NOT apply a tiering rule of its own, and SHALL render those counts
journal-wide rather than scoped to the range.

#### Scenario: a range with a bundle

- **WHEN** `witness report main..HEAD --bundle nullius.runs/feat.json --format md` runs on a branch whose bundle re-validates
- **THEN** the output carries the four tier headings in order, a flowchart, and no table containing both a CI-computed count and a bundle-derived count

#### Scenario: a single commit

- **WHEN** `witness report <sha>` is given a bare revision
- **THEN** the range is that commit against its parent, and the same tiers render for it

#### Scenario: a journal predating per-record attribution

- **WHEN** a bundled journal is below version `0.6`, so the validator computes no provenance for it
- **THEN** the hook-attested, self-reported and unattributed tiers each render *not recorded*, naming the journal's version and that per-record attribution arrived at `0.6`, and no count is printed for any of them

#### Scenario: out-of-range records are scoped by the report, not the bundle

- **WHEN** an included journal carries records keyed to paths outside the range
- **THEN** those records are present in the bundle, excluded from the report's mutation-derived tables and flowchart, and the number excluded is stated; records of kinds that carry no path are counted in full and the report says so

#### Scenario: range scoping does not reach the tier counts

- **WHEN** a journal at version `0.6` or above carries records both inside and outside the range
- **THEN** the tier counts remain the whole-journal `provenance` figures, unscoped by the range, because scoping them would require the report to re-partition records itself

### Requirement: `witness report` renders and does not gate

The verb SHALL exit 0 whenever it produced a report, SHALL reserve exit 2 for
a usage error or unreadable input, and SHALL NOT exit non-zero because a tier
it rendered contains a failure.

#### Scenario: a failing code-verified tier

- **WHEN** the anchor check over the touched documents reports a failure
- **THEN** the failure is rendered in the code-verified tier and the verb exits 0

#### Scenario: an unreadable bundle

- **WHEN** `--bundle` names a path that is not readable JSON
- **THEN** the verb exits 2 and names the path

### Requirement: Absence is rendered as not recorded, never as zero

Every section of the report SHALL render either its data or an explicit
*not recorded* line naming the reason, and SHALL NOT render a missing source
as a zero count.

#### Scenario: no bundle on the branch

- **WHEN** no envelope exists at the given or default path
- **THEN** the code-verified tier renders, and the hook-attested, self-reported and unattributed tiers each carry one line stating that no bundle was found at that path

#### Scenario: no oracles configured

- **WHEN** the configuration declares no `oracles`
- **THEN** the oracle row reads *not configured* with the key to add, rather than reporting zero changes

### Requirement: Bundled journals are re-validated before any count is rendered from them

The report SHALL run `validateJournal` over each journal reconstructed from
the bundle and SHALL render the hook-attested tier only when every journal
validates, otherwise stating which journal failed and why.

#### Scenario: a tampered bundle

- **WHEN** a bundled journal carries a dispatch with no terminal record
- **THEN** the hook-attested tier is replaced by the validator's finding for that journal, and no dispatch count is printed

### Requirement: Rendered strings are escaped and canary locations are never rendered

The renderer SHALL pass every bundle- or document-derived string through a
markdown-cell escaper and every flowchart label through a mermaid-label
escaper, and SHALL suppress the `source` of any `canary-present` result and
the out-of-scope canary warning.

#### Scenario: adversarial task name

- **WHEN** a dispatch's `task` contains a pipe, a newline, and `]`
- **THEN** the table row and the flowchart node render inert, and the mermaid block still parses

#### Scenario: canary present in a checked document

- **WHEN** the code-verified tier's anchor check reports `canary-present`
- **THEN** the failure is counted and neither the document nor the line is printed
