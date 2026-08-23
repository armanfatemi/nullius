# Proposal — add-probe-visibility

> **Depends on:** None

## Problem

The recorder can save every raw hook payload it sees, behind an env var:

**Evidence:** `packages/kit/src/cli.ts:433@a717cc4` — `  if (process.env["NULLIUS_WITNESS_PROBE"] === "1") probe(root, event, payload);`

Those recordings are not a curiosity. They are the fuel for the one check that
defends every assumption the recorder makes about a harness this project does
not own — `probeChecks` replays recorded payloads through the real extractor so
that a harness upgrade changing payload shape surfaces as a failed check rather
than as a journal that quietly records nothing:

**Evidence:** `packages/kit/src/doctor.ts:395@a717cc4` — `export function probeChecks(probeDir: string): Check[] {`

That check reads the committed corpus, which is correct — it is a regression
test over recordings, not a report on live state:

**Evidence:** `packages/kit/src/cli.ts:360@a717cc4` — `    probeDir: join(root, "spec", "fixtures", "probes", "claude-code"),`

The gap is that **nothing reports whether capture is currently on.** Live
payloads land in a different directory entirely:

**Evidence:** `packages/kit/src/cli.ts:588@a717cc4` — ``  const file = join(root, ".nullius", "probes", `${name}.json`);``

and no check looks at it. `init` never mentions probing either — neither the
installer entry point:

**Evidence:** `packages/kit/src/cli.ts:190@a717cc4` — `function runInit(argv: readonly string[]): number {`

nor any of the modules it composes to decide what to write:

**Evidence:** `grep -rn 'PROBE' packages/kit/src/profiles.ts packages/kit/src/render.ts packages/kit/src/detect.ts` → 0 results

So the loop has no entry point. The corpus is fed by live capture; live capture
is off by default; nothing ever says so; and a `doctor` run reports the corpus
check green while capture is off, which is true and reads as "probing is fine."

The cost is paid retroactively and only once it is too late. Capture cannot be
performed after the fact, so the first time a payload anomaly needs explaining
is exactly the moment the explaining data is discovered not to exist.

## Why now

This was found by running `doctor` against this repo during a real session, then
needing the live probe corpus to explain an anomaly and finding
`.nullius/probes/` empty with nothing having said so. The failure mode is not
theoretical and it is silent, which is the class of failure this project exists
to make loud.

## What changes

- **A `doctor` check for live capture state** (kit): reports whether
  `NULLIUS_WITNESS_PROBE` is set and whether `.nullius/probes/` holds anything,
  as a `fact` — never a `fail`. Not capturing is a legitimate choice, not a
  defect.
- **`init` names the option** (kit): the installer states that probing exists,
  what it records, and that it is off unless asked for. It does not silently
  turn it on.
- **Documentation** (`.nullius/README.md`): what the directory holds, that it is
  gitignored, and that raw payloads carry prompt text and absolute paths — the
  reason it is opt-in rather than default.

## Non-goals

- **Defaulting capture on.** Raw payloads contain prompt text, tool inputs, and
  absolute home-directory paths — the committed corpus had to redact the last of
  those before it could be shared. Persisting that by default is the user's
  decision, not the tool's. This change makes the choice visible; it does not
  make it.
- **Changing what `probeChecks` reads.** Replaying the committed corpus is the
  right behaviour for a shape regression test, and it is unchanged here.
- **Redaction.** Scrubbing captured payloads is a separate concern with its own
  design questions, and pretending to solve it here would be worse than leaving
  it named.
- **A verdict.** Capture state is an observation. Nothing about it fails a run.

## Dependencies

### Hard (must be merged before this starts)

None.

### Soft (design assumes these exist; graceful degradation if absent)

None.

### Enables (future changes that will depend on this)

- Any future work on payload redaction, which needs captured payloads to exist
  before it has anything to redact.

## Size estimate

|                                |                                          |
| ------------------------------ | ---------------------------------------- |
| Estimated tasks                | 9                                        |
| Packages or surfaces touched   | 2 (packages/kit, `.nullius/` docs)       |
| Risk                           | LOW                                      |
| Expected sessions to implement | 1                                        |

LOW: one added observation in `doctor`, one line of `init` output, and a
documentation section. No existing check changes behaviour, and nothing gains a
verdict.

## Open questions

- **Should `init` offer to enable capture, or only mention it?** Offering is more
  useful and makes the installer ask a privacy question it may not be the right
  place to ask. Mentioning is safer and more easily ignored. Resolve before
  implementing; the difference is one prompt.
- **Does the live directory deserve its own staleness signal?** A
  `.nullius/probes/` captured against a harness version that has since been
  upgraded is worse than an empty one, because it looks like coverage. Naming
  the harness version at capture time would fix it and needs a version string
  the payload may not carry.
