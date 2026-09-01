# Tasks — add-pr-process-report

Staged along the two seams named in the proposal. Each stage is shippable on
its own.

## 0. Prerequisites / setup

- [x] `pnpm build`.
- [x] Redact this repository's own producing session for PR #58 (`080b1cc9…`) into a committed fixture journal under `spec/fixtures/report/`. **Its actual shape, measured — not the tidier claim an earlier draft made.** Its header says `branch: main` (true, and the reason header-based selection is rejected), but its mutations only *partially* overlap the PR: of 11 mutation paths against PR #58's 13 changed files, 6 of the PR's files are never mutated and 4 mutations (`.claude/agent-memory/**`) are in no pull request at all. That imperfect overlap is what makes it the right fixture — it exercises inclusion and the renderer's range scoping in one journal, with records the bundle carries and the counts exclude. It is also **journal version `0.2`**, which is below the `0.6` ledger floor, so the validator computes no provenance for it at all: the correct rendering is three *not recorded* tiers, not a tier assignment of any kind. A fixture that rendered as hook-attested — or as unattributed — would be the defect, not the baseline.
- [x] Add a second fixture journal for the **inconclusive** case: overlaps the range in time, mutates nothing in it. Synthesised rather than harvested — no such journal is on this machine, and saying so is cheaper than pretending one was found. **Build it from the classification rule (overlap true, touches false), not from the renderer's branches**; a fixture tuned to the code under test proves the code agrees with itself.
- [ ] *(deferred to Stage B — both are renderer inputs; the check glob and whether `oracles` is configured are §4/§5 decisions)* Capture a real `check --format json` document and a real `oracle` human output for the fixture range.

## Stage A — the bundle (`packages/kit`)

### 1. Command + arg parsing

- [x] `witness bundle <base>..<head> [--out <path>] [--include <session>]… [--exclude <session>]… [--no-prompts] [--slack <minutes>]`; range validated with the same grammar `packages/claims/src/oracleGit.ts`'s `parseRange` uses. **Resolve the direction before writing either side:** duplicating the grammar forks it, and exporting it from the kernel contradicts Decision 5's own reason for putting the renderer there (not growing the published surface). Preferred: the kit validates only the *shape* it needs (`<base>..<head>` or a bare revision) and hands the string to the kernel verb unparsed, so there is exactly one parser and it stays internal. If that proves impossible, export `parseRange` and say so in Decision 5 — do not duplicate.
- [x] Changed files and commit times via bounded git calls modelled on `identity.ts` (argument vector, timeout, no shell).

### 2. Selection and redaction

- [x] `classifyJournals(candidates, range)` — pure; returns each candidate with a three-way `classification` (`included` | `inconclusive` | `excluded`) and a `reason`, per Decision 4. Not a boolean: `inconclusive` is a distinct outcome the report renders, not a synonym for excluded.
- [x] **No range filter in the bundler.** Decision 3's prohibition — the envelope carries every source *line*, redaction rewrites a line's fields and never drops a line — is the rule; there is nothing to implement here beyond not implementing it. Range scoping belongs to the renderer (§4).
- [x] `redactLines(lines, { prompts })` — pure, over the journal's **source lines**, not its parsed records. Lines pass through untouched unless they carry a field to redact; a line the validator would reject is carried verbatim, because the `malformed` / `duplicate-id` verdict about it is part of what the bundle is for. Returns the same number of lines in the same order — assert that in the function's own test, because it is the invariant every downstream verdict depends on.
- [x] Redaction, per line, **and only on a line carrying a valid `id`** — a line rejected for a missing id is reported with its own text as the subject (`packages/claims/src/witness.ts:820`), so rewriting it would move the subject of its own `malformed` finding. Preserve `report.findings`' **array length** and cap each entry (they are plain strings with no ids — do not write code that looks one up); cap `finding.text` and `prompt.text`; **cap `report.statement` under a bundle-set flag of its own** — not `truncated`/`response_chars`, which describe the clipped findings entry — and carry those two exactly as the producer set them, never synthesised. No keep-list, no kind enumeration, no closure. No `user.email` handling: the field does not exist upstream, and a strip for it would be a no-op that misleads.
- [x] `--no-prompts` **refuses** when any line in a selected journal fails to parse: exit non-zero, name the session and line numbers, write nothing, and point at `--exclude <session>`. An unparseable prompt line cannot be rewritten, and shipping its text under a flag that promises otherwise is worse than refusing.
- [x] `--no-prompts` **converts** each parseable `prompt` line to the producer's hashed shape — drop `text`, add `hash`, keep `chars` — modelled on `packages/kit/src/record.ts:894-900`. Not emptied: with `text` absent the validator requires `chars` **and** a non-empty `hash` (`packages/claims/src/witness.ts:1448`), so emptying manufactures `malformed`. Not removed either, though removal would validate clean — a converted record still says a prompt occurred and how long it was, and the report claims to show what the human asked for.
- [x] Envelope writer: `{ version: 1, range, selection, journals }`; `selection` carries the rule, the slack, every candidate's classification and reason, and the range's changed-file set (which the renderer scopes by); default path `nullius.runs/<branch-slug>.json`; refuses to write under `.nullius/`.
- [x] Print the selection with reasons; exit 1 when zero journals are `included` and no `--include` given. An `inconclusive` candidate does not satisfy this — the exit says nothing was selected, which is true.

