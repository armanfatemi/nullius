# Add init and doctor — the kit's front door

## Why

Adoption today is a scavenger hunt across README personas: plugin install,
Action YAML, config file, skill paste. The tool needs a one-command setup — and
because this tool's primary installer is an **agent** ("set up nullius" typed
into Claude Code), the non-interactive path is the primary path: agents, CI,
and copy-pasteable docs cannot drive an interactive picker.

The second half is liveness. Every delivery mechanism here fails open by
design (a hook that cannot run must never break plan mode), which means every
failure is silent: a moved binary, a wrong plan dir, a workflow without
`fetch-depth: 0` quietly turning every rev-anchor advisory. Fail-open is the
right hook policy; `doctor` is the only place the user ever learns the ratchet
stopped ratcheting.

## What Changes

- **`init`** (kit): non-interactive first — `init [--profile plans|prs|specs]
  [--dry-run] [--yes]`; detects harness and repo shape, applies the profile,
  prints exactly what it wrote. Profiles are the README personas. The `specs`
  profile doubles as the OpenSpec preset: docs globs pointed at
  `openspec/**` with `--require-markers` (subsumes issue #10's preset half).
  `--interactive` may come later as sugar.
- **One delivery mechanism per artifact.** On Claude Code, `init` defers to
  the existing plugin for hooks, skills, and commands (it prints or invokes
  the two `/plugin` lines) and writes only what the plugin cannot carry:
  `nullius.config.json`, the workflow file, and a pointer block in
  CLAUDE.md/AGENTS.md. No duplicate hook paths for `doctor` to disambiguate.
- **Managed-artifact identity.** Markdown blocks are **pointers** to files the
  kit fully owns under `.nullius/`, never rendered content — a pointer never
  needs a three-way merge. Settings hooks are identified by a command-path
  convention (the invoked command resolves to the kit), because the hooks
  schema has no name field to attach identity to; our own shipped hook is the
  model of an anonymous entry:

  **Evidence:** `plugin/hooks/hooks.json:5@3f40733` — `"matcher": "ExitPlanMode",`

- **Config stays unbroken.** Kernel config is strict by design — unknown keys
  throw, so kit-owned settings cannot ride in `nullius.config.json` without
  breaking older pinned CLIs (CI vs. local skew):

  **Evidence:** `packages/claims/src/config.ts:4@3f40733` — `* Validation is strict (unknown keys are rejected) because a typo'd key —`

  Kit settings therefore live in their own file (`.nullius/kit.json`), and the
  kernel reserves a `configVersion` key for future schema motion.
- **`doctor`** (kit): local-only in v1 — hooks present and resolvable, shims
  executable, config parseable, journal dir writable, workflow file present in
  the working tree, harness payload probe (from add-witness-recording). What
  is not locally checkable is reported as "not checkable from here", never
  guessed. Ends with a live proof: a known-good fixture pushed through the
  installed pipeline, verdict shown. `doctor --fix` re-renders managed
  artifacts from the installed kit version (there is no separate `update`
  verb — diagnose-then-repair is one mental model).
- **Action `v1` tag** (repo): `init` generates workflows pinned to `@v1`; the
  README currently advertises the mutable ref —

  **Evidence:** `README.md:175@3f40733` — `- uses: armanfatemi/nullius/action@main`

## Impact

- Affected specs: `installer` (new).
- Affected code: new kit package (init, doctor, managed-artifact rendering),
  README quickstarts, Action tagging; kernel gains only the reserved
  `configVersion` key. Prerequisite kernel chore: the flat single-parser CLI
  will not survive subcommand trees and is restructured per-command first —

  **Evidence:** `packages/claims/src/cli.ts:158@3f40733` — `function parseArgs(argv: string[]): ParsedArgs {`
- Subsumes issue #1 (init) and the preset half of #10 (OpenSpec).
- Risks: managed-block edge cases (user edits inside markers, deleted
  markers) — mitigated by pointers-not-content; `doctor` scope creep into
  network checks — barred in v1 by the local-only rule.
