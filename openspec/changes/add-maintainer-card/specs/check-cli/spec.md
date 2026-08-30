# check-cli spec delta

## ADDED Requirements

### Requirement: The Action renders a structured grounding card

The Action SHALL render its report as a structured card derived from
`check --format json`, reading the report's `version` field before any other
field and falling back to the unstructured human-format report when that
version is not one it recognizes.

#### Scenario: card rendered from a recognized report

- **WHEN** the Action runs against a checker whose report version it recognizes
- **THEN** the PR comment carries a table of anchors checked and failures by verdict

#### Scenario: unrecognized version falls back rather than guessing

- **WHEN** the report's `version` is not recognized
- **THEN** no card is rendered, the human-format report is posted instead, and the reason is stated

### Requirement: Rendered values from the checked document are escaped

The Action SHALL escape every value it interpolates into a markdown table
cell or a GitHub workflow command, because the checked document is untrusted,
PR-controlled input.

#### Scenario: adversarial anchor text cannot break the table

- **WHEN** a checked document contains an anchor whose text includes a pipe, a newline, or `::`
- **THEN** the rendered card and annotations contain that text inertly, with table and command structure intact

### Requirement: The card does not claim entailment

The card SHALL state that verdicts certify the citation and not the argument
built on it, and SHALL NOT present a passing run as evidence that the
document's reasoning is sound.

#### Scenario: a fully passing run is reported modestly

- **WHEN** every anchor in a pull request verifies
- **THEN** the card reports anchor integrity and names `audit` as the check it has not performed
