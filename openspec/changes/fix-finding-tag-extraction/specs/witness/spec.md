# witness spec delta

## ADDED Requirements

### Requirement: A severity tag is recognised regardless of markdown emphasis

The recorder SHALL extract a finding whose severity tag is wrapped in inline
code, bold or italic markers, because emphasis is ordinary markdown that no
agent contract forbids and a reviewer's accounting must not depend on it.

#### Scenario: an emphasised tag is extracted

- **WHEN** a report line reads "- `[blocker]` text" or "- **[blocker]** text"
- **THEN** a finding is recorded with severity blocker and the text that followed the tag

#### Scenario: a bare tag keeps working

- **WHEN** a report line reads "- [blocker] text"
- **THEN** the finding is recorded exactly as before

### Requirement: A tag the extractor declines is reported rather than dropped

The recorder SHALL note any list item that carries a bracketed severity word it
did not extract, so that a future formatting the extractor does not recognise
surfaces as a diagnostic instead of as an absence.

#### Scenario: an unrecognised shape is visible

- **WHEN** a list item contains a bracketed severity word the pattern does not match
- **THEN** the recorder emits a note naming the line, and no finding is silently discarded

### Requirement: Extraction stays anchored to a list item

The recorder SHALL match a severity tag only at the start of a list item, and
SHALL NOT match tags appearing in running prose, because agent definitions and
design documents discuss these tags by name and matching them would manufacture
findings.

#### Scenario: prose about tags produces no finding

- **WHEN** a line discusses the tag vocabulary in a sentence rather than opening a list item
- **THEN** no finding is recorded

#### Scenario: an example tag in a list item is not distinguished from a real one

- **WHEN** a list item carries a tag as an illustration rather than as a finding
- **THEN** it is extracted, because a line grammar cannot tell them apart, and this is unchanged from the previous behaviour
