# Tasks — add-probe-visibility

Kit-only. No dependencies. Nothing here changes which inputs an existing check
reads; one existing check's detail *text* changes, as argued in design
Decision 3.

## Code this change reasons about

These are the load-bearing claims about existing code that the tasks below
depend on. They are anchors rather than inline line numbers because an inline
number is invisible to `check` and silently rots — this list previously carried
a wrong range for A4 for a full review round, which is exactly the failure the
convention exists to prevent.

**Evidence:** `packages/kit/src/doctor.ts:74@12cde11` — `  const settingsPath = join(root, ".claude", "settings.json");`

**Evidence:** `packages/kit/src/doctor.ts:75@12cde11` — `  if (!existsSync(settingsPath)) return { entries: [], unreadable: false };`

**Evidence:** `packages/kit/src/doctor.ts:93@12cde11` — `    return { entries: [], unreadable: true };`

A4 — `DoctorOptions`, the seam task 1.0a extends:

**Evidence:** `packages/kit/src/doctor.ts:516@12cde11` — `export interface DoctorOptions {`

A5 — where the new check is inserted, immediately before `liveProof()`:

**Evidence:** `packages/kit/src/doctor.ts:551@12cde11` — `  checks.push(...probeChecks(probeDir));`

A6 — the test helper task 1.0b extends, whose parameters are already defaulted:

**Evidence:** `packages/kit/src/doctor.test.ts:25@12cde11` — `function check(root: string, probeDir = join(root, "nowhere")) {`

A7 — the ordering assertion task 1.9 must not break:

**Evidence:** `packages/kit/src/doctor.test.ts:263@12cde11` — `    expect(checks[checks.length - 1]?.name).toBe("live proof");`

## 0. Prerequisites / setup

- [x] 0.1 Resolve the open question in `design.md` Decision 2 — does `init`
      offer to enable capture, or only name it? **Resolved 2026-08-28: only
      name it.** It does not offer, and writes no probe key

## 1. Doctor

- [x] 1.0 A settings-`env` reader. None exists: `readManagedHooks`
      parses `.claude/settings.json` but extracts only `hooks`. It already keeps
      absence and unparseability apart — see the anchors above: `unreadable:
      false` for an absent file, `unreadable: true` from the catch block, which
      `runChecks` branches into `fact` versus `unknown` — so the new reader
      follows that precedent rather than inventing it
- [x] 1.0a The user settings path is **injectable**, not derived from
      `os.homedir()` at the point of use. Add it to `DoctorOptions` (A4), which
      today carries only `root` and `probeDir`. Nothing in `packages/kit/src`
      reads `os.homedir()` or `process.env.HOME` today, so without a seam task
      4.1a would have to mutate the developer's real `~/.claude/settings.json`
- [x] 1.0b Extend the `check()` helper (A6) with a third defaulted parameter. Defaulted, so none of the existing call sites
      change; no existing test asserts `checks.length` or a fixed index except
      the live-proof assertion task 1.9 covers
- [x] 1.1 A check reporting live-capture state: whether `NULLIUS_WITNESS_PROBE`
      is set to exactly `1` in any of `.claude/settings.local.json`,
      `.claude/settings.json` or the injected user settings path, and whether
      `.nullius/probes/` holds anything. Never read `doctor`'s own `process.env`
      — `doctor` runs in the operator's shell, not the hook subprocess
      (design 1a)
- [x] 1.2 The predicate is `=== "1"`, matching the recorder. A file carrying `0`
      is reported as *that file* disabling capture (design 1b). Both directions
      are file-scoped: "this file enables capture" is checkable, "capture is on"
      is not — the positive claim is no more grounded than the negative one
- [x] 1.2a Report every file that sets the variable and the value it carries.
      Do **not** adjudicate precedence: nothing in this repo establishes the
      harness's ordering, and naming a deciding file would assert external
      behaviour the checker cannot ground (design 1d)
- [x] 1.2b Where no file sets it, the detail names the files read and states
      that capture may still be enabled by sources this check does not read,
      including the launching environment. The wording stays non-exhaustive. It
      must NOT say capture is off — that would be a claim about sources it did
      not read
- [x] 1.3 Status is `fact` in every branch where the settings files parse —
      capturing, explicitly disabled, unset, directory absent, payloads held.
      Never `fail`
- [x] 1.3a Where payloads are held, report the count and the most recent write
      time, formatted as ISO-8601 UTC. Not `toLocaleString()` — a locale- and
      timezone-dependent detail string is a machine-dependent assertion, which
      is the same defect class as a missing seam arriving as a formatting
      choice. Never describe the payloads as stale or as "not being refreshed":
      that is a claim capture has stopped, which this check cannot make
- [x] 1.4 Status is `unknown` only when a settings file exists, does not parse,
      **and** no other file established the variable. An absent file is skipped
      as an observation and does not make the report unknown. The detail names
      the file it could not parse
