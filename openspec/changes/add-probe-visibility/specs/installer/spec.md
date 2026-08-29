# Installer — probe capture is visible

## ADDED Requirements

### Requirement: Doctor reports whether harness payload capture is on

`doctor` SHALL report whether live harness-payload capture is currently enabled
and whether any captures are present, and SHALL report it as a fact rather than
a fault.

Not capturing SHALL NOT be a failure. Capture records raw payloads carrying
prompt text and absolute paths, so declining it is a legitimate configuration
and a check that failed on it would be disabled rather than heeded.

Capture state SHALL be determined from the environment block of the harness
settings file, not from `doctor`'s own process environment. The variable governs
the hook subprocess, whose environment the settings file supplies; `doctor` runs
in the operator's shell, so its own environment answers a different question
from the one being asked.

The variable SHALL be treated as enabling capture only when its value is exactly
`1`. Any other value, including `0`, is reported as not capturing.

The state SHALL be reported as unknown only when the settings file cannot be
read or parsed. Where it can be read, the state is determinable and reporting it
as unknown would overstate the checker's ignorance.

The report SHALL name the environment variable that controls capture, so that a
reader can act on what was reported without consulting documentation.

The report SHALL distinguish the live capture directory from the committed probe
corpus, naming which of the two it is describing, because a reader who conflates
them will read a green corpus check as evidence that capture is on.

#### Scenario: capture is off

- **WHEN** `doctor` runs and the settings environment block sets no capture
  variable
- **THEN** the report states that capture is off, names the variable, and does
  not fail

#### Scenario: capture is on with recordings present

- **WHEN** the settings environment block sets the capture variable to `1` and
  the live probe directory holds payloads
- **THEN** the report states that capture is on and how many event types are
  held, as a fact

#### Scenario: capture is off but stale recordings remain

- **WHEN** the settings environment block sets no capture variable and the live
  probe directory nonetheless holds payloads from an earlier session
- **THEN** the report states that capture is off and that the held payloads are
  not being refreshed, as a fact

#### Scenario: settings cannot be read

- **WHEN** the harness settings file is absent, unreadable, or does not parse
- **THEN** the capture-state half of the report is unknown rather than assumed
  off, and the report says which file it could not read

### Requirement: Init names probe capture without enabling it

`init` SHALL state that harness payload capture exists, what it records, and
that it is off unless explicitly requested.

`init` SHALL NOT enable capture, and SHALL NOT offer to enable it. Persisting
prompt text is a decision belonging to the operator, and an installer that
begins recording payloads as a side effect of setup has made that decision on
their behalf.

The kit settings file `nullius.kit.json` that `init` writes SHALL contain no
probe key. `init` does not write `.claude/settings.json`, so an assertion
scoped to that file would be vacuously true and would prove nothing.

#### Scenario: init mentions capture and leaves it off

- **WHEN** `init` runs in a project
- **THEN** its output names probe capture, and the `nullius.kit.json` it writes
  contains no probe key
