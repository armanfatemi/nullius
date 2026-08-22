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
