# Installer — probe capture is visible

## ADDED Requirements

### Requirement: Doctor reports whether harness payload capture is on

`doctor` SHALL report whether live harness-payload capture is currently enabled
and whether any captures are present, and SHALL report it as a fact rather than
a fault.

Not capturing SHALL NOT be a failure. Capture records raw payloads carrying
prompt text and absolute paths, so declining it is a legitimate configuration
and a check that failed on it would be disabled rather than heeded.

Capture state SHALL be determined from the harness settings files, not from
`doctor`'s own process environment. The variable governs the hook subprocess;
`doctor` runs in the operator's shell, so its own environment answers a
different question from the one being asked.

The settings files SHALL be read in precedence order — project-local, then
project-shared, then user — and the first that sets the variable SHALL decide
the reported state. The report SHALL name which file supplied the value, so a
reader who disagrees with the answer knows which file to edit.

The variable SHALL be treated as enabling capture only when its value is exactly
`1`. Any other value, including `0`, is reported as not capturing.

Where no settings file sets the variable, the report SHALL state which files
were read and SHALL state that capture may still be enabled by the environment
of the process that launched the harness, which is not visible from `doctor`. It
SHALL NOT report that capture is off, because that is a claim about sources it
did not read.

The state SHALL be reported as unknown only for a settings file that exists and
does not parse. An absent settings file is not an unreadable one, and the two
SHALL be distinguished: absence is an observation, and a file that exists but
cannot be parsed is a failure to determine.

The report SHALL name the environment variable that controls capture, so that a
reader can act on what was reported without consulting documentation.

The report SHALL distinguish the live capture directory from the committed probe
corpus, naming which of the two it is describing, because a reader who conflates
them will read a green corpus check as evidence that capture is on.

#### Scenario: no settings file mentions capture

- **WHEN** `doctor` runs and no settings file in the precedence chain sets the
  capture variable
- **THEN** the report names the files it read, names the variable, states that
  the launching environment is not visible from here, and does not fail

#### Scenario: capture is on with recordings present

- **WHEN** a settings file sets the capture variable to `1` and the live probe
  directory holds payloads
- **THEN** the report states that capture is on, names the file that enabled it
  and how many event types are held, as a fact

#### Scenario: capture is explicitly disabled

- **WHEN** the highest-precedence settings file that mentions the variable sets
  it to a value other than `1`
- **THEN** the report states that capture is off, names the file that disabled
  it, and does not fail

#### Scenario: a lower-precedence file is overridden

- **WHEN** the user settings file sets the capture variable to `1` and the
  project-local settings file sets it to `0`
- **THEN** the report reflects the project-local value and names that file, not
  the user file

#### Scenario: capture is off but stale recordings remain

- **WHEN** no settings file enables capture and the live probe directory
  nonetheless holds payloads from an earlier session
- **THEN** the report states that the held payloads are not being refreshed, as
  a fact

#### Scenario: a settings file does not parse

- **WHEN** a settings file in the chain exists and is not valid JSON
- **THEN** the capture-state report is unknown rather than assumed off, and
  names the file it could not parse

#### Scenario: a settings file is absent

- **WHEN** a settings file in the chain does not exist
- **THEN** it is skipped as an observation and does not make the report unknown,
  because absence is not the same as unreadability

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
