# Check CLI — stamping, fixing, machine output

## ADDED Requirements

### Requirement: Stamp anchors verified at HEAD

`check --stamp` SHALL rewrite an unstamped presence anchor to carry the
current short HEAD (`path:line@rev`) only when the anchor verifies at the
cited line in the working tree (`ok` or `weak-anchor`, or was repointed by
`--fix` in the same run) **and** the cited file, read at HEAD, holds the
quote at the cited line. An anchor that fails in the working tree SHALL NOT
be stamped whatever HEAD holds. HEAD SHALL be resolved once per run. An anchor whose cited file cannot be read at
HEAD, or whose quote is not at the cited line at HEAD, SHALL NOT be stamped
and SHALL be reported as skipped with the reason. When HEAD cannot be
resolved, `check --stamp` SHALL exit 2 without writing any document.

#### Scenario: only claims verified at HEAD are settled

- **WHEN** a document holds (a) an unstamped anchor whose quote is at the
  cited line both in the working tree and at HEAD, (b) an unstamped anchor
  whose quote an uncommitted edit added, so it is at the cited line locally
  but not at HEAD, and (c) an unstamped anchor whose quote an uncommitted
  edit removed, so it is `FABRICATED` locally but present at HEAD, and
  `check --stamp` runs
- **THEN** (a) gains `@<head>`, (b) is byte-identical and reported
  `not-at-rev`, and (c) is byte-identical and still `FABRICATED`

#### Scenario: no commit to claim

- **WHEN** `check --stamp` runs where HEAD cannot be resolved
- **THEN** it exits 2 and no document is written

### Requirement: Fix stale coordinates

`check --fix` SHALL rewrite the cited line number for `DRIFT` and
`WRONG-LINE` results whose anchor carries no `@rev` — the verdicts whose
quote still uniquely identifies real code. It SHALL NOT alter quoted text or
any byte outside the line-number span, SHALL NOT touch any anchor that
carries a `@rev` stamp whatever its verdict, and SHALL NOT touch
`FABRICATED`, `UNPINNED`, or any failing verdict. A marker whose line no
longer parses to the citation the result was computed from SHALL be skipped
and reported.

#### Scenario: drift repaired, fabrication untouched

- **WHEN** a document holds a `DRIFT` result (text moved from line 3 to
  line 1) and `check --fix` runs
- **THEN** the citation now reads `:1`, re-checking yields `OK`, and no other
  byte of the document changed

#### Scenario: a stamped anchor is never repointed

- **WHEN** a document holds a stamped anchor whose commit cannot be read, so
  the checker reports `DRIFT` for it on the fail-open path, and `check --fix`
  runs
- **THEN** that anchor is byte-identical

### Requirement: Machine-readable output

`check --format json` SHALL emit a stable JSON report: one entry per claim
(verdict, document location, citation, detail, `failing` computed by the
same predicate that decides the exit code) plus summary counts including
anchor density and zero-anchor documents by name. The report SHALL carry an
integer `version` field, bumped when a field is renamed or removed or when the
verdict vocabulary grows. The default human output SHALL be unchanged.

#### Scenario: scripting the checker

- **WHEN** `check --format json` runs over passing and failing documents
- **THEN** stdout parses as JSON, the exit code matches the human-mode exit
  code, and each failing claim appears with its verdict string

### Requirement: The funnel names the next command

The final line of `check` output SHALL name the concrete retrofit command
for the largest matched document, in copy-pasteable form, whenever `check`
matches documents but finds zero grounding markers.

#### Scenario: anchorless repo gets a next step

- **WHEN** `check "docs/**/*.md"` matches five documents with no markers
- **THEN** the output ends with a `nullius audit <doc> --propose` invocation
  naming one of them
