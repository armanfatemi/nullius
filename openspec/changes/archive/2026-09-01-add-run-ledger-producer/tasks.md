# Tasks — add-run-ledger-producer

## 0. Prerequisites / setup

- [x] `pnpm build`; confirm `witness validate spec/fixtures/v0.5-run.jsonl` exits 0 on the fresh build.
- [ ] Capture a real synchronous and a real asynchronous `PostToolUse:Agent` payload and a `SubagentStop` from this machine's `.nullius/probes/` (redact paths) into `spec/fixtures/probes/claude-code/` if the committed corpus lacks the synchronous shape.
- [ ] Temporarily subscribe `UserPromptSubmit` locally with `NULLIUS_WITNESS_PROBE=1`, capture one payload, redact, and commit it to the probe corpus with a README row — before any parser is written.

> **Both capture items are BLOCKED on a human step, and shipped unticked.**
> The repository's `plugin/` directory is the marketplace *source*, not what
> runs: the installed plugin resolves to `~/.claude/plugins/cache/nullius/nullius/0.1.0`,
> pinned to a commit four `plugin/` commits ago and already drifted. The
> `UserPromptSubmit` entry this change adds therefore cannot fire until the
> plugin is reinstalled from the directory marketplace and a new session
> starts. The two ways to fake it were refused rather than taken: hand-editing
> the cache desynchronises the installed artefact from its recorded
> `gitCommitSha`, and a hook entry in `.claude/settings.json` is what
> `one-delivery-mechanism` forbids.
>
> **Consequence carried into the PR:** `record.ts`'s prompt parser reads the
> text from a documented assumption (`PROMPT_TEXT_KEYS`, with a ⚠️ comment
> pointing here), and no fixture asserts a payload shape nobody has observed.
> The first real capture may require a one-line change to that key list.

## 1. Kernel — schema 0.6 and counters (`packages/claims`)

