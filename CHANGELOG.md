# Changelog

## 0.6.0

Citation rot, and the two verbs the checker could not be.

### Added

- **Rev-stamped anchors: `path/to/file.ts:12@a1b2c3d`.** A citation asserts two
  different things — "this text was in this file" (a fact about the author) and
  "it is on line N of it today" (a fact about the repository) — and the checker
  had only the working tree to settle both. Stamping the commit splits them onto
  two snapshots: the gate runs against the immutable commit with `git show`, so
  a `FABRICATED` there is permanent and can never be excused by a later
  deletion, and the working tree becomes advisory (`STALE`), so no refactor can
  turn an honest document red. Unstamped anchors behave exactly as before.
- **`nullius audit <doc>`** — the entailment half `check` deliberately does not
  certify. Anchored claims are extracted deterministically, then dispatched one
  per agent, starved of the document, the title, and every sibling claim, and
  told to refute. Refutations come back as anchors that `check` re-verifies, so
  no model is in the verification path. `--emit-brief <id>` prints one brief,
  `--extract` pulls unanchored claims out of prose, `--propose` is the older
  confirmation-shaped mode (`eager-prompt` still works and points here).
  `UNVERIFIABLE-BY-SEARCH` is a first-class answer.
- **`nullius witness validate <journal.jsonl>`** — three invariants on the
  record a multi-agent run leaves behind: every dispatch reaches one of three
  terminal states (collapsing "reported nothing" into "never reported" launders
  dead agents into evidence of absence), no verification is relied on after the
  artifact it verified changed, and no append omits what it corrected. Schema:
  [spec/witness-journal.md](spec/witness-journal.md).
- New verdicts: `STALE` (advisory) and `MISSING-FILE-AT-REV` (failing).

### Fixed

- **Four-space indented blocks are quoted context**, like fenced ones. A README
  showing an example anchor in an indented block was asserting it. Indentation
  is measured from the enclosing list item's content column, so four spaces
  under a bullet stays list continuation and is still checked.
- **Markers written as list items are read**, not reported `MALFORMED`.
  Bulleting the evidence under the claim it supports is the natural authoring
  style, and refusing it trained authors away from the marker.

### Notes

- Rev-stamped anchors need the history they name: check out with
  `fetch-depth: 0`. A commit this clone does not have is judged exactly as an
  unstamped anchor would be — against the working tree, failures included — and
  the summary reports how many stamps went unhonoured. A stamp can win an
  anchor the permanent gate; it can never lose it the ordinary one. Squash-merge
  discards the stamped commit, so documents merged that way fall back to the
  ordinary check.
- The git lane reads with `git cat-file`, resolves cited paths relative to the
  checker's root (`<rev>:./<path>`), accepts blobs only, and is bounded by a
  per-read timeout, a 60s run budget, and a capped read cache. Running the
  checker from a subdirectory of a larger repository no longer lets a citation
  read files above the root.

## 0.5.0

A security release. It closes command execution and file-probe holes in the
absence lane, and it is **breaking** — see Migration.

### Security

- **Arbitrary code execution via ripgrep flags.** Allowlisting the binary was
  never enough: `rg --pre <cmd>` runs `<cmd>` against every searched file, and
  the run reported `OK` with exit 0. Commands are now tokenised and every flag
  is checked against a closed per-binary allowlist; unknown flags are refused
  rather than passed through.
- **No shell.** Commands are spawned as a canonical argv vector, never a string.
- **File-probe oracle in the absence lane.** `checkAbsence` never applied the
  repo-path guard that `checkPresence` used, so a search could read any file on
  the runner and the verdict — posted into a PR comment — was the answer. The
  guard now covers both lanes, in three layers: the string check, a refusal of
  any out-of-repo token wherever it appears (so containment does not depend on
  the arity table), and symlink resolution before anything is read or searched.
