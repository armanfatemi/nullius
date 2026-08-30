# check-cli spec delta

## ADDED Requirements

### Requirement: Scoped strictness

`check` SHALL accept a commit range that partitions results into in-scope and
out-of-scope, where a result is in scope when the document containing its
anchor was changed by the range. Only in-scope failures SHALL decide the exit
code. Out-of-scope results SHALL still be checked and reported.

#### Scenario: a failure in a touched document fails the run

- **WHEN** `check` runs with a range that touched the document carrying a failing anchor
- **THEN** the run exits non-zero and the failure is reported

#### Scenario: the same failure in an untouched document does not fail the run

- **WHEN** `check` runs with a range that did not touch the document carrying that failing anchor
- **THEN** the run exits zero, and the failure is still reported and counted as out of scope

### Requirement: An unresolvable range is an error

`check` SHALL exit with a usage error naming the range when the range cannot be
resolved, rather than defaulting to either an unscoped strict run or an
advisory one.

#### Scenario: shallow clone cannot resolve the base

- **WHEN** the named base commit is not present in the clone
- **THEN** `check` exits 2 with a message naming the unresolvable range, and no verdicts decide an exit code

### Requirement: Outstanding out-of-scope failures are published

`check` SHALL report the number of out-of-scope failures as a named value in
both the human report and the JSON summary, so that debt excluded from the gate
remains visible.

#### Scenario: debt is visible on a passing run

- **WHEN** a scoped run passes while out-of-scope failures exist
- **THEN** the report states how many failures were excluded from the exit code
