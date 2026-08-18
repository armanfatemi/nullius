# canary

## Purpose

Planting a registered false premise and deterministically verifying whether
the review layer flags it turns "the reviewers would catch it" from an
assumption into a measurement — mutation testing, one layer up from the tests.

## ADDED Requirements

### Requirement: Plant inserts one registered false claim

`nullius canary plant <doc>` SHALL insert exactly one plausibly-false claim
into the document and record it in a per-clone registry stored outside the
working tree, under the repository's `.git` directory (document path, line,
claim text, planted-at timestamp). At most one canary SHALL be active per
repository; plant SHALL refuse to run while one is registered. Plant SHALL
NOT use model calls — claims come from templates filled with lexically
harvested repository facts — and templates SHALL NOT produce binding moments
from the project's CI-caught list.

#### Scenario: Plant registers the claim

- WHEN `canary plant` runs against a document with no active canary
- THEN the document contains the claim at the registered line and the
  registry holds exactly one entry for it

#### Scenario: Second plant refused

- WHEN `canary plant` runs while a canary is already registered
- THEN no document is modified and the command exits non-zero naming the
  active canary

### Requirement: The planted diff is only the claim

The change plant introduces SHALL consist solely of the claim text: no
comment, marker, annotation, or registry reference is added to the document
or anywhere else in the working tree.

#### Scenario: Diff contains claim text only

- WHEN plant runs and the working tree is diffed against its pre-plant state
- THEN the diff contains exactly the inserted claim line and nothing else

### Requirement: Canaries live in reviewer jurisdiction only

A planted claim SHALL be of a kind the deterministic checker cannot itself
refute: a bare-prose claim about existing code contradicted by the
repository, or a compatibility risk whose binding moment is inside the
configured vocabulary but names the wrong mechanism. Plant SHALL NEVER emit a
structured `Evidence:` anchor as the canary — the checker would refute that
trivially, and the probe would measure nothing.

#### Scenario: Planted claim produces no failing anchor verdict

- WHEN a planted document is checked
- THEN the planted claim itself produces no failing anchor verdict; only the
  registry-based merge guard reports its presence

### Requirement: Verify has three outcomes

`nullius canary verify <report-file>` SHALL deterministically scan the given
review output and report exactly one outcome:

- `CANARY-CAUGHT` (exit 0) — the report contains the planted `<doc>:<line>`
  reference after whitespace normalization, or the full planted claim text
  under the checker's existing normalization.
- `CANARY-TAINTED` (exit 3) — the report references the probe machinery
  itself: the registry path or filename, or a `CANARY-` verdict token. A
  tainted probe is invalid, not caught.
- `CANARY-MISSED` (exit 1) — neither of the above.

Taint SHALL be tested before caught. All matching SHALL be literal substring
matching after normalization — never a pattern built from registry or report
content. No model SHALL judge any outcome.

#### Scenario: Caught

- WHEN the review output cites the planted document and line
- THEN `CANARY-CAUGHT` is reported and the command exits 0

#### Scenario: Missed

- WHEN the review output contains no reference to the planted location, the
  claim text, or the probe machinery
- THEN `CANARY-MISSED` is reported and the command exits 1

#### Scenario: Tainted probe is not a catch

- WHEN the review output quotes a `CANARY-PRESENT` verdict line and also
  cites the planted location
- THEN `CANARY-TAINTED` is reported and the command exits 3

### Requirement: Clear restores the document exactly

`nullius canary clear` SHALL remove the planted claim and its registry entry.
After clearing, the document SHALL be byte-identical to its pre-plant content
when no intervening edits touched it. WHEN the registered line no longer
carries the registered claim text, clear SHALL leave the document untouched,
report the mismatch, and exit non-zero with the registry entry retained.

#### Scenario: Plant then clear round-trips

- WHEN plant and then clear run with no intervening edits
- THEN the document is byte-identical to its pre-plant state and the registry
  holds no entry for it

#### Scenario: Stale line refuses to clear

- WHEN edits have moved or altered the planted line so the registered claim
  text is not at the registered location
- THEN clear modifies nothing, reports the mismatch, and exits non-zero

### Requirement: Status is the guard primitive

`nullius canary status` SHALL list the active canary (document, line,
planted-at) and exit 1 when one is registered, 0 when none is — so approval
and merge scripts can gate on probe state without reading the registry.
WHEN the registry is unreadable or invalid, probe state is unknown: `status`
and `verify` SHALL exit 2 rather than report all-clear, and `check` SHALL
fail with instructions — an unreadable registry fails closed.

#### Scenario: Active canary reported

- WHEN `canary status` runs while a canary is registered
- THEN the canary's document and line are listed and the command exits 1

#### Scenario: Unreadable registry is never all-clear

- WHEN the registry file is unparseable and `canary status` runs
- THEN the command reports that canary state cannot be determined and exits 2

### Requirement: Merge guard

`check` SHALL report a failing `CANARY-PRESENT` verdict for any matched
document that still contains a registered, uncleared canary. Registry content
SHALL be treated as untrusted input: registered paths pass the existing
path-safety rules before any use, and the guard SHALL read no file outside
the matched document set — a registry entry pointing at an unmatched or
excluded document produces a warning, not a read. `check --probing` SHALL
suppress `CANARY-PRESENT` (the probe runner is the one actor who knows a
probe is live). The guard is a safety net against accidental leakage, not an
adversarial control — this limit SHALL be advertised in the convention spec.

#### Scenario: Unresolved canary blocks the check

- WHEN `check` runs without `--probing` while a registered canary remains in
  a matched document
- THEN `CANARY-PRESENT` is reported and the check exits non-zero

#### Scenario: Probing run suppresses the guard

- WHEN `check --probing` runs while a registered canary is present
- THEN no `CANARY-PRESENT` verdict is reported and other verdicts are
  unaffected

#### Scenario: Registry entry outside the matched set warns

- WHEN the registry names a document that no configured glob matches
- THEN the checker prints a warning naming the document and does not read it
