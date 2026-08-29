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

The gap is that **nothing reports what the configuration says about capture.**
Whether capture is *running* is not knowable from here — the environment that
launched the harness can enable it unseen — but what the settings files say is
knowable, and nothing reports that either. Live payloads land in a different
directory entirely:

**Evidence:** `packages/kit/src/cli.ts:588@a717cc4` — ``  const file = join(root, ".nullius", "probes", `${name}.json`);``

and no check looks at it. `init` never mentions probing either — neither the
installer entry point:

**Evidence:** `packages/kit/src/cli.ts:190@a717cc4` — `function runInit(argv: readonly string[]): number {`

nor any of the modules it composes to decide what to write:

**Evidence:** `grep -rn 'PROBE' packages/kit/src/profiles.ts packages/kit/src/render.ts packages/kit/src/detect.ts` → 0 results

So the loop has no entry point. The corpus is fed by live capture; live capture
is off by default; and a `doctor` run reports the corpus check green while
nothing is being captured, which is true and reads as "probing is fine."

The variable is not wholly undocumented — `record --help` describes it:

**Evidence:** `packages/kit/src/cli.ts:68@12cde11` — `Set NULLIUS_WITNESS_PROBE=1 to also save each raw payload to`

But that is a help text for a subcommand the operator has no reason to run, and
nothing in the *installer* or in *`doctor`'s report* — the two surfaces a person
actually reads — mentions it. The gap is in the surfaces that report state, not
in the reference documentation.

The cost is paid retroactively and only once it is too late. Capture cannot be
performed after the fact, so the first time a payload anomaly needs explaining
is exactly the moment the explaining data is discovered not to exist.

## Why now

This was found by running `doctor` against this repo during a real session, then
needing live probe payloads to explain an anomaly and having no report anywhere
that said whether capture was on. The failure mode is not theoretical and it is
silent, which is the class of failure this project exists to make loud.

The state of `.nullius/probes/` at that moment is not re-checkable now — capture
has since been enabled on this machine and the directory holds payloads — which
is itself the point. Capture state is not recoverable after the fact, so a claim
about it has to be reported when it is true or not at all.

## What changes

- **A `doctor` check for live capture state** (kit): reads the harness settings
  files — project-local, project-shared and user — and reports every one that
  sets `NULLIUS_WITNESS_PROBE`, the value it carries, and whether
  `.nullius/probes/` holds anything. Never a `fail` — not capturing is a
  legitimate choice, not a defect. A `fact` in every branch but one: a settings
  file that exists and will not parse, with nothing else establishing the value,
  is `unknown`. Three things it deliberately
  does not do, each of which it did in an earlier draft of this proposal:
  - it does not read `doctor`'s own environment, because the variable governs
    the hook subprocess and `doctor` runs in the operator's shell (design 1a)
  - it does not adjudicate precedence between settings files, because nothing in
    this repository establishes the harness's ordering (design 1d)
  - it does not report "capture is off" when no file sets the variable, because
    sources it cannot read — including the launching environment — can still
    enable it (design 1c)
- **A corrected `probeChecks` detail line** (kit): when the committed corpus is
  absent, the current message tells the reader to fill it with a variable that
  writes to a different directory. The message changes; the check does not.
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

- ~~**Should `init` offer to enable capture, or only mention it?**~~
  **Resolved 2026-08-28: only mention it.** The installer is not the right place
  to ask a privacy question, and an `init` that may write a probe key turns an
  unconditional test assertion into a conditional one. See design Decision 2.
- **Does the live directory deserve its own staleness signal?** A
  `.nullius/probes/` captured against a harness version that has since been
  upgraded is worse than an empty one, because it looks like coverage. Naming
  the harness version at capture time would fix it and needs a version string
  the payload may not carry.
