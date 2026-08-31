# Proposal — add-canary-status-redaction

> **Depends on:** None

## Problem

The canary probe measures whether a reviewer actually reads a document by
planting a false claim and checking whether the review references it. The
measurement is only meaningful if "references it" means "found by reading" —
but `canary status` prints the plant's exact location to anyone who runs it:

**Evidence:** `packages/claims/src/cli.ts:1032@2792fa1` — ``      `active canary: ${entry.doc}:${entry.line} (planted ${entry.plantedAt})`,``

This is not a hypothetical side channel. Across two real runs, a dispatched
reviewer's own report stated it confirmed the plant "via the local registry"
rather than by reading the document — `review-evidence.md` records this
directly, and a later run's `.claude/agent-memory/architecture-reviewer/`
notes wrote the pairing down as that agent's "fastest opener" for future
runs, together with the plant's exact path. The leak, once written into
durable agent memory, is no longer incidental to one run.

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

The leak is now recorded in an agent's own durable memory as a preferred
strategy, not merely an accident — the next probed review is more likely to
use it, not less.

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
- `check`'s `CANARY-PRESENT` guard row no longer carries the plant's line. The
  redaction is applied where the result is constructed, so it holds for
  `--format json` as well as for human output. The guard keeps naming the
  document and keeps `canary clear` as its remedy — a remedy that never needed
  a line number.
- `canary verify`'s CAUGHT and MISSED messages no longer name the plant's
  document or line. Exit codes are unchanged.

Four surfaces, found one per review round. They are fixed together, and through
one shared redaction rather than four independent edits, because the pattern
this change kept rediscovering is that any renderer of a registry entry is free
to print its location.
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
| Estimated tasks                 | ~11 (was ~6 before scope grew to `check`) |
| Packages or surfaces touched    | 1 (`packages/claims`)                 |
| Risk                            | LOW                                   |
| Expected sessions to implement  | 1                                     |

## Open questions

- Whether the raw-registry-file read vector and the review-evidence.md
  history vector (both named in Non-goals) are worth their own follow-up
  proposals, or whether this fix plus PR #47's document-rotation mitigation
  is enough given how narrow the single-slot, one-probe-per-run design
  already keeps the exposure window.
