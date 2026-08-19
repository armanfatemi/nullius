# Changelog

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
- **`.git` is off limits.** Under `actions/checkout` it holds an
  `AUTHORIZATION: basic <token>` header, and anchors are unlimited per document.
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
- New failing verdict `UNPINNED`, the guard on that relaxation: a quote that is
  neither distinctive (`minAnchorChars`) nor on its cited line pins nothing
  down. A weak quote that IS on its cited line stays the passing
  `WEAK-ANCHOR`.
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
  that were red only from line drift go green; a doc whose anchors are both
  vague and mislocated goes red.
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
