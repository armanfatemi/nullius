# check-cli spec delta

## ADDED Requirements

### Requirement: A section may carry more than one figure

`ReportSection` SHALL be able to carry multiple named numeric figures, so that
a section reporting several related numbers does not have to place them in a
rendered table where a consumer would have to parse presentation to read them.

#### Scenario: a multi-figure section is machine-readable

- **WHEN** a section reports active time, window count, threshold and span
- **THEN** each is a named numeric field on the section, and none is recoverable only from a rendered cell

### Requirement: Loop depth is computed by the validator, not the renderer

The run ledger SHALL carry the maximum pipeline iteration, so the renderer
reads a computed figure rather than classifying records by kind, which the
report renderer is forbidden to do.

#### Scenario: the renderer never reads a record kind to place a figure

- **WHEN** loop depth is rendered
- **THEN** its value and its tier both come from data the validator produced, and no kind-to-tier map exists in the renderer

### Requirement: A figure derived from a span of records states its attribution

A figure derived from records SHALL name the tier its input records belonged
to, and SHALL be reported as unattributed when its inputs span more than one
tier, because tiers mix within a single journal and a span that crosses them is
not the account of either.

#### Scenario: a mixed-tier span is not claimed for the harness

- **WHEN** active time is derived from records whose origins differ
- **THEN** the figure is reported as unattributed rather than as hook-attested

### Requirement: Duration is reported as active time, with span labelled separately

The report SHALL present active time together with the idle threshold and
window count that produced it, and SHALL label wall-clock span separately
rather than presenting it as the duration of the work.

#### Scenario: an overnight gap does not inflate the reported duration

- **WHEN** a journal's records span a long idle gap
- **THEN** the gap is excluded from active time, the threshold is printed, and the span is labelled as span
