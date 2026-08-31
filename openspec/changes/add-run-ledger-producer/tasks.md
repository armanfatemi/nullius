# Tasks — add-run-ledger-producer

## 0. Prerequisites / setup

- [ ] `pnpm build`; confirm `witness validate spec/fixtures/v0.5-run.jsonl` exits 0 on the fresh build.
- [ ] Capture a real synchronous and a real asynchronous `PostToolUse:Agent` payload and a `SubagentStop` from this machine's `.nullius/probes/` (redact paths) into `spec/fixtures/probes/claude-code/` if the committed corpus lacks the synchronous shape.
- [ ] Temporarily subscribe `UserPromptSubmit` locally with `NULLIUS_WITNESS_PROBE=1`, capture one payload, redact, and commit it to the probe corpus with a README row — before any parser is written.

## 1. Kernel — schema 0.6 and counters (`packages/claims`)

- [ ] Append `"0.6"` to `VERSIONS`; `KINDS_V06 = [...KINDS_V03, "prompt"]`; map `0.6` to it in `VOCABULARY`; derive `type Kind` from `KINDS_V06`, not `KINDS_V03`; add `expects`, `origin`, `text`, `chars`, `hash`, `user` to `JournalRecord.raw`'s key list.
- [ ] `prompt` parser: `text` or (`chars` + `hash`) required, `chars` a non-negative integer, `hash` via `nonEmptyString`; break-on-first like the `stage` case.
- [ ] Per-record `origin`: at ≥0.6, `stage`/`resolution`/`decision`/`check` require `origin: "self-reported"`; absent or any other value is `MALFORMED` naming the record.
- [ ] Header `user.name` non-empty when present at ≥0.6 (same rule and same code path as `branch`).
- [ ] `expects`: closed vocabulary `["findings"]`; a present unknown value is `MALFORMED` at ≥0.6.
- [ ] `SILENT-REVIEWER`: at `versionAtLeast(version, "0.6")`, consider only dispatches with `expects === "findings"`; below 0.6, unchanged.
- [ ] `JournalReport.ledger = { stages, findings, resolutions, checks, decisions, prompts }`; `JournalSurvey.ledger` sums it; print both in the validate and survey summaries.
- [ ] Unit tests, one assertion each, by name: scoped `SILENT-REVIEWER` fires with `expects` and not without at 0.6; fires unscoped at 0.5; `MALFORMED` for a prompt with neither `text` nor `chars`+`hash`; for a non-integer `chars`; for a blank `user.name`; for a coordinator kind missing `origin`; for `expects: "reviews"`; `ledger` counters asserted by value.
- [ ] Fixtures per design Decision 9: `spec/fixtures/v0.6-run.jsonl` (exit 0), `v0.6-broken-run.jsonl` (exit 1, trips every rejection above), `v0.5-compat-run.jsonl` (same bytes as the valid file at `0.5`, exit 1 — the inverted pair for a loosening).
- [ ] `.github/workflows/ci.yml`: add the three to the witness gates with a comment saying why the compat twin fails rather than passes this time.
- [ ] `spec/witness-journal.md`: document `prompt`, per-record `origin`, `expects`, `user`, `model`, `usage`, `usage_source`, `tag`; record 0.6's triggers (1 and 3, with the scoping riding along); add clause 3's mirror — a loosening is also a change to the set of valid records — while keeping all four triggers in the restatement; update the fixture table.

## 2. Kit — finding extraction at the terminal (`packages/kit`)

- [ ] `record.ts`: `extractFindings(text, dispatchId, author)` — the line grammar from Decision 2; pure, unit-tested on the reviewers' own example outputs from `.claude/agents/*.md`.
- [ ] Emit `finding` records after the `report` in the same append, for both terminal paths (synchronous `PostToolUse` and `SubagentStop`), reading the untruncated text.
- [ ] `PreToolUse:Agent`: set `expects: "findings"` on the `dispatch` when `.claude/agents/<subagent_type>.md` exists and contains `[blocker]` under an `## Output format` heading; a missing file or heading leaves the key absent. Bounded file read, off the lock path.
- [ ] Tests in `record.test.ts`: one finding per tag; `[false-premise]` → `blocker` + `tag`; untagged return → no findings; `expects` present only for tag-declaring agents.

## 3. Kit — model and usage on `report`

- [ ] `launchAcknowledgement` returns `resolvedModel` as well as `agentId`; `recordLink` stores it in the links sidecar.
- [ ] Synchronous terminal: `model` and `usage` from `tool_response`; `usage_source: "payload"`.
- [ ] `SubagentStop`: `model` from the sidecar; `usage` summed from `agent_transcript_path` assistant turns under `TRANSCRIPT_BYTE_CAP` and a wall-clock budget strictly below `DEFAULT_WAIT_MS`, read before the lock; `usage_source: "transcript"`; omitted with a stderr note when over budget or unreadable. Both budgets are parameters of the reader (the `identity.ts` seam).
- [ ] Tests: sync payload → fields present; async with a fixture transcript → summed correctly; oversized transcript → fields absent and note printed; under-cap transcript with an injected zero time budget → absent and note printed; no transcript path → absent.

## 3b. Kit and plugin — git user and prompts

- [ ] `identity.ts`: resolve `user.name` via `git config` within `IDENTITY_TIMEOUT_MS` per call and `IDENTITY_BUDGET_MS` total; header gains `user: { name }`; lock-path test in `identity.lock.test.ts` still passes.
- [ ] `plugin/hooks/hooks.json`: add a `UserPromptSubmit` entry routed to `witness-record.sh`. The plugin is the only delivery mechanism for hooks; no other settings file is touched.
- [ ] `record.ts`: `UserPromptSubmit` → one `prompt` record; cap at `EXCERPT_LIMIT` with `truncated`/`chars`; `NULLIUS_WITNESS_PROMPTS=0` → `chars` + `hash`, no `text`; when the payload carries no `prompt_id`, id is `p:<hash of session_id, at, text>` and no later record gets a `prompt` key.
- [ ] `record.ts`: `dispatch` and `mutation` drafts carry `prompt: "p:<prompt_id>"` when the payload has `prompt_id`.
- [ ] `doctor`: the managed-hooks check knows the new event; report "prompts: recorded / hashed only" as a `fact` from the env it can see.
- [ ] Tests in `record.test.ts`: prompt record shape, both modes; the join key on dispatch and mutation; a payload without `prompt_id` leaves the key absent. Replay the new probe through the recorder in the corpus test.

## 4. Kit — `witness ledger` command

- [ ] `witness ledger stage|resolution|decision|check` with flags mirroring the schema's fields; every record written carries `origin: "self-reported"`; `--session` override; `CLAUDE_CODE_SESSION_ID` default; exit 2 with both named when neither is set.
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
- [ ] `IDEAS.md`: retire the "no producer yet" rows; the gap-map absence anchors go loud on their own. Add the follow-up from design Decision 4's known limit: a `wiring` check that every agent named in a skill's `dispatches:` declares the tag contract.
- [ ] `CHANGELOG.md` entries for both packages.
- [ ] `pnpm build && pnpm type-check && pnpm test` (6 ugrep baseline failures only); all dogfood gates both polarities.
- [ ] `node packages/claims/dist/cli.js check 'openspec/changes/add-run-ledger-producer/**/*.md'` passes.
