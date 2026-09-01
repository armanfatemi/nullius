# check-cli Specification

## Purpose
TBD - created by archiving change add-authoring-ergonomics. Update Purpose after archive.
## Requirements
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
verdict vocabulary grows. Under `--format json` stdout SHALL be exactly one
JSON document on every run, including a run that matched no files; messages
that changed the exit code or the matched set SHALL appear in a `diagnostics`
array, and a non-zero exit SHALL imply `failures > 0`, `markerFloorFailed`, or
a non-empty `diagnostics`. The default human output SHALL be unchanged.

#### Scenario: scripting the checker

- **WHEN** `check --format json` runs over passing and failing documents
- **THEN** stdout parses as JSON, the exit code matches the human-mode exit
  code, and each failing claim appears with its verdict string

#### Scenario: nothing matched is still a document

- **WHEN** `check "no/such/**/*.md" --format json --require-markers` runs
- **THEN** it exits 1, stdout parses as JSON with an empty `documents` array,
  `summary.markerFloorFailed` is true, and `diagnostics[0]` begins with
  `no files matched`

### Requirement: The funnel names the next command

The final line of `check` output SHALL name the concrete retrofit command
for the largest matched document, in copy-pasteable form — replacing, not
following, the `All 0 grounding marker(s) verified.` line — whenever `check`
matches documents but finds zero grounding markers.

#### Scenario: anchorless repo gets a next step

- **WHEN** `check "docs/**/*.md"` matches five documents with no markers
- **THEN** the output ends with a `nullius audit <doc> --propose` invocation
  naming one of them

### Requirement: An unresolvable commit SHALL soften a failing verdict only on a clone that cannot read history

The checker SHALL treat a rev-stamped anchor whose commit does not resolve as
`unverifiable-rev` only when the repository is a shallow clone, or when the
shallowness of the repository cannot be determined. On a repository with full
history, the checker SHALL report the working-tree verdict unchanged,
including its failing verdicts.

The rev in a citation is supplied by the author of the document under test, so
it SHALL NOT by itself determine whether a failure is softened.

#### Scenario: A fabricated claim cannot be rescued by an invented commit

- **WHEN** a document cites text that does not appear in the file, stamped with a commit not present in a full-history clone
- **THEN** the verdict is `fabricated` and the run fails

#### Scenario: A shallow clone still refuses to accuse

- **WHEN** the same anchor is checked in a shallow clone
- **THEN** the verdict is `unverifiable-rev`, the run passes, and the detail names `fetch-depth: 0` as the remedy

#### Scenario: An honest anchor is unaffected either way

- **WHEN** a stamped anchor's quote is present in the working tree and its commit does not resolve
- **THEN** the verdict is the ordinary working-tree verdict, exactly as today

#### Scenario: No git access falls open

- **WHEN** the checker was built or invoked without a rev reader, or git cannot be run
- **THEN** shallowness cannot be determined, and a failing verdict is softened to `unverifiable-rev`

### Requirement: The run SHALL report how many stamps it could not honour

The checker SHALL report the number of rev-stamped anchors whose commit did
not resolve. The count SHALL be advisory and SHALL NOT change the exit code.

#### Scenario: A shallow CI run says so

- **WHEN** a run checks stamped anchors in a shallow clone
- **THEN** the report states how many stamps went unhonoured

### Requirement: A stamped anchor's verdict SHALL NOT depend on the length of its hash

The checker SHALL determine whether a stamped commit exists by asking git
directly, and SHALL NOT infer it from the wording of a path error. A commit
that does not exist SHALL be reported as unresolvable whether its hash is 7
characters or 40.

#### Scenario: The same absent commit, written two ways

- **WHEN** a document cites text present in the working tree, stamped with an absent commit written as 7 hex characters, and the same claim stamped with the same absent commit written as 40
- **THEN** both claims receive the same verdict

#### Scenario: A file genuinely absent at a resolvable commit still fails

- **WHEN** a stamped anchor names a commit that exists and cites a path that was not in it
- **THEN** the verdict is `missing-file-at-rev` and the run fails, unchanged

### Requirement: The git lane SHALL resolve paths from the checked root

The checker SHALL address blobs relative to the directory it was pointed at,
so that a citation refused by the working-tree lane for being outside that
directory is refused by the git lane as well.

#### Scenario: An out-of-scope path is refused on both lanes

- **WHEN** the checker runs in a subdirectory of a repository and a stamped anchor cites a file that exists above that subdirectory, using a path containing no `..`
- **THEN** the citation is not verified against that file

#### Scenario: Running at the repository root is unaffected

- **WHEN** the checked root is the repository root
- **THEN** every stamped anchor resolves exactly as before

