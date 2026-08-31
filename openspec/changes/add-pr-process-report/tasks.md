# Tasks — add-pr-process-report

Staged along the two seams named in the proposal. Each stage is shippable on
its own.

## 0. Prerequisites / setup

- [ ] `pnpm build`.
- [ ] Redact this repository's own producing session for PR #58 (`080b1cc9…`) into a committed fixture journal under `spec/fixtures/report/` — the one real journal whose header says `main` while its mutations are the PR's files.
- [ ] Capture a real `check --format json` document and a real `oracle` human output for the fixture range.

## Stage A — the bundle (`packages/kit`)

### 1. Command + arg parsing

- [ ] `witness bundle <base>..<head> [--out <path>] [--include <session>]… [--exclude <session>]… [--no-prompts] [--slack <minutes>]`; range validated with the same grammar `oracleGit.parseRange` uses (exported, or duplicated with a test pinning parity).
- [ ] Changed files and commit times via bounded git calls modelled on `identity.ts` (argument vector, timeout, no shell).

### 2. Selection and redaction

- [ ] `selectJournals(candidates, range)` — pure; time-overlap ∩ mutation-path rule; returns each candidate with `included` and `reason`.
- [ ] `redactJournal(records, { prompts })` — pure; the keep/strip table from Decision 4; header `user.email` dropped.
- [ ] Envelope writer: `{ version: 1, range, selection, journals }`; default path `nullius.runs/<branch-slug>.json`; refuses to write under `.nullius/`.
- [ ] Print the selection with reasons; exit 1 when zero journals selected and no `--include` given.

### 3. Tests

- [ ] `selectJournals`: header-says-`main` session is selected by its mutations; concurrent other-worktree session is not; `--exclude` recorded as override.
- [ ] `redactJournal`: no `findings` bodies survive; `finding.text` capped; `--no-prompts` removes every `prompt`; `user.email` absent.
- [ ] Round trip: envelope → per-journal JSONL → `validateJournal` exits clean for the fixture.

## Stage B — the report (`packages/claims`)

### 4. `RunReport` and renderers

- [ ] `witnessReport.ts`: `buildRunReport({ bundle, commits, changedFiles, checkRun, oracleReport, journalReports })` — pure; tiers as three arrays of sections; every section is `{ status: "data" | "not-recorded", reason? }`.
- [ ] Round detection (`ROUND_WINDOW_MS`), edit bursts, prompt placement; unit-tested on the fixture journal against hand-counted values (the retro's own counts for PR #58 are the oracle).
- [ ] `renderMarkdown` with the mermaid `flowchart LR`; `renderJson` with `version: 1`.
- [ ] Escapers: markdown-cell and mermaid-label; adversarial fixture with `|`, newline, backtick, `::`, `]`, `"` in a task name, a path, and a prompt.
- [ ] Truncation at a stated budget with a visible line.

### 5. CLI verb

- [ ] `witness report <range|sha> [--bundle <path>] [--format md|json] [--config]`; bare `<sha>` through `parseRange`.
- [ ] Code-verified tier: `check --format json`-equivalent over the PR body file (when given) and touched documents; `checkOracles` via `gitOracleDeps`; `validateJournal` per bundled journal. `oracles` unconfigured → *not configured* row.
- [ ] No bundle → hook-attested and self-reported tiers render *not recorded: no bundle at <path>*.
- [ ] Canary: `canary-present` source suppressed; warning never rendered.

### 6. Tests, fixtures, spec

- [ ] Golden markdown and JSON for the fixture; a second golden for "no bundle".
- [ ] `spec/run-report.md`: the tiers, the selection rule, the record → section map, what a green tier does and does not certify; anchored, since `spec/**` runs under `--require-markers`.
- [ ] CI: `witness report` on the fixture, both with and without the bundle, plus `--format json | jq .version`.

## Stage C — Action, init, doctor, dogfood

### 7. Action

- [ ] Input `run-report` (default `'false'`); step runs `witness report "$BASE..$HEAD" --bundle "$BUNDLE" --format md`, PR body via `jq` from the event payload as the checker step does.
- [ ] Second upsert block under `<!-- nullius-run-report -->`; version read first for the JSON artefact; failed post surfaced in the step summary.
- [ ] Upload the JSON form as a workflow artefact.
- [ ] `action/README.md`: the input, the tiers, what the report does not claim.

### 8. init / doctor

- [ ] `init --run-report`; `nullius.kit.json` `runReport`; `renderWorkflow` emits the input; `readKitProfile` reads the key.
- [ ] `doctor`: `run report` check per Decision 10; `--fix` re-renders.
- [ ] Tests in `init.test.ts` / `doctor.test.ts`: flag → config → workflow; config-without-input fails; absent config is a fact.

### 9. Skill and dogfood

- [ ] `proposal-to-pr` Stage 8: bundle, commit, push before `gh pr create`; subcommand list updated; `nullius wiring` clean.
- [ ] This repository's CI: run `./action` on pull requests with `run-report: true` (first time the Action runs in CI at all) — or, if the composite action cannot be exercised on `pull_request` from the same repo, a job that runs the verb and posts through the same script.
- [ ] `docs/`: a short maintainer-facing page — how to read the report, which tier to trust for what.
- [ ] `CHANGELOG.md` for both packages and the Action.

## 10. Verification

- [ ] `pnpm build && pnpm type-check && pnpm test` (6 ugrep baseline failures only); dogfood gates both polarities.
- [ ] `node packages/claims/dist/cli.js check 'openspec/changes/add-pr-process-report/**/*.md'` passes; `check 'spec/**/*.md' --require-markers` passes with the new spec.
