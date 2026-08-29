# Canary — status does not reveal the plant's location

## ADDED Requirements

### Requirement: canary status does not print the plant's document or line

`canary status` SHALL report only whether a canary is active and when it was
planted. It SHALL NOT print the planted claim's document path or line
number.

This SHALL NOT change `canary status`'s exit code (`0` when no canary is
active, `1` when one is) or the message printed when no canary is active.

#### Scenario: An active canary's location is not printed

- **WHEN** a canary is planted and `canary status` is run
- **THEN** the printed line names when the canary was planted, and does not name the document or line it was planted at

#### Scenario: No active canary is reported exactly as before

- **WHEN** no canary is planted and `canary status` is run
- **THEN** the output is `no active canary` and the exit code is `0`
