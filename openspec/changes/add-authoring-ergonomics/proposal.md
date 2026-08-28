# Add authoring ergonomics — stamp, fix, machine output

## Why

Both design reviews reached the same verdict from opposite directions: the
roadmap grew toward the vision and away from the daily user. The items that
make a linter loved rather than tolerated are deterministic, small, and
already half-promised — the README's own roadmap calls unstamped anchors "the
last piece of clerical work":

**Evidence:** `README.md:414@87eb675` — `pass that fills in the commit for anchors that verify against the`

And on `DRIFT`/`WRONG-LINE`, the checker already computes the correct line
and then makes the human type it. Meanwhile there is no machine-readable
output at all — a prerequisite for editor integration, PR annotations, and
the eventual App, and a day-one need for anyone scripting around the tool.

These are kernel-only changes, independent of every other proposal.

## What Changes

- **`check --stamp`** (kernel): for every anchor that verifies against the
  working tree and carries no `@rev`, rewrite it in place with the current
  short HEAD. One git read per run; anchors that do not verify are left
  untouched (stamping an unverified claim would launder it).
- **`check --fix`** (kernel): rewrite the line number for `DRIFT` and
  `WRONG-LINE` verdicts — the verdicts where the quote still uniquely
  identifies real code and only the coordinate is stale. Never touches
  `FABRICATED`, `UNPINNED`, any `@rev`-stamped anchor, or the quoted text:
  the tool fixes citations, not claims. Composes with `--stamp` in one pass. (Subsumes issues #7 and the
  `--fix` half of #4.)
- **`check --format json`** (kernel): stable machine output — one object per
  claim result plus the summary counts (anchor density, unanchored docs, the
  three-way outcome counts from `witness validate`'s sibling philosophy).
  Human output unchanged and default.
- **Per-command help and the funnel** (kernel): each command gets `--help`
  with one example invocation; philosophy stays at one line per command, the
  essays stay in the specs. When `check` finds zero grounding markers in a
  repo, its last line names the next command to run (`nullius audit <doc>
  --propose`) instead of only a spec URL — the bridge from demo to first
  anchor, wired.

## Impact

- Affected specs: `check-cli` (new capability spec covering the check
  command's surface).
- Affected code: kernel only (`cli.ts`, `cliArgs.ts`, `checkClaims.ts`,
  `parseClaims.ts`, `runners.ts`, a small rewrite module for
  `--stamp`/`--fix`). The per-command parser from the archived
  add-init-doctor change has landed; per-command `--help` builds on it.
- `--fix` and `--stamp` write to checked documents — the one place the kernel
  edits user files. Writes are confined to marker lines whose current content
  the checker just read; a marker that changed between read and write is
  skipped and reported, not overwritten.
- Delivers what issues #7 and #4 (the `--fix` half) asked for. Both are
  already closed; the PR comments on them rather than closing anything.
  Issue #6 (`--eager`) is unrelated and not addressed here. The severity-separation half of #4 is
  not addressed here. The Action adopts the JSON output only after a release
  ships it.
