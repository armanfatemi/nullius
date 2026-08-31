# nullius

Deterministic checkers for agent-written claims. The thesis is that a model
should only ever *propose*; verification is always code. Keep that boundary —
if a change puts a model in the verification path, it is the wrong change.

## Commands

```sh
pnpm build        # required before any CLI use — dist/ is what the CLIs run
pnpm type-check
pnpm test
```

**`pnpm build` first, always.** The CLIs run from `dist/`, so an unbuilt tree
validates the *previous* version of the code and reports success on work that
does not exist yet.

## Known-environmental test failures

`src/flagConformance.test.ts` fails **6 tests** on machines where `grep` is
ugrep (macOS with ugrep installed). This is a real difference between the
declared flag table and the local binary, not a regression. Do not chase it,
and do not "fix" the table to match — CI runs real GNU grep and ripgrep.

Baseline: everything else passes. If you see 6 failures and they are all in
that file, you have not broken anything.

## Evidence Anchors — the house rule

Load-bearing claims about existing code carry a citation a checker re-verifies:

```markdown
**Evidence:** `path/to/file.ts:88@a1b2c3d` — `const result = await retry(...)`
```

**Rev-stamp anchors in `openspec/changes/**` from the start.** Get the hash
with `git rev-parse --short HEAD` when you read the file. A change proposal
cites code it is *about to modify*, so an unstamped anchor there is designed to
rot — a design doc quoting a line as the reason to delete it becomes
`FABRICATED` the moment the change lands. With a stamp, the immutable claim
stays a hard gate and only the line number goes advisory (`STALE`).

Never repoint a line number while keeping an old stamp: that turns an advisory
`STALE` into a hard `FABRICATED`, because the text was not there at that commit.

**Squash-merge destroys the commit a stamp names.** This repo merges PRs with
merge commits for that reason — a squash leaves every anchor stamped against a
branch commit unreachable from `main`, and the checker then fails open with the
advisory `UNVERIFIABLE-REV`: CI stays green while the hard gate silently stops
existing. If a PR is squashed anyway, re-pin its anchors to the squash commit.

Verify with the tool, never by hand — a line-by-line script only knows "does
line N match" and misses `FABRICATED` / `WEAK-ANCHOR` / `UNPINNED` / `DRIFT`:

```sh
node packages/claims/dist/cli.js check 'spec/**/*.md' --require-markers
node packages/claims/dist/cli.js check 'openspec/**/*.md'
```

## Dogfooding gates (CI runs all of these)

```sh
# every fixture, including the ones that must FAIL
node packages/claims/dist/cli.js witness validate spec/fixtures/valid-run.jsonl      # exit 0
! node packages/claims/dist/cli.js witness validate spec/fixtures/broken-run.jsonl   # exit 1
```

A fixture that stops failing is a checker that went quiet. When you add a
verdict, add a fixture that trips it — and assert the property in a unit test
too, because CI only checks the broken fixture's *exit code*, which stays 1
even if your new verdict never fires.

## This repo records its own runs

`.nullius/` is the opt-in marker; see `.nullius/README.md`. Hooks come from the
**plugin**, and `.claude/settings.json` carries only `NULLIUS_KIT_BIN`.

**Never write witness hook entries into `.claude/settings.json`.** One delivery
mechanism per artifact: duplicating a plugin-delivered hook gives `doctor` two
paths it cannot tell apart.

## OpenSpec

Changes live in `openspec/changes/<name>/` as proposal → design → specs →
tasks. `openspec validate <change>` gates them.

Its requirement check reads **only the first line** of a requirement body for
SHALL/MUST. A requirement whose modal verb wraps to line 2 fails with a
misleading "must contain SHALL or MUST". Put the verb on the first line.
