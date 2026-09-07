# Design — add-pr-template-pointer

## Context

`init` renders artifacts from declarative `ArtifactPlan` entries, and
`buildPlan` dispatches one branch per known artifact path — an artifact with no
branch plans as `skip` with a "this is a bug in the kit" reason, so a new
artifact needs both a `profiles.ts` entry and a `render.ts` branch.

Two mechanisms already exist for putting bytes on disk, and they differ in who
owns the result. `planFile` writes kit-owned files and overwrites an existing
one wholesale:

**Evidence:** `packages/kit/src/render.ts:71@78c13a0` — `  return { path, disposition: "update", contents, reason };`

`planPointer` contributes a single sentence to a file the user owns, appends
rather than replaces, and refuses to create the host if it is absent:

**Evidence:** `packages/kit/src/render.ts:266@78c13a0` — `    if (!existsSync(absolute)) continue;`

The reason it is a sentence rather than a managed block is recorded in the
kit and applies unchanged to a PR template:

**Evidence:** `packages/kit/src/render.ts:244@78c13a0` — ` * Deliberately a sentence, not a marker-delimited block. A block collects four`

**Evidence:** `packages/kit/src/render.ts:250@78c13a0` — `export const POINTER_LINE =`

## Decisions

### 1. A pointer into the PR template, never a rendered template

**Chosen:** make `.github/PULL_REQUEST_TEMPLATE.md` a pointer host and keep
`planPointer`'s *discipline* — append one sentence if the file exists and the
sentence is absent, do nothing otherwise, never create the host.

The discipline is reused; the implementation is not. An earlier draft of this
decision said "reuse `planPointer` unchanged", which was false: the function
returns on the first host that exists, so a third array entry would be
unreachable in any repository that has `CLAUDE.md`. Decision 4 settles what
actually has to change.

**Alternatives considered:**

- **Render a full kit-owned PR template** (the original suggestion) — rejected
  because the installer spec forbids it for user-owned markdown:

  **Evidence:** `openspec/specs/installer/spec.md:56@78c13a0` — `Content `init` places in user-owned markdown SHALL be a pointer to a kit-owned`

  and because `planFile`'s existing-file disposition is `update`, i.e. wholesale
  overwrite (`render.ts:71`, anchored above) — which on a repository with an established
  PR template would silently destroy it.

- **A marker-delimited managed block** (`<!-- nullius:start -->` … ) — rejected
  for the four wounds already documented at `render.ts:244`, anchored above.

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

**Rationale:** the two are read by different audiences at different moments — an
agent configuring itself for a session, versus an agent composing one PR body.
`planPointer`'s idempotence test is a whitespace-collapsed substring match, so
two sentences means the check must be made against the sentence belonging to the
group being planned, rather than against one global constant. That much is a
small change to the loop. It travels with a real contract change, which Decision
4 records separately rather than smuggling in under this one.

(Decision 4 makes the unit a *group* rather than a host. This decision is about
which sentence is written, and the two hosts it names — `CLAUDE.md` and
`AGENTS.md` — are one group, so "per-group" is the accurate term throughout.)

### 3. Accept that repositories without a PR template get nothing

**Chosen:** print the not-found note and move on, exactly as the existing hosts
do. Do not escalate to creating the file.

**Rationale:** this is the honest cost of Decision 1, and naming it is better
than hiding it.

It is also the only reading the installer spec leaves open. Decision 1 cites the
rule that content in user-owned markdown must be a pointer; the separate
sentence that decides whether `init` may put a *file* under `.github/` is this
one, and it says kit-owned files live at the root:

**Evidence:** `openspec/specs/installer/spec.md:65@78c13a0` — `sit at the repository root beside the kernel's config.`

So `.github/PULL_REQUEST_TEMPLATE.md` can only ever be a pointer host for this
kit, never a kit-owned artifact — which is the same conclusion Decision 1
reaches from the other direction, and answers whether adding a `.github/` path
crosses a boundary this repository keeps deliberately. It does not: the path is
user-owned, and the kit only appends a sentence to it. `init` already distinguishes "did a thing" from "here is a
thing you must do yourself" via `manualSteps`, so the copyable snippet has a home that does
not involve writing to a file the kit does not own. Open question 2 resolved in
favour of printing it, since the existing note already carries one.

### 4. Hosts are grouped; every group is visited, one host within each

