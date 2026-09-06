## Context

`init` is fully non-interactive today. `--yes`/`-y` is accepted and inert:

**Evidence:** `packages/kit/src/cli.ts:292@b5639a9` — `} else if (arg === "--yes" || arg === "-y") {`
**Evidence:** `packages/kit/src/cli.ts:293@b5639a9` — `// Accepted and inert: init never prompts, so there is nothing to confirm.`

It never writes Claude Code hooks, by a hard rule:

**Evidence:** `packages/kit/src/detect.ts:119@b5639a9` — `export function mayWriteHooks(harness: HarnessShape): { allowed: boolean; reason: string } {`
**Evidence:** `packages/kit/src/detect.ts:132@b5639a9` — `reason: "the plugin delivers the hooks; a second copy is a path doctor cannot disambiguate",`

Instead it prints the two `/plugin` slash-command lines every profile ends
with:

**Evidence:** `packages/kit/src/profiles.ts:93@b5639a9` — `const PLUGIN_STEPS = [`
**Evidence:** `packages/kit/src/profiles.ts:103@b5639a9` — `const CLAUDE_CODE_STEPS = [...PLUGIN_STEPS];`

`doctor` reads back managed hook entries — identified only by a command-string
convention, since JSON hook entries carry no id:

**Evidence:** `packages/kit/src/doctor.ts:61@b5639a9` — `export function isManagedHookCommand(command: string): boolean {`

— and today, a hook entry that matches that convention and resolves is
reported as passing, with no check for whether it *duplicates* a
plugin-delivered command for the same event:

**Evidence:** `packages/kit/src/doctor.ts:1034@b5639a9` — `      const result = resolveHookCommand(root, entry.command);`

The kernel's Oracle config is declared, never inferred, and lives under an
`oracles` key in `nullius.config.json` that the kernel — not the kit — owns
and schemas:

**Evidence:** `packages/claims/src/config.ts:60@b5639a9` — `  oracles?: OracleGlob[];`

The kit's own render pipeline tracks which top-level config keys it owns for
safe re-rendering, and today that set is just `docs`:

**Evidence:** `packages/kit/src/render.ts:76@b5639a9` — `const KIT_OWNED_CONFIG_KEYS = new Set(["docs"]);`

Two things follow from this survey that shape every decision below: prompting
has to be opt-in by flag, not by reading the environment, because the
existing installer spec already requires `init` to "complete without
prompting" by default and a reader of a copy-pasted command line cannot see
ambient TTY state; and anything written into `oracles` is a one-time,
user-confirmed value living in a kernel-owned key, never a kit-rendered
artifact subject to being overwritten on the next `doctor --fix`.

## Goals / Non-Goals

**Goals:**
- Let a human or an agent discover and configure Oracle globs, the GitHub
  Action, and the plugin steps without having read the README first.
- Keep `init`'s flagless behavior byte-identical to today, so every existing
  script, CI job, and test that invokes it without `--interactive` is
  unaffected.
- Make it structurally — not just procedurally — impossible for the new
  Claude Code skill to write hook entries itself.
- Give `doctor` a way to catch a duplicated hook regardless of what put it
  there, closing the gap where a resolvable duplicate currently reads as
  passing.

**Non-Goals:**
- Changing what the kernel requires of Oracle config, or any kernel
  (`packages/claims/src/**`) behavior. The detector only assists authoring a
  value a human still confirms; "declared, never inferred" is unchanged.
- Building a general-purpose plugin-installation mechanism, or making
  `/plugin marketplace add` / `/plugin install` invocable by an agent — both
  remain client-side-only steps a human runs.
- Supporting harnesses other than Claude Code in this change. The `--yes`/
  non-interactive path already works for any script driving any harness; the
  interactive path and the skill are Claude-Code-specific.

## Decisions

### `--interactive` is a flag, never TTY-ambient

Rejected: gating prompting on `process.stdout.isTTY`. A pasteable
`npx ... init` line would then behave differently depending on the reader's
terminal, which nobody reading the command can see — the same
one-artifact-two-behaviors shape `one-delivery-mechanism` already forbids at
the hook layer, recurring at the UX layer. Chosen: `--interactive` is the only
trigger. Within that flag's scope, a **stdin**-TTY check (matching the
existing convention elsewhere in the kit) is used only as a safety fallback —
if no TTY is actually available even though `--interactive` was passed,
`init` falls back to today's non-interactive defaults and prints what it
applied, rather than hanging. The flag declares intent; the TTY check only
prevents a hang once that intent is already declared.

### The Oracle detector is a pure function; nothing is auto-written

