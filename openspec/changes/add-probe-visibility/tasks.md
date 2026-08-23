# Tasks — add-probe-visibility

Kit-only. No dependencies. Nothing here changes an existing check's behaviour.

## 0. Prerequisites / setup

- [ ] 0.1 Resolve the open question in `design.md` Decision 2 — does `init`
      offer to enable capture, or only name it? One prompt's difference, decided
      before writing the code

## 1. Doctor

- [ ] 1.1 A check reporting live-capture state: whether
      `NULLIUS_WITNESS_PROBE` is set, and whether `.nullius/probes/` holds
      anything
- [ ] 1.2 Status is `fact` in every branch — capturing, not capturing, directory
      absent. Never `fail`, never `??`
- [ ] 1.3 The detail line names the env var, so the report says how to change
      what it just reported
- [ ] 1.4 `probeChecks` is untouched — assert this with a characterization test
      over its existing output, since the temptation to "fix" it is exactly what
      this change decided against

## 2. Init

- [ ] 2.1 `init` names probing: what it records, where it lands, that it is off
      unless asked for
- [ ] 2.2 `init` does not set `NULLIUS_WITNESS_PROBE`. A test asserts the
      written settings contain no probe key

## 3. Documentation

- [ ] 3.1 `.nullius/README.md`: the two probe directories and why they differ —
      committed corpus versus live capture
- [ ] 3.2 State plainly that raw payloads carry prompt text and absolute paths,
      and that this is why capture is opt-in

## 4. Tests

- [ ] 4.1 Doctor's three branches asserted on the message, not only the status
- [ ] 4.2 Init writes no probe key
- [ ] 4.3 `probeChecks` output unchanged

## 5. Close-out

- [ ] 5.1 `node packages/claims/dist/cli.js check 'openspec/**/*.md'` clean
- [ ] 5.2 CHANGELOG: a new observation in `doctor`, no new verdict, no default
      changed
