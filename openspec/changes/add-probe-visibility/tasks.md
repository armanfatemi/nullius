# Tasks — add-probe-visibility

Kit-only. No dependencies. Nothing here changes which inputs an existing check
reads; one existing check's detail *text* changes, as argued in design
Decision 3.

## 0. Prerequisites / setup

- [x] 0.1 Resolve the open question in `design.md` Decision 2 — does `init`
      offer to enable capture, or only name it? **Resolved 2026-08-28: only
      name it.** It does not offer, and writes no probe key

## 1. Doctor

- [ ] 1.0 A settings-`env` reader. None exists: `readManagedHooks`
      (`packages/kit/src/doctor.ts:74`) parses `.claude/settings.json` but
      extracts only `hooks`, and collapses absent-versus-unparseable into
      `unreadable: false`. The new reader must keep those two apart, or one
      report will say `fact` for hooks and `unknown` for capture off the same
      missing file
- [ ] 1.1 A check reporting live-capture state: whether `NULLIUS_WITNESS_PROBE`
      is set to exactly `1` anywhere in the settings precedence chain
      (`.claude/settings.local.json`, then `.claude/settings.json`, then
      `~/.claude/settings.json`), and whether `.nullius/probes/` holds anything.
      Never read `doctor`'s own `process.env` — `doctor` runs in the operator's
      shell, not the hook subprocess (design 1a)
- [ ] 1.2 The predicate is `=== "1"`, matching the recorder. `NULLIUS_WITNESS_PROBE=0`
      is set and does not capture, and must report as not capturing (design 1b)
- [ ] 1.2a First file in precedence order that sets the variable wins, and the
      detail names that file. A user setting of `1` overridden by a
      project-local `0` reports off, naming the project-local file (design 1c)
- [ ] 1.2b Where no file sets it, the detail names the files read and states
      that the launching environment is not visible from `doctor`. It must NOT
      say capture is off — that would be a claim about sources it did not read
- [ ] 1.3 Status is `fact` in every branch where the settings files parse —
      capturing, explicitly disabled, unset, directory absent, directory stale.
      Never `fail`
- [ ] 1.4 Status is `unknown` in exactly one branch: a settings file that exists
      and does not parse. An absent file is skipped as an observation and does
      not make the report unknown. The detail names the file it could not parse
- [ ] 1.5 The detail line names the environment variable, so the report says how
      to change what it just reported
- [ ] 1.6 The detail line names *which* probe directory it is describing — the
      live capture directory, not the committed corpus — since conflating them
      is the misreading this change exists to prevent
- [ ] 1.7 Correct `probeChecks`' absent-corpus detail line, which currently
      tells the reader to populate the committed corpus with a variable that
      writes to `.nullius/probes/`. Message only: the directory it reads, its
      status, and its returned shape are unchanged
- [ ] 1.8 Insert the new check *before* `liveProof()` in `runChecks`, not after.
      `packages/kit/src/doctor.test.ts:263` asserts live proof is the last check
      doctor runs; that test is correct and stays as written

## 2. Init

- [ ] 2.1 `init` names probing: what it records, where it lands, that it is off
      unless asked for
- [ ] 2.2 `init` does not set `NULLIUS_WITNESS_PROBE` and does not offer to. A
      test asserts the written `nullius.kit.json` contains no probe key —
      scoped to that file by name, because `init` never writes
      `.claude/settings.json` and an assertion against it would be vacuous

## 3. Documentation

- [ ] 3.1 `.nullius/README.md`: the two probe directories and why they differ —
      committed corpus versus live capture
- [ ] 3.2 State plainly that raw payloads carry prompt text and absolute paths,
      and that this is why capture is opt-in

## 4. Tests

- [ ] 4.1 Doctor's branches asserted on the message, not only the status. The
      settings axis is `{sets 1 | sets another value | sets nothing |
      exists but does not parse}`; the directory axis is
      `{absent | empty | non-empty}`. Two collapses are expected and should be
      asserted once rather than nine times:
      - the `does not parse` row is directory-invariant, since status and detail
        are tied to settings readability alone — one case, not three
      - `absent` and `empty` produce identical output in every row (zero
        payloads held), so they need one shared assertion plus one test that
        they really are identical
      The branch that must not be dropped is *no file enables capture, payloads
      present* — stale recordings that look like coverage
- [ ] 4.1a Precedence is asserted directly: user file sets `1`, project-local
      sets `0`, report says off and names the project-local file
- [ ] 4.2 `init` writes no probe key into `nullius.kit.json`. Extend the
      existing in-memory render assertions in `packages/kit/src/init.test.ts`
      rather than round-tripping through disk
- [ ] 4.3 A test at the **CLI seam** asserting `doctor` still points
      `probeChecks` at the committed corpus. A second direct call to
      `probeChecks` duplicates the existing coverage in
      `packages/kit/src/doctor.test.ts` and would still pass if someone
      repointed the call site in `packages/kit/src/cli.ts` at
      `.nullius/probes/` — which is the exact regression design Decision 3
      exists to prevent. Drive it through the CLI against a scratch root so the
      wiring, not the pure function, is what is under test
- [ ] 4.4 The corrected `probeChecks` detail line is asserted on its new text,
      so the old misleading instruction cannot come back unnoticed

## 5. Close-out

- [ ] 5.1 `node packages/claims/dist/cli.js check 'openspec/**/*.md'` clean
- [ ] 5.2 CHANGELOG: a new observation in `doctor`, one corrected detail line,
      no new verdict, no default changed
