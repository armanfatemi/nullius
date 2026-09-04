# installer spec delta

## ADDED Requirements

### Requirement: The Action can run a locally built checker

The Action SHALL run a checker named by an environment override when one is
set, and SHALL otherwise install the pinned release exactly as it does today,
so that a repository developing the checker can render its own pull-request
comments from the code under review.

#### Scenario: the override runs instead of the pinned release

- **WHEN** the override names an executable checker
- **THEN** the Action runs it and does not install the pinned version

#### Scenario: an unset override changes nothing

- **WHEN** the override is not set
- **THEN** the Action installs and runs the pinned `claims-version` as before

### Requirement: A comment says when it was not produced by a released checker

The Action SHALL state in the comment which checker rendered it whenever the
override is in use, because a card rendered from a working tree and one rendered
from a release are otherwise indistinguishable to a reviewer.

#### Scenario: an overridden run is labelled

- **WHEN** the Action renders a comment using the override
- **THEN** the comment names the checker it ran rather than implying a released version