- [x] Append `"0.6"` to `VERSIONS`; `KINDS_V06 = [...KINDS_V03, "prompt"]`; map `0.6` to it in `VOCABULARY`; derive `type Kind` from `KINDS_V06`, not `KINDS_V03`; add `expects`, `origin`, `text`, `chars`, `hash`, `user` to `JournalRecord.raw`'s key list.
- [x] `prompt` parser: `text` or (`chars` + `hash`) required, `chars` a non-negative integer, `hash` via `nonEmptyString`; break-on-first like the `stage` case.
- [x] Per-record `origin`: at ≥0.6, `stage`/`resolution`/`decision`/`check` require `origin: "self-reported"`; absent or any other value is `MALFORMED` naming the record. Do not reuse the header's `ORIGINS` list for this check — it would accept `"hooks"` on a `resolution`.
- [x] Header `user.name`: its own branch in `scanHeader` (not added to `IDENTITY_FIELDS`, whose loop records at every declared version and rejects only at ≥0.4, and which is flat and string-typed); records `user.name` at every version; at ≥0.6 reports `MALFORMED` naming the field when `name` is blank **or when `user` is present but is not an object carrying a string `name`** — an unrecognised shape fails closed, as `expects` does.
- [x] `expects`: closed vocabulary `["findings"]`; a present unknown value is `MALFORMED` at ≥0.6.
- [x] `SILENT-REVIEWER`: at `versionAtLeast(version, "0.6")`, consider only dispatches with `expects === "findings"`; below 0.6, unchanged.
- [x] `JournalReport.ledger: { stages, findings, resolutions, checks, decisions, prompts } | null` and `JournalReport.provenance: { hooks, selfReported, unattributed } | null` — both computed in `witness.ts` and **`null` below 0.6**, so the floor is decided once, in the kernel, by the existing private `versionAtLeast`; `cli.ts` compares no versions and renders each block only when non-null. `unattributed` counts records with no origin of their own under a header whose origin is null or absent.
- [x] `JournalSurvey.ledger` and `.provenance` are the same two blocks, `| null` — summed over the journals that reached the floor, and **`null` when none did**, so an all-0.5 survey prints no counts rather than zeros (a sum is not an absence). The survey renderer renders on presence, exactly as `validate` does.
- [x] `runWitnessValidate`'s header sentence (`packages/claims/src/cli.ts:681` at c8305b1): when `report.provenance` is non-null, the `hooks` branch is scoped to "records carrying no origin of their own" and followed by the three counts; the `self-reported` and default branches likewise print the counts; when null, every branch is unchanged. Characterization test pins a 0.5 and a 0.6 rendering.
- [x] `versionAtLeast`'s JSDoc call-site count updated to the new total; the predicate stays private.
- [x] Sweep the header-origin prose that states the old meaning: `witness.ts:31-33` module comment and `JournalHeader.origin`'s JSDoc say "for records carrying no origin of their own" at ≥0.6.
- [x] Append `"0.6"` **last** in `VOCABULARY` — insertion order drives the "arrived in schema X" message, as `VERSIONS` order already does.
- [x] Unit tests, one assertion each, by name: scoped `SILENT-REVIEWER` fires with `expects` and not without at 0.6; fires unscoped at 0.5; `MALFORMED` for a prompt with neither `text` nor `chars`+`hash`; for a non-integer `chars`; for a blank `user.name`; for `user: "Arman"` and `user: {}` (unrecognised shape); for a coordinator kind missing `origin`; for a coordinator kind with `origin: "hooks"` (wrong-but-present); for `expects: "reviews"`; `ledger` and `provenance` asserted by value at 0.6 and asserted `null` at 0.5; a survey of only sub-0.6 journals asserted `null` (not zeros); `provenance.unattributed` counts under a header with no origin; the 0.5 twin's unknown `prompt` arrives with the "arrived in schema 0.6" message.
- [x] Fixtures: `spec/fixtures/v0.6-run.jsonl` (exit 0), `v0.6-broken-run.jsonl` (exit 1 — trips **every** rejection in the unit-test line above; that line is the authoritative list and design Decision 9 mirrors it), `v0.5-compat-run.jsonl` (same bytes as the valid file at `0.5`, exit 1 — the inverted pair for a loosening).
- [x] `.github/workflows/ci.yml`: add the three to the witness gates with a comment saying why the compat twin fails rather than passes this time, and that it fails for two reasons — the exit code does not isolate the loosening; the "fires unscoped at 0.5" unit test does.
- [x] `spec/witness-journal.md`: document `prompt`, per-record `origin`, `expects`, `user`, `model`, `usage`, `usage_source`, `tag`; record 0.6's triggers (1 and 3, with the scoping riding along); add the loosening as trigger 5 — a loosening is also a change to the set of valid records — so the restatement carries all five with clauses 1-4 unmoved; update the fixture table.
- [x] Settle which document is canonical, because two currently claim it: `spec/witness-journal.md` ("This is the canonical statement of the rule") and `openspec/specs/witness/spec.md` ("These four triggers are the canonical statement"). **`spec/witness-journal.md` wins** — it is the published spec the README sends readers to, and it carries the fixture table and version history. The openspec capability spec gains a sentence saying it restates it.
- [x] Append the loosening as trigger **5**, never insert it: clauses 1-4 keep the positions six existing citations name (`spec/witness-journal.md:402,407,411,413` and `CHANGELOG.md:117,120`, which discuss "clause 4" meaning the new-verdict trigger). Then sweep every restatement in the same commit — `spec/witness-journal.md`, the delta's MODIFIED requirement, and any restatement in `CHANGELOG.md` or the kernel's JSDoc — so none is four-of-five at any point. Re-read those six citations afterwards and confirm each still refers to the clause it means.

## 2. Kit — finding extraction at the terminal (`packages/kit`)

