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

That subprocess does not get its environment from any single place. It
*inherits* the environment of the harness process, which the settings `env`
block augments — which is how `NULLIUS_KIT_BIN` reaches it, but not the only way
a variable can. The recorder's own help text lists the probe variable alongside
two others as ordinary environment variables:

**Evidence:** `packages/kit/src/cli.ts:73@12cde11` — `env: NULLIUS_WITNESS_ROOT, NULLIUS_WITNESS_ORIGIN, NULLIUS_WITNESS_PROBE`

What matters for this design is narrower and still true: `doctor` runs in the
operator's shell, and its only use of its own environment is the `PATH` lookup:

**Evidence:** `packages/kit/src/doctor.ts:105@12cde11` — `  const dirs = (process.env["PATH"] ?? "").split(":").filter((dir) => dir.length > 0);`

So a naive `process.env` read inside `doctor` is wrong in both directions:
capture configured in settings and actually running would report "off", and
`NULLIUS_WITNESS_PROBE=1 nullius-kit doctor` would report "on" while the hooks
never saw it. Reading the settings block makes the check answer the question it
claims to answer.

**Alternative considered:** report `??` whenever the project settings file is
silent — rejected, because silence is the common case and the report would then
say "I don't know" about precisely the thing this change exists to surface.

**Second alternative considered:** drop the environment half and report only the
directory contents — rejected, because "is capture on right now" is the question
that motivated the change, and a directory listing does not answer it.

### 1c. Read the whole precedence chain, and name what is still not visible

**Chosen:** read project-local, project-shared and user settings; report every
file that sets the variable and the value it carries; do not assert which one
wins. Where none set it, report what was read and say that capture may still be
enabled by sources this check does not read — never that capture is off.

**This decision exists because 1a as first written was wrong in the same way
the thing it fixed was wrong.** The first revision required capture state be
read from *the* settings `env` block and permitted `unknown` only for an
unreadable file. But `NULLIUS_WITNESS_PROBE=1 claude`, `.claude/settings.local.json`
and `~/.claude/settings.json` each enable capture while the project file is
silent, so that rule would have produced a confident `fact` reading "capture is
off" while capture was on — the exact confident-wrong-answer failure 1b rejects,
re-created one layer out. Narrowing a source of truth is not the same as
checking the narrowed source is complete.

The residue is real and is named rather than closed over: a variable exported
in the shell that launched the harness is invisible to `doctor`, and no amount
of file reading recovers it. That is why the silent case reports what it read
instead of what it concluded.

**The residue is also named non-exhaustively, on purpose.** An earlier draft
listed the launching environment as *the* invisible source, which implies the
file chain is otherwise complete — and enterprise or managed settings and a
`--settings` argument are neither read nor excluded here, neither of which this
repository can settle. Enumerating the unknowns is the move that produced two
successive versions of this requirement that forbade the correct answer, so the
wording stays open-ended.

### 1d. Report every setter; do not adjudicate precedence

**Chosen:** name each settings file that sets the variable and the value it
carries, and stop there.

An earlier draft had the first file in precedence order decide, and the report
name it. That is a confident claim about harness behaviour, and nothing in this
repository establishes the ordering: `.claude/settings.local.json` appears
nowhere in the tree outside this change's own documents. Naming a deciding file
would have `doctor` assert something it cannot check — the same class of error
as 1a and 1c, arriving a third time by a different route.

Reporting every setter is strictly more informative than reporting a winner. A
reader who sees two files disagree learns something a resolved answer would have
hidden, and the resolution belongs to the component that actually performs it.

**Alternative considered:** vendor the precedence order as a documented
assumption and check it — rejected. It is external behaviour that can change
without notice, and this repository has one rule already
(`openspec-shall-first-line.md`) that exists precisely because a tool's
behaviour could not be grounded in-tree. One such ungrounded claim, clearly
labelled, is a known cost; a second one buried inside a checker's confident
output is not.

### 1e. Absence is treated three ways in one report, deliberately

The new check sits next to two existing treatments of absence, and they differ:

- an absent settings file is an **observation** — nothing was configured, which
  is the common and correct case
- a settings file that exists and does not parse is **`unknown`** — something
  was configured and this tool cannot read it
- an absent probe corpus is **`unknown`** in `probeChecks`, because that check
  replays recordings and without them it has verified nothing

The third is the one that looks inconsistent and is not. `probeChecks` reports
`unknown` because its subject *is* the recordings; with none, it made no
finding. The capture check's subject is the configuration, which is fully read
even when it configures nothing. The distinction is between "I could not perform
my check" and "I performed it and the answer is none".

This is written down because three treatments of absence in adjacent lines of
one report will read as an accident to the next person, and the honest response
to that is an argument rather than a forced consistency.

**Alternative considered:** report the effective value by merging all files —
rejected. Precedence is what the harness applies, so a merge that ignored it
would answer a question nobody asked. Naming the deciding file also gives the
reader the one thing they need in order to act.

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
returned shape are untouched. No existing test pins that string, so the blast
radius is empty; task 4.4 adds the assertion that was missing.

One ordering constraint does bind. `runChecks` appends the live-proof check
last:

**Evidence:** `packages/kit/src/doctor.ts:551@12cde11` — `  checks.push(...probeChecks(probeDir));`

and a test asserts that it stays last:

**Evidence:** `packages/kit/src/doctor.test.ts:263@12cde11` — `    expect(checks[checks.length - 1]?.name).toBe("live proof");`

So the capture-state check is inserted *before* `liveProof()`, not appended.
That test is correct and stays as it is — live proof is the report's closing
statement and should remain so.

## Open questions

Mirrored from `proposal.md`:

- ~~Whether `init` offers to enable capture or only mentions it.~~ **Resolved:**
  it only mentions it. See Decision 2.
- Whether live captures need a harness-version stamp, since a capture taken
  against an older harness looks like coverage while testing a payload shape
  that no longer ships. Still open, and only partly mitigated here: the check
  reports how many payloads are held and when the most recent was written, which
  lets a reader judge age for themselves. It deliberately does not call them
  stale — that would be a claim about whether capture is still running, which
  this check cannot make.
