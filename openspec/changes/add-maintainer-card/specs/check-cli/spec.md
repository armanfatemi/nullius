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

### Requirement: The card is rendered by the checker, not by the workflow

The checker SHALL render the card, and the Action SHALL post what it rendered,
because the escaping the card performs is security-relevant and a renderer
embedded in workflow YAML has nowhere to put a test for it.

#### Scenario: the card comes from the checker

- **WHEN** the Action posts a grounding card
- **THEN** the card text was produced by `check --format card` and the Action did not compose it

### Requirement: An annotation escapes its property values as well as its message

The Action SHALL escape a workflow command's property values with the
property-value encoding, which also covers `:` and `,`, and SHALL NOT reuse the
message encoding for them, because a document path is PR-controlled and either
character would end the property and begin another.

#### Scenario: a newline in a document path cannot split the annotation

- **WHEN** a failing result's document path contains a newline, a colon or a comma
- **THEN** the emitted annotation is a single line and the path appears percent-encoded inside the property

### Requirement: Annotation severity matches whether the run gates

The Action SHALL emit `::error` when it is configured to fail the job and
`::warning` when it is advisory, so an annotation's severity never disagrees
with whether the run blocks.

#### Scenario: an advisory run annotates as a warning

- **WHEN** the Action runs with strict disabled and a claim is unverified
- **THEN** the annotation is a warning and the job does not fail