- [x] `record.ts`: `extractFindings(text, dispatchId, author)` — the line grammar from Decision 2; pure, unit-tested on the reviewers' own example outputs from `.claude/agents/*.md`.
- [x] Emit `finding` records after the `report` in the same append, for both terminal paths (synchronous `PostToolUse` and `SubagentStop`), reading the untruncated text.
- [x] `RecordContext` gains `readAgentDefinition(subagentType): string | null` and `readTranscriptUsage(path, budgets): Usage | null`; `record.ts` stays free of `node:fs`; `cli.ts` implements both beside `locateTarget`; `record.test.ts` stubs them.
- [x] `PreToolUse:Agent`: validate `subagent_type` against `^[A-Za-z0-9][A-Za-z0-9._-]*$` before any path is built (the same shape `isSafeChangeName` enforces); an unsafe value reads nothing. Then set `expects: "findings"` on the `dispatch` when `readAgentDefinition` returns text containing `[blocker]` under an `## Output format` heading. The dispatch also records `agent_definition: "read" | "missing" | "unreadable" | "unsafe-name"` — metadata no verdict reads — so a miss is distinguishable in the file from "not a reviewer". Bounded file read, off the lock path.
- [x] The four reviewer agent files' `## Output format` sections gain: "A review with nothing to raise returns at least one `[looks-good]` line; an untagged return is recorded as silent." `nullius wiring .` passes afterwards.
- [x] Tests in `record.test.ts`: one finding per tag; `[false-premise]` → `blocker` + `tag`; untagged return → no findings; `expects` present only for tag-declaring agents; each of `agent_definition`'s four values asserted by name (`read` from a tag-declaring stub, `missing` from an absent file, `unreadable` from a context throwing, `unsafe-name` from `subagent_type: "../../etc/passwd"`); and the containment refusal asserted as *no read attempted* — the stubbed `readAgentDefinition` records its calls and is never called for an unsafe name.

## 3. Kit — model and usage on `report`

- [x] `launchAcknowledgement` returns `resolvedModel` as well as `agentId`; `recordLink` stores it in the links sidecar.
- [x] Synchronous terminal: `model` and `usage` from `tool_response`; `usage_source: "payload"`.
- [x] `SubagentStop`: `model` from the sidecar; `usage` summed from `agent_transcript_path` assistant turns under `TRANSCRIPT_BYTE_CAP` and a wall-clock budget strictly below `DEFAULT_WAIT_MS`, read before the lock; `usage_source: "transcript"`; omitted with a stderr note when over budget or unreadable. Both budgets are parameters of the reader (the `identity.ts` seam).
- [x] Tests: sync payload → fields present; async with a fixture transcript → summed correctly; oversized transcript → fields absent and note printed; under-cap transcript with an injected zero time budget → absent and note printed; no transcript path → absent.

## 3b. Kit and plugin — git user and prompts

- [x] `identity.ts`: resolve `user.name` via `git config` within `IDENTITY_TIMEOUT_MS` per call and `IDENTITY_BUDGET_MS` total; header gains `user: { name }`; lock-path test in `identity.lock.test.ts` still passes.
- [x] `plugin/hooks/hooks.json`: add a `UserPromptSubmit` entry routed to `witness-record.sh`, with **no `timeout` key** — see the next task for why the bound lives in the script instead. The plugin is the only delivery mechanism for hooks; no other settings file is touched.
- [x] `plugin/hooks/witness-record.sh`: bound the runner in-script rather than by a harness `timeout` — wrap the invocation so a hung runner is killed and the script still reaches its own `exit 0`. A harness-killed process never runs the script's last line, which is where this repository's fail-open guarantee actually lives; and `UserPromptSubmit` is the one event where a blocking hook can erase the operator's prompt. Comment says both. If the wrapper is unavailable on a target platform, the bound is dropped rather than delegated — record that in the plugin README.
- [x] `record.ts`: `UserPromptSubmit` → one `prompt` record; cap at `EXCERPT_LIMIT` with `truncated`/`chars`; `NULLIUS_WITNESS_PROMPTS=0` → `chars` + `hash`, no `text`; when the payload carries no `prompt_id`, id is `p:<hash of session_id, at, text>` and no later record gets a `prompt` key.
- [x] `record.ts`: `dispatch` and `mutation` drafts carry `prompt: "p:<prompt_id>"` when the payload has `prompt_id`.
- [x] `plugin/hooks/witness-record.sh`: redirect the runner's stdout to stderr (`>&2`) on the `witness record` invocation, for every event; comment says why (`UserPromptSubmit` hook stdout is returned to the model).
- [x] `packages/kit/src/hookScript.test.ts` (new): spawns `bash plugin/hooks/witness-record.sh` with `CLAUDE_PROJECT_DIR` set to a temp root containing `.nullius/` (the script reads that variable first, falling back to `$PWD`; the test sets it explicitly rather than relying on `cwd`), and `NULLIUS_KIT_BIN` pointing at a stub that writes a sentinel to stdout and exits 0; pipes a `UserPromptSubmit` payload and a `PreToolUse` payload; asserts the script's stdout is empty, its stderr carries the sentinel, and it exits 0. A second case: a stub that hangs is killed by the in-script bound and the script still exits 0. (`doctor`'s live proof is in-process and cannot see any of this.)
- [x] `doctor`: the managed-hooks check knows the new event; report "prompts: recorded / hashed only" as a `fact` from the env it can see.
- [x] Tests in `record.test.ts`: prompt record shape, both modes; the join key on dispatch and mutation; a payload without `prompt_id` leaves the key absent on later records **and** yields a `prompt` id of the fallback shape (asserted against the hash of `session_id`, `at`, `text`, not merely "starts with `p:`"). Replay the new probe through the recorder in the corpus test.

