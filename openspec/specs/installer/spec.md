# installer Specification

## Purpose

How a repository adopts nullius, and how it learns the adoption stopped
working.

Two commands. `init` applies one of the README's personas as a profile,
non-interactively, printing every file it writes — the primary operator is an
agent driving a terminal, then CI, then a human pasting from a README, and none
of the three can drive a wizard.

`doctor` exists because every delivery mechanism here fails open by design: a
hook that cannot run must never break a session, and a workflow missing
`fetch-depth: 0` quietly turns every rev-stamped anchor advisory. That posture
is right, and its cost is that every failure is silent. This is the only place
a user learns the ratchet stopped ratcheting.

Both are bound by the same rule the rest of this project runs on: state what
is checkable, label what is not, and never infer the difference.
## Requirements
### Requirement: Non-interactive init

The kit SHALL provide `init [--profile <name>] [--dry-run] [--yes]` that
completes without prompting, applies the named profile (default detected from
repo shape), and prints every file it wrote or would write. `--dry-run` SHALL
write nothing and print the full plan.

#### Scenario: agent-driven setup

- **WHEN** `init --profile specs --yes` runs in a repo with an `openspec/`
  directory
- **THEN** it exits 0 having written config pointing docs globs at
  `openspec/**` with require-markers, and printed each written path

#### Scenario: dry run is inert

- **WHEN** `init --dry-run` runs in any repo
- **THEN** the working tree is unchanged and the plan is printed

### Requirement: One delivery mechanism per artifact

On Claude Code, `init` SHALL NOT write hook, skill, or command content that
the plugin delivers; it SHALL surface the plugin install steps instead and
write only artifacts the plugin cannot carry (config, workflow, pointer
blocks).

#### Scenario: no duplicate hooks

- **WHEN** `init` runs in a repo where the nullius plugin is installed
- **THEN** `.claude/settings.json` gains no hook entry duplicating a
  plugin-delivered hook

### Requirement: Managed artifacts are pointers with owned identity

Content `init` places in user-owned markdown SHALL be a pointer to a kit-owned
file, not rendered content. Hook entries `init` manages SHALL be identified by
a command-path convention (the invoked command resolves to the kit), and
`doctor --fix` SHALL only modify entries matching that convention.

Kit-owned files SHALL NOT live under `.nullius/`. That directory's existence is
the witness recording opt-in, so putting kit artifacts there makes `init`
create it as a side effect and silently enables run recording — a consent
boundary set by a command that configures a document checker. Kit-owned files
sit at the repository root beside the kernel's config.

#### Scenario: user file survives re-render

- **WHEN** the kit re-renders its managed artifacts after an upgrade
- **THEN** every user-owned file is byte-identical, and only kit-owned files
  change

#### Scenario: init does not set the recording opt-in

- **WHEN** `init` runs under any profile in a repository with no `.nullius/`
- **THEN** no `.nullius/` directory is created, and an existing one is neither
  created nor removed

### Requirement: Kit settings live outside kernel config

Kit-owned settings SHALL be stored in a kit-owned file, never as new keys in
`nullius.config.json`. The kernel SHALL reserve a `configVersion` key: current
versions accept and ignore it; a future schema bump uses it to fail with one
clear message.

#### Scenario: older kernel in CI

- **WHEN** CI runs an older pinned kernel against a repo initialized by a
  newer kit
- **THEN** `check` parses `nullius.config.json` without error

### Requirement: Doctor diagnoses locally and proves liveness

`doctor` SHALL verify, from local state only: managed hooks present and their
commands resolvable, shims executable, config files parseable, journal
directory writable, workflow file present, and the harness payload shape
probe. Facts not locally checkable SHALL be reported as not checkable, never
inferred. `doctor` SHALL end by running a known-good fixture through the
installed pipeline and printing the verdict. `doctor --fix` SHALL re-render
managed artifacts from the installed kit version.

#### Scenario: dead hook is loud

- **WHEN** a managed hook's command no longer resolves
- **THEN** `doctor` reports that hook as failing with the command it tried,
  and exits non-zero

#### Scenario: absence of evidence is labeled

- **WHEN** the journal directory exists but contains no journals
- **THEN** `doctor` reports "no journals recorded" as a fact, without claiming
  the hook pack is broken

### Requirement: Doctor reports what the settings files say about payload capture

`doctor` SHALL report what each harness settings file says about live
payload capture, and whether any captures are present, as a fact rather than a
fault. It reports what it read, not a conclusion about whether capture is
running — sources it cannot read can enable capture, so the running state is not
a claim this check is entitled to make.

