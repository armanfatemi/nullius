# Tasks — add-run-ledger-producer

## 0. Prerequisites / setup

- [ ] `pnpm build`; confirm `witness validate spec/fixtures/v0.5-run.jsonl` exits 0 on the fresh build.
- [ ] Capture a real synchronous and a real asynchronous `PostToolUse:Agent` payload and a `SubagentStop` from this machine's `.nullius/probes/` (redact paths) into `spec/fixtures/probes/claude-code/` if the committed corpus lacks the synchronous shape.
- [ ] Temporarily subscribe `UserPromptSubmit` locally with `NULLIUS_WITNESS_PROBE=1`, capture one payload, redact, and commit it to the probe corpus with a README row — before any parser is written.

## 1. Kernel — schema 0.6 and counters (`packages/claims`)

- [ ] Append `"0.6"` to `VERSIONS`; `KINDS_V06 = [...KINDS_V03, "prompt"]`; map `0.6` to it in `VOCABULARY`.
- [ ] `prompt` parser: `text` or (`chars` + `hash`) required, `chars` a non-negative integer; header `user.name` / `user.email` non-empty when present at ≥0.6 (same rule as `branch`).
- [ ] `SILENT-REVIEWER`: at `versionAtLeast(version, "0.6")`, skip dispatches whose `raw.expects !== "findings"`; below 0.6, unchanged.
- [ ] Add `stages`, `findings`, `resolutions`, `checks`, `decisions` to `JournalReport`; print them in `runWitnessValidate`'s summary line.
- [ ] Unit tests: the scoped verdict fires on an `expects: "findings"` dispatch with a `found` terminal and no finding; does not fire on the same records without `expects`; still fires unscoped at `0.5`. Counters asserted by name.
- [ ] Fixture pair `spec/fixtures/v0.6-run.jsonl` / `v0.6-broken-run.jsonl` plus a `v0.5-compat` twin of the broken file that must exit 1 (the same bytes, older version — the pair is what proves the floor).
- [ ] `.github/workflows/ci.yml`: add the pair to the witness gates.
- [ ] `spec/witness-journal.md`: document `expects`, `model`, `usage`, `usage_source`, `tag`, and 0.6's trigger; keep all four triggers in the restatement.

## 2. Kit — finding extraction at the terminal (`packages/kit`)

- [ ] `record.ts`: `extractFindings(text, dispatchId, author)` — the line grammar from Decision 2; pure, unit-tested on the reviewers' own example outputs from `.claude/agents/*.md`.
- [ ] Emit `finding` records after the `report` in the same append, for both terminal paths (synchronous `PostToolUse` and `SubagentStop`), reading the untruncated text.
- [ ] `PreToolUse:Agent`: set `expects: "findings"` on the `dispatch` when `.claude/agents/<subagent_type>.md` exists and contains `[blocker]` under an `## Output format` heading; a missing file or heading leaves the key absent. Bounded file read, off the lock path.
- [ ] Tests in `record.test.ts`: one finding per tag; `[false-premise]` → `blocker` + `tag`; untagged return → no findings; `expects` present only for tag-declaring agents.

## 3. Kit — model and usage on `report`

- [ ] `launchAcknowledgement` returns `resolvedModel` as well as `agentId`; `recordLink` stores it in the links sidecar.
- [ ] Synchronous terminal: `model` and `usage` from `tool_response`; `usage_source: "payload"`.
- [ ] `SubagentStop`: `model` from the sidecar; `usage` summed from `agent_transcript_path` assistant turns under `TRANSCRIPT_BYTE_CAP` and a wall-clock budget strictly below `DEFAULT_WAIT_MS`, read before the lock; `usage_source: "transcript"`; omitted with a stderr note when over budget or unreadable.
- [ ] Tests: sync payload → fields present; async with a fixture transcript → summed correctly; oversized transcript → fields absent and note printed; no transcript path → absent.

## 3b. Kit and plugin — git user and prompts

- [ ] `identity.ts`: resolve `user.name` / `user.email` via `git config` within `IDENTITY_TIMEOUT_MS` per call and `IDENTITY_BUDGET_MS` total; header gains `user`; lock-path test in `identity.lock.test.ts` still passes.
- [ ] `plugin/hooks/hooks.json`: add `UserPromptSubmit` → `witness-record.sh` (plugin-delivered only; nothing in `.claude/settings.json`).
- [ ] `record.ts`: `UserPromptSubmit` → one `prompt` record; cap at `EXCERPT_LIMIT` with `truncated`/`chars`; `NULLIUS_WITNESS_PROMPTS=0` → `chars` + `hash`, no `text`.
- [ ] `record.ts`: `dispatch` and `mutation` drafts carry `prompt: "p:<prompt_id>"` when the payload has `prompt_id`.
- [ ] `doctor`: the managed-hooks check knows the new event; report "prompts: recorded / hashed only" as a `fact` from the env it can see.
- [ ] Tests in `record.test.ts`: prompt record shape, both modes; the join key on dispatch and mutation; a payload without `prompt_id` leaves the key absent. Replay the new probe through the recorder in the corpus test.

## 4. Kit — `witness ledger` command

- [ ] `witness ledger stage|resolution|decision|check` with flags mirroring the schema's fields; `--session` override; `CLAUDE_CODE_SESSION_ID` default; exit 2 with both named when neither is set.
- [ ] Validate closed vocabularies and required fields before appending, using the kernel's exported constants where they exist and adding exports where they do not (`SEVERITIES`, `RESOLUTION_OUTCOMES`, `CHECK_OUTCOMES`).
- [ ] Append under the lock via `appendRecords`; ids `s:`/`res:`/`dec:`/`c:` + short hash.
- [ ] `witness ledger findings [--open]`: list this session's `finding` records (id, severity, author, text), `--open` filtering to blockers with no `resolution`.
- [ ] Move `SCHEMA_VERSION` to `"0.6"`, with a comment stating why this change is the one that moves it.
- [ ] Tests in `witness.cli.test.ts`: each kind round-trips and validates; a bad `--outcome` is refused before any write; a missing session refuses; `findings --open` lists exactly the unanswered blockers.
- [ ] CI round-trip step: after the existing parallel `witness record` gate, append one `stage`, one `resolution` against an extracted finding, one `check`, and validate — and assert `SUPPRESSED-FINDING` fires when the resolution is omitted.

## 5. Skill — `proposal-to-pr` emits records

- [ ] Stage transitions: `witness ledger stage --phase <stage> --iteration <n> --change <name>` next to each `state-set stage`.
- [ ] Stage 3 / Stage 7: for each finding addressed, `witness ledger findings --open` then one `resolution` per id; `duplicate`/`folded-in` carry `--merges-into`.
- [ ] Stage 5: one `check` per verify chunk mirroring the existing `evidence-append "Stage 5 — Verify"` body.
- [ ] Design decisions written in `design.md` get a `decision` record with `--resolves "Decision N"`.
- [ ] Update the prose subcommand list and the stage-8 checklist; `nullius wiring` passes.

## 6. Documentation, exports, verification

- [ ] `packages/kit/README.md` and `README.md` witness section: the producer exists; what is hook-extracted vs self-reported.
- [ ] `IDEAS.md`: retire the "no producer yet" rows; the gap-map absence anchors go loud on their own.
- [ ] `CHANGELOG.md` entries for both packages.
- [ ] `pnpm build && pnpm type-check && pnpm test` (6 ugrep baseline failures only); all dogfood gates both polarities.
- [ ] `node packages/claims/dist/cli.js check 'openspec/changes/add-run-ledger-producer/**/*.md'` passes.
