# canary spec delta

## ADDED Requirements

### Requirement: A planted claim does not repeat one already in the repository

`canary plant` SHALL NOT plant a claim whose text already appears in the working
tree, because a claim a reviewer can find by searching measures whether they
searched rather than whether they read.

#### Scenario: an already-published claim is refused

- **WHEN** the harvested claim's text is already present in a tracked file
- **THEN** `plant` refuses or plants a different claim, and says which happened

### Requirement: The probe reports when it could not have measured a reader

The verify step SHALL distinguish a catch made against a claim that was novel
from one made against a claim already published, so a verdict never reports more
than it established.

#### Scenario: a discoverable plant is not scored as a clean catch

- **WHEN** the planted claim's text appears in committed files predating the plant
- **THEN** the verdict records that the probe was discoverable rather than reporting an unqualified catch
