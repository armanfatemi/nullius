# Tasks — add-oracle-conservation

Kernel-only, plus one Action input. Independent of `add-journal-identity` and
`add-rules-compliance`; it reads a journal but adds no verdict to `witness`.

## 1. Config

- [ ] 1.1 `oracles` key: array of `{glob, weakening?, skipMarker?}`, parsed with
      the existing closed-key strictness; unknown sub-keys rejected
- [ ] 1.2 Absent `oracles` is a reported state, never an empty result set —
      wire it into the command's output and into `doctor` as `??`
- [ ] 1.3 A glob with no `weakening` states that `weakened` went unchecked for
      it; a silent two-thirds check is the failure this repo is named after

## 2. Classification

- [ ] 2.1 Range diff against declared globs — name-status, so renames and
      deletions are distinguishable from edits
- [ ] 2.2 `deleted` — present at base, absent at head
- [ ] 2.3 `skipped` — declared skip marker count increased across the range
- [ ] 2.4 `weakened` — declared `weakening` count decreased across the range;
      message names the pattern and both counts so a false positive is
      dismissible in seconds
- [ ] 2.5 Advisory listing for every other change to a declared oracle
- [ ] 2.6 Reuse the existing bounded-git machinery; one `git show` per
      (rev, path), same cache and timeout as the anchor path

## 3. Justification matching

- [ ] 3.1 `decision.justifies` parser: `{path, change}`, `change` closed to the
      three classes, present-but-blank is `MALFORMED`
- [ ] 3.2 Match hard changes against decisions on the derived `(path, change)`
      pair — never on a record id
- [ ] 3.3 Two hard classes on one path need two decisions
- [ ] 3.4 `OracleVerdict` union with `UNJUSTIFIED-ORACLE-CHANGE`; the exported
      `Verdict` is untouched
- [ ] 3.5 Regression test: a journal carrying `justifies` produces byte-identical
      `witness validate` output to one without it

## 4. Command and output

- [ ] 4.1 `nullius oracle <range> [--journal <path>] [--strict]`
- [ ] 4.2 Advisory by default; `--strict` is the only way to a failing exit
- [ ] 4.3 The pass line states the limit — a reason was recorded, not assessed
- [ ] 4.4 Per-command `--help` with one example, matching the funnel convention
- [ ] 4.5 `--format json` if `add-authoring-ergonomics` has landed; otherwise
      leave the hook and do not invent a second output shape

## 5. Fixtures

- [ ] 5.1 A fixture repo with a justified deletion, an unjustified weakening,
      a skipped test, and an added test that must raise nothing
- [ ] 5.2 A deletion performed without any `mutation` record, proving the git
      source catches what the hook tier cannot — this is the change's whole
      premise and needs a test that fails if the premise stops holding
- [ ] 5.3 Assert every verdict in a unit test, not only the fixture's exit code

## 6. Documentation

- [ ] 6.1 The Evidence-Anchor convention for rationales (design Decision 2) in
      the authoring skill — a convention, deliberately not a verdict
- [ ] 6.2 README: a fourth row in the verbs table, and the honest one-line
      limit next to it
- [ ] 6.3 Document `weakened`'s crudeness where users meet it, not only in the
      design: merged assertions are a false positive, a gutted assertion body
      is a false negative

## 7. Close-out

- [ ] 7.1 `node packages/claims/dist/cli.js check 'openspec/**/*.md'` clean
- [ ] 7.2 `check 'README.md' 'spec/**/*.md' --require-markers` clean
- [ ] 7.3 Every witness fixture exits as `spec/witness-journal.md` says
- [ ] 7.4 CHANGELOG: new verb, new union, no schema bump, and why
