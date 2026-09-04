# evidence-anchors spec delta

## ADDED Requirements

### Requirement: An absence claim states the repository state it is about

An absence anchor SHALL make explicit whether its count is a claim about the
working tree or about a fixed point in history, so that a merged document does
not assert a live property of a repository its author no longer influences.

#### Scenario: a merged document is not failed by an unrelated change

- **WHEN** a change introduces the first instance of something an already-merged document recorded the absence of
- **THEN** the merged document does not hard-fail the unrelated change

#### Scenario: a live document's absence claim still binds

- **WHEN** an absence anchor sits in a change that has not merged
- **THEN** the claim is checked against the working tree and fails when the count disagrees
