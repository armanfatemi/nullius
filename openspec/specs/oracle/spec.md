# oracle Specification

## Purpose
TBD - created by archiving change add-oracle-conservation. Update Purpose after archive.
## Requirements
### Requirement: Oracles are declared, never inferred

The kernel SHALL read declared oracle globs from `nullius.config.json` under an
`oracles` key, and SHALL NOT infer which files are oracles from path
conventions.

Each entry SHALL carry a `glob` and MAY carry a `weakening` pattern, a regular
expression whose match count is compared across revisions.

Where no `oracles` key is configured, the command SHALL report that none are
declared and SHALL NOT report zero oracle changes. An unconfigured project and
a project whose oracle genuinely did not change are different facts, and only
one of them is evidence.

#### Scenario: an unconfigured project is told, not reassured

- **WHEN** `nullius oracle` runs in a project with no `oracles` key
- **THEN** the output names the missing configuration and the exit code does
  not report a clean pass

#### Scenario: a declared oracle without a weakening pattern

- **WHEN** an entry carries `glob` and no `weakening`
- **THEN** `deleted` and `skipped` are still classified, and the output states
  that `weakened` was not checked for that glob

### Requirement: Oracle changes are classified from a closed vocabulary

`nullius oracle <range>` SHALL diff the given commit range against the declared
globs and classify each changed path.

Three classes SHALL be **hard**, and the list SHALL be closed:

- `deleted` — the path no longer exists at the head of the range
- `skipped` — a declared skip marker's match count increased
- `weakened` — a declared `weakening` pattern's match count decreased

Every other change to a declared oracle SHALL be reported as advisory and SHALL
raise no obligation.

Reduction of what the oracle can detect SHALL be the reason a class is hard.
That is the rationale for the closed list above, and it is neither a universal
property of every instance nor an exhaustive account of the reductions that
exist.

It is not universal over instances: `skipped` applied to a file added within the
range reduces nothing, because there was nothing there to reduce, and it SHALL
still be classified hard rather than special-cased against the base revision.

It is not exhaustive over reductions: a rename out of a declared glob, and the
removal of a glob from the `oracles` configuration, both reduce detection and
SHALL both be left unclassified in this version.

The command SHALL NOT claim completeness it does not have. Where its output
summarises what was checked, it SHALL be phrased as the classes it detects rather
than as the reductions that are possible.

#### Scenario: a deleted test is hard

- **WHEN** a path matching a declared glob exists at the base and not at the head
- **THEN** it is classified `deleted` and raises an obligation

#### Scenario: an added test raises nothing

- **WHEN** a new file matching a declared glob appears in the range
- **THEN** it is reported advisory and raises no obligation

#### Scenario: an edit that adds assertions raises nothing

- **WHEN** a declared `weakening` pattern's count increases across the range
- **THEN** the change is advisory

### Requirement: A hard change reaches a decision or a verdict

Every hard change SHALL be matched against `decision` records carrying a
`justifies` object whose `path` and `change` equal the change's own.

A hard change with no matching decision SHALL be reported
`UNJUSTIFIED-ORACLE-CHANGE`. The verdict SHALL belong to an `OracleVerdict`
union, separate from the kernel's exported `Verdict`, whose growth is breaking
public API.

Matching SHALL be on the derived pair `(path, change)` and SHALL NOT require a
record id, because the changes most worth catching are made by tools that emit
no record to refer to.

The `oracle` capability SHALL own the validation of `justifies`, because it is
its only consumer. A `justifies` whose `path` is blank, or whose `change` falls
outside the three hard classes, SHALL be reported `MALFORMED-JUSTIFICATION` and
SHALL NOT discharge any obligation. `witness validate` SHALL NOT report a finding
for it.

`MALFORMED-JUSTIFICATION` SHALL be raised by reading the journal, independently of
whether any change in the range matches it. A verdict conditional on a matching
change would be unreachable in exactly the case the typo caused.

Multiple hard changes to one path SHALL each require their own justification
when their `change` classes differ.

#### Scenario: a justified deletion passes

- **WHEN** a test is deleted and a `decision` carries
  `justifies: {path: "test/a.test.ts", change: "deleted"}`
- **THEN** no verdict is reported for that change

#### Scenario: an unjustified weakening fails

- **WHEN** a declared pattern's count decreases and no decision names that path
  with `change: "weakened"`
- **THEN** the change is reported `UNJUSTIFIED-ORACLE-CHANGE`

#### Scenario: a mistyped change class is loud, not inert

- **WHEN** a decision carries `justifies: {path: "a.test.ts", change: "tweaked"}`
  and `a.test.ts` was deleted in the range
- **THEN** the deletion is still reported `UNJUSTIFIED-ORACLE-CHANGE`, and the
  malformed justification is separately reported `MALFORMED-JUSTIFICATION` naming
  the unrecognised class alongside the three valid ones

#### Scenario: a mistyped class is caught with no matching change

- **WHEN** a journal carries a malformed `justifies` and no file in the range
  matches its `path`
- **THEN** `MALFORMED-JUSTIFICATION` is still reported, and the exit code is
  non-zero with no strict flag set

#### Scenario: one decision does not discharge two classes

- **WHEN** a file is both skipped and weakened, and one decision names it with
  `change: "skipped"`
- **THEN** the `weakened` change is still reported unjustified

#### Scenario: a deletion no hook witnessed is still caught

- **WHEN** an oracle file is removed by a command the recorder does not watch,
  leaving no `mutation` record
- **THEN** the change is still classified `deleted` from the diff

### Requirement: The verdict certifies that a reason exists, never that it is good

`UNJUSTIFIED-ORACLE-CHANGE` SHALL certify only that no decision named the
change. The command SHALL NOT evaluate whether a rationale justifies its change,
and no model SHALL appear in this verdict path.

The command's output SHALL state this limit where it reports a pass, in the
same register `check` uses to advertise that its verdicts certify form and never
entailment.

#### Scenario: a weak reason passes

- **WHEN** a decision's rationale is "adjusted for the new behaviour" and it
  names the change correctly
- **THEN** the change is not reported, and the output does not imply the
  rationale was assessed

### Requirement: Oracle checking is advisory before it is a gate

Pass and fail SHALL be decided by a verdict's membership in an `OracleVerdict`
`PASSING` set, following the mechanism every other verdict family in this kernel
already uses, and SHALL NOT be decided solely by a command-line flag.

`UNJUSTIFIED-ORACLE-CHANGE` SHALL be a member of that set in v1, so the default
run reports without a failing exit code. The membership SHALL carry a written
argument for why it passes, so that the calibration is a decision on the record
rather than an accident of where the check landed.

`PASSING` SHALL NOT contain every member of the union. `MALFORMED-JUSTIFICATION`
SHALL be excluded from it and SHALL fail with no flag set, on the same principle
that excludes `malformed-rule-header` from the rule verdicts' passing set: a
mistyped key is an authoring error rather than a finding about the codebase. A
passing set with no complement would make the failure predicate constant-false
and return the decision to the flag it was moved off.

`--strict` SHALL widen what fails rather than being the only thing that can fail.

#### Scenario: default run reports without blocking

- **WHEN** `nullius oracle <range>` finds an unjustified change and no strict
  flag is set
- **THEN** the findings are printed and the exit code is 0

#### Scenario: the failure decision is not a no-op predicate

- **WHEN** the kernel is asked whether an `OracleVerdict` is a failure
- **THEN** the answer comes from `PASSING` membership, so the predicate remains
  meaningful independently of any CLI flag

