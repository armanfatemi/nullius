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
- **`unknown` (`??`)** — rejected. `??` means "I could not determine this."
  Capture state is trivially determinable; claiming otherwise would be the
  checker overstating its own ignorance, which is the mirror of the failure this
  repo refuses.

**Rationale:** the goal is that a reader of `doctor` output knows capture is off.
That needs visibility, not severity.

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
fixes it without deciding for them. Whether `init` goes further and *offers* is
an open question, deliberately unresolved.

### 3. This change does not touch `probeChecks`

**Chosen:** leave it reading the committed corpus.

**Rationale:** it was briefly mis-read during review as a live-capture check
pointed at the wrong directory. It is not. Its own doc comment states the intent
— recordings replayed through the extractor — and the corpus is the right input
for that. The defect was a missing check, not a misdirected one, and a change
built on the other reading would have "fixed" a working test.

## Compatibility risks

None. Nothing here changes a stored format, a schema, an exported type, or the
behaviour of an existing check. The added observation is new output in a report
that is already free-form per check.

## Open questions

Mirrored from `proposal.md`:

- Whether `init` offers to enable capture or only mentions it.
- Whether live captures need a harness-version stamp, since a stale capture
  looks like coverage while testing a payload shape that no longer ships.
