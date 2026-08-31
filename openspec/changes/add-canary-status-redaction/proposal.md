# Proposal — add-canary-status-redaction

> **Depends on:** None

## Problem

The canary probe measures whether a reviewer actually reads a document by
planting a false claim and checking whether the review references it. The
measurement is only meaningful if "references it" means "found by reading" —
but `canary status` prints the plant's exact location to anyone who runs it:

**Evidence:** `packages/claims/src/cli.ts:1032@2792fa1` — ``      `active canary: ${entry.doc}:${entry.line} (planted ${entry.plantedAt})`,``

This is not a hypothetical side channel. It is counted, in committed evidence
files, across prior runs:

**Evidence:** `openspec/changes/archive/2026-08-30-add-probe-visibility/review-evidence.md:860@df9a0cb` — `architecture-reviewer 5/5 (2 via the registry side channel, 3 by reading),`

**Evidence:** `openspec/changes/archive/2026-08-30-add-authoring-ergonomics/review-evidence.md:133@df9a0cb` — `- FP1 `openspec/changes/add-authoring-ergonomics/proposal.md:6` — the `retry` / "must stay in sync" sentence naming `spec/fixtures/rules-valid/src/example.ts` (defines only `widgetCount`). Flagged by both reviewers (2 of 2). architecture-reviewer confirmed via the local registry ("third successive plant"); rule-auditor from the grammar break and a grep.`

Two of five scored rounds reached the plant through the registry rather than
by reading, and the reviewer's own report says so. The leak had also been
written into that agent's durable memory as a preferred opener — which the
agent has since corrected of its own accord, so that particular instance is
gone, but the CLI surface that made it available has not changed.

**And it recurred during this change's own pre-review.** Iteration 1's
`## Probe — stage 2` section in this folder records a reviewer obtaining the
plant's location together with its `plantedAt` timestamp — a value printed by
nothing but the presence branch of `canary status`. Iteration 2's records
another reaching it through `check`. The command this proposal is about leaked
to the review of the proposal about it.

Nothing in this repository captures which tool calls a dispatched reviewer
actually makes. Hook wiring covers only `ExitPlanMode`, dispatch:

**Evidence:** `plugin/hooks/hooks.json:14@2792fa1` — `        "matcher": "^(Task|Agent)$",`

and mutation (`Task`/`Agent`/`Edit`/`Write`/`MultiEdit`/`NotebookEdit`):

**Evidence:** `plugin/hooks/hooks.json:25@2792fa1` — `        "matcher": "^(Task|Agent|Edit|Write|MultiEdit|NotebookEdit)$",`

A reviewer's `Read`, `Bash`, or `Grep` calls are invisible to every hook this
repository owns — so there is no way to detect, after the fact, that a
reviewer read `canary status`'s output instead of the document. Trying to
detect the cheat from report wording alone is a losing game against
phrasing, and it puts a heuristic in the position of inferring intent from
prose — the wrong shape of fix for a deterministic tool. The available fix is
prevention: stop the commands from answering the question a reviewer would
use them to answer.

**`status` is not the only such command.** `check` prints the plant's document
itself, unprompted, in two warning branches — and the first one names
`canary status` as the place to go for more:

**Evidence:** `packages/claims/src/cli.ts:1107@3f64b6e`

```ts
        `warning: the registered canary points at a document outside the matched set (${activeCanary.doc}) — not read; run \`canary status\``,
