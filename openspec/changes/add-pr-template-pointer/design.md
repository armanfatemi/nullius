# Design — add-pr-template-pointer

## Context

`init` renders artifacts from declarative `ArtifactPlan` entries, and
`buildPlan` dispatches one branch per known artifact path — an artifact with no
branch plans as `skip` with a "this is a bug in the kit" reason, so a new
artifact needs both a `profiles.ts` entry and a `render.ts` branch.

Two mechanisms already exist for putting bytes on disk, and they differ in who
owns the result. `planFile` writes kit-owned files and overwrites an existing
one wholesale:

**Evidence:** `packages/kit/src/render.ts:69@5f88e21` — `  return { path, disposition: "update", contents, reason };`

`planPointer` contributes a single sentence to a file the user owns, appends
rather than replaces, and refuses to create the host if it is absent:

**Evidence:** `packages/kit/src/render.ts:236@5f88e21` — `    if (!existsSync(absolute)) continue;`

The reason it is a sentence rather than a managed block is recorded in the
kit and applies unchanged to a PR template:

**Evidence:** `packages/kit/src/render.ts:214@5f88e21` — ` * Deliberately a sentence, not a marker-delimited block. A block collects four`

**Evidence:** `packages/kit/src/render.ts:220@5f88e21` — `export const POINTER_LINE =`

## Decisions

### 1. A pointer into the PR template, never a rendered template

**Chosen:** add `.github/PULL_REQUEST_TEMPLATE.md` to `POINTER_HOSTS` and reuse
`planPointer` unchanged. `init` appends one sentence if the file exists and the
sentence is absent; it does nothing otherwise.

**Alternatives considered:**

- **Render a full kit-owned PR template** (the original suggestion) — rejected
  because the installer spec forbids it for user-owned markdown:

  **Evidence:** `openspec/specs/installer/spec.md:58@5f88e21` — `Content `init` places in user-owned markdown SHALL be a pointer to a kit-owned`

  and because `planFile`'s existing-file disposition is `update`, i.e. wholesale
  overwrite (`render.ts:69`, above) — which on a repository with an established
  PR template would silently destroy it.

- **A marker-delimited managed block** (`<!-- nullius:start -->` … ) — rejected
  for the four wounds already documented at `render.ts:214`, above.

- **Create the template when absent** — rejected by analogy with the host rule
  `planPointer` already enforces: a tool that invents a contributor-facing
  document in a repository that chose not to have one is making a maintainer's
  decision for them, and the file outlives uninstallation.

**Rationale:** the constraint here is not a preference. The installer spec
states the rule, and the code already implements it for two other hosts; this
change adds a third host to an existing mechanism rather than introducing a
second mechanism beside it.

### 2. A distinct pointer sentence for the PR-template host

**Chosen:** a second exported constant, addressed to the PR description, while
`POINTER_LINE` keeps its current text for `CLAUDE.md` / `AGENTS.md`.

**Alternatives considered:**

- **Reuse `POINTER_LINE` verbatim** — rejected because its subject is
  load-bearing claims about existing code in general, which in a PR template
  reads as advice about the diff rather than about the description being
  written.

**Rationale:** the two hosts are read by different audiences at different
moments — an agent configuring itself for a session, versus an agent composing
one PR body. `planPointer`'s idempotence test is a whitespace-collapsed
substring match, so two constants means the check must be per-host rather than
global; that is a small change to `planPointer`'s loop, not to its contract.

### 3. Accept that repositories without a PR template get nothing

**Chosen:** print the not-found note and move on, exactly as the existing hosts
do. Do not escalate to creating the file.

**Rationale:** this is the honest cost of Decision 1, and naming it is better
than hiding it. `init` already distinguishes "did a thing" from "here is a
thing you must do yourself" via `manualSteps`, so the copyable snippet — if
Open question 2 resolves that way — has a home that does not involve writing to
a file the kit does not own.

## Compatibility risks

None. This change adds no schema, no exported union member, no config key, and
no wire format. The one new exported constant is additive, and a repository
that never runs `init` again is unaffected.

## Open questions

Mirrored from `proposal.md`:

1. Whether a pointer sentence in a PR template is actually read as an
   instruction by a coding agent, or deleted as boilerplate.
2. Whether the not-found note should print a copyable snippet.
