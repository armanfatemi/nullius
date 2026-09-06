## ADDED Requirements

### Requirement: Interactive onboarding proposes Oracle candidates

`init --interactive` SHALL run a deterministic Oracle-glob detector and present its candidates for accept, edit, or skip before writing anything to the `oracles` key of `nullius.config.json`. It SHALL NOT write a candidate the operator did not explicitly accept or edit-and-accept.

Where the detector finds no candidates, `init --interactive` SHALL offer an explicit "skip for now" choice rather than silently leaving Oracle unconfigured without saying so. A value written this way SHALL be treated as ordinary user config from that point on, never re-rendered or overwritten by a later `doctor --fix`.

#### Scenario: a detected candidate is accepted

- **WHEN** `init --interactive` runs in a repo with a `vitest.config.ts` and the operator accepts the proposed glob
- **THEN** `nullius.config.json` gains an `oracles` entry matching that glob, and `init` states that it was operator-confirmed

#### Scenario: no candidates found is stated, not silent

- **WHEN** `init --interactive` runs in a repo with no detectable test configuration
- **THEN** `init` offers to skip Oracle configuration and, if the operator does, writes no `oracles` key and states that Oracle remains unconfigured

#### Scenario: a re-run offers the existing value, not a fresh guess

- **WHEN** `init --interactive` runs again in a repo that already has an `oracles` key
- **THEN** `init` presents the existing value as the default and asks before changing it, rather than treating it as regenerable kit-owned content

### Requirement: Interactive onboarding offers a GitHub Action opt-in

`init --interactive` SHALL offer to add the existing `.github/workflows/claims.yml` artifact to the plan when the chosen profile does not already include it, and SHALL only add it on explicit acceptance. This reuses the profile system's existing workflow renderer rather than scaffolding a second, overlapping CI file.

Where the chosen profile already includes that artifact, `init --interactive` SHALL NOT prompt for this opt-in, since accepting it would ask the operator to confirm something already true.

#### Scenario: accepted opt-in adds the workflow to a profile that lacked it

- **WHEN** the operator accepts the GitHub Action opt-in during `init --interactive` under the `plans` profile
- **THEN** the plan gains `.github/workflows/claims.yml`, rendered the same way the `prs` and `specs` profiles already render it, and `init` prints the path it wrote

#### Scenario: a profile that already includes the workflow is not re-prompted

- **WHEN** `init --interactive` runs under the `prs` or `specs` profile
- **THEN** `init` does not offer the opt-in, since `.github/workflows/claims.yml` is already part of that profile's plan

### Requirement: Onboarding skill cannot write hook entries

The `nullius:setup` Claude Code skill SHALL declare an `allowed-tools` restriction limiting it to running the nullius kit CLI, so it SHALL NOT have the capability to invoke a file-write tool against `.claude/settings.json` or any other file.

The skill SHALL drive `init`'s interactive flow through explicit flags rather than relying on terminal prompt output, since a skill invoking the CLI through a tool call has no input TTY.

#### Scenario: the skill's manifest restricts its tools

- **WHEN** the `nullius:setup` skill's frontmatter is inspected
- **THEN** its `allowed-tools` list contains only the nullius kit CLI invocation and no file-write tool

#### Scenario: the skill completes onboarding without a TTY

- **WHEN** the `nullius:setup` skill runs `init` through a tool call
- **THEN** it supplies Oracle and GitHub Action answers via flags rather than waiting on interactive terminal prompts, and `init` completes without hanging

### Requirement: Doctor detects duplicated hook delivery

`doctor` SHALL report a hard failure when a managed-convention hook entry in `.claude/settings.json` duplicates, for the same event, a command the plugin itself would install — regardless of what wrote the duplicate. This check SHALL NOT fail on a hook entry that does not match the managed-command convention, since `doctor` does not adjudicate hooks it did not deliver.

#### Scenario: a duplicated plugin hook fails

- **WHEN** `.claude/settings.json` carries a managed-convention hook entry for an event the plugin also delivers, with a command distinct from the plugin's own
- **THEN** `doctor` reports that event as a hard failure naming both commands, and exits non-zero

#### Scenario: an unrelated hook is left alone

- **WHEN** `.claude/settings.json` carries a hook entry that does not match the managed-command convention
- **THEN** `doctor`'s duplicate-hook check does not report on it

## MODIFIED Requirements

### Requirement: Non-interactive init

The kit SHALL provide `init [--profile <name>] [--dry-run] [--yes] [--interactive]` that, absent `--interactive`, completes without prompting, applies the named profile (default detected from repo shape), and prints every file it wrote or would write. `--dry-run` SHALL write nothing and print the full plan.

`--interactive` SHALL be the only trigger for prompting; ambient TTY state SHALL NOT by itself change what a flagless invocation does. When `--interactive` is passed but no input TTY is available, `init` SHALL fall back to the same defaults and output as a flagless run, and SHALL state in its output that it did so.

#### Scenario: agent-driven setup

- **WHEN** `init --profile specs --yes` runs in a repo with an `openspec/` directory
- **THEN** it exits 0 having written config pointing docs globs at `openspec/**` with require-markers, and printed each written path

#### Scenario: dry run is inert

- **WHEN** `init --dry-run` runs in any repo
- **THEN** the working tree is unchanged and the plan is printed

#### Scenario: interactive flag with no TTY falls back

- **WHEN** `init --interactive` runs with no input TTY available
- **THEN** `init` applies the same defaults a flagless run would, and states in its output that it fell back because no TTY was available
