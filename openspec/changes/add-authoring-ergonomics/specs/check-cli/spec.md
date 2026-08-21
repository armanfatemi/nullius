# Check CLI — stamping, fixing, machine output

## ADDED Requirements

### Requirement: Stamp verified anchors

`check --stamp` SHALL rewrite each unstamped presence anchor that verifies
against the working tree to carry the current short HEAD (`path:line@rev`),
reading git once per run. Anchors that do not verify SHALL NOT be stamped.

#### Scenario: only verified claims are settled

- **WHEN** a document holds one `OK` unstamped anchor and one `FABRICATED`
  anchor and `check --stamp` runs
- **THEN** the `OK` anchor gains `@<head>` and the `FABRICATED` anchor is
  byte-identical, still failing

### Requirement: Fix stale coordinates

`check --fix` SHALL rewrite the cited line number for `DRIFT` and
`WRONG-LINE` results — the verdicts whose quote still uniquely identifies
real code. It SHALL NOT alter quoted text and SHALL NOT touch `FABRICATED`,
`UNPINNED`, or any failing verdict. A marker whose content changed between
read and write SHALL be skipped and reported.

#### Scenario: drift repaired, fabrication untouched

- **WHEN** a document holds a `DRIFT` result (text moved from line 3 to
  line 1) and `check --fix` runs
- **THEN** the citation now reads `:1`, re-checking yields `OK`, and no other
  byte of the document changed

### Requirement: Machine-readable output

`check --format json` SHALL emit a stable JSON report: one entry per claim
(verdict, document location, citation, detail) plus summary counts including
anchor density and zero-anchor documents by name. The default human output
SHALL be unchanged.

#### Scenario: scripting the checker

- **WHEN** `check --format json` runs over passing and failing documents
- **THEN** stdout parses as JSON, the exit code matches the human-mode exit
  code, and each failing claim appears with its verdict string

### Requirement: The funnel names the next command

When `check` matches documents but finds zero grounding markers, its final
line SHALL name the concrete retrofit command for the largest matched
document, in copy-pasteable form.

#### Scenario: anchorless repo gets a next step

- **WHEN** `check "docs/**/*.md"` matches five documents with no markers
- **THEN** the output ends with a `nullius audit <doc> --propose` invocation
  naming one of them
