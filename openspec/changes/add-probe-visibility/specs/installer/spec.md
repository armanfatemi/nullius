# Installer — probe capture is visible

## ADDED Requirements

### Requirement: Doctor reports whether harness payload capture is on

`doctor` SHALL report whether live harness-payload capture is currently enabled
and whether any captures are present, and SHALL report it as a fact rather than
a fault.

Not capturing SHALL NOT be a failure. Capture records raw payloads carrying
prompt text and absolute paths, so declining it is a legitimate configuration
and a check that failed on it would be disabled rather than heeded.

The state SHALL NOT be reported as unknown, because it is determinable from the
environment and the filesystem; reporting it as unknown would overstate the
checker's ignorance.

The report SHALL name the environment variable that controls capture, so that a
reader can act on what was reported without consulting documentation.

#### Scenario: capture is off

- **WHEN** `doctor` runs with no capture environment variable set
- **THEN** the report states that capture is off, names the variable, and does
  not fail

#### Scenario: capture is on with recordings present

- **WHEN** capture is enabled and the live probe directory holds payloads
- **THEN** the report states that capture is on and how many event types are
  held, as a fact

### Requirement: Init names probe capture without enabling it

`init` SHALL state that harness payload capture exists, what it records, and
that it is off unless explicitly requested.

`init` SHALL NOT enable capture. Persisting prompt text is a decision belonging
to the operator, and an installer that begins recording payloads as a side
effect of setup has made that decision on their behalf.

#### Scenario: init mentions capture and leaves it off

- **WHEN** `init` runs in a project
- **THEN** its output names probe capture, and the settings it writes contain no
  probe key