```

That branch fires precisely when the registered canary sits outside the set
being checked — which is the case for a reviewer running this repository's
other documented gate, `check 'README.md' 'spec/**/*.md'`, while a canary is
planted in a proposal. So the shortest path to the plant's location does not
run through `status` at all, and a change that redacted only `status` would
report that it had closed the vector while leaving a shorter one open. Both
commands are in scope here for that reason; `design.md` Decision 2 carries the
argument.

## Why now

This change's own three pre-review rounds are the argument. Reviewers reached
the plant through the CLI twice — through `canary status` in iteration 1 and
through `check` in iteration 2 — while reviewing the proposal to stop exactly
that. The surface is reachable during ordinary review work, not only by someone
looking for it.

(An earlier draft argued the urgency differently: that the leak had been written
into an agent's durable memory as a preferred strategy. That was true when
written and is no longer — the agent removed it during iteration 1 of this run,
unprompted. The claim is retired rather than restated, because the CLI surface
is the durable fact and the memory entry was a symptom.)

## What changes

- `canary status`'s default output no longer names the plant's document or
  line. It reports only that a canary is active (or not) and when it was
  planted — enough for the documented legitimate uses (a human or the
  coordinator checking "is something still planted"), not enough to locate
  the claim.
- `check`'s two canary warnings no longer name the plant's document either,
  and the first stops directing the reader to `canary status`, which after
  this change can no longer answer it. Both warnings keep their diagnostic
  content: something is registered, and it is in an unexpected state.
- `canary verify`'s CAUGHT and MISSED messages no longer name the plant's
  document or line. Exit codes are unchanged.
- `canary clear`'s confirmation no longer names them either. `clear` takes no
  operand, which makes it the shortest path of all — and it is the remedy the
  other messages advertise.
- `clearCanary`'s refusal message, raised when the registered line no longer
  carries the planted claim, no longer names them.
- **All five go through one redacting accessor**, with `canary plant` as the
  single explicit exception. This is the substance of the change. Enumerating
  call sites was tried three times and shipped an incomplete set each time —
  six surfaces surfaced at roughly two per review round, by a process with no
  way to know when it was finished. `design.md` Decision 5 has the argument.
- The coordinator does not lose anything it needs: `canary plant` already
  prints the location at plant time, and Stage 2 Step 3 already instructs
  recording it then — `status` was never the coordinator's source for this
  information, only ever a convenience a curious reviewer could also reach.
- Exit codes are unchanged (`0` when no canary is active, `1` when one is) —
  every existing consumer in this repository (the CI dogfood gate, Stage 8's
  guard, Resume semantics' "if a canary is still registered" check) reads
  only the exit code, never the printed text. Confirmed by reading each call
  site before writing this proposal; see `design.md` Context.

## Non-goals

- **Not closing the raw-registry-file read vector.** `.git/nullius/canaries.json`
  remains directly readable by any tool call with filesystem access
  (`cat`, `Read`, `grep`), regardless of what the CLI prints. Closing that
  needs a harness-level permission mechanism this repository does not
  control and cannot verify from source — asserting a fix here would be an
  unverifiable claim about external behavior, the same category of claim
  `doctor.ts`'s payload-capture check already declines to make about
  settings precedence. Left as an explicit open question below.
- **Not closing the leak in committed `review-evidence.md` history.** A
  later pre-review round's reviewers can read earlier rounds' `## Probe —
  stage 2` sections, which name where the canary was planted that round. PR
  #47 already mitigates the sharpest form of this (rotating the plant's
  target document across iterations, so an old section names a stale
  location) but does not redact the sections themselves. A redaction
  convention for historical probe sections is a different fix, to a
  different file, and is out of scope here.
- **Not redacting `check`'s `CANARY-PRESENT` guard row.** It leaks the plant's
  line through `source.line`, a structured field that reaches the published
  JSON schema — a different kind of fix from the five message strings this
  change covers, needing an additive field rather than a sentinel, and a
  reviewer whose remit is the kernel's contracts. Split into a follow-up at
  iteration 3; `design.md` Decision 4 carries the argument. It is also the
  least informative of the six surfaces: it adds the line to a document the
  reader already knows, because they just asked `check` to read it.
- **Not claiming to stop a determined reviewer.** The boundary this change
  enforces is *reachability through the tool's own commands*, and what it
  removes is incidental exposure — a reviewer running documented commands as
  part of an ordinary review being handed the plant's location without having
  sought it. Someone willing to read the registry file directly is outside the
  threat model, and this change does not pretend otherwise.

  (An earlier draft carried a Non-goal here excluding `canary verify` on the
  grounds that it is coordinator-only. That was withdrawn at refinement
  iteration 2: nothing sequences `verify`, so the exclusion described a
  convention rather than a guard. `design.md` Decision 3 has the detail.)

## Dependencies

### Hard (must be merged before this starts)

None.

### Soft (design assumes these exist; graceful degradation if absent)

None.

### Enables (future changes that will depend on this)

None known.

## Size estimate

|                                 |                                    |
| ------------------------------- | ------------------------------------ |
| Estimated tasks                 | ~28 (was ~6; grew across three review rounds) |
| Packages or surfaces touched    | 1 (`packages/claims`)                 |
| Risk                            | LOW                                   |
| Expected sessions to implement  | 1                                     |

## Open questions

- Whether the raw-registry-file read vector and the review-evidence.md
  history vector (both named in Non-goals) are worth their own follow-up
  proposals, or whether this fix plus PR #47's document-rotation mitigation
  is enough given how narrow the single-slot, one-probe-per-run design
  already keeps the exposure window.
