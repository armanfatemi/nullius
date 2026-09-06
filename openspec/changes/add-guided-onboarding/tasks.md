## 1. Flag plumbing

- [x] 1.1 Add `--interactive` to `init`'s argument parser in `packages/kit/src/cli.ts`, alongside `--oracle <glob>[,<glob>...]` and `--action` for pre-answering the interactive steps non-interactively.
- [x] 1.2 Confirm `--yes`/no-flag behavior is byte-identical to today's when `--interactive` is absent (regression-test against existing `init.cli.test.ts` assertions, not just new ones) — all 74 pre-existing `init.test.ts`/`init.cli.test.ts` cases pass unchanged.

## 2. Interactive prompt layer

- [x] 2.1 Add `@clack/prompts` as a dependency of `packages/kit`.
- [x] 2.2 Create `packages/kit/src/prompts.ts`: a thin wrapper gated on `--interactive` plus a stdin-TTY check, falling back to non-interactive defaults (with a stated reason) when no TTY is present.
- [x] 2.3 Wire profile/harness confirmation into the interactive flow, reusing `detect()`'s existing output rather than re-deriving it (`ctx.detection.reason` printed in the `clack.intro` line).

## 3. Oracle detector

- [x] 3.1 Create `packages/kit/src/detectOracle.ts`: scans for `package.json` test scripts, `jest.config.*`, `vitest.config.*`, `pytest.ini`/`setup.cfg`, returning candidate `OracleCandidate[]`.
- [x] 3.2 Unit-test the detector: jest, vitest, pytest, plain npm-test-script, mixed-language, and "nothing detected" cases (8 tests).
- [x] 3.3 Wire the detector into `init --interactive`: present candidates for accept/edit/skip via a re-editable text prompt, re-validated on every keystroke against the kernel's own `parseConfig` (not a re-implementation of its rules); write only on explicit confirmation.
- [x] 3.4 On re-run, read an existing `oracles` value back as the prefilled default instead of re-proposing from scratch; confirmed it is never added to `KIT_OWNED_CONFIG_KEYS` in `packages/kit/src/render.ts` (still just `["docs"]`).

## 4. GitHub Action opt-in

- [x] 4.1 ~~Add a scaffolder that writes a version-pinned `.github/workflows/nullius.yml`~~ — corrected during implementation: `profiles.ts` already has a `WORKFLOW` artifact (`.github/workflows/claims.yml` via `renderWorkflow`) that `prs`/`specs` already include; `plans` is the only profile missing it. Offer to add that existing artifact to the plan instead of inventing a second file.
- [x] 4.2 Only offer the opt-in when the chosen profile's artifact list does not already include `WORKFLOW` (`prs`/`specs` are never prompted; only `plans` is).
- [x] 4.3 CLI test covering: opt-in under `plans` adds the workflow, `prs`/`specs` are a no-op (same rendered content with or without the flag), and no flag on `plans` leaves it absent.

## 5. Doctor duplicate-hook check

- [x] 5.1 Extended `packages/kit/src/doctor.ts`'s managed-hooks readback: reuses `RECORDED_EVENTS`/`CHECKING_EVENTS` as `PLUGIN_HOOK_EVENTS`, and reports a hard `fail` when a managed-convention entry's event is in that set and the plugin is enabled — regardless of whether the command itself would resolve.
- [x] 5.2 Fixture uses `"node packages/kit/dist/cli.js witness record"` — the exact `isManagedHookCommand`-matching shape, not a synthetic placeholder.
- [x] 5.3 Named unit test (`doctor.test.ts` "fails a resolvable managed hook when the plugin also delivers that event") asserts the verdict fires by name, checking `status`, the event name in the check name, and the detail text — not just the report's overall exit code.
- [x] 5.4 Two fixtures/tests added: plugin enabled + managed hook for a non-overlapping... (all events overlap in this build, so instead: plugin enabled + a *non-managed-convention* command is left alone; and plugin *disabled* + the same managed command falls through to ordinary resolvability, unaffected).

## 6. `nullius:setup` skill

- [x] 6.1 Create `plugin/skills/setup/SKILL.md` with `allowed-tools: Bash(npx -y @nullius-inverba/kit:*), Bash(npx nullius-kit:*), Bash(nullius-kit:*)` — scoped Bash patterns only, no `Write`/`Edit` in the list at all.
- [x] 6.2 Write the skill's instructions to drive `init`'s flag surface directly (`--dry-run`, the new `--suggest-oracle` query flag, `--oracle`, `--action`) rather than `--interactive`'s terminal prompts, which would silently no-op with no TTY; close by running `doctor` and reporting its real output rather than a claim of completion.
- [ ] 6.3 Manually verify in Claude Code: install the plugin, invoke the skill, confirm it cannot touch `.claude/settings.json` and that a stray attempt would be caught by the Section 5 doctor check. (Not performable inside this session — needs a real Claude Code session with the plugin installed.)

## 7. Documentation and front door

- [x] 7.1 Update `README.md`'s quickstart to add `init --interactive` alongside the existing `init`/`init --dry-run` lines, unpinned — matching this repo's existing convention of never version-pinning the primary quickstart `npx` line (the "pin a paste block" concern from the design applies to a copy-pasted-elsewhere artefact, not this already-unpinned in-repo quickstart). Documented `--oracle`/`--action`/`--suggest-oracle` and the `nullius:setup` skill in the plugin delivers-table.
- [x] 7.2 Checked `.nullius/README.md` — it describes the recording opt-in, not `init`'s interactivity, and needed no change.

## 8. Verification

- [x] 8.1 `pnpm build` and `pnpm type-check` clean, repo-wide.
- [x] 8.2 `pnpm test`: kit 466 passed + 1 pre-existing skip (14 files); claims 1125 passed, only the documented 6 environmental `flagConformance` failures (ugrep on macOS) — no new regressions.
- [x] 8.3 `openspec validate add-guided-onboarding --strict` passes.
- [x] 8.4 Re-verified: all 10 anchors in `design.md` resolve `OK` or advisory `STALE` (never `FABRICATED`) — the `STALE`s are expected drift, since `design.md`'s Context section cites the pre-change code that this same change then edited; left unstamped rather than repointed under the same commit, per `never-repoint-under-old-stamp` (drift, not "line was always wrong"). Dogfooding gates also re-run clean: `witness validate` on `valid-run.jsonl` exits 0, `broken-run.jsonl` exits 1 with all six pre-existing verdicts intact.