- **`.git` is off limits, at the walk and not just the operand.** Under
  `actions/checkout` it holds an `AUTHORIZATION: basic <token>` header, and
  anchors are unlimited per document, so each one is a bit. Refusing the written
  path was not enough: `grep -r` never needs the directory named to descend into
  it, and defaults to `.` with no operand at all. Searches now run with
  `--exclude-dir=.git` (grep) or a negated `.git` glob (ripgrep, which skips it
  by default but not under `--hidden`/`--no-ignore`/`-uuu`), and a symlink
  resolving into `.git` is refused.
- **Budgets.** 10s per search, 120s per run, and `RIPGREP_CONFIG_PATH` /
  `GREP_OPTIONS` are stripped from the child environment.
- Flags that make a search vacuous regardless of the pattern (`-q`, `-m 0`,
  `--max-depth 0`, `--max-filesize 0`) are refused, as is a null byte anywhere
  in a command (which previously crashed the whole run).

### Verdicts

- **The line number is now a hint, not an assertion.** `WRONG-LINE` and `DRIFT`
  pass, reporting the delta. A citation asserts two things on two axes: "this
  text is in this file" is a claim about the author that can be fabricated and
  can never later become false, while "it is on line N" is a claim about the
  repository that goes stale whenever someone inserts a line above it.
  Hard-failing the second turns a correct document red on an unrelated
  refactor, which is what gets `continue-on-error` added to a workflow.
  `FABRICATED` still fails permanently.
- New failing verdict `UNPINNED`, the guard on that relaxation: a quote that
  matches SEVERAL lines and is on none of them at the cited line identifies
  nothing on either axis. Length alone never fails a claim — a short quote
  matching exactly one line still pins that line, and re-reading the file can
  still contradict it. Distinctiveness prefers exact whole-line matches, so
  appending a trailing comment to a copy of a cited line does not make the
  original quote "ambiguous".
- `WEAK-ANCHOR` (passing) covers both quality signals: a quote shorter than
  `minAnchorChars`, or one matching several lines while still sitting on its
  cited line.
- `--require-markers` is now a **per-document** floor. Previously one anchored
  document licensed every unanchored document in the glob.
- New passing verdict `WEAK-ANCHOR`: the quote is true but too short
  (`minAnchorChars`, default 8) or too repeated to identify the cited line.
- Absence claims report `SEARCH-CLEAN` rather than `OK` — a search certifies the
  search, never the absence.
- A zero-result absence search is re-run with a match-anything pattern as a
  reachability control; if that also returns zero the search examined nothing
  and the verdict drops to `ADVISORY`.
- The summary counts presence and search anchors separately.

### Authoring

- A quote may be a fenced block under the marker; a multi-line block must match
  consecutively from the cited line.
- Fences track their delimiter and length (CommonMark), so neither a ``` inside
  a ~~~ block nor a ``` inside a ```` block flips the rest of the document
  between asserting and quoting.

### Migration

- **`WRONG-LINE` no longer fails**, and a new `UNPINNED` verdict does. Documents
  that were red only from line drift go green; a doc whose anchors match several
  lines and sit on none of them goes red. `driftWindow` now only chooses between
  two passing verdicts, so it no longer affects the exit code.
- **Shell globs are no longer expanded.** `grep -rn x src/*.ts` now reports a
  missing file instead of silently matching. Use `-r` with `--include=`/`-g`.
- **`exclude` is a glob against the full repo-relative path**, not a basename.
  `"review-log.md"` now matches only the root-level file; use
  `"**/review-log.md"` for the previous behaviour.
- **A pattern that looks like an absolute path is refused.** Write
  `grep -rn 'api/v1/users' src/` rather than `'/api/v1/users'`.
- **`searchTimeoutMs: 0` is rejected** rather than silently failing every search.
- Library API: `CheckDeps.runSearch` takes a parsed `SearchPlan` instead of a
  command string, and the `Verdict` union gained members.

## 0.4.0

Initial release: Evidence Anchors spec, deterministic checker, GitHub Action,
Claude Code plugin.
