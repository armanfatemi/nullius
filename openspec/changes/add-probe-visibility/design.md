# Design — add-probe-visibility

## Context

Two probe directories exist and they are not the same thing.

`spec/fixtures/probes/claude-code/` is a **committed corpus**: recordings of real
hook payloads, replayed through the real extractor by `probeChecks` so a harness
upgrade that changes payload shape fails a check instead of silently producing
empty journals. It is a regression test and it belongs in the repo.

`.nullius/probes/` is **live capture**: the latest raw payload per event type,
written only when `NULLIUS_WITNESS_PROBE=1`, gitignored, per-machine. It is how
the corpus gets fed.

`doctor` reports on the first and says nothing about the second. That asymmetry
is the whole of this change.

## Decisions

### 1. Capture state is a `fact`, never a `fail`

**Chosen:** report it in the register `doctor` already uses for observations with
no verdict attached.

**Alternatives considered:**

- **`fail` when capture is off** — rejected. Not capturing is a legitimate and
  probably correct default for most projects. A check that fails on a reasonable
  configuration is a check people disable.
- **`unknown` (`??`) unconditionally** — rejected. `??` means "I could not
  determine this." Where the settings file is readable the state *is*
  determinable, and claiming otherwise would be the checker overstating its own
  ignorance, which is the mirror of the failure this repo refuses. `??` is
  retained for the one case where it is honest: settings absent or unparseable.

**Rationale:** the goal is that a reader of `doctor` output knows capture is off.
That needs visibility, not severity.

### 1a. Capture state is read from the settings env block, not `process.env`

**Chosen:** `doctor` reads the `env` block of the harness settings file and asks
whether the capture variable is set there to exactly `1`.

This corrects a false premise in the first draft of this design, which asserted
capture state was determinable "from the environment and the filesystem" and
wrote a `SHALL NOT be reported as unknown` on that basis. The environment half
was wrong. The variable is read in the **hook subprocess**:

**Evidence:** `packages/kit/src/cli.ts:436@12cde11` — `  if (process.env["NULLIUS_WITNESS_PROBE"] === "1") probe(root, event, payload);`

and that subprocess takes its environment from the settings `env` block — the
same mechanism that delivers `NULLIUS_KIT_BIN`. `doctor` runs in the operator's
shell, and its only use of its own environment is the `PATH` lookup:

**Evidence:** `packages/kit/src/doctor.ts:105@12cde11` — `  const dirs = (process.env["PATH"] ?? "").split(":").filter((dir) => dir.length > 0);`

So a naive `process.env` read inside `doctor` is wrong in both directions:
capture configured in settings and actually running would report "off", and
`NULLIUS_WITNESS_PROBE=1 nullius-kit doctor` would report "on" while the hooks
never saw it. Reading the settings block makes the check answer the question it
claims to answer.

**Alternative considered:** report `??` for the environment half and only the
filesystem half as fact — rejected, because the state is genuinely readable and
declining to read it is the checker being lazy rather than honest.

**Second alternative considered:** drop the environment half and report only the
directory contents — rejected, because "is capture on right now" is the question
that motivated the change, and a directory listing does not answer it.

### 1b. The predicate is `=== "1"`, not "is set"

**Chosen:** report capture as on only when the variable's value is exactly `1`.

The recorder's own condition is an equality test against `"1"`, so
`NULLIUS_WITNESS_PROBE=0` is set and does not capture. An "is set" check would
report capture on for a configuration that deliberately turned it off, which is
worse than not reporting at all — it is a confident wrong answer in the one
place a reader has no reason to doubt.

### 2. `init` states the option; it does not enable it

**Chosen:** the installer names probing, what it records, and that it is off.

**Alternatives considered:**

- **Enable by default** — rejected. Raw payloads carry prompt text, tool inputs,
  and absolute home paths; the committed corpus had to redact the last of those
  before sharing. A tool that starts persisting prompts because someone ran
  `init` has made a privacy decision on the user's behalf.
- **Say nothing, as today** — rejected. That is the current state and it is why
  the corpus has no supply.

**Rationale:** the failure is that nobody knows the option exists. Telling them
fixes it without deciding for them.

**Resolved 2026-08-28:** `init` names the option and does not offer to enable
it. The installer is not the right place to ask a privacy question, and an
`init` that can write a probe key needs a test asserting when it does not — a
conditional assertion is a weaker gate than an unconditional one. The spec now
says `SHALL NOT enable capture, and SHALL NOT offer to enable it`, and the
absence assertion is scoped to `nullius.kit.json`, the file `init` actually
writes.

### 3. This change does not touch `probeChecks`

**Chosen:** leave it reading the committed corpus.

**Rationale:** it was briefly mis-read during review as a live-capture check
pointed at the wrong directory. It is not. Its own doc comment states the intent
— recordings replayed through the extractor — and the corpus is the right input
for that. The defect was a missing check, not a misdirected one, and a change
built on the other reading would have "fixed" a working test.

**But the cause of that misreading is real and is fixed here.** When the corpus
is absent, `probeChecks` tells the reader to populate it with the variable that
writes somewhere else:

**Evidence:** `packages/kit/src/doctor.ts:407@12cde11` — `no probe recordings at ${probeDir} — capture some with NULLIUS_WITNESS_PROBE=1`

`probeDir` there is the committed corpus; `NULLIUS_WITNESS_PROBE=1` writes to
`.nullius/probes/`. Following that instruction does not populate the directory
the message names. The detail line is corrected to describe the actual path from
live capture to committed corpus. `probeChecks`' behaviour — what it reads and
what it returns — is unchanged.

## Compatibility risks

Nothing here changes a stored format, a schema, an exported type, or which
inputs an existing check reads. The added observation is new output in a report
that is already free-form per check.

One existing check's *text* changes: `probeChecks`' absent-corpus detail line is
corrected, as argued in Decision 3. Its status, its input directory and its
returned shape are untouched. Any test asserting on that exact string will need
updating, and that is the intended blast radius — a test pinning the old string
is pinning the instruction that caused the misreading.

## Open questions

Mirrored from `proposal.md`:

- ~~Whether `init` offers to enable capture or only mentions it.~~ **Resolved:**
  it only mentions it. See Decision 2.
- Whether live captures need a harness-version stamp, since a stale capture
  looks like coverage while testing a payload shape that no longer ships. Still
  open, and partly mitigated here: the "capture off but payloads present" branch
  now reports that the held payloads are not being refreshed, which names the
  staleness without dating it.