**Chosen:** replace the flat `POINTER_HOSTS` list with groups. `CLAUDE.md` and
`AGENTS.md` stay one group, resolved first-match-wins exactly as today. The PR
template is a second group. `planPointer` visits every group, takes at most one
host from each, and returns `PlannedFile[]`.

**Why the current shape cannot simply be extended.** The loop `continue`s only
when a host is absent; every other branch returns:

**Evidence:** `packages/kit/src/render.ts:266@78c13a0` — `    if (!existsSync(absolute)) continue;`

So the list is first-match-wins, and the not-found note says so in the user's own
language by joining hosts with `" or "`:

**Evidence:** `packages/kit/src/render.ts:398@78c13a0` — `            `No agent-instructions file found (${POINTER_HOSTS.join(" or ")}) — add this line to yours: ${POINTER_LINE}`,`

A third flat entry would therefore be reached only in a repository that has
*neither* `CLAUDE.md` nor `AGENTS.md`. This repository has `CLAUDE.md`, so the
change would no-op on the very repository it is meant to dogfood — shipping
green, with passing tests, doing nothing.

**Why groups rather than a flat visit-everything list.** An earlier draft of this
decision chose the flat list, and offered only one alternative — a separate
planning function for the PR template — which it rejected for duplicating the
exists/read/skip/idempotence ladder. That was a false dichotomy, and review
caught it.

Grouping is better than both, on this decision's own reasoning. The argument for
writing the PR template *as well as* `CLAUDE.md` is that they are read by
different audiences at different moments. That argument does not apply to
`CLAUDE.md` versus `AGENTS.md`: those are two spellings of one thing, an agent's
instruction file, and a repository holding both wants one pointer, not two.
Alternatives are a preference list; different audiences are a set. Groups are
that distinction made structural, instead of asserted in prose and then
implemented as a flat list that erases it.

It also costs nothing to reuse: the ladder runs once per group, so the
duplication that sank the separate-function option does not arise.

**What it removes.** The flat draft changed behaviour for an existing user with
both `CLAUDE.md` and `AGENTS.md`, who would begin receiving two pointers where
they had one, and this document had written that up as an acceptable correction.
Under grouping there is no behaviour change for any existing repository at all. A
disclosed risk that a better shape simply deletes was never a cost worth
accepting; it was an artefact of the wrong data structure.

**What changes with Decision 4:**

- `POINTER_HOSTS` becomes a list of groups, each with its own hosts and its own
  pointer sentence. Its docstring is rewritten to match; that edit is owned here
  and nowhere else.
- `planPointer`'s return type, and its single call site in `buildPlan`
- the not-found note becomes per-group. Within a group it keeps its current
  shape, `" or "` join included, because within a group first-match-wins is
  still exactly what is happening. A repository with `CLAUDE.md` but no PR
  template now gets a second note about the group it is missing.
- the idempotence check, per Decision 2, matched against the group's own sentence

### 5. The PR-template group holds both `.github/` spellings, and only those

**Chosen:** the second group holds `.github/PULL_REQUEST_TEMPLATE.md` and
`.github/pull_request_template.md`, in that order. Repositories using a
root-level or `docs/` template are an accepted limitation, stated below.

**Why the group needs more than one member.** Decision 4 justifies grouping on
the ground that a group holds several spellings of one thing, resolved
first-match-wins. An earlier draft then gave the new group exactly one member,
which is the same mistake in miniature: a repository whose template is
`.github/pull_request_template.md` would be told to add a pointer to a file it
already has under a different name. On a case-sensitive filesystem — which CI
runs on — those are different files.

**Why only two, when GitHub honours more.** An earlier draft of this decision
listed six paths and claimed they were ordered by "GitHub's own precedence
order". Review could not confirm that ordering exists: GitHub documents three
*locations* (repository root, `docs/`, `.github/`) and that casing may vary, but
does not publish a total order across all six combinations. The draft had
therefore baked an uncitable claim into a spec `SHALL` and attributed the choice
to a third party, which makes a guess look settled.

Two same-directory case variants have no such problem. There is no cross-location
precedence question to get wrong, and the order between them is a choice this kit
makes and says so — uppercase first, because it is the spelling GitHub's own
documentation and templates use most often. Nothing is attributed to anyone else.