- [x] 1.4a A parse failure never discards a determinate read from another file.
      Report the readable file's value as a fact and name the unreadable one
      alongside it — `unknown` is for when nothing could be established, not for
      when something could and something else could not (design 1e)
- [x] 1.5 The detail line names the environment variable, so the report says how
      to change what it just reported
- [x] 1.6 The detail line names *which* probe directory it is describing — the
      live capture directory, not the committed corpus — since conflating them
      is the misreading this change exists to prevent
- [x] 1.7 Correct `probeChecks`' absent-corpus detail line, which currently
      tells the reader to populate the committed corpus with a variable that
      writes to `.nullius/probes/`. Message only: the directory it reads, its
      status, and its returned shape are unchanged
- [x] 1.8 Insert the new check *before* `liveProof()` in `runChecks` (A5), not
      after. A7 asserts live proof is the last check doctor runs; that test is
      correct and stays as written
- [x] 1.9 Assert the new check's own position directly, by comparing the
      `findIndex` of the two check names — capture before live proof — never a
      fixed offset like `checks[checks.length - 2]`, which breaks the moment any
      check lands between them. `doctor.test.ts:263` catches a misplacement only
      as a side effect and names the wrong invariant when it does: a reader sees
      "live proof is not last" and debugs `liveProof` (A7)

## 2. Init

- [x] 2.1 `init` names probing: what it records, where it lands, that it is off
      unless asked for
- [x] 2.2 `init` does not set `NULLIUS_WITNESS_PROBE` and does not offer to. A
      test asserts the written `nullius.kit.json` contains no probe key —
      scoped to that file by name, because `init` never writes
      `.claude/settings.json` and an assertion against it would be vacuous

## 3. Documentation

- [x] 3.1 `.nullius/README.md`: the two probe directories and why they differ —
      committed corpus versus live capture
- [x] 3.2 State plainly that raw payloads carry prompt text and absolute paths,
      and that this is why capture is opt-in

## 4. Tests

- [x] 4.1 Doctor's branches asserted on the message, not only the status. The
      settings axis is `{sets 1 | sets another value | sets nothing |
      exists but does not parse}`; the directory axis is
      `{absent | empty | non-empty}`. One collapse is real and should be
      asserted once rather than nine times; a second was claimed here and was
      wrong:
      - `absent` and `empty` produce identical output in every row (zero
        payloads held), so they need one shared assertion plus one test that
        they really are identical
      - the `does not parse` row is **not** directory-invariant. Its *status* is
        tied to settings readability alone, but its detail still reports held
        payloads: "where payloads are held, the report SHALL state how many are
        held and when the most recent was written" is unconditional, and a
        settings file that will not parse says nothing about what is on disk.
        This task first claimed the opposite, and the implementation followed it
        into an early return that dropped held payloads while a test pinned the
        omission as deliberate. Assert the count and the timestamp in this row
        too
      The branch that must not be dropped is *no file sets the variable, payloads
      present* — payloads that look like coverage. Assert the detail reports
      count and most-recent-write-time and does NOT call them stale
- [x] 4.1a Disagreement is asserted directly: user file sets `1`, project-local
      sets `0`, report names both files and both values and declares no winner.
      Written against the injected user settings path from task 1.0a, never the
      real home directory
- [x] 4.1b Each of the three files is exercised as the sole setter, so nothing
      passes by only ever reading two of them. `.claude/settings.json`
      standalone is the one 4.1a does not touch
- [x] 4.1c The mixed case: one file unparseable, another setting `1`. Assert the
      status is `fact`, the determinate value is reported, and the unreadable
      file is named
- [x] 4.2 `init` writes no probe key into `nullius.kit.json`. Assert against the
      in-memory output of `renderKitConfig` rather than round-tripping through
      disk — the same technique `packages/kit/src/init.test.ts` already uses for
      `renderConfig`. Note it is a *new* assertion, not an extension of an
      existing one: that file has no in-memory content assertions for
      `renderKitConfig` today
- [x] 4.3 A test at the **CLI seam** asserting `doctor` still points
      `probeChecks` at the committed corpus. A second direct call to
      `probeChecks` duplicates the existing coverage in
      `packages/kit/src/doctor.test.ts` and would still pass if someone
      repointed the call site in `packages/kit/src/cli.ts` at
      `.nullius/probes/` — which is the exact regression design Decision 3
      exists to prevent. Drive it through the CLI against a scratch root so the
      wiring, not the pure function, is what is under test
- [x] 4.4 The corrected `probeChecks` detail line is asserted on its new text,
      so the old misleading instruction cannot come back unnoticed

## 5. Close-out

- [x] 5.1 `pnpm build`, then `node packages/claims/dist/cli.js check
      'openspec/**/*.md'` clean. The build is named because the CLI runs from
      `dist/`, and an unbuilt tree checks the previous build and reports success
- [x] 5.2 CHANGELOG: a new observation in `doctor`, one corrected detail line,
      no new verdict, no default changed
