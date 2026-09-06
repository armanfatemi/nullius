## Why

`init` never prompts, and the kernel's Oracle config is deliberately
"declared, never inferred" — so an operator who wants Oracle coverage has to
already know the exact glob/weakening shape the kernel schema expects, with
no way to discover it from the tool itself. The GitHub Action that runs
nullius on a consumer repo's CI, and the two `/plugin` commands that deliver
hooks, are both invisible unless someone has already read the README.
Comparable tools (OpenSpec, BMAD-METHOD, SuperClaude, create-vite) close this
gap with an interactive onboarding flow that proposes defaults and asks for
confirmation rather than requiring prior documentation-reading. Doing the
same for nullius is worth doing carefully, because a naive interactive
rewrite risks reintroducing the exact "two paths to one artifact" failure
`one-delivery-mechanism` already exists to prevent — this time at the
hook-write layer instead of the settings-file layer, if an onboarding flow
driven by a model routes around a client-side-only step it cannot execute.

## What Changes

- `init` gains an explicit `--interactive` flag. Absent the flag, `init`'s
  behavior is byte-identical to today's — non-interactive, deterministic,
  CI-safe. The flag is the only trigger for prompting; ambient TTY state is
  never used to silently change what a copy-pasted command does. Even with
  `--interactive` set, a run with no TTY available falls back to today's
  defaults and prints what it applied, so it never hangs.
- A new deterministic Oracle-glob detector (`packages/kit/src/detectOracle.ts`)
  scans for common test-framework signals (`package.json` test script,
  `jest.config.*`, `vitest.config.*`, `pytest.ini`, common test globs) and
  produces candidate globs. `--interactive` presents them for accept, edit
  (re-editable text, re-validated against the kernel's config schema), or
  skip — nothing is written to `nullius.config.json`'s `oracles` key without
  that explicit confirmation. This does not change what the kernel requires
  of Oracle config (still declared, never inferred); it only assists the
  authoring of the declaration.
- `--interactive` adds a GitHub Action opt-in step that, on acceptance, adds
  the kit's existing `.github/workflows/claims.yml` artifact to the plan when
  the chosen profile does not already include it — `prs` and `specs` already
  declare `WORKFLOW` in their `artifacts` list, and only `plans` omits it:

  **Evidence:** `packages/kit/src/profiles.ts:113@b5639a9` — `artifacts: [CONFIG, KIT_CONFIG, AUTHORING_POINTER],`

  **Evidence:** `packages/kit/src/profiles.ts:120@b5639a9` — `name: "prs",`

  Three lines below that, `prs`'s own `artifacts` list already includes
  `WORKFLOW` (`specs`'s profile, a few lines further down, repeats the
  identical list).

  This reuses the existing workflow renderer rather than scaffolding a second,
  overlapping CI file — a fact discovered mid-implementation, after an
  earlier draft of this proposal assumed no such artifact existed and specced
  a brand-new `.github/workflows/nullius.yml` instead.
- `doctor` gains a check that reports a hard failure when a hook entry in
  `.claude/settings.json` duplicates a command the plugin would itself
  install for the same event — scoped specifically to plugin-equivalent
  commands, not any hook entry, so a user's unrelated pre-existing hooks are
  left alone. Today, a resolvable duplicate hook reads as passing; this
  closes that gap regardless of what wrote the duplicate.
- A new `nullius:setup` Claude Code skill (`plugin/skills/`) drives `init
  --interactive`'s flag surface conversationally. It is restricted via its
  own `allowed-tools` frontmatter to running the nullius kit CLI only, so it
  structurally cannot invoke a `Write`/`Edit` tool against
  `.claude/settings.json` — the constraint is enforced by capability, not
  only by instruction, with the new `doctor` check above as a backstop.
- `init --interactive` is documented in the README quickstart, unpinned,
  matching this repo's existing convention for that block (the quickstart's
  other two lines are already unpinned `npx @nullius-inverba/kit ...`
  invocations) — so discovery no longer requires already knowing the flag
  exists, without introducing a pinning inconsistency the rest of the
  quickstart doesn't have.

## Capabilities

### New Capabilities

(none — everything below extends the existing `installer` capability's
purpose: how a repository adopts nullius, and how it learns adoption stopped
working)

### Modified Capabilities

- `installer`: adds an interactive mode to `init` (`--interactive`, flag-gated
  and TTY-fallback-safe, never ambient), adds Oracle-candidate proposal and
  GitHub Action opt-in as part of that mode, and adds a `doctor` requirement
  that duplicated plugin-equivalent hook delivery is a hard failure rather
  than a pass.

## Impact

- `packages/kit/src/cli.ts` — new `--interactive` flag parsing, no change to
  default (flagless) behavior. Also adds a read-only `--suggest-oracle` query
  flag, so a caller with no TTY (the skill below) can see detected candidates
  without going through the interactive flow at all.
- `packages/kit/src/prompts.ts` (new) — `@clack/prompts`-based interactive
  layer, gated strictly on the flag plus a stdin-TTY safety check.
- `packages/kit/src/detectOracle.ts` (new) — the Oracle-glob detector.
- `packages/kit/src/doctor.ts` — new duplicate-hook-delivery check, reusing
  the existing `RECORDED_EVENTS`/`CHECKING_EVENTS` constants as the plugin's
  event coverage rather than a new hardcoded list.
- `packages/kit/src/render.ts` — `buildPlan`/`renderConfig` gain optional
  `oracles`/`includeWorkflow` parameters; `KIT_OWNED_CONFIG_KEYS` is
  unchanged (still just `docs`), which is what keeps a written `oracles`
  value from being treated as kit-rendered content.
- `packages/claims/src/index.ts` — one-line addition exporting the existing
  `OracleGlob` type from the barrel, so the kit can depend on the kernel's
  own type instead of restating its shape. The kernel's config schema and
  its "declared, never inferred" requirement are otherwise unchanged.
- `plugin/skills/setup/SKILL.md` (new) — a restrictive `allowed-tools`
  frontmatter scoped to `Bash(npx -y @nullius-inverba/kit:*)` and
  equivalents, with no `Write`/`Edit` in the list.
- No new `.github/workflows/nullius.yml`: the GitHub Action opt-in reuses
  the profile system's existing `.github/workflows/claims.yml` artifact
  (`packages/kit/src/profiles.ts`'s `WORKFLOW`), adding it to the plan for
  profiles that omit it rather than scaffolding a second, overlapping file —
  a correction made after discovering that artifact already existed.
- `README.md` — `init --interactive` documented alongside the existing
  quickstart lines, and the plugin delivers-table gains the `nullius:setup`
  skill.
