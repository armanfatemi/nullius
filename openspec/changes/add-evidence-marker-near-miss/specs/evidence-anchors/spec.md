# Evidence Anchors — near-miss markers report, not vanish

## ADDED Requirements

### Requirement: A near-miss Evidence marker is reported as malformed, not silently skipped

The parser SHALL report a line that closely resembles an `**Evidence:**`
marker but does not match the accepted shape as a `malformed` claim, rather
than skipping it without any record.

The parser SHALL NOT extract a near-miss marker as a valid `presence` or
`absence` claim. Only the exact accepted shapes may be extracted; a near-miss
is reported, never parsed as evidence.

The near-miss detector SHALL NOT fire on ordinary prose that mentions the
word "evidence" with no markdown emphasis adjacent to it — the detector is
scoped to lines that plausibly attempted the marker syntax, not to the
presence of the word.

#### Scenario: A parenthetical after the label is reported as malformed

- **WHEN** a document contains the line `**Evidence (Decision 4):** \`path.ts:10\` — \`text\``
- **THEN** `check` reports a `malformed` finding for that line, and the run fails

#### Scenario: Ordinary prose mentioning "evidence" produces no finding

- **WHEN** a document contains the line "The evidence shows this file is unused."
- **THEN** `check` produces no claim and no finding for that line