### 3. Tests

- [x] `classifyJournals`: header-says-`main` session classifies `included` by its mutations; a session whose records fall **outside the range's time window** classifies `excluded` (its fixture mutates two in-range files, so the test proves the time gate fires rather than passing because nothing matched); the review-only fixture — overlap yes, touches no — classifies **`inconclusive`** and is asserted by name, not merely as "not included"; `--exclude` recorded as an override. **Note the correction:** an earlier draft of this line asked for a *concurrent* other-worktree session to classify `excluded`, which contradicts Decision 4's table — concurrent means overlap yes, and overlap-yes/touches-no is `inconclusive` by definition. The table governs.
- [x] `redactLines` is line-preserving: given the PR #58 fixture it returns the same line count in the same order, including the four `.claude/agent-memory/**` mutations, which are carried rather than dropped.
- [x] `report.statement` is capped at the stated budget and the bundle's own flag is set; `truncated` and `response_chars` are byte-identical to the source. Assert the flag is a **new** key — a test that accepts `truncated` here would pass the exact mismatch the design refuses.
- [x] A line with a redactable `text` field but no valid `id` is copied byte-for-byte, and its `malformed` finding's subject is identical in source and reconstruction.
- [x] **A journal with an unparseable line round-trips with its verdict.** Fixture: a journal carrying one line of invalid JSON and one duplicate id. Assert the reconstruction still reports `malformed` and `duplicate-id` — this is the case a record-level rule silently dropped, and the reason the rule is stated over lines.
- [x] `--no-prompts`: the converted line validates clean, carries `hash` and `chars`, carries no `text`, and the prompt is still counted as having occurred.
- [x] **Bundling cannot change a verdict, in either direction.** Fixture: a source journal that genuinely reports `stale-verification`. Bundle it, reconstruct, re-validate, and assert the verdict set is **identical** to the source journal's — not merely non-empty. **Compare on `(verdict, subject)` and say so in the test**: `line` shifts with any blank or rejected source line, and `detail` embeds line numbers, so naive deep equality is flaky for a reason that has nothing to do with the property being tested. This is the one test the whole hook-attested tier rests on, and it replaces an earlier draft's fixture that was impossible by construction: that one asked for a `stale-verification` on an out-of-range path while the rule then in force dropped every record for such a path, leaving no verdict to assert.
- [x] `origin` survives redaction on every record — asserted directly, because the tier counts depend on it across a stage boundary and nothing else in the plan checks it.

## Stage B — the report (`packages/claims`)

### 4. `RunReport` and renderers