**The accepted limitation.** A repository whose only template is at the
repository root or under `docs/` is treated as having no template: it receives
the not-found note naming the `.github/` paths, and no pointer is placed. That is
a real false negative and it is written down rather than designed around. The
remedy available to such a repository is to add the pointer by hand, which the
note already gives it verbatim.

**Also excluded: the directory form** `.github/PULL_REQUEST_TEMPLATE/`, used by
repositories offering several named templates. An earlier draft claimed the
exclusion was self-handling because `existsSync` would succeed and `readFileSync`
would throw `EISDIR` onto the skip branch. That was wrong, and the correction
matters more than the conclusion: an excluded path is never probed at all, and
`existsSync(".github/PULL_REQUEST_TEMPLATE.md")` is false when only the directory
`.github/PULL_REQUEST_TEMPLATE/` exists, because they are different paths. Such a
repository therefore receives the not-found note — the same accepted limitation
as the root and `docs/` cases, reached by the same route, and not a mechanism
that quietly handles itself. Choosing which of several named templates to
annotate remains a decision the kit has no standing to make.

**An unreadable first spelling shadows the second, and that is intended.** The
group loop returns on the first host that *exists*, and an unreadable file
exists. So a `.github/PULL_REQUEST_TEMPLATE.md` that cannot be read yields the
skip and its reason, and `.github/pull_request_template.md` is never probed. The
alternatives within a group are spellings of one document; falling through would
annotate a second copy of something the reader may only ever see one of, which is
worse than reporting the file that needs fixing. This was invisible before
grouping because the only group had members that rarely coexist; it is the first
group whose two members plausibly both exist, so it is written down here.

**Evidence:** `packages/kit/src/render.ts:253@78c13a0` — `/** Where a pointer would go, in preference order. Never created if absent. */`

That docstring describes a flat preference list and becomes wrong at group level,
where preference operates within a group and not across groups. Rewriting it is
listed once, under Decision 4's consequences, and is not re-claimed here.

## Compatibility risks

`planPointer` is module-internal (`function planPointer`, not exported), and its
only caller is `buildPlan`, so the return-type change in Decision 4 is contained
within `render.ts`. No schema, no exported union member, no config key and no
wire format changes. The one new exported constant is additive, and a repository
that never runs `init` again is unaffected.

**No existing repository's agent-instructions pointer placement changes.** That
is the narrow claim, and it is the one grouping buys: a repo with both
`CLAUDE.md` and `AGENTS.md` still gets exactly one pointer, in `CLAUDE.md`,
because first-match-wins still holds inside that group. The flat draft would have
broken this and called the breakage a correction.

**Every repository does see something new**, and an earlier version of this
section wrongly claimed otherwise. Enumerated, because "what changes for whom" is
what an implementer reads this section to decide:

| repository | before | after |
| --- | --- | --- |
| has an agent-instructions file, has a PR template | one pointer | one pointer, plus a pointer appended to the template |
| has an agent-instructions file, no PR template | one pointer, no note | one pointer, plus one note naming the missing template |
| no agent-instructions file, has a PR template | one note | one note, plus a pointer appended to the template |
| no agent-instructions file, no PR template | one note | **two** notes |
| template only at repo root, `docs/`, or as `.github/PULL_REQUEST_TEMPLATE/` | as its first column above | **plus** a note naming the `.github/` paths, though it has a template |

The last row is Decision 5's accepted limitation showing up in the table, and it
is the row an earlier draft of this section did not have — the table was written
before Decision 5 existed and was not re-derived when it landed. A repository with
a template GitHub honours but this kit does not look for is told to add one. Row
four was also missing from the prose that preceded the table. Nothing in any row is a
regression: the added notes each end in a copyable sentence, `init` cannot act on
the user's behalf for a file it does not own, and the appended pointer is the
feature. But a repository that ran `init` yesterday and runs it today will see
output it has not seen before, and that is worth saying plainly rather than
filing under "no behaviour change".

## Open questions

Mirrored from `proposal.md`:

1. Whether a pointer sentence in a PR template is actually read as an
   instruction by a coding agent, or deleted as boilerplate. Open; it is the
   reason the scope stops at a pointer.
2. ~~Whether the not-found note should print a copyable snippet.~~ Resolved in
   Stage 3: it already does, for the existing hosts, so the PR-template host
   mirrors that shape.