Not capturing SHALL NOT be a failure. Capture records raw payloads carrying
prompt text and absolute paths, so declining it is a legitimate configuration
and a check that failed on it would be disabled rather than heeded.

Capture state SHALL be determined from the harness settings files, not from
`doctor`'s own process environment. The variable governs the hook subprocess;
`doctor` runs in the operator's shell, so its own environment answers a
different question from the one being asked.

The check SHALL read every settings file it knows of — project-local,
project-shared, and user — and SHALL report each file that sets the variable
together with the value that file carries. It SHALL NOT assert which file wins.
Settings precedence is behaviour of the harness, and this repository contains
nothing that establishes it; a checker that named a deciding file would be
asserting external behaviour it cannot ground. Reporting every setter and its
value gives the reader what they need to act, and leaves the resolution to the
component that actually performs it.

A file SHALL be reported as enabling capture only when the value it carries is
exactly `1`. Any other value, including `0`, is reported as that file disabling
capture. Both readings SHALL be scoped to the file they came from: "this file
enables capture" is checkable, "capture is on" is not, for the same reason
"capture is off" is not.

Where no settings file sets the variable, the report SHALL state which files
were read and SHALL state that capture may still be enabled by sources this
check does not read, including — but not limited to — the environment of the
process that launched the harness. It SHALL NOT report that capture is off,
because that is a claim about sources it did not read, and SHALL NOT present its
list of unread sources as complete.

The state SHALL be reported as unknown only for a settings file that exists and
does not parse. An absent settings file is not an unreadable one, and the two
SHALL be distinguished: absence is an observation, and a file that exists but
cannot be parsed is a failure to determine.

The report SHALL name the environment variable that controls capture, so that a
reader can act on what was reported without consulting documentation.

Where payloads are held, the report SHALL state how many are held and when the
most recent was written, as an ISO-8601 UTC timestamp. The format is fixed
because a locale- or timezone-dependent rendering cannot be asserted
deterministically, which would make the requirement untestable on a machine
other than the author's.

The check SHALL read a user settings file whose location is not fixed to the
invoking user's home directory. Stated observably because it is a capability
requirement, not an implementation note: a check hard-wired to the real home
directory cannot be exercised against a fixture, and a requirement whose test
would have to mutate the developer's own configuration is not testable. The
seam this implies is named in `tasks.md` 1.0a.

The report SHALL distinguish the live capture directory from the committed probe
corpus, naming which of the two it is describing, because a reader who conflates
them will read a green corpus check as evidence that capture is on.

#### Scenario: no settings file mentions capture

- **WHEN** `doctor` runs and no settings file in the precedence chain sets the
  capture variable
- **THEN** the report names the files it read, names the variable, states that
  capture may still be enabled by sources this check does not read — including
  the launching environment — and does not fail

#### Scenario: one file enables capture and recordings are present

- **WHEN** exactly one settings file sets the capture variable, to `1`, and the
  live probe directory holds payloads
- **THEN** the report names that file as enabling capture, and states how many
  payloads are held and when the most recent was written, as a fact. It does not
  assert that capture is on globally, for the same reason it may not assert that
  capture is off

#### Scenario: one file explicitly disables capture

- **WHEN** exactly one settings file sets the variable, to a value other than
  `1`
- **THEN** the report states that that file disables capture, names it, and does
  not fail

#### Scenario: two settings files disagree

- **WHEN** the user settings file sets the capture variable to `1` and the
  project-local settings file sets it to `0`
- **THEN** the report names both files and the value each carries, and does not
  declare which one takes effect

#### Scenario: payloads are held while no settings file enables capture

- **WHEN** no settings file sets the capture variable and the live probe
  directory nonetheless holds payloads
- **THEN** the report states how many payloads are held and when the most recent
  was written, as a fact, and SHALL NOT state that they are stale or that they
  are not being refreshed — capture may be enabled by a source this check does
  not read

#### Scenario: a settings file does not parse

- **WHEN** a settings file in the chain exists and is not valid JSON, and no
  other file sets the capture variable
- **THEN** the capture-state report is unknown rather than assumed off, and
  names the file it could not parse

#### Scenario: one file does not parse while another sets the variable

- **WHEN** one settings file is not valid JSON and another sets the capture
  variable to `1`
- **THEN** the report states what the readable file says, as a fact, and also
  names the file it could not parse. A determinate read is not discarded because
  a different file was unreadable

#### Scenario: the report distinguishes the live directory from the corpus

- **WHEN** `doctor` runs in a repository holding both a committed probe corpus
  and a live capture directory
- **THEN** the capture-state report names the live capture directory, and does
  so in terms that cannot be read as describing the committed corpus, which a
  different check reports on separately

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