- [ ] `witnessReport.ts`: `buildRunReport({ bundle, commits, changedFiles, checkRun, oracleReport, journalReports })` — pure; tiers as **four** arrays of sections; every section is `{ status: "data" | "not-recorded", reason? }`.
- [ ] **Read the tier counts off `JournalReport.provenance`; compute nothing.** It is already on `validateJournal`'s return and already exported from `packages/claims/src/index.ts`, so no kernel API change is needed. The renderer must contain no tiering rule of its own — not a `tierOf`, not a kind list, not a header check.
- [ ] **`provenance === null` renders the three bundle tiers as *not recorded*,** naming the journal version and that per-record attribution arrived at `0.6`. Test on the `0.2` fixture **against the structured `RunReport`, not the rendered markdown**: each of the three tier sections has `status: "not-recorded"`, a `reason` naming the version, and **no `count` key at all**. Absence rendered as zero is the failure mode and this asserts against it at the only place it can be asserted cleanly — a string scan for `0` would fire on the version numbers `0.2` and `0.6` that the same task requires the reason to name.
- [ ] Range scoping is the **renderer's**; it applies to the **mutation-derived** tables and the flowchart only, never to the tier counts, and never to kinds that carry no path. Only `mutation`, `verification` and `append` have a path; dispatches, reports, findings, prompts and the ledger kinds are counted in full, and the report states that rather than implying they were scoped. Tier counts are journal-wide because `provenance` is a whole-journal partition with no path predicate (`packages/claims/src/witness.ts:1615-1639`); re-partitioning it by path would be the renderer applying a tiering rule of its own, which Decision 1 forbids. Test on the PR #58 fixture: the four `.claude/agent-memory/**` paths are present in the bundle, absent from the record tables, the excluded count reads 4, and the tier section is unaffected by the range.
- [ ] Round detection (`ROUND_WINDOW_MS`), edit bursts, prompt placement. **Hand-count from the fixture's raw record timestamps, and commit the hand-count as a table in the test file.** Do not use the retrospective's counts as the oracle: the retro records *pipeline stage labels* (`pre_review_1…5`, `stage_6`), not timestamp clusters, so a disagreement between it and `ROUND_WINDOW_MS` would not say which of the two was wrong — and it is prose a model wrote, which is not what a deterministic test is measured against in this repository.
- [ ] `renderMarkdown` with the mermaid `flowchart LR`; `renderJson` with `{ kind: "run-report", version: 1 }` per Decision 14, embedding the check document under its own key with that document's own `version` rather than shadowing it.
- [ ] **Renderer determinism:** no wall-clock value is read inside `buildRunReport` or either renderer — every timestamp comes from a record or a commit. A test renders the same fixture twice and asserts byte equality. Without this the goldens below are non-deterministic by construction, and this repository has no golden-file precedent to inherit one from.
- [ ] Escapers: markdown-cell and mermaid-label; adversarial fixture with `|`, newline, backtick, `]`, `"`, `<`, and a leading control character in a task name, a path, and a prompt. Include a case for `×` (U+00D7) asserting it is replaced with `·` — the allow-list is ASCII `x` per Decision 6, and an earlier draft's `×` would have shipped either reading untested. Drop `::` as an escaping case (`:` is inside the allow-list, so it exercises quoting, not replacement) and keep it only as an explicit quoting case, labelled as such.
- [ ] Truncation at a stated budget with a visible line.

### 5. CLI verb

- [ ] `witness report <range|sha> [--bundle <path>] [--format md|json] [--config]`; bare `<sha>` through `parseRange`.
- [ ] **Exit-code contract per Decision 13: 0 whenever a report was produced, 2 on usage error or unreadable input, never non-zero because a rendered tier contains a failure.** Test: run the verb over a fixture whose code-verified tier fails and assert exit 0 *and* that the failure is visible in the output. This is the contract task 6's `--format json | jq .version` step depends on.
- [ ] Code-verified tier: `check --format json`-equivalent over the PR body file (when given) and touched documents; `checkOracles` via `gitOracleDeps`; `validateJournal` per bundled journal. Call `checkOracles` directly and branch on its `unconfigured` field for the *not configured* row — do not route through the CLI path, which exits 2 on that same field.
- [ ] No bundle → hook-attested, self-reported and unattributed tiers render *not recorded: no bundle at <path>*.
- [ ] Inconclusive candidates from the envelope render in the *not recorded* list with their session ids and the `--include` remedy.
- [ ] Canary: `canary-present` source suppressed; warning never rendered. `describeCanary` is called with `reveal` unset, and a test asserts the rendered report contains neither the document path nor the line for a registered entry — the accessor returns exactly that pair when `reveal` is true, so the call site is what is being tested.

### 6. Tests, fixtures, spec

- [ ] Golden markdown and JSON for the fixture; a second golden for "no bundle". Goldens depend on the determinism task in §4 — write that one first.
- [ ] **Tampered-bundle fixture and test**, discharging `specs/check-cli/spec.md`'s requirement *"Bundled journals are re-validated before any count is rendered from them"* — named by title rather than ordinal, because inserting a requirement renumbers every one after it and an earlier draft of this line cited the wrong position for exactly that reason. It is currently the one scenario with no named coverage: a bundled journal carrying a dispatch with no terminal record renders the validator's finding in place of the hook-attested tier, and **no dispatch count is printed**. Assert the absence of the count, not merely the presence of the finding.
- [ ] `spec/run-report.md`: the four tiers, the three-way selection rule, the line-level redaction rule and the renderer's range scoping, the record → section map, the exit-code contract, and what a green tier does and does not certify — explicitly including that `validateJournal` checks a bundle's internal consistency and never its completeness, so a bundle with whole journals removed validates cleanly. Anchored, since `spec/**` runs under `--require-markers`.
- [ ] CI: `witness report` on the fixture, both with and without the bundle, plus `--format json | jq .kind` and `jq .version`.

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