`detectOracle.ts` takes a filesystem read (already injected the way the
kernel's own `oracle.ts` keeps its core pure) and returns candidate
`OracleGlob[]` values. `init --interactive` presents them; the user must
accept, edit, or skip each one before anything reaches
`nullius.config.json`. This preserves the kernel's requirement that an
unconfigured project is a reported fact, not silently populated — a scan that
finds nothing surfaces as an explicit "skip for now" choice, structurally
identical to a human declining to configure Oracles today.

Edit is a re-editable comma-separated string, re-validated against the
kernel's config schema before it's accepted — `@clack/prompts` has no list
editor, so this is stated explicitly rather than implied as something richer.

### Written Oracle globs are user config, not a kit-rendered artifact

Once `oracles` is written with confirmation, it is treated exactly like a
hand-authored entry in `nullius.config.json` — not added to
`KIT_OWNED_CONFIG_KEYS`, and never silently re-rendered or overwritten by a
later `doctor --fix`. `KIT_OWNED_CONFIG_KEYS` governs artifacts the kit
manages across upgrades; `oracles` is a kernel-schema key whose value is a
one-time, human-confirmed declaration, the same as if the user had typed it
by hand. A re-run of `init --interactive` reads the existing value back as
the prefilled default and asks before changing it, rather than treating it as
kit-owned content to regenerate.

### The `nullius:setup` skill is capability-restricted, not just instructed

An earlier draft relied on the skill's own prompt text telling it never to
touch `.claude/settings.json`. That is not sufficient on its own: the actual
rule at risk is `one-delivery-mechanism`, and a model executing an onboarding
flow that dead-ends on a client-side-only `/plugin` step has a plausible
incentive to "finish the job" by writing the hook itself, and nothing in
`mayWriteHooks` constrains a model holding a `Write` tool — that guard only
constrains the kit's own code. The skill's frontmatter restricts
`allowed-tools` to running the nullius kit CLI via `Bash` only, so it lacks
the capability to invoke `Write`/`Edit` at all; the "never touch
settings.json" instruction becomes redundant rather than load-bearing. The
new `doctor` check (below) is the backstop for the case this restriction is
ever loosened or bypassed.

Because the skill drives `init` through the `Bash` tool, its stdout is never
a TTY. So the skill cannot rely on the interactive terminal prompts directly
— it drives the same flow through explicit flags (e.g. `--oracle
<glob>[,<glob>...]`, `--action`) that `init --interactive` also accepts as
pre-answers. The flag surface is the real interface both paths share; the
terminal prompt UI is a convenience layer on top of it for a human at a
keyboard.

### `doctor`'s duplicate-hook check is scoped to plugin-equivalent commands

Rejected: failing on any hook entry found in `.claude/settings.json`. Doctor
today deliberately limits `--fix` to entries matching the managed-command
convention specifically so it never touches "hooks somebody else installed"
— a blanket fail would contradict that same posture at the read side. Chosen:
the new check compares each managed-convention hook entry's event against
what the plugin's own `hooks.json` would install for that event, and fails
only when they collide on the same event with a command that isn't the
plugin's own. This is also why the fixture for this check has to use the
exact command shape a real duplication would take (copied from the plugin's
actual hook command, not a synthetic placeholder) — a fixture built from an
arbitrary string would not exercise the comparison this check is actually
making.

## Risks / Trade-offs

- [Risk] Capability-restricting the skill only prevents *that* skill from
  writing hooks; a differently-authored future skill or a human editing
  `.claude/settings.json` by hand could still create the duplicate this
  change is worried about. → Mitigation: the `doctor` check is
  source-agnostic — it fails on the duplicate regardless of what produced it,
  so the backstop holds even where the frontmatter restriction doesn't apply.
- [Risk] Flipping the duplicate-hook check from today's "resolvable = pass"
  to "duplicate = fail" changes behavior for any existing installation that
  happens to have a working, hand-rolled hook shaped like the plugin's own.
  → Mitigation: scope the failure narrowly (exact event + command-shape
  collision with the plugin's own hooks.json), and call this out explicitly
  in the migration note so it reads as a deliberate tightening, not a
  regression report.
- [Risk] The README quickstart's `npx @nullius-inverba/kit ...` lines,
  `init --interactive` included, are unpinned — matching the two lines
  already there, but meaning a copy into a fork or a blog post always
  resolves to whatever is current when it runs, not what was current when it
  was written. → Accepted, on the same terms the existing two lines already
  accept it: this repository's quickstart has never pinned that command, and
  introducing a pin only for the new line would make the block internally
  inconsistent for no corresponding gain — the risk this trades against
  (stale pins nobody updates) is exactly the one a stale pin ships anyway.
- [Risk] `--oracle`/`--action` flags meant primarily for the skill to drive
  `init` non-interactively are also usable directly by any script, expanding
  `init`'s flag surface beyond what a purely human-facing wizard would need.
  → Accepted: this is also what keeps the skill's actual writes
  code-verified rather than model-trusted — the flags are the boundary the
  "model proposes, code verifies" rule requires, not an accident to route
  around.

## Migration Plan

- Additive for the default path: no existing invocation of `init` changes
  behavior, since `--interactive` is opt-in.
- The `doctor` duplicate-hook check is the one behavior change to an existing
  command. It ships with a clear message naming which event collided and
  which command it compared against, so a repository that trips it has an
  actionable next step (usually: delete the hand-rolled entry, since the
  plugin already delivers it).
- No data migration: `oracles`, when written, is standard kernel-schema
  content: an older pinned kernel in CI already tolerates unknown-to-it
  values under keys it understands.

## Open Questions

- Whether the GitHub Action opt-in should also offer to run `doctor` as a
  post-scaffold CI step, or leave that to a separate, later change. Left for
  a later change: `doctor`'s local-only checks and a CI workflow's remote
  context are different enough postures that bundling them by default risks
  answering a question nobody asked yet.
