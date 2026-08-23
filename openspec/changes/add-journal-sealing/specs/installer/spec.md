# Installer — doctor reports journal durability

## ADDED Requirements

### Requirement: Doctor reports unsealed journals as a fact

`doctor` SHALL report the number of journals in `.nullius/runs/` that the
`refs/nullius/runs` ref does not carry, and SHALL report it as a fact rather
than a fault.

An unsealed journal is not a defect — a session may still be running, or may
have crashed before its terminal hook. The register SHALL match the one already
used for an empty runs directory, which states the absence and declines to call
it evidence of a fault.

Where git is unavailable or the project is not a repository, `doctor` SHALL
label the sealing state `??` rather than reporting zero unsealed journals: it
checks only what local state can prove.

#### Scenario: unsealed journals are counted, not failed

- **WHEN** `.nullius/runs/` holds three journals and the ref carries one
- **THEN** `doctor` reports two unsealed journals and does not fail

#### Scenario: no git means unknown, not zero

- **WHEN** `doctor` runs where the project is not a git repository
- **THEN** the sealing state is reported `??`, and the message names why