## 4. Kit — `witness ledger` command

- [x] `witness ledger stage|resolution|decision|check` with flags mirroring the schema's fields; every record written carries `origin: "self-reported"`; `--session` override; `CLAUDE_CODE_SESSION_ID` default; exit 2 with both named when neither is set.
- [x] Validate closed vocabularies and required fields before appending, using the kernel's exported constants where they exist and adding exports where they do not (`SEVERITIES`, `RESOLUTION_OUTCOMES`, `CHECK_OUTCOMES`).
- [x] Append under the lock via `appendRecords`; ids `s:`/`res:`/`dec:`/`c:` + short hash.
- [x] `witness ledger findings [--open]`: list this session's `finding` records (id, severity, author, text), `--open` filtering to blockers with no `resolution`.
- [x] Move `SCHEMA_VERSION` to `"0.6"`, with a comment stating why this change is the one that moves it.
- [x] Tests in `witness.cli.test.ts`: each kind round-trips and validates; a bad `--outcome` is refused before any write; a missing session refuses; `findings --open` lists exactly the unanswered blockers.
- [x] CI round-trip step: after the existing parallel `witness record` gate, append one `stage`, one `resolution` against an extracted finding, one `check`, and validate — and assert `SUPPRESSED-FINDING` fires when the resolution is omitted.

## 5. Skill — `proposal-to-pr` emits records

- [x] Stage transitions: `witness ledger stage --phase <stage> --iteration <n> --change <name>` next to each `state-set stage`.
- [x] Stage 3 / Stage 7: for each finding addressed, `witness ledger findings --open` then one `resolution` per id; `duplicate`/`folded-in` carry `--merges-into`.
- [x] Stage 5: one `check` per verify chunk mirroring the existing `evidence-append "Stage 5 — Verify"` body.
- [x] Design decisions written in `design.md` get a `decision` record with `--resolves "Decision N"`.
- [x] Update the prose subcommand list and the stage-8 checklist; `nullius wiring` passes.

## 6. Documentation, exports, verification

- [x] `packages/kit/README.md` and `README.md` witness section: the producer exists; what is hook-extracted vs self-reported.
- [x] `IDEAS.md`: retire the "no producer yet" rows; the gap-map absence anchors go loud on their own. Add the follow-up from design Decision 4's known limit: a `wiring` check that every agent named in a skill's `dispatches:` declares the tag contract.
- [x] `CHANGELOG.md` entries for both packages.
- [x] `pnpm build && pnpm type-check && pnpm test` (6 ugrep baseline failures only); all dogfood gates both polarities.
- [x] `node packages/claims/dist/cli.js check 'openspec/changes/add-run-ledger-producer/**/*.md'` passes.
